import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  getIntrospectionQuery, 
  buildClientSchema, 
  GraphQLSchema,
  isNonNullType,
  isListType,
  isInputObjectType,
} from 'graphql';
import { getBaseUrl } from '@/features/dashboard/lib/getBaseUrl';
import { keystoneContext } from '@/features/keystone/context';
import { authorizeMcpRequest } from '@/features/keystone/mcp-oauth/http';
import { internalGraphqlEndpoint } from '@/features/keystone/lib/internal-origin';
import { DOMAIN_TOOLS, runDomainTool } from '@/features/keystone/mcp/registry';
import { buildSelection, boundedTake, SelectionError, MCP_MAX_TAKE } from '@/features/keystone/mcp/selection';

// Get simple type name for display
function getSimpleTypeName(type: any): string {
  if (isNonNullType(type)) {
    return getSimpleTypeName(type.ofType);
  }
  if (isListType(type)) {
    return `[${getSimpleTypeName(type.ofType)}]`;
  }
  return type.name || type.toString();
}

// Execute GraphQL query as the caller: their session cookie, or their MCP OAuth bearer token
async function executeGraphQL(query: string, graphqlEndpoint: string, auth: Record<string, string>, variables?: Record<string, unknown>): Promise<any> {
  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...auth,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL execution failed: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

// Get GraphQL schema from introspection
async function getGraphQLSchema(graphqlEndpoint: string, auth: Record<string, string>): Promise<GraphQLSchema> {
  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...auth,
    },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL introspection failed: ${JSON.stringify(result.errors)}`);
  }
  
  return buildClientSchema(result.data);
}

export async function POST(request: Request, { params }: { params: Promise<{ transport: string }> }) {
  try {
    const { transport } = await params;
    
    // Construct GraphQL endpoint
    const graphqlEndpoint = internalGraphqlEndpoint() ?? `${await getBaseUrl()}/api/graphql`;
    
    // Parse the JSON-RPC request
    const body = await request.json();

    // Every call runs as one Keystone user: the session cookie (built-in assistant)
    // or an MCP OAuth token. Without either, answer with the OAuth challenge.
    const authorization = await authorizeMcpRequest(keystoneContext, request, body);
    if (authorization instanceof Response) return authorization;
    const auth = authorization.forwardHeaders;

    // Notifications have no response body (Streamable HTTP: 202 Accepted)
    if (typeof body.method === 'string' && body.method.startsWith('notifications/')) {
      return new Response(null, { status: 202 });
    }

    // Get the GraphQL schema
    const schema = await getGraphQLSchema(graphqlEndpoint, auth);
    
    // Handle the request based on method
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: {
            name: 'openfront-dental',
            version: '0.1.0'
          }
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (body.method === 'ping') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: {}
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (body.method === 'tools/list') {
      // Return tools
      const tools: Tool[] = [{
        name: 'listModels',
        description: 'List all available GraphQL models/types in the system',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }, {
        name: 'queryData',
        description: 'Execute a GraphQL query to get actual data from the system',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              description: 'The list query name (e.g., "users", "locations", "roles")'
            },
            fields: {
              type: 'string',
              description: 'Field names to select, with { } for related records (e.g., "id name" or "id patient { id }"). No arguments; at most 3 levels.'
            },
            take: {
              type: 'number',
              description: `How many records (1–${MCP_MAX_TAKE}, default 10)`
            }
          },
          required: ['operation', 'fields']
        }
      }, {
        name: 'searchModels',
        description: 'Search for models by name pattern',
        inputSchema: {
          type: 'object',
          properties: {
            searchTerm: {
              type: 'string',
              description: 'The search term to find models (e.g., "User", "Location", "Role")'
            }
          },
          required: ['searchTerm']
        }
      }, {
        name: 'getFieldsForType',
        description: 'Get all available fields for a specific GraphQL type',
        inputSchema: {
          type: 'object',
          properties: {
            typeName: {
              type: 'string',
              description: 'The GraphQL type name to get fields for (e.g., "User", "Location", "Role")'
            }
          },
          required: ['typeName']
        }
      }, {
        name: 'lookupInputType',
        description: 'Get the structure of a GraphQL input type for mutations',
        inputSchema: {
          type: 'object',
          properties: {
            inputTypeName: {
              type: 'string',
              description: 'The GraphQL input type name (e.g., "UserCreateInput", "LocationUpdateInput")'
            }
          },
          required: ['inputTypeName']
        }
      }, {
        name: 'modelSpecificSearch',
        description: 'Perform intelligent search on a specific model using the same logic as the dashboard search functionality',
        inputSchema: {
          type: 'object',
          properties: {
            modelName: {
              type: 'string',
              description: 'The model name to search (e.g., "User", "Location", "ProviderProfile"). Will be automatically converted to the correct GraphQL operation name.'
            },
            searchQuery: {
              type: 'string',
              description: 'The search term to find within the model. Supports both ID matching and text field searching with case-insensitive matching.'
            },
            fields: {
              type: 'string',
              description: 'The fields to return from matching items (e.g., "id name email" or "id title description")'
            }
          },
          required: ['modelName', 'searchQuery', 'fields']
        }
      }];
      
      // Generic reads above; every write is a domain tool that runs one audited command.
      tools.push(...DOMAIN_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { tools }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (body.method === 'tools/call') {
      // Handle tool call
      const { name, arguments: args } = body.params;

      try {
        if (name === 'listModels') {
          const allModels: any[] = [];
          
          // Get all types from schema
          const typeMap = schema.getTypeMap();
          
          for (const [typeName, type] of Object.entries(typeMap)) {
            // Skip built-in GraphQL types
            if (typeName.startsWith('__')) continue;
            
            // Find related operations for this type
            const relatedOps: string[] = [];
            
            // Check queries
            if (schema.getQueryType()) {
              const queryFields = schema.getQueryType()!.getFields();
              for (const [queryName] of Object.entries(queryFields)) {
                const baseTypeName = typeName.toLowerCase().replace(/input$|type$/i, '');
                if (queryName.toLowerCase().includes(baseTypeName) || 
                    queryName.toLowerCase() === baseTypeName + 's' ||
                    queryName.toLowerCase() === baseTypeName) {
                  relatedOps.push(`Query: ${queryName}`);
                }
              }
            }
            
            // Check mutations  
            if (schema.getMutationType()) {
              const mutationFields = schema.getMutationType()!.getFields();
              for (const [mutationName] of Object.entries(mutationFields)) {
                const baseTypeName = typeName.toLowerCase().replace(/input$|type$/i, '');
                if (mutationName.toLowerCase().includes(baseTypeName)) {
                  relatedOps.push(`Mutation: ${mutationName}`);
                }
              }
            }
            
            allModels.push({
              typeName,
              description: type.description || `GraphQL type: ${typeName}`,
              kind: type.constructor.name,
              relatedOperations: relatedOps
            });
          }
          
          // Sort by name
          allModels.sort((a, b) => a.typeName.localeCompare(b.typeName));
          
          const result = {
            totalModels: allModels.length,
            models: allModels
          };
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        if (name === 'queryData') {
          const { operation, fields, take } = args;
          // The caller's field list is parsed and rebuilt from schema names, never spliced in (no where/orderBy/args).
          let built;
          try { built = buildSelection(schema, operation, fields); } catch (error) {
            if (!(error instanceof SelectionError)) throw error;
            return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: error.message } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          const queryString = `query McpQuery($take: Int!) { ${built.operation}(take: $take) { ${built.selection} } }`;
          const result = await executeGraphQL(queryString, graphqlEndpoint, auth, { take: boundedTake(take) });
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        if (name === 'searchModels') {
          const { searchTerm } = args;
          const searchLower = searchTerm.toLowerCase();
          
          const matchingModels: any[] = [];
          
          // Get all types from schema
          const typeMap = schema.getTypeMap();
          
          for (const [typeName, type] of Object.entries(typeMap)) {
            // Skip built-in GraphQL types
            if (typeName.startsWith('__')) continue;
            
            // Check if type name matches search term
            if (typeName.toLowerCase().includes(searchLower)) {
              // Find related operations for this type
              const relatedOps: string[] = [];
              
              // Check queries
              if (schema.getQueryType()) {
                const queryFields = schema.getQueryType()!.getFields();
                for (const [queryName] of Object.entries(queryFields)) {
                  const baseTypeName = typeName.toLowerCase().replace(/input$|type$/i, '');
                  if (queryName.toLowerCase().includes(baseTypeName) || 
                      queryName.toLowerCase() === baseTypeName + 's' ||
                      queryName.toLowerCase() === baseTypeName) {
                    relatedOps.push(`Query: ${queryName}`);
                  }
                }
              }
              
              // Check mutations  
              if (schema.getMutationType()) {
                const mutationFields = schema.getMutationType()!.getFields();
                for (const [mutationName] of Object.entries(mutationFields)) {
                  const baseTypeName = typeName.toLowerCase().replace(/input$|type$/i, '');
                  if (mutationName.toLowerCase().includes(baseTypeName)) {
                    relatedOps.push(`Mutation: ${mutationName}`);
                  }
                }
              }
              
              matchingModels.push({
                typeName,
                description: type.description || `GraphQL type: ${typeName}`,
                kind: type.constructor.name,
                relatedOperations: relatedOps
              });
            }
          }
          
          // Sort by name
          matchingModels.sort((a, b) => a.typeName.localeCompare(b.typeName));
          
          const result = {
            searchTerm,
            matchingModels: matchingModels.length,
            models: matchingModels
          };
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        if (name === 'getFieldsForType') {
          const { typeName } = args;
          
          // Get the specific type from schema
          const typeMap = schema.getTypeMap();
          const type = typeMap[typeName];
          
          if (!type) {
            return new Response(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: `Type '${typeName}' not found in schema`,
                    availableTypes: Object.keys(typeMap).filter(name => !name.startsWith('__'))
                  }, null, 2),
                }],
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          
          const fields: any[] = [];
          
          // Check if type has fields (ObjectType or InputObjectType)
          if ('getFields' in type && typeof type.getFields === 'function') {
            const typeFields = type.getFields();
            
            for (const [fieldName, field] of Object.entries(typeFields)) {
              const fieldInfo: any = {
                name: fieldName,
                type: getSimpleTypeName(field.type),
                description: field.description || null
              };
              
              // Add args if it's a field with arguments
              if ('args' in field && field.args && field.args.length > 0) {
                fieldInfo.args = field.args.map((arg: any) => ({
                  name: arg.name,
                  type: getSimpleTypeName(arg.type),
                  description: arg.description || null,
                  defaultValue: arg.defaultValue
                }));
              }
              
              fields.push(fieldInfo);
            }
          }
          
          const result = {
            typeName,
            typeKind: type.constructor.name,
            description: type.description || null,
            fields: fields
          };
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        if (name === 'lookupInputType') {
          const { inputTypeName } = args;
          
          // Get the specific input type from schema
          const typeMap = schema.getTypeMap();
          const inputType = typeMap[inputTypeName];
          
          if (!inputType) {
            return new Response(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: `Input type '${inputTypeName}' not found in schema`,
                    availableInputTypes: Object.keys(typeMap).filter(name => 
                      !name.startsWith('__') && name.toLowerCase().includes('input')
                    )
                  }, null, 2),
                }],
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          
          const inputFields: any[] = [];
          
          // Check if it's an input object type
          if (isInputObjectType(inputType)) {
            const fields = inputType.getFields();
            
            for (const [fieldName, field] of Object.entries(fields)) {
              const inputField = field as any;
              const inputFieldInfo: any = {
                name: fieldName,
                type: getSimpleTypeName(inputField.type),
                description: inputField.description || null,
                required: isNonNullType(inputField.type),
                defaultValue: inputField.defaultValue
              };
              
              inputFields.push(inputFieldInfo);
            }
          }
          
          const result = {
            inputTypeName,
            typeKind: inputType.constructor.name,
            description: inputType.description || null,
            fields: inputFields,
            isInputType: isInputObjectType(inputType)
          };
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        if (name === 'modelSpecificSearch') {
          const { modelName, searchQuery, fields, limit = 10 } = args;
          if (typeof searchQuery !== 'string' || searchQuery.length > 200) {
            return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'searchQuery must be a short string.' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          
          // Get all types from schema to find the correct model
          const typeMap = schema.getTypeMap();
          let foundModel = null;
          let operationName = null;
          
          // Find the model by name (case-insensitive)
          const modelNameLower = modelName.toLowerCase();
          for (const [typeName] of Object.entries(typeMap)) {
            if (typeName.toLowerCase() === modelNameLower || 
                typeName.toLowerCase() === modelNameLower + 's' ||
                typeName.toLowerCase().replace(/s$/, '') === modelNameLower) {
              foundModel = typeName;
              break;
            }
          }
          
          if (!foundModel) {
            return new Response(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: `Model '${modelName}' not found in schema`,
                    availableModels: Object.keys(typeMap).filter(name => !name.startsWith('__'))
                  }, null, 2),
                }],
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          
          // Find the corresponding query operation
          if (schema.getQueryType()) {
            const queryFields = schema.getQueryType()!.getFields();
            const modelLower = foundModel.toLowerCase();
            
            // Try various naming conventions
            const possibleNames = [
              modelLower + 's',  // products
              modelLower,        // product
              foundModel.charAt(0).toLowerCase() + foundModel.slice(1) + 's', // Products -> products
              foundModel.charAt(0).toLowerCase() + foundModel.slice(1)        // Products -> product
            ];
            
            // The list query is the one returning [Model!]; naming guesses miss plurals like outsideHistories.
            const returnsList = (name: string) => {
              let t: any = queryFields[name]?.type;
              if (t && isNonNullType(t)) t = t.ofType;
              return Boolean(t && isListType(t));
            };
            operationName = Object.keys(queryFields).find(name => {
              if (!returnsList(name)) return false;
              let t: any = queryFields[name].type;
              while (t && (isListType(t) || isNonNullType(t))) t = t.ofType;
              return t?.name === foundModel;
            }) ?? possibleNames.find(name => queryFields[name] && returnsList(name)) ?? null;
          }
          
          if (!operationName) {
            return new Response(JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: `No query operation found for model '${modelName}'`,
                    foundModel,
                    availableOperations: schema.getQueryType() ? Object.keys(schema.getQueryType()!.getFields()) : []
                  }, null, 2),
                }],
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          
          // Get the actual fields available on this model by checking the GraphQL schema
          const queryField = schema.getQueryType()?.getFields()[operationName];
          const returnType = queryField?.type;
          let availableFields: string[] = [];
          
          // Extract the element type from list types and non-null wrappers
          let elementType = returnType;
          while (elementType && (isListType(elementType) || isNonNullType(elementType))) {
            elementType = elementType.ofType;
          }
          
          if (elementType && 'getFields' in elementType && typeof elementType.getFields === 'function') {
            const modelFields = elementType.getFields();
            availableFields = Object.keys(modelFields);
          }
          
          // Build search conditions using only fields that exist on the model
          const searchConditions = [];
          const searchTerm = searchQuery.trim();
          
          // Add ID search (exact match) - ID should always exist
          if (searchTerm && availableFields.includes('id')) {
            searchConditions.push(`{ id: { equals: $id } }`);
          }
          
          // Add text field search (case-insensitive contains) for fields that exist
          const commonSearchFields = ['name', 'title', 'label', 'description', 'email'];
          const whereInput = schema.getType(`${foundModel}WhereInput`);
          const filterable = whereInput && isInputObjectType(whereInput) ? Object.keys(whereInput.getFields()) : [];
          const validSearchFields = commonSearchFields.filter(field => availableFields.includes(field) && filterable.includes(field));
          
          for (const fieldName of searchTerm ? validSearchFields : []) {
            searchConditions.push(`{ ${fieldName}: { contains: $term, mode: insensitive } }`);
          }
          
          // Build the GraphQL query manually to avoid JSON.stringify issues with enums
          let whereClause = '';
          if (searchConditions.length > 0) {
            whereClause = `where: { OR: [${searchConditions.join(', ')}] },`;
          }
          
          let built;
          try { built = buildSelection(schema, operationName, fields); } catch (error) {
            if (!(error instanceof SelectionError)) throw error;
            return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: error.message } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          // The term travels as a variable, never inside the query text.
          const declared = [searchConditions.some(c => c.includes('$id')) ? '$id: ID!' : '', validSearchFields.length && searchTerm ? '$term: String!' : '', '$take: Int!'].filter(Boolean).join(', ');
          const queryString = `query Search${foundModel}(${declared}) { ${built.operation}(${whereClause} take: $take) { ${built.selection} } }`;
          const variables: Record<string, unknown> = { take: boundedTake(limit) };
          if (declared.includes('$id')) variables.id = searchTerm;
          if (declared.includes('$term')) variables.term = searchTerm;
          const result = await executeGraphQL(queryString, graphqlEndpoint, auth, variables);
          
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  searchQuery: searchTerm,
                  modelName: foundModel,
                  operationName,
                  availableFields,
                  validSearchFields,
                  queryUsed: queryString,
                  results: result,
                  total: result?.data?.[operationName]?.length || 0
                }, null, 2),
              }],
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        
        const domain = DOMAIN_TOOLS.find((tool) => tool.name === name);
        if (domain) {
          const output = await runDomainTool(domain, args ?? {}, { graphqlEndpoint, auth });
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] },
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...(domain.writes ? { 'X-Data-Changed': 'true' } : {}) },
          });
        }

        throw new Error(`Tool ${name} not found`);
      } catch (error) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [{
              type: 'text',
              text: `Error executing ${name}: ${error}`,
            }],
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32601, message: 'Method not found' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { 
        code: -32603, 
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error)
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Stateless Streamable HTTP: no server-initiated SSE stream, so GET is 405 (MCP spec).
export async function GET() {
  return new Response(JSON.stringify({ error: 'Method not allowed. POST JSON-RPC to this endpoint.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });
}

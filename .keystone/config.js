"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core10 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_access = require("@keystone-6/core/access");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/access.ts
var permissionNames = [
  // Starter and fleet-standard
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canAccessDashboard",
  "canManageOnboarding",
  "canManagePayments",
  "canIssueRefunds",
  "canReadAudit",
  // Practice, locations and adapters
  "canManagePractice",
  "canManageAdapters",
  "canApproveAdapters",
  "canAccessAllLocations",
  // Patients
  "canManagePatients",
  "canApprovePatientMerge",
  "canReadDemographics",
  // Scheduling
  "canManageSchedule",
  "canOverrideSchedule",
  "canOverrideTemplate",
  "canOverrideLabGate",
  "canReadSchedule",
  // Clinical
  "canChart",
  "canCompleteProcedures",
  "canSignClinicalNotes",
  "canPrescribe",
  "canManagePerio",
  "canManageLabCases",
  "canApproveClinicalCorrections",
  "canReadClinical",
  "canReadSensitive",
  // Treatment
  "canManageTreatmentPlans",
  "canPresentPlans",
  // Codes and fees
  "canManageFees",
  "canImportCodes",
  "canApproveCodeImport",
  "canApproveFeePublish",
  // Insurance
  "canManageInsurance",
  "canVerifyBenefits",
  "canReadInsurance",
  // Claims
  "canManageClaims",
  "canSubmitClaims",
  "canOverrideScrub",
  "canPostRemittances",
  // Ledger
  "canTakePayments",
  "canAdjust",
  "canCloseDay",
  "canClosePeriod",
  "canApproveAdjustments",
  "canApproveRefunds",
  "canApprovePeriodReopen",
  "canReadLedger",
  // Memberships
  "canManageMemberships",
  // Communications
  "canMessagePatients",
  "canManageTemplates",
  "canReplyReviews",
  // AI action layer
  "canManageAgents",
  "canDecideProposals",
  "canDecideClaimProposals",
  "canDecideClinicalProposals",
  "canDecideFinancialProposals",
  "canApproveAgentGrants",
  "canApproveAutonomy",
  "canReadSignals",
  // Privacy and compliance. canBreakGlass and canBreakGlassRecords are never on a default role.
  "canManageCompliance",
  "canBreakGlass",
  "canBreakGlassRecords",
  "canReviewPrivacy",
  "canApproveRetention",
  "canReadPhiAudit",
  // Data
  "canImportData",
  "canExportData",
  "canApproveImports"
];
var NEVER_DEFAULT = ["canBreakGlass", "canBreakGlassRecords"];
var approvalPermissions = permissionNames.filter((name) => name.startsWith("canApprove") || name === "canBreakGlass" || name === "canBreakGlassRecords");
var isSignedIn = ({ session }) => {
  if (!session) return false;
  const expires = session.data?.accessExpiresAt;
  return !expires || Date.parse(expires) > Date.now();
};
var hasPermission = (session, permission) => isSignedIn({ session }) && session?.data.role?.[permission] === true;
var permissions = Object.fromEntries(
  permissionNames.map((name) => [name, ({ session }) => hasPermission(session, name)])
);
var anyOf = (...names) => ({ session }) => names.some((name) => hasPermission(session, name));
var sys = () => false;
var today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
function sessionLocationIds(session) {
  if (!isSignedIn({ session })) return [];
  if (session.data.role?.canAccessAllLocations) return null;
  const day2 = today();
  return (session.data.assignments ?? []).filter((a) => a.location?.id && (!a.startsOn || a.startsOn <= day2) && (!a.endsOn || a.endsOn >= day2)).map((a) => a.location.id);
}
var rules = {
  canReadPeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canSeeOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } },
  canUpdatePeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canEditOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } },
  /** Row filter for lists with a `location` relationship. */
  atMyLocations: (field = "location") => ({ session }) => {
    const ids = sessionLocationIds(session);
    if (ids === null) return true;
    return { [field]: { id: { in: ids } } };
  }
};

// features/keystone/models/User.ts
var serverSecret = { access: { read: import_access.denyAll, create: sys, update: sys }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } } };
var User = (0, import_core.list)({
  access: {
    operation: {
      ...(0, import_access.allOperations)(isSignedIn),
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") return true;
        return permissions.canManagePeople(args);
      },
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "title", "role", "kind"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields2.text)({ validation: { isRequired: true } }),
    email: (0, import_fields2.text)({ isFilterable: false, isOrderable: false, isIndexed: "unique", validation: { isRequired: true } }),
    password: (0, import_fields2.password)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
      ui: { itemView: { fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read" } }
    }),
    kind: (0, import_fields2.select)({
      type: "enum",
      options: ["staff", "patient_portal", "auditor", "machine"].map((value) => ({ label: value.replace("_", " "), value })),
      defaultValue: "staff",
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople }
    }),
    title: (0, import_fields2.text)(),
    assignments: (0, import_fields2.relationship)({ ref: "StaffAssignment.user", many: true, ui: { itemView: { fieldMode: "read" } } }),
    providerProfile: (0, import_fields2.relationship)({ ref: "ProviderProfile.user", ui: { itemView: { fieldMode: "read" } } }),
    accessExpiresAt: (0, import_fields2.timestamp)({
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
      ui: { description: "Time-boxed access for auditors and bookkeepers." }
    }),
    // MFA (BUILD-PLAN Phase 0 auth hardening). Factor material is sealed in SecretBox.
    mfaEnrolled: (0, import_fields2.checkbox)({ defaultValue: false, access: { create: sys, update: sys } }),
    mfaSecretId: (0, import_fields2.text)({ ...serverSecret, db: { isNullable: true } }),
    mfaPendingSecretId: (0, import_fields2.text)({ ...serverSecret, db: { isNullable: true } }),
    mfaPendingExpiresAt: (0, import_fields2.timestamp)({ ...serverSecret, db: { isNullable: true } }),
    mfaLastCounter: (0, import_fields2.integer)({ defaultValue: -1, ...serverSecret }),
    mfaRecoveryHashes: (0, import_fields2.text)({ defaultValue: "[]", ...serverSecret }),
    mfaFailures: (0, import_fields2.integer)({ defaultValue: 0, ...serverSecret }),
    mfaLockedUntil: (0, import_fields2.timestamp)({ ...serverSecret, db: { isNullable: true } }),
    quickSwitchPinHash: (0, import_fields2.text)({ ...serverSecret, db: { isNullable: true } }),
    authVersion: (0, import_fields2.integer)({ defaultValue: 1, access: { read: import_access.denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: "hidden" } } }),
    onboardingStatus: (0, import_fields2.select)({
      options: ["not_started", "in_progress", "completed", "dismissed"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      defaultValue: "not_started"
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");
var Role = (0, import_core2.list)({
  access: {
    operation: {
      ...(0, import_access3.allOperations)(permissions.canManageRoles),
      query: isSignedIn
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    description: (0, import_fields3.text)({ ui: { displayMode: "textarea" } }),
    ...Object.fromEntries(permissionNames.map((name) => [name, (0, import_fields3.checkbox)({ defaultValue: false })])),
    ...trackingFields,
    assignedTo: (0, import_fields3.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    })
  }
});

// features/keystone/models/OAuthApp.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");

// features/keystone/mcp-oauth/core.ts
var import_node_crypto = __toESM(require("node:crypto"));
var MCP_SCOPES = ["mcp:read", "mcp:write"];
var MCP_ACCESS_PREFIX = "mcp_at_";
var ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1e3;
var CONSENT_TICKET_TTL_MS = 10 * 60 * 1e3;
var DEVELOPMENT_SECRET = "this secret should only be used in testing";
function secret() {
  return process.env.SESSION_SECRET || DEVELOPMENT_SECRET;
}
function randomToken(prefix, bytes = 32) {
  return `${prefix}${import_node_crypto.default.randomBytes(bytes).toString("base64url")}`;
}
function digestToken(token, purpose = "mcp-oauth-token") {
  return import_node_crypto.default.createHmac("sha256", secret()).update(`${purpose}\0${token}`, "utf8").digest("hex");
}
function bearerToken(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : null;
}
function isMcpAccessToken(token) {
  return typeof token === "string" && token.startsWith(MCP_ACCESS_PREFIX) && token.length > MCP_ACCESS_PREFIX.length;
}
function storedScopes(value) {
  return Array.isArray(value) ? MCP_SCOPES.filter((scope) => value.includes(scope)) : [];
}

// features/keystone/models/OAuthApp.ts
var OAuthApp = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    name: (0, import_fields4.text)({
      validation: {
        isRequired: true
      }
    }),
    clientId: (0, import_fields4.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ operation, resolvedData }) => {
          if (operation === "create" && !resolvedData.clientId) {
            return randomToken("mcp_cl_", 18);
          }
          return resolvedData.clientId;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Auto-generated unique identifier for your application."
      }
    }),
    clientSecret: (0, import_fields4.text)({
      access: {
        read: () => false
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          if (resolvedData.clientSecret) {
            return digestToken(resolvedData.clientSecret, "oauth-client-secret");
          }
          return void 0;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        description: "Stored only as a digest. Public MCP clients have no secret."
      }
    }),
    tokenEndpointAuthMethod: (0, import_fields4.select)({
      options: [
        { label: "Client secret (POST)", value: "client_secret_post" },
        { label: "Client secret (Basic)", value: "client_secret_basic" },
        { label: "None (public PKCE client)", value: "none" }
      ],
      defaultValue: "client_secret_post",
      ui: {
        description: "How the app authenticates at the token endpoint. MCP clients are public (none)."
      }
    }),
    redirectUris: (0, import_fields4.json)({
      defaultValue: [],
      ui: {
        description: "Array of allowed redirect URIs for OAuth callbacks"
      }
    }),
    scopes: (0, import_fields4.json)({
      defaultValue: [...MCP_SCOPES],
      ui: {
        description: "Array of allowed OAuth scopes. MCP scopes only narrow the signed-in user's own access."
      }
    }),
    webhookUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to receive webhook notifications"
      }
    }),
    status: (0, import_fields4.select)({
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" }
      ],
      defaultValue: "active"
    }),
    installUrl: (0, import_fields4.text)({
      ui: {
        description: "URL where users can install this app"
      }
    }),
    uninstallUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to handle app uninstallation"
      }
    }),
    description: (0, import_fields4.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    metadata: (0, import_fields4.json)({
      defaultValue: {},
      ui: {
        description: "Additional app-specific configuration and settings"
      }
    }),
    developerEmail: (0, import_fields4.text)(),
    privacyPolicyUrl: (0, import_fields4.text)(),
    termsOfServiceUrl: (0, import_fields4.text)(),
    supportUrl: (0, import_fields4.text)(),
    ...trackingFields
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "clientId", "status", "createdAt"]
    }
  }
});

// features/keystone/models/OAuthToken.ts
var import_core5 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var digestTokenInput = {
  resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] ? digestToken(resolvedData[fieldKey]) : resolvedData[fieldKey]
};
var OAuthToken = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    tokenType: (0, import_fields5.select)({
      options: [
        { label: "Authorization Code", value: "authorization_code" },
        { label: "Access Token", value: "access_token" },
        { label: "Refresh Token", value: "refresh_token" }
      ],
      validation: {
        isRequired: true
      }
    }),
    token: (0, import_fields5.text)({
      access: { read: () => false },
      validation: {
        isRequired: true
      },
      isIndexed: "unique",
      hooks: digestTokenInput
    }),
    clientId: (0, import_fields5.text)({
      validation: {
        isRequired: true
      },
      isIndexed: true
    }),
    user: (0, import_fields5.relationship)({
      ref: "User",
      ui: {
        description: "The user who authorized this token"
      }
    }),
    scopes: (0, import_fields5.json)({
      defaultValue: [],
      ui: {
        description: "Array of granted scopes"
      }
    }),
    redirectUri: (0, import_fields5.text)({
      ui: {
        description: "The redirect URI used during authorization"
      }
    }),
    resource: (0, import_fields5.text)({
      ui: {
        description: "The MCP endpoint (RFC 8707 resource) this grant is for"
      }
    }),
    expiresAt: (0, import_fields5.timestamp)({
      ui: {
        description: "When this token expires"
      }
    }),
    isRevoked: (0, import_fields5.select)({
      options: [
        { label: "Active", value: "false" },
        { label: "Revoked", value: "true" }
      ],
      defaultValue: "false"
    }),
    authorizationCode: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "The authorization code that was exchanged for this token (for access tokens)"
      }
    }),
    refreshToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated refresh token (for access tokens)"
      }
    }),
    accessToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated access token (for refresh tokens)"
      }
    }),
    state: (0, import_fields5.text)({
      ui: {
        description: "OAuth state parameter for CSRF protection"
      }
    }),
    codeChallenge: (0, import_fields5.text)({
      ui: {
        description: "PKCE code challenge"
      }
    }),
    codeChallengeMethod: (0, import_fields5.select)({
      options: [
        { label: "Plain", value: "plain" },
        { label: "SHA256", value: "S256" }
      ],
      ui: {
        description: "PKCE code challenge method"
      }
    }),
    ...trackingFields
  },
  ui: {
    labelField: "clientId",
    listView: {
      initialColumns: ["tokenType", "clientId", "user", "scopes", "expiresAt", "isRevoked"]
    }
  }
});

// features/keystone/models/platform.ts
var platform_exports = {};
__export(platform_exports, {
  ADAPTER_AREAS: () => ADAPTER_AREAS,
  AdapterInstallation: () => AdapterInstallation,
  ApprovalDecision: () => ApprovalDecision,
  ApprovalPolicy: () => ApprovalPolicy,
  ApprovalRequest: () => ApprovalRequest,
  AuditEvent: () => AuditEvent,
  BillingEntity: () => BillingEntity,
  BreakGlassEvent: () => BreakGlassEvent,
  BusinessAssociate: () => BusinessAssociate,
  CommandReceipt: () => CommandReceipt,
  Credential: () => Credential,
  Document: () => Document,
  InboundObservation: () => InboundObservation,
  InferenceProvider: () => InferenceProvider,
  Job: () => Job,
  JurisdictionPack: () => JurisdictionPack,
  Lease: () => Lease,
  Location: () => Location,
  MachineCredential: () => MachineCredential,
  Notification: () => Notification,
  OUTBOX_TOPICS: () => OUTBOX_TOPICS,
  OutboxEvent: () => OutboxEvent,
  PhiReadAudit: () => PhiReadAudit,
  PracticeSettings: () => PracticeSettings,
  ProviderProfile: () => ProviderProfile,
  RateLimitBucket: () => RateLimitBucket,
  SecretBox: () => SecretBox,
  Sequence: () => Sequence,
  StaffAssignment: () => StaffAssignment
});
var import_core7 = require("@keystone-6/core");
var import_access8 = require("@keystone-6/core/access");
var import_fields7 = require("@keystone-6/core/fields");

// features/keystone/models/domainFields.ts
var import_fields6 = require("@keystone-6/core/fields");
var minor = (options = {}) => (0, import_fields6.bigInt)({
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0 },
  ...options.description ? { ui: { description: options.description } } : {}
});
var exact = (precision, scale) => (options = {}) => (0, import_fields6.decimal)({
  precision,
  scale,
  validation: { isRequired: options.required ?? false },
  ...options.description ? { ui: { description: options.description } } : {}
});
var pct = exact(9, 4);
var dec62 = exact(6, 2);
var rate = exact(28, 12);
var option = (value) => ({ label: value.replaceAll("_", " ").replaceAll(".", " \xB7 "), value });
var lifecycle = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  defaultValue: initial,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var choice = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  ...initial !== null ? { defaultValue: initial } : {},
  validation: { isRequired: initial !== null }
});
var versionField = () => (0, import_fields6.integer)({
  defaultValue: 0,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var systemText = (options = {}) => (0, import_fields6.text)({
  ...options.indexed ? { isIndexed: options.indexed } : {},
  validation: { isRequired: options.required ?? false },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var readOnly = { access: { create: () => false, update: () => false }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } } };
var fixedChoice = (values) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});

// features/keystone/models/listAccess.ts
var rule = (permission) => permission === "signedIn" ? isSignedIn : Array.isArray(permission) ? anyOf(...permission) : permissions[permission];
var governed = (read) => ({
  operation: { query: rule(read), create: sys, update: sys, delete: sys }
});
var managed = (read, write) => ({
  operation: { query: rule(read), create: rule(write), update: rule(write), delete: sys }
});
var immutable = governed;
var serverOnly = {
  operation: { query: sys, create: sys, update: sys, delete: sys }
};

// features/keystone/models/platform.ts
var PracticeSettings = (0, import_core7.list)({
  isSingleton: true,
  graphql: { plural: "PracticeSettingsItems" },
  access: { operation: { query: isSignedIn, create: permissions.canManagePractice, update: permissions.canManagePractice, delete: sys } },
  fields: {
    legalName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Dental" }),
    displayName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Dental" }),
    isSynthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "Sample practice: synthetic data. Synthetic records can never reach a live adapter." } }),
    defaultTimeZone: (0, import_fields7.text)({ defaultValue: "America/New_York", validation: { isRequired: true } }),
    currencyCode: (0, import_fields7.text)({ defaultValue: "USD", validation: { isRequired: true, match: { regex: /^[A-Z]{3}$/ } } }),
    toothNumbering: choice(["universal", "fdi", "palmer"], "universal"),
    scheduleUnitMinutes: (0, import_fields7.integer)({ defaultValue: 10, validation: { isRequired: true, min: 5, max: 15 } }),
    lateCancelHours: (0, import_fields7.integer)({ defaultValue: 24, validation: { min: 0, max: 168 } }),
    noShowAfterMinutes: (0, import_fields7.integer)({ defaultValue: 15, validation: { min: 1, max: 240 } }),
    inactiveAfterMonths: (0, import_fields7.integer)({ defaultValue: 18, validation: { min: 1, max: 120 } }),
    backdateDays: (0, import_fields7.integer)({ defaultValue: 3, validation: { min: 0, max: 60 } }),
    noteSignHours: (0, import_fields7.integer)({ defaultValue: 24, validation: { min: 1, max: 720 } }),
    mergeRevertDays: (0, import_fields7.integer)({ defaultValue: 30, validation: { min: 0, max: 365 } }),
    eligibilityCacheMinutes: (0, import_fields7.integer)({ defaultValue: 60, validation: { min: 0, max: 10080 } }),
    creditReviewDays: (0, import_fields7.integer)({ defaultValue: 60, validation: { min: 1, max: 730 } }),
    minStatementMinor: minor({ defaultValue: 500n }),
    recallLeadDays: (0, import_fields7.integer)({ defaultValue: 30, validation: { min: 0, max: 180 } }),
    sessionHours: (0, import_fields7.integer)({ defaultValue: 12, validation: { min: 1, max: 24 }, ui: { description: "Staff sessions end after this many hours; signing and money actions re-check the second factor." } }),
    // Controls below change only through the maker-checker mutation requestPracticeControls.
    breakGlassMinutes: (0, import_fields7.integer)({ ...readOnly, defaultValue: 60 }),
    strictAgentOwnerSoD: (0, import_fields7.checkbox)({ ...readOnly, defaultValue: true }),
    aiAutonomyAllowed: (0, import_fields7.checkbox)({ ...readOnly, defaultValue: false }),
    requireStaffMfa: (0, import_fields7.checkbox)({ ...readOnly, defaultValue: true }),
    version: versionField(),
    ...trackingFields
  }
});
var Location = (0, import_core7.list)({
  access: { operation: { query: isSignedIn, create: permissions.canManagePractice, update: permissions.canManagePractice, delete: sys } },
  ui: { labelField: "name", listView: { initialColumns: ["code", "name", "timeZone", "jurisdiction", "isActive"] } },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    code: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z0-9]{2,8}$/, explanation: "2-8 capital letters or digits" } } }),
    address: (0, import_fields7.json)({ defaultValue: {} }),
    phone: (0, import_fields7.text)(),
    email: (0, import_fields7.text)(),
    timeZone: (0, import_fields7.text)({ defaultValue: "America/New_York", validation: { isRequired: true } }),
    jurisdiction: (0, import_fields7.relationship)({ ref: "JurisdictionPack.locations" }),
    npiType2: (0, import_fields7.text)({ ui: { description: "Organisation NPI (10 digits, Luhn check with the 80840 prefix)." } }),
    taxonomyCode: (0, import_fields7.text)(),
    placeOfServiceCode: (0, import_fields7.text)({ defaultValue: "11" }),
    stateFacilityPermit: (0, import_fields7.text)(),
    hours: (0, import_fields7.json)({ defaultValue: {}, ui: { description: 'Weekday (0-6) \u2192 [["08:00","17:00"], \u2026] local time.' } }),
    billingEntity: (0, import_fields7.relationship)({ ref: "BillingEntity.locations" }),
    staff: (0, import_fields7.relationship)({ ref: "StaffAssignment.location", many: true, ui: { itemView: { fieldMode: "read" } } }),
    isActive: (0, import_fields7.checkbox)({ defaultValue: true }),
    isSynthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var BillingEntity = (0, import_core7.list)({
  access: managed(["canManagePractice", "canReadLedger"], "canManagePractice"),
  ui: { labelField: "legalName" },
  fields: {
    legalName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    tinLast4: (0, import_fields7.text)({ validation: { match: { regex: /^(\d{4})?$/, explanation: "Last four digits only" } } }),
    tinSecretId: (0, import_fields7.text)({ access: { read: import_access8.denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: "hidden" } } }),
    npiType2: (0, import_fields7.text)(),
    address: (0, import_fields7.json)({ defaultValue: {} }),
    payToAddress: (0, import_fields7.json)({ defaultValue: {} }),
    clearinghouseSubmitterIds: (0, import_fields7.json)({ defaultValue: {} }),
    locations: (0, import_fields7.relationship)({ ref: "Location.billingEntity", many: true }),
    ...trackingFields
  }
});
var StaffAssignment = (0, import_core7.list)({
  access: { operation: { query: isSignedIn, create: permissions.canManagePeople, update: permissions.canManagePeople, delete: sys } },
  ui: { listView: { initialColumns: ["user", "location", "role", "startsOn", "endsOn"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.assignments" }),
    location: (0, import_fields7.relationship)({ ref: "Location.staff" }),
    role: (0, import_fields7.relationship)({ ref: "Role", ui: { description: "Overrides the person\u2019s default role at this location." } }),
    startsOn: (0, import_fields7.calendarDay)({ validation: { isRequired: true } }),
    endsOn: (0, import_fields7.calendarDay)(),
    ...trackingFields
  }
});
var ProviderProfile = (0, import_core7.list)({
  access: { operation: { query: isSignedIn, create: permissions.canManagePeople, update: permissions.canManagePeople, delete: sys } },
  ui: { labelField: "displayName", listView: { initialColumns: ["displayName", "providerType", "specialty", "npiType1", "isActive"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.providerProfile" }),
    displayName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    abbreviation: (0, import_fields7.text)({ validation: { isRequired: true, match: { regex: /^[A-Z0-9]{2,6}$/, explanation: "2-6 capital letters" } }, isIndexed: "unique" }),
    providerType: choice(["dentist", "hygienist", "assistant", "specialist", "other"], "dentist"),
    specialty: choice(["general", "pediatric", "ortho", "perio", "endo", "oral_surgery", "prostho", "other"], "general"),
    npiType1: (0, import_fields7.text)({ isIndexed: "unique", db: { isNullable: true }, validation: { isRequired: false } }),
    taxonomyCode: (0, import_fields7.text)(),
    credentials: (0, import_fields7.relationship)({ ref: "Credential.holder", many: true }),
    payerProviderIds: (0, import_fields7.json)({ defaultValue: {} }),
    supervisionClass: (0, import_fields7.text)({ ui: { description: "Jurisdiction pack vocabulary, e.g. dentist, rdh_general, eda_radiography." } }),
    colour: (0, import_fields7.text)({ defaultValue: "#2563eb", validation: { match: { regex: /^#[0-9a-fA-F]{6}$/ } } }),
    productionCreditMode: choice(["rendering", "primary_provider"], "rendering"),
    isActive: (0, import_fields7.checkbox)({ defaultValue: true }),
    isSynthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var Credential = (0, import_core7.list)({
  access: managed(["canManagePeople", "canManageCompliance"], ["canManagePeople", "canManageCompliance"]),
  ui: { labelField: "kind", listView: { initialColumns: ["holder", "kind", "jurisdiction", "expiresOn", "status"] } },
  fields: {
    holder: (0, import_fields7.relationship)({ ref: "ProviderProfile.credentials" }),
    staffUser: (0, import_fields7.relationship)({ ref: "User", ui: { description: "For staff certificates without a provider profile." } }),
    kind: choice(["dental_licence", "hygiene_licence", "da_radiography", "dea", "state_controlled_substance", "cpr_bls", "sedation_permit", "other"], "dental_licence"),
    jurisdiction: (0, import_fields7.text)({ defaultValue: "US-FL" }),
    numberLast4: (0, import_fields7.text)({ ui: { description: "Shown to staff. DEA numbers are stored sealed; this is the last four only." } }),
    numberSecretId: (0, import_fields7.text)({ access: { read: import_access8.denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: "hidden" } } }),
    issuedOn: (0, import_fields7.calendarDay)(),
    expiresOn: (0, import_fields7.calendarDay)(),
    status: choice(["active", "expired", "suspended"], "active"),
    evidence: (0, import_fields7.relationship)({ ref: "Document" }),
    ...trackingFields
  }
});
var MachineCredential = (0, import_core7.list)({
  access: governed("canManageAgents"),
  ui: { labelField: "name" },
  fields: {
    name: systemText({ required: true }),
    agent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    tokenDigest: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { read: import_access8.denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: "hidden" } } }),
    tokenPrefix: systemText(),
    status: lifecycle(["active", "revoked"]),
    expiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    lastUsedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    ...trackingFields
  }
});
var BreakGlassEvent = (0, import_core7.list)({
  access: governed(["canReviewPrivacy", "canBreakGlass", "canBreakGlassRecords"]),
  ui: { labelField: "reason", listView: { initialColumns: ["user", "subjectType", "status", "openedAt", "expiresAt"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    kind: fixedChoice(["location_scope", "records_override"]),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ indexed: true, required: true }),
    location: (0, import_fields7.relationship)({ ref: "Location", ...readOnly }),
    reason: systemText({ required: true }),
    openedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    expiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    endedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["active", "ended", "reviewed_ok", "reviewed_violation"]),
    reviewedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    reviewNote: systemText(),
    version: versionField(),
    ...trackingFields
  }
});
var AuditEvent = (0, import_core7.list)({
  access: immutable("canReadAudit"),
  ui: { labelField: "eventType", listView: { initialColumns: ["seq", "at", "eventType", "entityType", "entityId", "actorUser"], initialSort: { field: "seq", direction: "DESC" } } },
  fields: {
    seq: (0, import_fields7.integer)({ isIndexed: "unique", validation: { isRequired: true }, ...readOnly }),
    eventKey: systemText({ indexed: "unique", required: true }),
    eventType: systemText({ indexed: true, required: true }),
    entityType: systemText({ indexed: true, required: true }),
    entityId: systemText({ indexed: true, required: true }),
    actorUser: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    actorAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    approver: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    reason: systemText(),
    before: (0, import_fields7.json)({ ...readOnly }),
    after: (0, import_fields7.json)({ ...readOnly }),
    metadata: (0, import_fields7.json)({ ...readOnly }),
    requestId: systemText(),
    prevHash: systemText({ required: true }),
    hash: systemText({ indexed: "unique", required: true }),
    at: (0, import_fields7.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, ...readOnly })
  }
});
var CommandReceipt = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    command: (0, import_fields7.text)({ validation: { isRequired: true } }),
    principalKey: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestHash: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields7.json)(),
    responseCode: (0, import_fields7.text)(),
    responseBody: (0, import_fields7.json)(),
    recoveryPoint: (0, import_fields7.text)({ defaultValue: "completed" }),
    completedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" } }),
    ...trackingFields
  }
});
var OUTBOX_TOPICS = [
  "claim.submit",
  "claim.status",
  "eligibility.check",
  "era.fetch",
  "attachment.upload",
  "message.send",
  "payment.create",
  "payment.refund",
  "erx.send",
  "lab.send",
  "review.reply",
  "inference.call",
  "webhook.out",
  "audit.anchor",
  "notify.approval",
  "notify.staff",
  "confirmation.dispatch"
];
var OutboxEvent = (0, import_core7.list)({
  access: governed(["canManagePractice", "canManageAdapters"]),
  ui: { listView: { initialColumns: ["topic", "status", "attempts", "nextAttemptAt", "aggregateType", "aggregateId"] } },
  fields: {
    topic: systemText({ indexed: true, required: true }),
    aggregateType: systemText({ required: true }),
    aggregateId: systemText({ indexed: true, required: true }),
    dedupeKey: systemText({ indexed: "unique", required: true }),
    payload: (0, import_fields7.json)({ ...readOnly, access: { read: anyOf("canManageAdapters"), create: sys, update: sys } }),
    adapterKey: systemText(),
    mode: (0, import_fields7.select)({ type: "string", options: ["manual_export", "sandbox", "live"].map((value) => ({ label: value.replace("_", " "), value })), defaultValue: "manual_export", ...readOnly }),
    isSynthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    status: lifecycle(["pending", "leased", "delivered", "failed", "dead", "blocked"]),
    attempts: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    nextAttemptAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    leaseOwner: systemText(),
    leaseExpiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    lastError: systemText(),
    deliveredAt: (0, import_fields7.timestamp)({ ...readOnly }),
    ...trackingFields
  }
});
var InboundObservation = (0, import_core7.list)({
  access: governed(["canManageAdapters"]),
  ui: { listView: { initialColumns: ["source", "kind", "externalId", "receivedAt", "appliedAt"] } },
  fields: {
    source: systemText({ indexed: true, required: true }),
    kind: fixedChoice(["webhook", "poll", "file", "response"]),
    externalId: systemText(),
    contentHash: systemText({ required: true }),
    raw: (0, import_fields7.relationship)({ ref: "Document", ...readOnly }),
    rawSecretId: (0, import_fields7.text)({ access: { read: import_access8.denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: "hidden" } } }),
    receivedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    appliedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    applyResult: (0, import_fields7.json)({ ...readOnly }),
    isSynthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var Lease = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    owner: (0, import_fields7.text)({ validation: { isRequired: true } }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 1, validation: { isRequired: true } }),
    expiresAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});
var RateLimitBucket = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    windowStart: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    count: (0, import_fields7.integer)({ defaultValue: 0, validation: { isRequired: true } }),
    ...trackingFields
  }
});
var Job = (0, import_core7.list)({
  access: governed(["canManagePractice", "canManageAdapters"]),
  fields: {
    kind: systemText({ indexed: "unique", required: true }),
    intervalSeconds: (0, import_fields7.integer)({ ...readOnly }),
    nextRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    lastRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["idle", "running", "failed", "disabled"], "idle"),
    leaseKey: systemText(),
    lastError: systemText(),
    ...trackingFields
  }
});
var Sequence = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    nextValue: (0, import_fields7.integer)({ defaultValue: 1, validation: { isRequired: true } })
  }
});
var Notification = (0, import_core7.list)({
  access: {
    operation: { query: permissions.canAccessDashboard, create: sys, update: permissions.canAccessDashboard, delete: sys },
    filter: {
      query: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false,
      update: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false
    }
  },
  fields: {
    recipient: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    channel: choice(["in_app", "email"], "in_app"),
    template: systemText({ required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    status: lifecycle(["pending", "sent", "failed"]),
    sentAt: (0, import_fields7.timestamp)({ ...readOnly }),
    readAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var ApprovalPolicy = (0, import_core7.list)({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManagePractice, update: sys, delete: sys } },
  ui: { labelField: "action" },
  fields: {
    action: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    description: (0, import_fields7.text)(),
    requiredPermission: (0, import_fields7.text)({ validation: { isRequired: true } }),
    minApprovals: (0, import_fields7.integer)({ defaultValue: 1, validation: { min: 1 } }),
    thresholdMinor: minor(),
    expiresAfterMinutes: (0, import_fields7.integer)({ defaultValue: 1440 }),
    ...trackingFields
  }
});
var ApprovalRequest = (0, import_core7.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "action", listView: { initialColumns: ["action", "status", "targetList", "requestedBy", "createdAt", "expiresAt"] } },
  fields: {
    action: systemText({ indexed: true, required: true }),
    summary: systemText(),
    targetList: systemText({ required: true }),
    targetId: systemText({ indexed: true, required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    requiredPermission: systemText({ required: true }),
    requestedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    requestedByAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    status: lifecycle(["pending", "approved", "rejected", "expired", "cancelled"]),
    expiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    consumedAt: (0, import_fields7.timestamp)({ ...readOnly, ui: { ...readOnly.ui, description: "When the approved action was carried out. An approval is used once." } }),
    decisions: (0, import_fields7.relationship)({ ref: "ApprovalDecision.request", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ApprovalDecision = (0, import_core7.list)({
  access: immutable("canAccessDashboard"),
  fields: {
    request: (0, import_fields7.relationship)({ ref: "ApprovalRequest.decisions", ...readOnly }),
    decidedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    decision: (0, import_fields7.select)({ type: "string", options: ["approve", "reject"].map((value) => ({ label: value, value })), validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    at: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly })
  }
});
var Document = (0, import_core7.list)({
  access: governed("canAccessDashboard"),
  fields: {
    title: (0, import_fields7.text)({ validation: { isRequired: true } }),
    kind: choice(["radiograph", "photo", "clinical_attachment", "eob", "era", "claim_attachment", "consent", "form", "id_card", "insurance_card", "statement", "baa", "credential", "policy", "export", "import", "transcript", "recording", "other"], "other"),
    phiTier: choice(["none", "dem", "clin", "sens", "ins", "fin"], "none"),
    storageKey: systemText(),
    sha256: systemText(),
    mimeType: systemText(),
    sizeBytes: (0, import_fields7.integer)({ ...readOnly }),
    documentVersion: (0, import_fields7.integer)({ defaultValue: 1, ...readOnly }),
    supersedes: (0, import_fields7.relationship)({ ref: "Document", ...readOnly }),
    uploadedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    retentionUntil: (0, import_fields7.calendarDay)(),
    signedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    isSynthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var SecretBox = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    purpose: (0, import_fields7.text)({ validation: { isRequired: true } }),
    ciphertext: (0, import_fields7.text)({ validation: { isRequired: true } }),
    iv: (0, import_fields7.text)({ validation: { isRequired: true } }),
    authTag: (0, import_fields7.text)({ validation: { isRequired: true } }),
    keyVersion: (0, import_fields7.integer)({ defaultValue: 1 }),
    ...trackingFields
  }
});
var ADAPTER_AREAS = [
  "clearinghouse",
  "benefits",
  "attachments",
  "payments",
  "financing",
  "messaging",
  "voice",
  "inference",
  "erx",
  "imaging",
  "radiograph_ai",
  "lab",
  "reviews",
  "accounting",
  "calendar",
  "code_licence",
  "import"
];
var AdapterInstallation = (0, import_core7.list)({
  access: governed(["canManageAdapters", "canApproveAdapters", "canManagePractice"]),
  ui: { labelField: "adapterKey", listView: { initialColumns: ["area", "adapterKey", "mode", "status", "lastVerifiedAt"] } },
  fields: {
    area: fixedChoice(ADAPTER_AREAS),
    adapterKey: systemText({ required: true }),
    displayName: systemText(),
    mode: (0, import_fields7.select)({ type: "string", options: ["manual_export", "sandbox", "live"].map((value) => ({ label: value.replace("_", " "), value })), defaultValue: "manual_export", ...readOnly }),
    status: lifecycle(["configured", "sandbox_verified", "live", "suspended"]),
    secret: (0, import_fields7.relationship)({ ref: "SecretBox", access: { read: import_access8.denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: "hidden" } } }),
    config: (0, import_fields7.json)({ ...readOnly }),
    handlesPhi: (0, import_fields7.checkbox)({ defaultValue: true, ...readOnly }),
    baa: (0, import_fields7.relationship)({ ref: "BusinessAssociate.adapterInstallations", ...readOnly }),
    lastVerifiedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    verificationReceipt: (0, import_fields7.json)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var BusinessAssociate = (0, import_core7.list)({
  access: managed(["canManageCompliance", "canManageAdapters", "canManagePractice"], ["canManageCompliance", "canManagePractice"]),
  ui: { labelField: "name", listView: { initialColumns: ["name", "service", "status", "baaSignedOn", "expiresOn"] } },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    service: choice(["clearinghouse", "messaging", "voice", "inference", "storage", "payments", "erx", "imaging", "hosting", "other"], "other"),
    baaSignedOn: (0, import_fields7.calendarDay)(),
    expiresOn: (0, import_fields7.calendarDay)(),
    baaDocument: (0, import_fields7.relationship)({ ref: "Document" }),
    status: choice(["pending", "active", "expired", "terminated"], "pending"),
    adapterInstallations: (0, import_fields7.relationship)({ ref: "AdapterInstallation.baa", many: true, ui: { itemView: { fieldMode: "read" } } }),
    ...trackingFields
  }
});
var JurisdictionPack = (0, import_core7.list)({
  access: { operation: { query: isSignedIn, create: sys, update: sys, delete: sys } },
  ui: { labelField: "label", listView: { initialColumns: ["key", "version", "name", "status", "verifiedAt"] } },
  fields: {
    label: systemText({ indexed: "unique", required: true }),
    key: systemText({ indexed: true, required: true }),
    version: systemText({ required: true }),
    name: systemText({ required: true }),
    rules: (0, import_fields7.json)({ ...readOnly }),
    sources: (0, import_fields7.json)({ ...readOnly }),
    verifiedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    verifiedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["draft", "active", "superseded"], "active"),
    locations: (0, import_fields7.relationship)({ ref: "Location.jurisdiction", many: true, ...readOnly }),
    ...trackingFields
  }
});
var PhiReadAudit = (0, import_core7.list)({
  access: immutable("canReadPhiAudit"),
  ui: { labelField: "operationName", listView: { initialColumns: ["at", "actorUser", "purpose", "listKeys", "recordCount", "operationName"], initialSort: { field: "at", direction: "DESC" } } },
  fields: {
    actorUser: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    actorAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    actorReference: systemText({ required: true }),
    purpose: (0, import_fields7.select)({ type: "string", options: ["treatment", "payment", "operations", "patient_request", "break_glass", "system"].map((value) => ({ label: value.replace("_", " "), value })), defaultValue: "operations", ...readOnly }),
    operationType: systemText({ required: true }),
    operationName: systemText({ required: true }),
    listKeys: (0, import_fields7.json)({ ...readOnly }),
    tiers: (0, import_fields7.json)({ ...readOnly }),
    fields: (0, import_fields7.json)({ ...readOnly }),
    fieldSetDigest: systemText({ required: true }),
    recordCount: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    recordIdsDigest: systemText(),
    resourceReferences: (0, import_fields7.json)({ ...readOnly, ui: { ...readOnly.ui, description: "HMAC reference tokens, never ids or values." } }),
    breakGlass: (0, import_fields7.relationship)({ ref: "BreakGlassEvent", ...readOnly }),
    success: (0, import_fields7.checkbox)({ defaultValue: true, ...readOnly }),
    correlationReference: systemText(),
    at: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, validation: { isRequired: true }, ...readOnly })
  }
});
var InferenceProvider = (0, import_core7.list)({
  access: governed(["canManageAgents", "canManageAdapters"]),
  ui: { labelField: "key", listView: { initialColumns: ["key", "kind", "model", "isActive", "retainsPrompts"] } },
  fields: {
    key: systemText({ indexed: "unique", required: true }),
    kind: fixedChoice(["self_hosted", "baa_hosted", "no_phi"]),
    endpoint: systemText(),
    model: systemText(),
    secret: (0, import_fields7.relationship)({ ref: "SecretBox", access: { read: import_access8.denyAll, create: sys, update: sys }, ui: { itemView: { fieldMode: "hidden" } } }),
    baa: (0, import_fields7.relationship)({ ref: "BusinessAssociate", ...readOnly }),
    retainsPrompts: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    isActive: (0, import_fields7.checkbox)({ defaultValue: true, ...readOnly }),
    ...trackingFields
  }
});

// features/keystone/models/agents.ts
var import_core8 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var PROPOSAL_KINDS = [
  "fill_slot",
  "outreach_message",
  "verify_eligibility",
  "verification_task",
  "fix_claim",
  "corrected_claim",
  "appeal",
  "claim_status_inquiry",
  "payment_reminder",
  "payment_plan_offer",
  "refund_request",
  "write_off_request",
  "note_draft",
  "perio_entry_draft",
  "review_reply",
  "booking"
];
var AGENT_READ_SCOPES = [
  "schedule.read",
  "availability.read",
  "patient.read_demographics",
  "patient.read_clinical_summary",
  "clinical.read",
  "coverage.read",
  "claims.read",
  "ledger.read",
  "messages.read"
];
var AGENT_WRITE_SCOPES = ["messages.send_within_policy", "holds.create", "booking.create_within_policy", "eligibility.run", "benefits.record_fact"];
var AGENT_SCOPES = [...AGENT_READ_SCOPES, ...AGENT_WRITE_SCOPES, ...PROPOSAL_KINDS.map((kind) => `propose:${kind}`)];
var AgentIdentity = (0, import_core8.list)({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageAgents, update: sys, delete: sys } },
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields8.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    purpose: (0, import_fields8.text)({ ui: { displayMode: "textarea" } }),
    kind: choice(["llm_agent", "rules_engine", "external_mcp_client"], "llm_agent"),
    inferenceProvider: (0, import_fields8.relationship)({ ref: "InferenceProvider" }),
    owner: (0, import_fields8.relationship)({ ref: "User" }),
    status: lifecycle(["active", "paused", "revoked"]),
    oauthApp: (0, import_fields8.relationship)({ ref: "OAuthApp" }),
    grants: (0, import_fields8.relationship)({ ref: "AgentToolGrant.agent", many: true, ...readOnly }),
    runs: (0, import_fields8.relationship)({ ref: "AgentRun.agent", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AgentToolGrant = (0, import_core8.list)({
  access: governed(["canManageAgents", "canApproveAgentGrants"]),
  ui: { labelField: "scope", listView: { initialColumns: ["agent", "scope", "status", "createdAt"] } },
  fields: {
    agent: (0, import_fields8.relationship)({ ref: "AgentIdentity.grants", ...readOnly }),
    scope: fixedChoice(AGENT_SCOPES),
    constraints: (0, import_fields8.json)({ ...readOnly, ui: { ...readOnly.ui, description: 'Limits, e.g. {"locations":["\u2026"],"maxPerDay":40}.' } }),
    status: lifecycle(["requested", "active", "revoked"]),
    approval: (0, import_fields8.relationship)({ ref: "ApprovalRequest", ...readOnly }),
    revokedAt: (0, import_fields8.timestamp)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AgentRun = (0, import_core8.list)({
  access: governed(["canManageAgents", "canReadSignals"]),
  ui: { labelField: "promptHash", listView: { initialColumns: ["agent", "status", "startedAt", "endedAt"] } },
  fields: {
    agent: (0, import_fields8.relationship)({ ref: "AgentIdentity.runs", ...readOnly }),
    inferenceProvider: (0, import_fields8.relationship)({ ref: "InferenceProvider", ...readOnly }),
    model: systemText(),
    startedAt: (0, import_fields8.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    endedAt: (0, import_fields8.timestamp)({ ...readOnly }),
    status: lifecycle(["started", "completed", "failed", "aborted"]),
    promptHash: systemText(),
    toolCalls: (0, import_fields8.json)({ ...readOnly, ui: { ...readOnly.ui, description: "Tool names and argument hashes, never raw arguments." } }),
    tokens: (0, import_fields8.json)({ ...readOnly }),
    costMinor: minor(),
    proposals: (0, import_fields8.relationship)({ ref: "Proposal.agentRun", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var Proposal = (0, import_core8.list)({
  access: governed(["canReadSignals", "canDecideProposals"]),
  ui: { labelField: "kind", listView: { initialColumns: ["kind", "status", "proposedByAgent", "proposedByUser", "createdAt"] } },
  fields: {
    kind: fixedChoice(PROPOSAL_KINDS),
    payload: (0, import_fields8.json)({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    expectedImpact: (0, import_fields8.json)({ ...readOnly }),
    status: lifecycle(["proposed", "validated", "invalid", "approved", "rejected", "expired", "executing", "executed", "failed", "unknown"]),
    agentRun: (0, import_fields8.relationship)({ ref: "AgentRun.proposals", ...readOnly }),
    proposedByAgent: (0, import_fields8.relationship)({ ref: "AgentIdentity", ...readOnly }),
    proposedByUser: (0, import_fields8.relationship)({ ref: "User", ...readOnly }),
    location: (0, import_fields8.relationship)({ ref: "Location", ...readOnly }),
    targetList: systemText(),
    targetId: systemText({ indexed: true }),
    approval: (0, import_fields8.relationship)({ ref: "ApprovalRequest", ...readOnly }),
    validation: (0, import_fields8.json)({ ...readOnly, ui: { ...readOnly.ui, description: "Check results recorded when the proposal was validated." } }),
    execution: (0, import_fields8.json)({ ...readOnly }),
    realised: (0, import_fields8.json)({ ...readOnly }),
    expiresAt: (0, import_fields8.timestamp)({ ...readOnly }),
    autonomyPolicyVersion: (0, import_fields8.integer)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});

// features/keystone/security/phiFields.ts
var TIER_PERMISSION = {
  dem: "canReadDemographics",
  clin: "canReadClinical",
  sens: "canReadSensitive",
  ins: "canReadInsurance",
  fin: "canReadLedger"
};
var IMPLIES = {
  canReadDemographics: ["canReadClinical", "canReadInsurance", "canReadLedger", "canManagePatients"],
  canReadClinical: ["canReadSensitive"]
};
function canReadTier(session, tier) {
  const permission = TIER_PERMISSION[tier];
  if (hasPermission(session, permission)) return true;
  return (IMPLIES[permission] ?? []).some((other) => hasPermission(session, other));
}
var PHI_FIELDS = {
  // Snapshots and payloads can carry any tier; they are read under the strictest relevant tier.
  AuditEvent: { before: "clin", after: "clin", reason: "clin" },
  OutboxEvent: { payload: "clin" },
  ApprovalRequest: { payload: "fin" },
  Proposal: { payload: "clin", validation: "clin", execution: "clin", realised: "clin" },
  Document: { title: "clin" },
  BreakGlassEvent: { reason: "clin" }
};
var PHI_FIELD_NAMES = new Set(Object.values(PHI_FIELDS).flatMap((fields) => Object.keys(fields)));
function applyPhiTiers(models2) {
  for (const [listKey, list7] of Object.entries(models2)) {
    const tiers = PHI_FIELDS[listKey];
    if (!tiers) continue;
    for (const [fieldKey, tier] of Object.entries(tiers)) {
      const original = list7.fields?.[fieldKey];
      if (typeof original !== "function") throw new Error(`PHI_FIELDS names ${listKey}.${fieldKey}, which does not exist.`);
      list7.fields[fieldKey] = (args) => {
        const field = original(args);
        const access = field.access;
        const baseRead = typeof access === "function" ? access : access?.read;
        const read = async (input) => canReadTier(input.session, tier) && (baseRead ? await baseRead(input) : true);
        return {
          ...field,
          access: typeof access === "function" ? { read, create: access, update: access } : { ...access ?? {}, read }
        };
      };
    }
  }
  return models2;
}

// features/keystone/models/index.ts
var hideRefusedActions = (lists) => Object.fromEntries(Object.entries(lists).map(([key, config2]) => {
  const op2 = config2.access?.operation ?? {};
  const ui = { ...config2.ui };
  if (op2.create === sys && ui.hideCreate === void 0) ui.hideCreate = true;
  if (op2.delete === sys && ui.hideDelete === void 0) ui.hideDelete = true;
  return [key, { ...config2, ui }];
}));
var listsOf = (mod) => Object.fromEntries(Object.entries(mod).filter(([, value]) => value && typeof value === "object" && "fields" in value));
var models = hideRefusedActions(applyPhiTiers({
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...listsOf(platform_exports),
  AgentIdentity,
  AgentToolGrant,
  AgentRun,
  Proposal
}));

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(_root, { data }, context) {
  const session = context.session;
  if (!isSignedIn({ session })) throw new Error("Not authenticated");
  const allowed = /* @__PURE__ */ new Set(["email", "name", "password", "onboardingStatus"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  return context.db.User.updateOne({ where: { id: session.itemId }, data });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/mutations/op.ts
var import_graphql = require("graphql");

// features/keystone/lib/errors.ts
var DomainError = class extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
};
var isDomainError = (error) => error instanceof DomainError;
var Codes = {
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  STALE_STATE: "STALE_STATE",
  GUARD_FAILED: "GUARD_FAILED",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IN_PROGRESS: "IN_PROGRESS",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  SELF_APPROVAL: "SELF_APPROVAL",
  AGENT_CANNOT_APPROVE: "AGENT_CANNOT_APPROVE",
  APPROVAL_MISMATCH: "APPROVAL_MISMATCH",
  LEASE_LOST: "LEASE_LOST",
  STALE_FENCING_TOKEN: "STALE_FENCING_TOKEN",
  AUDIT_CHAIN_BROKEN: "AUDIT_CHAIN_BROKEN",
  // Dental (STATE-MACHINES, INTEGRATIONS)
  SLOT_TAKEN: "SLOT_TAKEN",
  HOLD_EXPIRED: "HOLD_EXPIRED",
  OUTSIDE_TEMPLATE: "OUTSIDE_TEMPLATE",
  PATIENT_UNAVAILABLE: "PATIENT_UNAVAILABLE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  SUPERVISION_REQUIRED: "SUPERVISION_REQUIRED",
  INFERENCE_PHI_BLOCKED: "INFERENCE_PHI_BLOCKED",
  SYNTHETIC_TO_LIVE: "SYNTHETIC_TO_LIVE",
  MFA_REQUIRED: "MFA_REQUIRED",
  BREAK_GLASS_REQUIRED: "BREAK_GLASS_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED"
};

// features/keystone/mutations/op.ts
var UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+/i;
var SAFE_DETAIL_KEYS = /* @__PURE__ */ new Set(["currentStatus", "currentVersion", "to", "reason", "field", "problems", "replay"]);
var op = (fn) => async (root, args, context) => {
  try {
    return await fn(root, args, context);
  } catch (error) {
    if (error instanceof import_graphql.GraphQLError) throw error;
    if (isDomainError(error)) {
      const details = Object.fromEntries(Object.entries(error.details).filter(([key]) => SAFE_DETAIL_KEYS.has(key)));
      throw new import_graphql.GraphQLError(error.message, { extensions: { code: error.code, ...details } });
    }
    const message = typeof error?.message === "string" ? error.message : "";
    console.error("Operation failed:", message.slice(0, 300).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
    const safe = message && message.length <= 300 && !UNSAFE.test(message) && !error?.code;
    throw new import_graphql.GraphQLError(safe ? message : "Unable to complete the request. Please try again.", { extensions: { code: "KS_USER_INPUT_ERROR" } });
  }
};

// features/keystone/lib/actor.ts
function actorFromSession(session) {
  if (!session || !isSignedIn({ session })) throw new DomainError(Codes.NOT_AUTHORIZED, "Sign in to continue.");
  const role = session.data.role;
  const granted = new Set(role ? permissionNames.filter((name) => role[name] === true) : []);
  return { kind: "user", userId: session.itemId, name: session.data.name, permissions: granted };
}
function requirePermission(actor, ...anyOf2) {
  if (actor.kind === "system") return;
  if (actor.kind === "agent") throw new DomainError(Codes.NOT_AUTHORIZED, "Agents act only through their tool grants.");
  if (!anyOf2.some((permission) => actor.permissions.has(permission))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `This needs the ${anyOf2.join(" or ")} permission.`);
  }
}
var principalKey = (actor) => actor.kind === "user" ? `user:${actor.userId}` : actor.kind === "agent" ? `agent:${actor.agentId}` : `system:${actor.name}`;
var actorUserId = (actor) => actor.kind === "user" ? actor.userId : null;
var actorAgentId = (actor) => actor.kind === "agent" ? actor.agentId : null;

// features/keystone/lib/canonical.ts
var import_node_crypto2 = require("node:crypto");

// features/keystone/lib/decimal.ts
var import_decimal = __toESM(require("decimal.js"));
var Decimal = import_decimal.default.clone({
  precision: 60,
  rounding: import_decimal.default.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 60
});
var DECIMAL_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
function dec(value) {
  if (value instanceof Decimal) return value;
  if (typeof value === "bigint") return new Decimal(value.toString());
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`Refusing float ${value}: pass the exact decimal as a string`);
    return new Decimal(value);
  }
  const text8 = String(value).trim();
  if (!DECIMAL_TEXT.test(text8)) throw new Error(`Not a decimal number: ${JSON.stringify(text8).slice(0, 40)}`);
  return new Decimal(text8);
}
var plain = (value) => dec(value).toFixed();
var ZERO = new Decimal(0);
var ONE = new Decimal(1);
var BPS = new Decimal(1e4);

// features/keystone/lib/canonical.ts
function canonicalize(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot hold a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const decimalLike = value;
    if (typeof decimalLike.isFinite === "function" && typeof decimalLike.isNaN === "function") return plain(decimalLike.toString());
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  throw new Error(`Canonical JSON cannot hold a ${typeof value}`);
}
var canonicalJson = (value) => JSON.stringify(canonicalize(value));
var sha256 = (text8) => (0, import_node_crypto2.createHash)("sha256").update(text8).digest("hex");
var payloadHash = (value) => sha256(canonicalJson(value));
var toJsonValue = (value) => canonicalize(value);

// features/keystone/lib/db.ts
async function advisoryLock(tx, key) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
var MODEL_NAME = /^[A-Z][A-Za-z0-9]*$/;
function tableName(model) {
  if (!MODEL_NAME.test(model)) throw new Error(`Invalid model name: ${model.slice(0, 40)}`);
  return `"${model}"`;
}
function delegateOf(tx, model) {
  tableName(model);
  const delegate = tx[model[0].toLowerCase() + model.slice(1)];
  if (!delegate) throw new Error(`Unknown model: ${model}`);
  return delegate;
}
var TRANSACTION_OPTIONS = { maxWait: 15e3, timeout: 6e4 };

// features/keystone/lib/idempotency.ts
var IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;
function assertIdempotencyKey(key) {
  if (typeof key !== "string" || !key.trim()) throw new DomainError(Codes.IDEMPOTENCY_KEY_REQUIRED, "An idempotency key is required.");
  if (!IDEMPOTENCY_KEY.test(key)) throw new DomainError(Codes.INVALID_INPUT, "The idempotency key must be 8 to 200 letters, digits or . _ : -");
}
async function claimReceipt(tx, input) {
  assertIdempotencyKey(input.key);
  await advisoryLock(tx, `command:${input.key}`);
  const existing = await tx.commandReceipt.findUnique({ where: { idempotencyKey: input.key } });
  if (!existing) return { replay: false };
  const requestHash = payloadHash(input.params);
  if (existing.command !== input.command || existing.principalKey !== input.principalKey || existing.requestHash !== requestHash) {
    throw new DomainError(Codes.IDEMPOTENCY_KEY_REUSED, "This idempotency key was already used for a different request.");
  }
  return { replay: true, responseBody: existing.responseBody };
}
async function writeReceipt(tx, input) {
  await tx.commandReceipt.create({
    data: {
      idempotencyKey: input.key,
      command: input.command,
      principalKey: input.principalKey,
      requestHash: payloadHash(input.params),
      requestParams: toJsonValue(canonicalize(input.params)),
      responseCode: "ok",
      responseBody: toJsonValue(input.response),
      recoveryPoint: "completed",
      completedAt: input.now
    }
  });
}

// features/keystone/lib/audit.ts
var import_node_crypto3 = require("node:crypto");
var GENESIS_HASH = "0".repeat(64);
function auditHashBody(row) {
  return {
    seq: row.seq,
    eventKey: row.eventKey,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.actorUserId ?? null,
    actorAgentId: row.actorAgentId ?? null,
    approverId: row.approverId ?? null,
    reason: row.reason || null,
    before: row.before ?? null,
    after: row.after ?? null,
    metadata: row.metadata ?? null,
    requestId: row.requestId || null,
    at: row.at.toISOString()
  };
}
var auditHash = (prevHash, row) => sha256(`${prevHash}
${canonicalJson(auditHashBody(row))}`);
async function appendAuditEvents(tx, events, now = /* @__PURE__ */ new Date()) {
  if (!events.length) return [];
  await advisoryLock(tx, "audit:chain");
  const last = await tx.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
  let seq = last?.seq ?? 0;
  let prevHash = last?.hash ?? GENESIS_HASH;
  const written = [];
  for (const event of events) {
    seq += 1;
    const row = {
      seq,
      eventKey: event.eventKey ?? (0, import_node_crypto3.randomUUID)(),
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId ?? null,
      actorAgentId: event.actorAgentId ?? null,
      approverId: event.approverId ?? null,
      reason: event.reason ? event.reason.slice(0, 2e3) : null,
      before: event.before === void 0 ? null : toJsonValue(event.before),
      after: event.after === void 0 ? null : toJsonValue(event.after),
      metadata: event.metadata === void 0 ? null : toJsonValue(event.metadata),
      requestId: event.requestId ?? null,
      prevHash,
      at: now
    };
    const hash = auditHash(prevHash, row);
    const created = await tx.auditEvent.create({
      data: {
        seq: row.seq,
        eventKey: row.eventKey,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        actorUserId: row.actorUserId,
        actorAgentId: row.actorAgentId,
        approverId: row.approverId,
        reason: row.reason ?? "",
        // Nullable json columns: omit null (stored as SQL NULL, read back as null).
        ...row.before === null ? {} : { before: row.before },
        ...row.after === null ? {} : { after: row.after },
        ...row.metadata === null ? {} : { metadata: row.metadata },
        requestId: row.requestId ?? "",
        prevHash,
        hash,
        at: row.at
      },
      select: { id: true }
    });
    written.push({ id: created.id, seq, hash });
    prevHash = hash;
  }
  return written;
}
async function verifyAuditChain(db, batchSize = 1e3) {
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  let count = 0;
  for (; ; ) {
    const rows = await db.auditEvent.findMany({ where: { seq: { gte: expectedSeq } }, orderBy: { seq: "asc" }, take: batchSize });
    if (!rows.length) break;
    for (const row of rows) {
      if (row.seq !== expectedSeq) return { ok: false, count, lastSeq: expectedSeq - 1, lastHash: prevHash, brokenAtSeq: expectedSeq, problem: "missing event" };
      if (row.prevHash !== prevHash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "previous hash does not match" };
      const hash = auditHash(prevHash, {
        ...row,
        reason: row.reason || null,
        requestId: row.requestId || null,
        actorUserId: row.actorUserId ?? null,
        actorAgentId: row.actorAgentId ?? null,
        approverId: row.approverId ?? null
      });
      if (hash !== row.hash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "content does not match its hash" };
      prevHash = row.hash;
      expectedSeq += 1;
      count += 1;
    }
  }
  return { ok: true, count, lastSeq: expectedSeq - 1, lastHash: prevHash };
}

// features/keystone/lib/unitOfWork.ts
var UnitOfWork = class {
  constructor(tx, now, requestId) {
    this.tx = tx;
    this.now = now;
    this.requestId = requestId;
    this.audits = [];
    this.outbox = [];
  }
  audit(event) {
    this.audits.push({ requestId: this.requestId, ...event });
  }
  emit(message) {
    this.outbox.push(message);
  }
};
async function flushOutbox(tx, messages, now) {
  for (const message of messages) {
    const payload = toJsonValue(message.payload);
    const dedupeKey = message.dedupeKey ?? `${message.topic}:${message.aggregateType}:${message.aggregateId}:${sha256(canonicalJson(payload))}`;
    await tx.outboxEvent.upsert({
      where: { dedupeKey },
      create: {
        topic: message.topic,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        dedupeKey,
        payload,
        status: "pending",
        nextAttemptAt: message.availableAt ?? now
      },
      update: {}
    });
  }
}
async function runInTransaction(db, work, options = {}) {
  return db.$transaction(async (tx) => {
    const uow = new UnitOfWork(tx, options.now ?? /* @__PURE__ */ new Date(), options.requestId ?? null);
    const result = await work(uow);
    await flushOutbox(tx, uow.outbox, uow.now);
    await appendAuditEvents(tx, uow.audits, uow.now);
    return result;
  }, TRANSACTION_OPTIONS);
}

// features/keystone/lib/command.ts
var RETRYABLE = /deadlock detected|could not serialize|P2034|40P01|40001/i;
async function command(db, spec, work) {
  const principal = principalKey(spec.actor);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runInTransaction(db, async (uow) => {
        const receipt = await claimReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params });
        if (receipt.replay) return { replay: true, value: receipt.responseBody };
        const value = toJsonValue(await work(uow));
        await writeReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params, response: value, now: uow.now });
        return { replay: false, value };
      }, { requestId: spec.requestId ?? null, now: spec.now });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error?.code ?? "";
      if (attempt < 4 && (RETRYABLE.test(message) || RETRYABLE.test(code))) continue;
      throw error;
    }
  }
}

// features/keystone/lib/cas.ts
var COLUMN = /^[a-z][A-Za-z0-9]*$/;
async function lockRow(tx, model, id) {
  const rows = await tx.$queryRawUnsafe(`SELECT id FROM ${tableName(model)} WHERE id = $1 FOR UPDATE`, id);
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, `${model} not found.`, { model, id });
  const row = await delegateOf(tx, model).findUnique({ where: { id } });
  return row;
}
async function transition(uow, spec) {
  const statusField = spec.statusField ?? "status";
  if (!COLUMN.test(statusField)) throw new Error("Invalid status field");
  const row = await lockRow(uow.tx, spec.model, spec.id);
  const currentStatus = String(row[statusField]);
  const currentVersion = Number(row.version);
  if (spec.expectedVersion !== void 0 && spec.expectedVersion !== null && spec.expectedVersion !== currentVersion) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  if (!spec.from.includes(currentStatus)) {
    throw new DomainError(Codes.INVALID_TRANSITION, `${spec.model} can't move from ${currentStatus} to ${spec.to}.`, { currentStatus, currentVersion, to: spec.to });
  }
  if (spec.guard) await spec.guard(row);
  const extra = typeof spec.data === "function" ? await spec.data(row) : spec.data ?? {};
  const result = await delegateOf(uow.tx, spec.model).updateMany({
    where: { id: spec.id, version: currentVersion, [statusField]: { in: [...spec.from] } },
    data: { ...extra, [statusField]: spec.to, version: { increment: 1 } }
  });
  if (result.count !== 1) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  uow.audit({
    eventType: spec.eventType,
    entityType: spec.model,
    entityId: spec.id,
    actorUserId: actorUserId(spec.actor),
    actorAgentId: actorAgentId(spec.actor),
    approverId: spec.approverId ?? null,
    reason: spec.reason ?? null,
    before: { [statusField]: currentStatus, version: currentVersion },
    after: { [statusField]: spec.to, version: currentVersion + 1, ...extra },
    metadata: { ...spec.metadata ?? {}, ...spec.actor.kind === "system" ? { system: spec.actor.name } : {} }
  });
  return await delegateOf(uow.tx, spec.model).findUnique({ where: { id: spec.id } });
}
function auditCreate(uow, actor, model, id, eventType, after, extra = {}) {
  uow.audit({
    eventType,
    entityType: model,
    entityId: id,
    actorUserId: actorUserId(actor),
    actorAgentId: actorAgentId(actor),
    reason: extra.reason ?? null,
    after,
    metadata: { ...extra.metadata ?? {}, ...actor.kind === "system" ? { system: actor.name } : {} }
  });
}

// features/keystone/lib/jurisdiction.ts
var import_zod = require("zod");
var verified = (value) => import_zod.z.object({ value, verify: import_zod.z.boolean(), note: import_zod.z.string().optional(), source: import_zod.z.string().optional() });
var packRulesSchema = import_zod.z.object({
  retention: verified(import_zod.z.object({ adultYearsAfterLastVisit: import_zod.z.number().int().min(1).max(50), minorYearsAfterMajority: import_zod.z.number().int().min(0).max(30), majorityAge: import_zod.z.number().int().min(16).max(21) })),
  supervision: verified(import_zod.z.object({
    hygieneGeneralAllowed: import_zod.z.boolean(),
    requiresDentistExamWithinMonths: import_zod.z.number().int().min(0).max(36).nullable(),
    /** What the scheduler does when a hygiene visit has no dentist on site: hard stop or warning (I-S5). */
    enforcement: import_zod.z.enum(["hard", "warn"]),
    assistantDuties: import_zod.z.array(import_zod.z.string())
  })),
  membershipPlans: verified(import_zod.z.object({ mode: import_zod.z.enum(["allowed", "registration_required", "licence_required", "prohibited"]), licenceKind: import_zod.z.string().nullable() })),
  epcs: verified(import_zod.z.object({ required: import_zod.z.boolean(), scope: import_zod.z.enum(["controlled_only", "all", "none"]) })),
  pdmp: verified(import_zod.z.object({ requiredBeforeSchedules: import_zod.z.array(import_zod.z.string()) })),
  minorsConfidentiality: verified(import_zod.z.object({ guardianSeesClinical: import_zod.z.boolean(), confidentialCategories: import_zod.z.array(import_zod.z.string()) })),
  aiDisclosure: verified(import_zod.z.object({ voice: import_zod.z.boolean(), chat: import_zod.z.boolean() })),
  escheat: verified(import_zod.z.object({ dormancyYears: import_zod.z.number().int().min(1).max(15) })),
  gfe: verified(import_zod.z.object({ scheduledDaysAheadMin: import_zod.z.number().int(), deliverWithinBusinessDays: import_zod.z.number().int(), onRequestWithinBusinessDays: import_zod.z.number().int() })),
  consent: verified(import_zod.z.object({ quietHoursStart: import_zod.z.string().regex(/^\d{2}:\d{2}$/), quietHoursEnd: import_zod.z.string().regex(/^\d{2}:\d{2}$/), restartKeywords: import_zod.z.array(import_zod.z.string()) }))
});
var SOURCES = {
  ada: { id: "S46", title: "ADA, Record Retention", url: "https://www.ada.org/resources/practice/practice-management/record-retention" },
  cms: { id: "S38", title: "CMS, No Surprises Act good faith estimate (uninsured / self-pay)", url: "https://www.cms.gov/nosurprises" },
  fcc: { id: "S41", title: "FCC 24-17 Declaratory Ruling (AI-generated voices under the TCPA)", url: "https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf" },
  adha: { id: "S47", title: "ADHA, Scope of practice / supervision by state", url: "https://www.adha.org/advocacy/scope-of-practice/" }
};
var US_FL_2026_1 = {
  key: "US-FL",
  version: "2026.1",
  name: "Florida (United States)",
  rules: {
    retention: { value: { adultYearsAfterLastVisit: 4, minorYearsAfterMajority: 0, majorityAge: 18 }, verify: true, note: "Florida Board of Dentistry record-keeping rule sets a minimum period after the last visit; many practices keep 7+ years. Confirm with counsel.", source: "S46" },
    supervision: { value: { hygieneGeneralAllowed: true, requiresDentistExamWithinMonths: 13, enforcement: "warn", assistantDuties: ["radiographs_with_certification", "coronal_polish_with_certification", "sealants_with_certification"] }, verify: true, note: "General supervision for many hygiene duties if the patient was examined by the dentist within a set period. Confirm the current Board rule.", source: "S47" },
    membershipPlans: { value: { mode: "registration_required", licenceKind: "discount_medical_plan_organization" }, verify: true, note: "In-house plans may fall under discount plan rules; confirm with the Office of Insurance Regulation or counsel before activating." },
    epcs: { value: { required: true, scope: "controlled_only" }, verify: true, note: "Florida electronic prescribing requirement with exceptions; controlled substances need an EPCS-certified eRx partner." },
    pdmp: { value: { requiredBeforeSchedules: ["II", "III", "IV"] }, verify: true, note: "E-FORCSE check before prescribing controlled substances (exceptions apply)." },
    minorsConfidentiality: { value: { guardianSeesClinical: true, confidentialCategories: [] }, verify: true },
    aiDisclosure: { value: { voice: true, chat: true }, verify: true, note: "Disclose AI at the start of every voice and chat conversation as a product rule regardless of state law.", source: "S41" },
    escheat: { value: { dormancyYears: 5 }, verify: true, note: "Unclaimed property dormancy for credit balances; confirm the current period with the Division of Unclaimed Property." },
    gfe: { value: { scheduledDaysAheadMin: 3, deliverWithinBusinessDays: 1, onRequestWithinBusinessDays: 3 }, verify: true, source: "S38" },
    consent: { value: { quietHoursStart: "20:00", quietHoursEnd: "08:00", restartKeywords: ["START", "UNSTOP"] }, verify: true, note: "Florida Telephone Solicitation Act limits calling hours for solicitations; reminders use the same window as policy." }
  },
  sources: [SOURCES.ada, SOURCES.adha, SOURCES.cms, SOURCES.fcc]
};
var US_GENERIC_2026_1 = {
  key: "US-generic",
  version: "2026.1",
  name: "United States (conservative defaults)",
  rules: {
    retention: { value: { adultYearsAfterLastVisit: 10, minorYearsAfterMajority: 7, majorityAge: 18 }, verify: true, note: "Longest common period; replace with the state rule.", source: "S46" },
    supervision: { value: { hygieneGeneralAllowed: false, requiresDentistExamWithinMonths: null, enforcement: "hard", assistantDuties: [] }, verify: true, source: "S47" },
    membershipPlans: { value: { mode: "licence_required", licenceKind: null }, verify: true },
    epcs: { value: { required: true, scope: "controlled_only" }, verify: true },
    pdmp: { value: { requiredBeforeSchedules: ["II", "III", "IV", "V"] }, verify: true },
    minorsConfidentiality: { value: { guardianSeesClinical: false, confidentialCategories: ["reproductive", "substance_use", "mental_health"] }, verify: true },
    aiDisclosure: { value: { voice: true, chat: true }, verify: true, source: "S41" },
    escheat: { value: { dormancyYears: 3 }, verify: true },
    gfe: { value: { scheduledDaysAheadMin: 3, deliverWithinBusinessDays: 1, onRequestWithinBusinessDays: 3 }, verify: true, source: "S38" },
    consent: { value: { quietHoursStart: "21:00", quietHoursEnd: "08:00", restartKeywords: ["START", "UNSTOP"] }, verify: true }
  },
  sources: [SOURCES.ada, SOURCES.adha, SOURCES.cms, SOURCES.fcc]
};
var PACKS = [US_FL_2026_1, US_GENERIC_2026_1];

// features/keystone/seed/practice.ts
var PACK_LABELS = PACKS.map((pack) => `${pack.key}@${pack.version}`);
var PRACTICE = {
  legalName: "Bayview Family Dental, PLLC",
  displayName: "Bayview Family Dental",
  defaultTimeZone: "America/New_York",
  currencyCode: "USD",
  toothNumbering: "universal",
  scheduleUnitMinutes: 10
};
var LOCATIONS = [
  {
    id: "seed_loc_tpa",
    code: "TPA",
    name: "Bayview Family Dental \u2014 Tampa",
    timeZone: "America/New_York",
    address: { line1: "4100 Harbour Light Way", line2: "Suite 210", city: "Tampa", state: "FL", postal: "33609", country: "US" },
    phone: "(813) 555-0142",
    email: "tampa@bayviewdental.example",
    hours: { 1: [["07:30", "17:00"]], 2: [["07:30", "17:00"]], 3: [["08:00", "18:00"]], 4: [["07:30", "17:00"]], 5: [["07:30", "14:00"]] }
  },
  {
    id: "seed_loc_stp",
    code: "STP",
    name: "Bayview Family Dental \u2014 St. Petersburg",
    timeZone: "America/New_York",
    address: { line1: "880 Pelican Shore Drive", line2: "", city: "St. Petersburg", state: "FL", postal: "33701", country: "US" },
    phone: "(727) 555-0187",
    email: "stpete@bayviewdental.example",
    hours: { 1: [["08:00", "17:00"]], 2: [["08:00", "17:00"]], 3: [["08:00", "17:00"]], 4: [["08:00", "17:00"]] }
  }
];
var BASE = ["canAccessDashboard", "canSeeOtherPeople", "canReadSchedule", "canReadDemographics"];
var FRONT = [...BASE, "canManagePatients", "canManageSchedule", "canMessagePatients", "canTakePayments", "canVerifyBenefits", "canReadInsurance", "canReadLedger"];
var CLINICAL = [...BASE, "canReadClinical", "canChart", "canManagePerio", "canReadInsurance"];
var DENTIST = [...CLINICAL, "canCompleteProcedures", "canSignClinicalNotes", "canPrescribe", "canManageLabCases", "canManageTreatmentPlans", "canPresentPlans", "canReadSensitive", "canManageSchedule", "canDecideClinicalProposals"];
var BILLING = [...BASE, "canReadInsurance", "canManageInsurance", "canVerifyBenefits", "canManageClaims", "canSubmitClaims", "canPostRemittances", "canReadLedger", "canTakePayments", "canAdjust", "canDecideClaimProposals", "canDecideFinancialProposals"];
var ALL_BUT_BREAK_GLASS = permissionNames.filter((name) => !NEVER_DEFAULT.includes(name));
var ROLES = [
  { id: "seed_role_org_admin", name: "Organisation Admin", description: "Setup, users, locations, adapters and the BAA register. Activating a live adapter needs a second person.", permissions: [...BASE, "canManagePeople", "canManageRoles", "canEditOtherPeople", "canManageOnboarding", "canManagePractice", "canManageAdapters", "canAccessAllLocations", "canImportCodes", "canImportData", "canExportData", "canManageAgents", "canReadAudit", "canManageCompliance"] },
  { id: "seed_role_owner", name: "Practice Owner", description: "Runs the practice. Approver for write-offs, refunds, period reopen and autonomy policies.", permissions: ALL_BUT_BREAK_GLASS },
  { id: "seed_role_office_manager", name: "Office Manager", description: "Templates, draft fee schedules, day close, statements and staff.", permissions: [...FRONT, "canManagePeople", "canOverrideSchedule", "canOverrideTemplate", "canManageFees", "canCloseDay", "canAdjust", "canManageTemplates", "canManageMemberships", "canReadSignals", "canDecideProposals", "canReplyReviews", "canApproveAdjustments", "canReadAudit"] },
  { id: "seed_role_dentist", name: "Dentist", description: "Charts, signs notes, plans treatment, prescribes and supervises hygiene.", permissions: [...DENTIST, "canApproveClinicalCorrections"] },
  { id: "seed_role_associate", name: "Associate Dentist", description: "As Dentist, scoped to assigned locations; production credited to the rendering provider.", permissions: DENTIST },
  { id: "seed_role_hygienist", name: "Hygienist", description: "Perio, hygiene notes within scope, recall and radiographs.", permissions: [...CLINICAL, "canCompleteProcedures", "canSignClinicalNotes", "canManageSchedule"] },
  { id: "seed_role_assistant", name: "Dental Assistant", description: "Chart entry drafts, vitals, images and lab case handling. Does not sign provider notes.", permissions: [...CLINICAL, "canManageLabCases"] },
  { id: "seed_role_front_office", name: "Front Office", description: "Patients, families, scheduling, confirmations, forms, verification tasks and payments.", permissions: FRONT },
  { id: "seed_role_tc", name: "Treatment Coordinator", description: "Presents plans, financing and good faith estimates; follows up.", permissions: [...FRONT, "canPresentPlans", "canReadClinical"] },
  { id: "seed_role_insurance", name: "Insurance Coordinator", description: "Coverage, verifications, claims, attachments, ERA posting, denials and appeals.", permissions: BILLING },
  { id: "seed_role_central_billing", name: "Central Billing (DSO)", description: "Payment-scoped access across locations; no clinical notes beyond what a claim needs.", permissions: [...BILLING, "canAccessAllLocations"] },
  { id: "seed_role_privacy", name: "Privacy Officer", description: "PHI read audit, break-glass review, rights requests, retention and holds.", permissions: [...BASE, "canAccessAllLocations", "canReviewPrivacy", "canReadPhiAudit", "canReadAudit", "canManageCompliance", "canApproveRetention", "canExportData"] },
  { id: "seed_role_bookkeeper", name: "Bookkeeper", description: "Reports, close exports and the read-only ledger. Time-boxed by the access expiry.", permissions: ["canAccessDashboard", "canReadLedger", "canAccessAllLocations"] },
  { id: "seed_role_auditor", name: "Auditor", description: "Read-only, time-boxed by the user access expiry.", permissions: ["canAccessDashboard", "canReadAudit", "canReadLedger", "canReadPhiAudit", "canAccessAllLocations"] },
  { id: "seed_role_patient", name: "Patient", description: "Portal only (through the portal API); no dashboard.", permissions: [] }
];
var STAFF = [
  { id: "seed_user_okafor", name: "Dr. Maya Okafor", email: "maya.okafor@bayviewdental.example", title: "Owner dentist", roleId: "seed_role_owner", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"], provider: { id: "seed_prov_okafor", abbreviation: "MOK", type: "dentist", npi: "1999000015", colour: "#2563eb", supervisionClass: "dentist" } },
  { id: "seed_user_reyes", name: "Dr. Daniel Reyes", email: "daniel.reyes@bayviewdental.example", title: "Associate dentist", roleId: "seed_role_associate", kind: "staff", locations: ["seed_loc_tpa"], provider: { id: "seed_prov_reyes", abbreviation: "DRE", type: "dentist", npi: "1999000023", colour: "#7c3aed", supervisionClass: "dentist" } },
  { id: "seed_user_natarajan", name: "Dr. Priya Natarajan", email: "priya.natarajan@bayviewdental.example", title: "Associate dentist", roleId: "seed_role_associate", kind: "staff", locations: ["seed_loc_stp"], provider: { id: "seed_prov_natarajan", abbreviation: "PNA", type: "dentist", npi: "1999000031", colour: "#0891b2", supervisionClass: "dentist" } },
  { id: "seed_user_hale", name: "Jenna Hale, RDH", email: "jenna.hale@bayviewdental.example", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_tpa"], provider: { id: "seed_prov_hale", abbreviation: "JHA", type: "hygienist", npi: "1999000049", colour: "#059669", supervisionClass: "rdh_general" } },
  { id: "seed_user_brandt", name: "Marcus Brandt, RDH", email: "marcus.brandt@bayviewdental.example", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_tpa"], provider: { id: "seed_prov_brandt", abbreviation: "MBR", type: "hygienist", npi: "1999000056", colour: "#16a34a", supervisionClass: "rdh_general" } },
  { id: "seed_user_ortiz", name: "Lucia Ortiz, RDH", email: "lucia.ortiz@bayviewdental.example", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"], provider: { id: "seed_prov_ortiz", abbreviation: "LOR", type: "hygienist", npi: "1999000064", colour: "#65a30d", supervisionClass: "rdh_general" } },
  { id: "seed_user_kim", name: "Grace Kim, RDH", email: "grace.kim@bayviewdental.example", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_stp"], provider: { id: "seed_prov_kim", abbreviation: "GKI", type: "hygienist", npi: "1999000072", colour: "#0d9488", supervisionClass: "rdh_general" } },
  { id: "seed_user_dupree", name: "Tasha Dupree", email: "tasha.dupree@bayviewdental.example", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_novak", name: "Eli Novak", email: "eli.novak@bayviewdental.example", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_mendes", name: "Carla Mendes", email: "carla.mendes@bayviewdental.example", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_stp"] },
  { id: "seed_user_baptiste", name: "Rene Baptiste", email: "rene.baptiste@bayviewdental.example", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_stp"] },
  { id: "seed_user_walsh", name: "Kerry Walsh", email: "kerry.walsh@bayviewdental.example", title: "Front desk", roleId: "seed_role_front_office", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_ibrahim", name: "Noor Ibrahim", email: "noor.ibrahim@bayviewdental.example", title: "Front desk", roleId: "seed_role_front_office", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_tran", name: "Vivian Tran", email: "vivian.tran@bayviewdental.example", title: "Front desk", roleId: "seed_role_front_office", kind: "staff", locations: ["seed_loc_stp"] },
  { id: "seed_user_foster", name: "Dana Foster", email: "dana.foster@bayviewdental.example", title: "Insurance coordinator", roleId: "seed_role_insurance", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"] },
  { id: "seed_user_morales", name: "Rosa Morales", email: "rosa.morales@bayviewdental.example", title: "Office manager", roleId: "seed_role_office_manager", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"] },
  { id: "seed_user_quinn", name: "Avery Quinn", email: "avery.quinn@bayviewdental.example", title: "Treatment coordinator", roleId: "seed_role_tc", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_shah", name: "Imran Shah", email: "imran.shah@bayviewdental.example", title: "Privacy officer", roleId: "seed_role_privacy", kind: "staff", locations: [] },
  { id: "seed_user_lindqvist", name: "M. Lindqvist", email: "m.lindqvist@gulfcoastcpa.example", title: "Bookkeeper, Gulf Coast CPA", roleId: "seed_role_bookkeeper", kind: "auditor", locations: [], accessDays: 30 }
];
var APPROVAL_POLICIES = [
  { action: "practice.controls", description: "Change practice-wide controls (AI autonomy, agent-owner separation, break-glass window, staff MFA).", requiredPermission: "canApproveAutonomy", expiresAfterMinutes: 1440 },
  { action: "refund.execute", description: "Refund money to a patient or payer.", requiredPermission: "canApproveRefunds", expiresAfterMinutes: 1440 },
  { action: "adjustment.post", description: "Post an adjustment above its type threshold, or any bad-debt write-off.", requiredPermission: "canApproveAdjustments", expiresAfterMinutes: 1440, thresholdMinor: 10000n },
  { action: "period.reopen", description: "Reopen a closed ledger period (creates a restatement record).", requiredPermission: "canApprovePeriodReopen", expiresAfterMinutes: 1440 },
  { action: "autonomy.activate", description: "Activate an AI autonomy policy.", requiredPermission: "canApproveAutonomy", expiresAfterMinutes: 1440 },
  { action: "agent_grant.activate", description: "Activate a tool grant for an AI agent.", requiredPermission: "canApproveAgentGrants", expiresAfterMinutes: 1440 },
  { action: "adapter.go_live", description: "Switch an adapter to live mode (needs a verified installation, a test receipt and a BAA when it handles PHI).", requiredPermission: "canApproveAdapters", expiresAfterMinutes: 1440 },
  { action: "code_import.activate", description: "Activate an imported code set (licence attestation on file).", requiredPermission: "canApproveCodeImport", expiresAfterMinutes: 1440 },
  { action: "fee_schedule.publish", description: "Publish a fee schedule version.", requiredPermission: "canApproveFeePublish", expiresAfterMinutes: 1440 },
  { action: "patient.merge", description: "Merge two patient records (revertible within the merge window).", requiredPermission: "canApprovePatientMerge", expiresAfterMinutes: 1440 },
  { action: "import.apply", description: "Apply an import batch from another system.", requiredPermission: "canApproveImports", expiresAfterMinutes: 1440 },
  { action: "retention.dispose", description: "Dispose of records past retention (no legal hold).", requiredPermission: "canApproveRetention", expiresAfterMinutes: 1440 },
  { action: "clinical.correct", description: "Correct a completed, posted procedure.", requiredPermission: "canApproveClinicalCorrections", expiresAfterMinutes: 1440 },
  { action: "claim.void_paid", description: "Void a claim that has been paid.", requiredPermission: "canApproveAdjustments", expiresAfterMinutes: 1440 },
  { action: "role.assign_approval", description: "Give a person a role that can approve.", requiredPermission: "canManageRoles", expiresAfterMinutes: 1440 }
];

// features/keystone/seed/platform.ts
var UNUSABLE_PASSWORD_HASH = "$2a$10$3dITCbIvf5zFA.1U8KZDhOHC3EEexi3KYy5ysZK1cRF6LHMm0H.ya";
var day = (date) => /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
async function seedPracticePlatform(uow, actor) {
  if (process.env.NODE_ENV === "production" && process.env.DENTAL_ALLOW_SAMPLE_PRACTICE !== "true") {
    throw new Error("The sample practice cannot be loaded into a production deployment (I-G3). Set DENTAL_ALLOW_SAMPLE_PRACTICE=true only on a QA deployment.");
  }
  const { tx, now } = uow;
  const created = { practice: 0, jurisdictionPacks: 0, locations: 0, roles: 0, staff: 0, assignments: 0, providers: 0, approvalPolicies: 0 };
  const meta = { metadata: { seed: true, synthetic: true } };
  if (!await tx.practiceSettings.findUnique({ where: { id: 1 } })) {
    await tx.practiceSettings.create({ data: { id: 1, ...PRACTICE, isSynthetic: true } });
    auditCreate(uow, actor, "PracticeSettings", "1", "practice.created", PRACTICE, meta);
    created.practice += 1;
  }
  for (const pack of PACKS) {
    const label = `${pack.key}@${pack.version}`;
    if (await tx.jurisdictionPack.findUnique({ where: { label } })) continue;
    const row = await tx.jurisdictionPack.create({ data: { label, key: pack.key, version: pack.version, name: pack.name, rules: pack.rules, sources: pack.sources, status: "active" } });
    auditCreate(uow, actor, "JurisdictionPack", row.id, "jurisdiction_pack.loaded", { label }, meta);
    created.jurisdictionPacks += 1;
  }
  const florida = await tx.jurisdictionPack.findUniqueOrThrow({ where: { label: "US-FL@2026.1" }, select: { id: true } });
  for (const location of LOCATIONS) {
    if (await tx.location.findUnique({ where: { id: location.id } })) continue;
    await tx.location.create({ data: { id: location.id, code: location.code, name: location.name, timeZone: location.timeZone, address: location.address, phone: location.phone, email: location.email, hours: location.hours, jurisdictionId: florida.id, isSynthetic: true } });
    auditCreate(uow, actor, "Location", location.id, "location.created", { code: location.code, name: location.name }, meta);
    created.locations += 1;
  }
  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
  const newRoles = ROLES.filter((role) => !haveRoles.has(role.id));
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map((role) => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map((name) => [name, role.permissions.includes(name) && !NEVER_DEFAULT.includes(name)])) })) });
    for (const role of newRoles) auditCreate(uow, actor, "Role", role.id, "role.created", { name: role.name, permissions: role.permissions }, meta);
    created.roles = newRoles.length;
  }
  const haveUsers = await tx.user.findMany({ where: { OR: [{ id: { in: STAFF.map((p) => p.id) } }, { email: { in: STAFF.map((p) => p.email) } }] }, select: { id: true, email: true } });
  const newStaff = STAFF.filter((person) => !haveUsers.some((u) => u.id === person.id || u.email === person.email));
  if (newStaff.length) {
    await tx.user.createMany({
      data: newStaff.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        title: person.title,
        password: UNUSABLE_PASSWORD_HASH,
        kind: person.kind,
        roleId: person.roleId,
        accessExpiresAt: person.accessDays ? new Date(now.getTime() + person.accessDays * 864e5) : null,
        onboardingStatus: "dismissed"
      }))
    });
    for (const person of newStaff) auditCreate(uow, actor, "User", person.id, "user.created", { name: person.name, title: person.title, role: person.roleId, kind: person.kind }, meta);
    created.staff = newStaff.length;
    const assignments = newStaff.flatMap((person) => person.locations.map((locationId) => ({ id: `seed_asg_${person.id.slice(10)}_${locationId.slice(9)}`, userId: person.id, locationId, startsOn: day("2024-01-02") })));
    if (assignments.length) {
      await tx.staffAssignment.createMany({ data: assignments });
      created.assignments = assignments.length;
    }
    const providers = newStaff.filter((person) => person.provider);
    for (const person of providers) {
      const p = person.provider;
      await tx.providerProfile.create({ data: { id: p.id, userId: person.id, displayName: person.name, abbreviation: p.abbreviation, providerType: p.type, specialty: "general", npiType1: p.npi ?? null, colour: p.colour, supervisionClass: p.supervisionClass, isSynthetic: true } });
      auditCreate(uow, actor, "ProviderProfile", p.id, "provider.created", { abbreviation: p.abbreviation, type: p.type }, meta);
    }
    created.providers = providers.length;
  }
  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map((p) => p.action));
  for (const policy of APPROVAL_POLICIES.filter((p) => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes, thresholdMinor: policy.thresholdMinor ?? null } });
    auditCreate(uow, actor, "ApprovalPolicy", row.id, "approval_policy.created", { action: policy.action, requiredPermission: policy.requiredPermission }, meta);
    created.approvalPolicies += 1;
  }
  return created;
}

// features/keystone/mutations/setup.ts
async function loadPracticeSetup(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageOnboarding");
  const result = await command(context.prisma, { name: "setup.load_practice", actor, idempotencyKey: args.idempotencyKey, params: {} }, (uow) => seedPracticePlatform(uow, actor));
  return { replay: result.replay, created: result.value };
}

// features/keystone/mutations/audit.ts
async function verifyAuditChain2(_root, _args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canReadAudit");
  return verifyAuditChain(context.prisma);
}

// features/keystone/lib/separationOfDuties.ts
var SELF_APPROVAL_MESSAGE = "You can't approve your own request.";
var AGENT_APPROVAL_MESSAGE = "An agent can propose but never approve.";
function assertCanDecide(actor, requesterUserId, requesterAgentOwnerId, strictAgentOwner = true) {
  if (actor.kind !== "user") throw new DomainError(Codes.AGENT_CANNOT_APPROVE, AGENT_APPROVAL_MESSAGE);
  if (requesterUserId && requesterUserId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, SELF_APPROVAL_MESSAGE);
  if (strictAgentOwner && requesterAgentOwnerId && requesterAgentOwnerId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve a proposal made by your own agent.");
}

// features/keystone/lib/approval.ts
async function requestApproval(uow, actor, input) {
  const policy = await uow.tx.approvalPolicy.findUnique({ where: { action: input.action } });
  const requiredPermission = policy?.requiredPermission ?? input.requiredPermission;
  const minutes = input.expiresInMinutes ?? policy?.expiresAfterMinutes ?? 1440;
  const created = await uow.tx.approvalRequest.create({
    data: {
      action: input.action,
      summary: input.summary ?? "",
      targetList: input.targetList,
      targetId: input.targetId,
      payload: toJsonValue(input.payload),
      payloadHash: payloadHash(input.payload),
      requiredPermission,
      requestedById: actorUserId(actor),
      requestedByAgentId: actorAgentId(actor),
      status: "pending",
      expiresAt: new Date(uow.now.getTime() + minutes * 6e4)
    }
  });
  uow.audit({ eventType: "approval.requested", entityType: "ApprovalRequest", entityId: created.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { action: input.action, targetList: input.targetList, targetId: input.targetId, payloadHash: created.payloadHash, requiredPermission } });
  uow.emit({ topic: "notify.approval", aggregateType: "ApprovalRequest", aggregateId: created.id, payload: { action: input.action, requiredPermission }, dedupeKey: `notify.approval:${created.id}` });
  return created;
}
async function decideApproval(uow, actor, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  let agentOwnerId = null;
  if (request.requestedByAgentId) {
    const agent = await uow.tx.agentIdentity.findUnique({ where: { id: request.requestedByAgentId }, select: { ownerId: true } });
    agentOwnerId = agent?.ownerId ?? null;
  }
  assertCanDecide(actor, request.requestedById, agentOwnerId, input.strictAgentOwner ?? true);
  if (actor.kind !== "user" || !actor.permissions.has(request.requiredPermission)) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `Deciding this needs the ${request.requiredPermission} permission.`);
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) {
    await transition(uow, { model: "ApprovalRequest", id: input.requestId, from: ["pending"], to: "expired", actor, eventType: "approval.expired" });
    throw new DomainError(Codes.GUARD_FAILED, "This approval request has expired.");
  }
  const to = input.decision === "approve" ? "approved" : "rejected";
  const updated = await transition(uow, {
    model: "ApprovalRequest",
    id: input.requestId,
    from: ["pending"],
    to,
    expectedVersion: input.expectedVersion,
    actor,
    eventType: `approval.${to}`,
    reason: input.reason ?? null,
    approverId: actor.userId
  });
  await uow.tx.approvalDecision.create({ data: { requestId: input.requestId, decidedById: actor.userId, decision: input.decision, reason: input.reason ?? "", at: uow.now } });
  return updated;
}
async function consumeApproval(uow, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  if (request.status !== "approved") throw new DomainError(Codes.APPROVAL_REQUIRED, "This action needs an approved request.");
  if (request.consumedAt) throw new DomainError(Codes.APPROVAL_MISMATCH, "This approval was already used.");
  if (request.action !== input.action || request.targetList !== input.targetList || request.targetId !== input.targetId || request.payloadHash !== payloadHash(input.payload)) {
    throw new DomainError(Codes.APPROVAL_MISMATCH, "The approval was given for a different action or payload.");
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "The approval has expired.");
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: input.requestId, decision: "approve" }, orderBy: { at: "desc" } });
  await uow.tx.approvalRequest.update({ where: { id: input.requestId }, data: { consumedAt: uow.now, version: { increment: 1 } } });
  uow.audit({ eventType: "approval.consumed", entityType: "ApprovalRequest", entityId: input.requestId, approverId: decision?.decidedById ?? null, after: { action: input.action, targetId: input.targetId } });
  return { approverId: decision?.decidedById ?? null };
}

// features/keystone/lib/approvalAppliers.ts
var appliers = /* @__PURE__ */ new Map();
function registerApplier(action, apply, options = {}) {
  if (appliers.has(action)) throw new Error(`Applier for ${action} already registered`);
  appliers.set(action, { apply, applyOnApprove: options.applyOnApprove ?? true });
}
function applierFor(action) {
  return appliers.get(action) ?? null;
}

// features/keystone/lib/practiceControls.ts
var KEYS = ["aiAutonomyAllowed", "strictAgentOwnerSoD", "breakGlassMinutes", "requireStaffMfa"];
var bool = (value, name) => {
  if (typeof value !== "boolean") throw new DomainError(Codes.INVALID_INPUT, `${name} must be true or false.`, { field: name });
  return value;
};
function validatePracticeControls(input) {
  const keys = Object.keys(input ?? {});
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, "Nothing to change.");
  const out = {};
  for (const key of keys) if (!KEYS.includes(key)) throw new DomainError(Codes.INVALID_INPUT, `${key} is not a practice control.`, { field: key });
  if (input.aiAutonomyAllowed !== void 0) out.aiAutonomyAllowed = bool(input.aiAutonomyAllowed, "aiAutonomyAllowed");
  if (input.strictAgentOwnerSoD !== void 0) out.strictAgentOwnerSoD = bool(input.strictAgentOwnerSoD, "strictAgentOwnerSoD");
  if (input.requireStaffMfa !== void 0) out.requireStaffMfa = bool(input.requireStaffMfa, "requireStaffMfa");
  if (input.breakGlassMinutes !== void 0) {
    const minutes = input.breakGlassMinutes;
    if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 240) throw new DomainError(Codes.INVALID_INPUT, "breakGlassMinutes must be a whole number from 5 to 240.", { field: "breakGlassMinutes" });
    out.breakGlassMinutes = minutes;
  }
  return out;
}
async function requestPracticeControlsChange(uow, actor, input, reason) {
  const changes = validatePracticeControls(input);
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 } });
  if (!practice) throw new DomainError(Codes.NOT_FOUND, "Practice settings are not set up yet.");
  return requestApproval(uow, actor, {
    action: "practice.controls",
    targetList: "PracticeSettings",
    targetId: "1",
    payload: { changes, baseVersion: practice.version },
    requiredPermission: "canApproveAutonomy",
    summary: `Change practice controls: ${Object.keys(changes).join(", ")}${reason ? ` (${reason})` : ""}`
  });
}
registerApplier("practice.controls", async (uow, actor, request) => {
  const [row] = await uow.tx.$queryRaw`SELECT version FROM "PracticeSettings" WHERE id = 1 FOR UPDATE`;
  if (!row) throw new DomainError(Codes.NOT_FOUND, "Practice settings are not set up yet.");
  const { changes, baseVersion } = request.payload;
  if (row.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, "Practice settings changed after this was approved. Request the change again.", { currentVersion: row.version });
  const before = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { aiAutonomyAllowed: true, strictAgentOwnerSoD: true, breakGlassMinutes: true, requireStaffMfa: true } });
  const updated = await uow.tx.practiceSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...changes, version: { increment: 1 } } });
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, "Practice settings changed while applying.");
  uow.audit({ eventType: "practice.controls_changed", entityType: "PracticeSettings", entityId: "1", actorUserId: actor.kind === "user" ? actor.userId : null, before, after: changes });
  return { applied: Object.keys(changes) };
});

// features/keystone/mutations/approvals.ts
async function decideApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  if (args.decision !== "approve" && args.decision !== "reject") throw new DomainError(Codes.INVALID_INPUT, "Decision must be approve or reject.");
  if (args.decision === "reject" && !args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why you are rejecting it.", { field: "reason" });
  const result = await command(context.prisma, { name: "approval.decide", actor, idempotencyKey: args.idempotencyKey, params: { requestId: args.requestId, decision: args.decision, reason: args.reason ?? "", expectedVersion: args.expectedVersion } }, async (uow) => {
    const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true } });
    const decided = await decideApproval(uow, actor, { requestId: args.requestId, decision: args.decision, reason: args.reason ?? void 0, expectedVersion: args.expectedVersion, strictAgentOwner: practice?.strictAgentOwnerSoD ?? true });
    let applied = null;
    const registration = applierFor(String(decided.action));
    if (args.decision === "approve" && registration?.applyOnApprove) {
      const request = await uow.tx.approvalRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      await consumeApproval(uow, { requestId: request.id, action: request.action, targetList: request.targetList, targetId: request.targetId, payload: request.payload });
      applied = await registration.apply(uow, actor, request);
    }
    return { id: decided.id, status: decided.status, applied };
  });
  return { replay: result.replay, ...result.value };
}
async function cancelApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  const result = await command(context.prisma, { name: "approval.cancel", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const row = await transition(uow, {
      model: "ApprovalRequest",
      id: args.requestId,
      from: ["pending"],
      to: "cancelled",
      expectedVersion: args.expectedVersion,
      actor,
      eventType: "approval.cancelled",
      reason: args.reason ?? null,
      guard: (request) => {
        if (actor.kind !== "user" || request.requestedById !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, "Only the person who asked can withdraw a request.");
      }
    });
    return { id: row.id, status: row.status };
  });
  return { replay: result.replay, ...result.value };
}
async function requestPracticeControls(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManagePractice");
  if (!args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why the controls should change.", { field: "reason" });
  const result = await command(context.prisma, { name: "practice.controls.request", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const request = await requestPracticeControlsChange(uow, actor, args.changes, args.reason.trim());
    return { id: request.id, status: request.status };
  });
  return { replay: result.replay, ...result.value };
}

// features/keystone/mutations/mfa.ts
var import_graphql2 = require("graphql");

// features/keystone/lib/secretBox.ts
var import_node_crypto4 = require("node:crypto");
var SECRET_KEY_VERSION = 1;
function decodeKey(value) {
  const text8 = String(value || "").trim();
  if (!text8) throw new Error("DENTAL_SECRET_KEY is not set: secrets cannot be stored or read.");
  const key = /^[a-f0-9]{64}$/i.test(text8) ? Buffer.from(text8, "hex") : Buffer.from(text8, "base64");
  if (key.length !== 32) throw new Error("DENTAL_SECRET_KEY must decode to exactly 32 bytes");
  return key;
}
function sealSecret(plaintext, purpose, keyText = process.env.DENTAL_SECRET_KEY) {
  const key = decodeKey(keyText);
  const iv = (0, import_node_crypto4.randomBytes)(12);
  const cipher = (0, import_node_crypto4.createCipheriv)("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { purpose, ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), keyVersion: SECRET_KEY_VERSION };
}
function openSecret(box, keyText = process.env.DENTAL_SECRET_KEY) {
  const decipher = (0, import_node_crypto4.createDecipheriv)("aes-256-gcm", decodeKey(keyText), Buffer.from(box.iv, "base64"));
  decipher.setAAD(Buffer.from(box.purpose, "utf8"));
  decipher.setAuthTag(Buffer.from(box.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(box.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
async function storeSecret(tx, purpose, plaintext) {
  const sealed = sealSecret(plaintext, purpose);
  return tx.secretBox.create({ data: sealed, select: { id: true } });
}
async function readSecret(tx, id) {
  const box = await tx.secretBox.findUnique({ where: { id } });
  if (!box) throw new Error("Secret not found");
  return openSecret(box);
}

// features/keystone/lib/session.ts
var import_node_crypto5 = require("node:crypto");
var import_session = require("@keystone-6/core/session");
var SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
var PENDING_MS = 5 * 6e4;
var attested = /* @__PURE__ */ new WeakMap();
function attestVerifiedStart(user) {
  const data = { listKey: "User", itemId: user.id };
  attested.set(data, Number(user.authVersion));
  return data;
}
function sessionSecret() {
  const secret2 = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-development-session-secret-change-me-now");
  if (secret2.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return secret2;
}
async function loadUser(context, id) {
  const user = await context.prisma.user.findUnique({ where: { id }, select: { id: true, authVersion: true, mfaEnrolled: true, accessExpiresAt: true } });
  if (!user) return void 0;
  if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) return void 0;
  return user;
}
async function practiceSessionHours(context) {
  const practice = await context.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { sessionHours: true } }).catch(() => null);
  return Math.min(12, Math.max(1, Number(practice?.sessionHours ?? 12)));
}
function dentalSessions() {
  const base = (0, import_session.statelessSessions)({ maxAge: SESSION_MAX_AGE_SECONDS, secret: sessionSecret(), sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  async function readRaw(context) {
    const raw = await base.get({ context });
    if (!raw?.itemId || raw.listKey !== "User") return void 0;
    const user = await loadUser(context, raw.itemId);
    if (!user || Number(user.authVersion) !== Number(raw.authVersion)) return void 0;
    const hours = await practiceSessionHours(context);
    if (raw.startedAt && Date.now() - raw.startedAt > hours * 36e5) return void 0;
    return { raw, user };
  }
  return {
    async get({ context }) {
      const current = await readRaw(context);
      if (!current) return void 0;
      const { raw, user } = current;
      if (user.mfaEnrolled && raw.mfaVerified !== true) return void 0;
      return { listKey: "User", itemId: raw.itemId, mfaVerified: raw.mfaVerified === true, authVersion: raw.authVersion };
    },
    /** The pending second-factor challenge for this cookie, if any (verifyMfa only). */
    async pending({ context }) {
      const current = await readRaw(context);
      if (!current) return void 0;
      const { raw, user } = current;
      if (!user.mfaEnrolled || raw.mfaVerified || !raw.mfaNonce || !raw.mfaExpiresAt || raw.mfaExpiresAt <= Date.now()) return void 0;
      return { userId: user.id, nonce: raw.mfaNonce, authVersion: Number(user.authVersion) };
    },
    async start({ context, data }) {
      const user = await loadUser(context, data.itemId);
      if (!user) throw new Error("This account cannot sign in.");
      const verifiedVersion = attested.get(data);
      attested.delete(data);
      if (verifiedVersion !== void 0 && verifiedVersion !== Number(user.authVersion)) throw new Error("Your sign-in details changed during verification. Sign in again.");
      return base.start({
        context,
        data: {
          listKey: "User",
          itemId: user.id,
          authVersion: Number(user.authVersion),
          mfaVerified: verifiedVersion !== void 0,
          mfaNonce: (0, import_node_crypto5.randomBytes)(24).toString("hex"),
          mfaExpiresAt: Date.now() + PENDING_MS,
          startedAt: Date.now()
        }
      });
    },
    end: (args) => base.end(args)
  };
}

// features/keystone/lib/mfa.ts
var import_node_crypto6 = require("node:crypto");
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function encodeMfaSecret(bytes) {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits) result += BASE32[value << 5 - bits & 31];
  return result;
}
function decodeSecret(secret2) {
  if (!/^[A-Z2-7]{32}$/.test(secret2)) throw new Error("Invalid authenticator secret.");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of secret2) {
    value = value << 5 | BASE32.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
var newMfaSecret = () => encodeMfaSecret((0, import_node_crypto6.randomBytes)(20));
function totp(secret2, counter) {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("Invalid authenticator counter.");
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const hash = (0, import_node_crypto6.createHmac)("sha1", decodeSecret(secret2)).update(input).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 2147483647) % 1e6).padStart(6, "0");
}
function verifyTotp(secret2, code, lastCounter, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) throw new DomainError(Codes.INVALID_INPUT, "Enter the six-digit code from your authenticator app.", { field: "code" });
  const current = Math.floor(now / 3e4);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter >= 0 && counter > lastCounter && (0, import_node_crypto6.timingSafeEqual)(Buffer.from(totp(secret2, counter)), Buffer.from(code))) return counter;
  }
  throw new DomainError(Codes.MFA_REQUIRED, "That code is wrong, expired or already used. Wait for the next code and try again.");
}
var provisioningUri = (issuer, account, secret2) => `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret2}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
var hashRecoveryCode = (userId, code) => (0, import_node_crypto6.createHash)("sha256").update(`${userId}:${code.trim().toUpperCase()}`).digest("hex");
function newRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => (0, import_node_crypto6.randomBytes)(10).toString("hex").toUpperCase().replace(/(.{5})(?=.)/g, "$1-"));
}
function consumeRecoveryCode(userId, stored, code) {
  let hashes = [];
  try {
    const parsed = JSON.parse(stored || "[]");
    hashes = Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    hashes = [];
  }
  const hash = hashRecoveryCode(userId, code.replaceAll("-", "").replace(/(.{5})(?=.)/g, "$1-"));
  const index = hashes.findIndex((value) => value.length === hash.length && (0, import_node_crypto6.timingSafeEqual)(Buffer.from(value), Buffer.from(hash)));
  if (index < 0) throw new DomainError(Codes.MFA_REQUIRED, "That recovery code is wrong or already used.");
  return JSON.stringify(hashes.filter((_, position) => position !== index));
}
var MFA_MAX_FAILURES = 5;
var MFA_LOCK_MS = 15 * 6e4;

// features/keystone/mutations/mfa.ts
var lockUser = (tx, id) => tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `mfa:${id}`);
async function requirePassword(context, user, password2) {
  const field = context.graphql?.schema?.getType("User")?.getFields()?.password?.extensions?.keystoneSecretField;
  if (!field?.compare || typeof password2 !== "string" || password2.length > 1e3 || !await field.compare(password2, user.password)) {
    throw new DomainError(Codes.NOT_AUTHORIZED, "Enter your current password.");
  }
}
function assertNotLocked(user) {
  if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) throw new DomainError(Codes.RATE_LIMITED, "Too many wrong codes. Try again in 15 minutes.");
}
async function recordFailure(prisma, userId) {
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { mfaFailures: true } });
    const failures = Number(user?.mfaFailures ?? 0) + 1;
    await tx.user.update({ where: { id: userId }, data: failures >= MFA_MAX_FAILURES ? { mfaFailures: 0, mfaLockedUntil: new Date(Date.now() + MFA_LOCK_MS) } : { mfaFailures: failures } });
  });
}
var audit = (uow, userId, eventType, metadata = {}) => uow.audit({ eventType, entityType: "User", entityId: userId, actorUserId: userId, metadata });
async function mfaStatus(_root, _args, context) {
  if (context.session?.itemId) {
    const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId }, select: { mfaEnrolled: true, mfaRecoveryHashes: true } });
    const remaining = (() => {
      try {
        return JSON.parse(user?.mfaRecoveryHashes || "[]").length;
      } catch {
        return 0;
      }
    })();
    return { signedIn: true, enrolled: Boolean(user?.mfaEnrolled), verified: context.session.mfaVerified === true, recoveryCodesRemaining: remaining };
  }
  const pending = await context.sessionStrategy?.pending?.({ context });
  return { signedIn: false, challengeRequired: Boolean(pending) };
}
async function verifyMfa(_root, args, context) {
  const pending = await context.sessionStrategy?.pending?.({ context });
  if (!pending) throw new DomainError(Codes.MFA_REQUIRED, "Sign in again to get a new verification step.");
  const code = String(args.code ?? "").trim();
  let user;
  try {
    user = await runInTransaction(context.prisma, async (uow) => {
      await lockUser(uow.tx, pending.userId);
      const row = await uow.tx.user.findUnique({ where: { id: pending.userId } });
      if (!row?.mfaEnrolled || !row.mfaSecretId || Number(row.authVersion) !== pending.authVersion) throw new DomainError(Codes.MFA_REQUIRED, "Sign in again to get a new verification step.");
      assertNotLocked(row);
      const used = await uow.tx.auditEvent.findUnique({ where: { eventKey: `mfa-challenge:${pending.nonce}` }, select: { id: true } });
      if (used) throw new DomainError(Codes.MFA_REQUIRED, "This verification step was already used. Sign in again.");
      const data = args.recovery ? { mfaRecoveryHashes: consumeRecoveryCode(row.id, row.mfaRecoveryHashes, code) } : { mfaLastCounter: verifyTotp(await readSecret(uow.tx, row.mfaSecretId), code, Number(row.mfaLastCounter)) };
      await uow.tx.user.update({ where: { id: row.id }, data: { ...data, mfaFailures: 0, mfaLockedUntil: null } });
      uow.audit({ eventKey: `mfa-challenge:${pending.nonce}`, eventType: args.recovery ? "mfa.recovery_used" : "mfa.verified", entityType: "User", entityId: row.id, actorUserId: row.id });
      return row;
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === Codes.MFA_REQUIRED && /wrong/.test(error.message)) await recordFailure(context.prisma, pending.userId);
    throw error;
  }
  const sessionToken = await context.sessionStrategy.start({ context, data: attestVerifiedStart({ id: user.id, authVersion: Number(user.authVersion) }) });
  return { sessionToken };
}
async function manageMfa(_root, args, context) {
  const id = context.session?.itemId;
  if (!id) throw new import_graphql2.GraphQLError("Sign in to manage your second factor.", { extensions: { code: Codes.NOT_AUTHORIZED } });
  const code = String(args.code ?? "").trim();
  try {
    return await runInTransaction(context.prisma, async (uow) => {
      await lockUser(uow.tx, id);
      const user = await uow.tx.user.findUnique({ where: { id } });
      if (!user || Number(user.authVersion) !== Number(context.session.authVersion)) throw new DomainError(Codes.NOT_AUTHORIZED, "Your session changed. Sign in again.");
      assertNotLocked(user);
      await requirePassword(context, user, args.password);
      if (args.action === "enrol") {
        if (user.mfaEnrolled) throw new DomainError(Codes.INVALID_TRANSITION, "A second factor is already set up. Disable it first to change authenticators.");
        const secret2 = newMfaSecret();
        const box = await storeSecret(uow.tx, `mfa:${id}`, secret2);
        await uow.tx.user.update({ where: { id }, data: { mfaPendingSecretId: box.id, mfaPendingExpiresAt: new Date(uow.now.getTime() + 10 * 6e4) } });
        audit(uow, id, "mfa.enrolment_started");
        return { secret: secret2, provisioningUri: provisioningUri("Openfront Dental", user.email, secret2), expiresInMinutes: 10 };
      }
      let factor;
      if (args.action === "confirm") {
        if (user.mfaEnrolled || !user.mfaPendingSecretId || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt.getTime() <= uow.now.getTime()) {
          throw new DomainError(Codes.INVALID_TRANSITION, "Set-up expired. Start again.");
        }
        factor = { mfaLastCounter: verifyTotp(await readSecret(uow.tx, user.mfaPendingSecretId), code, -1), mfaSecretId: user.mfaPendingSecretId, mfaEnrolled: true };
      } else if (args.action === "disable" || args.action === "rotate_recovery") {
        if (!user.mfaEnrolled || !user.mfaSecretId) throw new DomainError(Codes.INVALID_TRANSITION, "No second factor is set up.");
        factor = args.recovery ? { mfaRecoveryHashes: consumeRecoveryCode(id, user.mfaRecoveryHashes, code) } : { mfaLastCounter: verifyTotp(await readSecret(uow.tx, user.mfaSecretId), code, Number(user.mfaLastCounter)) };
      } else {
        throw new DomainError(Codes.INVALID_INPUT, "Choose enrol, confirm, rotate_recovery or disable.", { field: "action" });
      }
      const codes = args.action === "disable" ? [] : newRecoveryCodes();
      await uow.tx.user.update({
        where: { id },
        data: {
          ...factor,
          ...args.action === "disable" ? { mfaEnrolled: false, mfaSecretId: null, mfaLastCounter: -1 } : {},
          mfaRecoveryHashes: JSON.stringify(codes.map((c) => hashRecoveryCode(id, c))),
          mfaPendingSecretId: null,
          mfaPendingExpiresAt: null,
          mfaFailures: 0,
          authVersion: { increment: 1 }
        }
      });
      audit(uow, id, args.action === "confirm" ? "mfa.enrolled" : `mfa.${args.action}`);
      return { recoveryCodes: codes, signedOut: true };
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === Codes.MFA_REQUIRED && /wrong/.test(error.message)) await recordFailure(context.prisma, id);
    throw error;
  }
}

// features/keystone/mutations/index.ts
var graphql = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
        mfaStatus: JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadPracticeSetup(idempotencyKey: String!): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestPracticeControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON
        verifyMfa(code: String!, recovery: Boolean): JSON
        manageMfa(action: String!, password: String!, code: String, recovery: Boolean): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        verifyAuditChain: op(verifyAuditChain2),
        mfaStatus: op(mfaStatus)
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        loadPracticeSetup: op(loadPracticeSetup),
        decideApprovalRequest: op(decideApprovalRequest),
        cancelApprovalRequest: op(cancelApprovalRequest),
        requestPracticeControls: op(requestPracticeControls),
        verifyMfa: op(verifyMfa),
        manageMfa: op(manageMfa)
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.warn(`Test mail preview: ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/mcp-oauth/session.ts
async function resolveMcpAccessToken(context, token, listKey = "User") {
  try {
    const sudo = context.sudo();
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } });
    if (!record || record.tokenType !== "access_token" || record.isRevoked !== "false" || !record.userId || !record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return void 0;
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } });
    if (!app || app.status !== "active") return void 0;
    const mcp = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id)
    };
    return { itemId: String(record.userId), listKey, mcp };
  } catch {
    return void 0;
  }
}
function withMcpBearerSessions(strategy, listKey = "User") {
  return {
    ...strategy,
    async get({ context }) {
      const token = bearerToken(context?.req?.headers?.authorization);
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey);
      return strategy.get({ context });
    }
  };
}

// features/keystone/prismaConstraints.ts
var COMPOUND_UNIQUES = {
  StaffAssignment: ['@@index([userId, locationId], map: "StaffAssignment_user_location_idx")'],
  AgentToolGrant: ['@@index([agentId, scope], map: "AgentToolGrant_agent_scope_idx")']
};
function addDatabaseConstraints(schema) {
  for (const [modelName, directives] of Object.entries(COMPOUND_UNIQUES)) {
    const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`);
    const model = schema.match(pattern)?.[0];
    if (!model) throw new Error(`Generated Prisma schema is missing ${modelName}`);
    const missing = directives.filter((directive) => !model.includes(directive));
    if (!missing.length) continue;
    schema = schema.replace(model, model.replace(/\n\}$/, `
${missing.map((directive) => `  ${directive}`).join("\n")}
}`));
  }
  return schema;
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Practice Owner",
          // Every permission except break-glass, which is never granted by default.
          ...Object.fromEntries(permissionNames.filter((name) => !NEVER_DEFAULT.includes(name)).map((name) => [name, true]))
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    kind
    accessExpiresAt
    mfaEnrolled
    assignments {
      startsOn
      endsOn
      location { id }
      role {
        id
        ${permissionNames.join("\n        ")}
      }
    }
    role {
      id
      name
      ${permissionNames.join("\n      ")}
    }
  `
});
var keystone_default = withAuth(
  (0, import_core10.config)({
    db: {
      provider: "postgresql",
      url: databaseURL,
      extendPrismaSchema: addDatabaseConstraints
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => isSignedIn({ session }) && session?.data.role?.canAccessDashboard === true
    },
    // Staff cookies: 12 h ceiling, second-factor pending state, authVersion revocation (lib/session).
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions(dentalSessions()),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map

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
var import_core14 = require("@keystone-6/core");
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

// features/keystone/models/patients.ts
var patients_exports = {};
__export(patients_exports, {
  ALERT_KINDS: () => ALERT_KINDS,
  CONTACT_KINDS: () => CONTACT_KINDS,
  ContactPoint: () => ContactPoint,
  FamilyGroup: () => FamilyGroup,
  GUARANTOR_RELATIONSHIPS: () => GUARANTOR_RELATIONSHIPS,
  Guarantor: () => Guarantor,
  GuarantorLink: () => GuarantorLink,
  IDENTIFIER_SYSTEMS: () => IDENTIFIER_SYSTEMS,
  MergeCase: () => MergeCase,
  MergeMap: () => MergeMap,
  PATIENT_READERS: () => PATIENT_READERS,
  PATIENT_STATUSES: () => PATIENT_STATUSES,
  Patient: () => Patient,
  PatientAlert: () => PatientAlert,
  PatientIdentifier: () => PatientIdentifier,
  Referral: () => Referral,
  ReferralSource: () => ReferralSource,
  SEX_AT_BIRTH: () => SEX_AT_BIRTH,
  ageOn: () => ageOn
});
var import_core9 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");

// features/keystone/models/scope.ts
var rule2 = (read) => Array.isArray(read) ? anyOf(...read) : permissions[read];
var PATIENT_LOCATION_LOOKBACK_YEARS = 3;
var locationFilter = (path = ["location"]) => ({ session }) => {
  if (!isSignedIn({ session })) return false;
  const ids = sessionLocationIds(session);
  if (ids === null) return true;
  return nest(path, { id: { in: ids } });
};
var patientFilter = (path = []) => ({ session }) => {
  if (!isSignedIn({ session })) return false;
  const ids = sessionLocationIds(session);
  if (ids === null) return true;
  const since = new Date(Date.now() - PATIENT_LOCATION_LOOKBACK_YEARS * 365.25 * 864e5);
  const where = {
    OR: [
      { homeLocation: { id: { in: ids } } },
      { appointments: { some: { location: { id: { in: ids } }, startsAt: { gte: since.toISOString() } } } }
    ]
  };
  return path.length ? nest(path, where) : where;
};
function nest(path, leaf) {
  return path.reduceRight((inner, key) => ({ [key]: inner }), leaf);
}
var scopedGoverned = (read, filter) => ({
  operation: { query: rule2(read), create: () => false, update: () => false, delete: () => false },
  filter: { query: filter }
});
var scopedManaged = (read, write, filter) => ({
  operation: { query: rule2(read), create: rule2(write), update: rule2(write), delete: () => false },
  filter: { query: filter, update: filter }
});

// features/keystone/models/patients.ts
var PATIENT_READERS = ["canReadDemographics", "canManagePatients", "canReadClinical", "canReadInsurance", "canReadLedger", "canReadSchedule"];
var PATIENT_STATUSES = ["prospect", "active", "inactive", "archived", "deceased", "merged_into"];
var SEX_AT_BIRTH = ["female", "male", "unknown", "other"];
var ALERT_KINDS = ["premedication", "anticoagulant", "antiresorptive", "allergy", "latex", "pregnancy", "diabetes", "hypertension", "cardiac", "sedation_history", "behavioural", "financial", "other"];
var CONTACT_KINDS = ["mobile", "home", "work", "email"];
var GUARANTOR_RELATIONSHIPS = ["self", "parent", "spouse", "guardian", "other"];
var IDENTIFIER_SYSTEMS = ["incumbent_dentrix", "incumbent_eaglesoft", "incumbent_opendental", "incumbent_other", "mrn_external", "state_medicaid"];
function ageOn(dateOfBirth, on) {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  return y - by - (m < bm || m === bm && d < bd ? 1 : 0);
}
var Patient = (0, import_core9.list)({
  access: scopedGoverned([...PATIENT_READERS], patientFilter()),
  ui: {
    labelField: "chartNumber",
    listView: { initialColumns: ["chartNumber", "lastName", "firstName", "dateOfBirth", "status", "homeLocation"], initialSort: { field: "lastName", direction: "ASC" } }
  },
  fields: {
    chartNumber: systemText({ indexed: "unique", required: true }),
    status: lifecycle(PATIENT_STATUSES),
    mergedInto: (0, import_fields9.relationship)({ ref: "Patient", ...readOnly }),
    firstName: (0, import_fields9.text)({ validation: { isRequired: true }, ...readOnly }),
    middleName: (0, import_fields9.text)({ ...readOnly }),
    lastName: (0, import_fields9.text)({ validation: { isRequired: true }, ...readOnly }),
    preferredName: (0, import_fields9.text)({ ...readOnly }),
    suffix: (0, import_fields9.text)({ ...readOnly }),
    dateOfBirth: (0, import_fields9.calendarDay)({ validation: { isRequired: true }, ...readOnly }),
    sexAssignedAtBirth: fixedChoice(SEX_AT_BIRTH),
    genderIdentity: (0, import_fields9.text)({ ...readOnly }),
    pronouns: (0, import_fields9.text)({ ...readOnly }),
    preferredLanguage: (0, import_fields9.text)({ defaultValue: "en", ...readOnly }),
    address: (0, import_fields9.json)({ defaultValue: {}, ...readOnly }),
    contactPoints: (0, import_fields9.relationship)({ ref: "ContactPoint.patient", many: true, ...readOnly }),
    identifiers: (0, import_fields9.relationship)({ ref: "PatientIdentifier.patient", many: true, ...readOnly }),
    family: (0, import_fields9.relationship)({ ref: "FamilyGroup.members", ...readOnly }),
    guarantorLinks: (0, import_fields9.relationship)({ ref: "GuarantorLink.patient", many: true, ...readOnly }),
    primaryProvider: (0, import_fields9.relationship)({ ref: "ProviderProfile", ...readOnly }),
    primaryHygienist: (0, import_fields9.relationship)({ ref: "ProviderProfile", ...readOnly }),
    homeLocation: (0, import_fields9.relationship)({ ref: "Location", ...readOnly }),
    referralSource: (0, import_fields9.relationship)({ ref: "ReferralSource", ...readOnly }),
    referredBy: (0, import_fields9.text)({ ...readOnly }),
    isMinor: (0, import_fields9.virtual)({
      field: import_core9.graphql.field({
        type: import_core9.graphql.Boolean,
        async resolve(item, _args, context) {
          if (!item.dateOfBirth) return null;
          const dob = item.dateOfBirth instanceof Date ? item.dateOfBirth.toISOString().slice(0, 10) : String(item.dateOfBirth).slice(0, 10);
          let majority = 18;
          if (item.homeLocationId) {
            const location = await context.sudo().prisma.location.findUnique({ where: { id: item.homeLocationId }, select: { jurisdiction: { select: { rules: true } } } });
            const age = location?.jurisdiction?.rules?.retention?.value?.majorityAge;
            if (Number.isInteger(age)) majority = age;
          }
          return ageOn(dob, (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) < majority;
        }
      }),
      ui: { itemView: { fieldMode: "read" }, listView: { fieldMode: "hidden" } }
    }),
    firstVisitOn: (0, import_fields9.calendarDay)({ ...readOnly }),
    lastVisitOn: (0, import_fields9.calendarDay)({ ...readOnly }),
    dateOfDeath: (0, import_fields9.calendarDay)({ ...readOnly }),
    alerts: (0, import_fields9.relationship)({ ref: "PatientAlert.patient", many: true, ...readOnly }),
    appointments: (0, import_fields9.relationship)({ ref: "Appointment.patient", many: true, ...readOnly }),
    asapEntries: (0, import_fields9.relationship)({ ref: "AsapEntry.patient", many: true, ...readOnly }),
    statementHold: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly }),
    isSynthetic: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var PatientIdentifier = (0, import_core9.list)({
  access: scopedGoverned(["canReadDemographics", "canManagePatients"], patientFilter(["patient"])),
  ui: { labelField: "value", listView: { initialColumns: ["patient", "system", "value"] } },
  fields: {
    patient: (0, import_fields9.relationship)({ ref: "Patient.identifiers", ...readOnly }),
    system: fixedChoice(IDENTIFIER_SYSTEMS),
    value: systemText({ required: true }),
    ...trackingFields
  }
});
var FamilyGroup = (0, import_core9.list)({
  access: managed(["canReadDemographics", "canManagePatients"], "canManagePatients"),
  ui: { labelField: "name", listView: { initialColumns: ["name", "members"] } },
  fields: {
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    members: (0, import_fields9.relationship)({ ref: "Patient.family", many: true, ...readOnly }),
    primaryAddress: (0, import_fields9.json)({ defaultValue: {} }),
    notes: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    isSynthetic: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var Guarantor = (0, import_core9.list)({
  access: governed(["canReadLedger", "canManagePatients", "canReadDemographics"]),
  ui: { listView: { initialColumns: ["patient", "links"] } },
  fields: {
    patient: (0, import_fields9.relationship)({ ref: "Patient", ...readOnly, ui: { ...readOnly.ui, description: "Set when the guarantor is also a patient." } }),
    personName: (0, import_fields9.json)({ defaultValue: {}, ...readOnly, ui: { ...readOnly.ui, description: "Name of a guarantor who is not a patient." } }),
    contactPoints: (0, import_fields9.relationship)({ ref: "ContactPoint.guarantor", many: true, ...readOnly }),
    links: (0, import_fields9.relationship)({ ref: "GuarantorLink.guarantor", many: true, ...readOnly }),
    isSynthetic: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var GuarantorLink = (0, import_core9.list)({
  access: governed(["canReadLedger", "canManagePatients", "canReadDemographics"]),
  ui: { listView: { initialColumns: ["patient", "guarantor", "relationship", "status", "startsOn"] } },
  fields: {
    patient: (0, import_fields9.relationship)({ ref: "Patient.guarantorLinks", ...readOnly }),
    guarantor: (0, import_fields9.relationship)({ ref: "Guarantor.links", ...readOnly }),
    relationship: fixedChoice(GUARANTOR_RELATIONSHIPS),
    status: lifecycle(["active", "ended"]),
    startsOn: (0, import_fields9.calendarDay)({ ...readOnly }),
    endsOn: (0, import_fields9.calendarDay)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ContactPoint = (0, import_core9.list)({
  access: governed(["canReadDemographics", "canManagePatients", "canMessagePatients"]),
  ui: { labelField: "kind", listView: { initialColumns: ["patient", "kind", "value", "isPrimary", "isActive"] } },
  fields: {
    patient: (0, import_fields9.relationship)({ ref: "Patient.contactPoints", ...readOnly }),
    guarantor: (0, import_fields9.relationship)({ ref: "Guarantor.contactPoints", ...readOnly }),
    kind: fixedChoice(CONTACT_KINDS),
    value: systemText({ required: true }),
    valueNormalized: systemText({ indexed: true, required: true }),
    isPrimary: (0, import_fields9.checkbox)({ defaultValue: false, ...readOnly }),
    isActive: (0, import_fields9.checkbox)({ defaultValue: true, ...readOnly }),
    verifiedAt: (0, import_fields9.timestamp)({ ...readOnly }),
    consentGrants: (0, import_fields9.relationship)({ ref: "ConsentGrant.contactPoint", many: true, ...readOnly }),
    ...trackingFields
  }
});
var PatientAlert = (0, import_core9.list)({
  access: scopedGoverned([...PATIENT_READERS], patientFilter(["patient"])),
  ui: { labelField: "kind", listView: { initialColumns: ["patient", "kind", "severity", "activeFrom", "endedAt"] } },
  fields: {
    patient: (0, import_fields9.relationship)({ ref: "Patient.alerts", ...readOnly }),
    kind: fixedChoice(ALERT_KINDS),
    severity: fixedChoice(["info", "caution", "critical"]),
    text: systemText({ required: true }),
    source: fixedChoice(["manual", "history_answer"]),
    activeFrom: (0, import_fields9.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    endedAt: (0, import_fields9.timestamp)({ ...readOnly }),
    recordedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ReferralSource = (0, import_core9.list)({
  access: managed(["canReadDemographics", "canManagePatients"], "canManagePatients"),
  ui: { labelField: "name", listView: { initialColumns: ["name", "kind", "isActive"] } },
  fields: {
    name: (0, import_fields9.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    kind: choice(["marketing", "patient", "provider", "insurance_directory", "other"], "marketing"),
    providerContact: (0, import_fields9.json)({ defaultValue: {} }),
    isActive: (0, import_fields9.checkbox)({ defaultValue: true }),
    ...trackingFields
  }
});
var Referral = (0, import_core9.list)({
  access: scopedManaged(["canReadDemographics", "canManagePatients", "canReadClinical"], ["canManagePatients", "canChart"], patientFilter(["patient"])),
  ui: { listView: { initialColumns: ["patient", "direction", "toFrom", "status", "createdAt"] } },
  fields: {
    patient: (0, import_fields9.relationship)({ ref: "Patient" }),
    direction: choice(["in", "out"], "out"),
    toFrom: (0, import_fields9.relationship)({ ref: "ReferralSource" }),
    reason: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    status: choice(["draft", "sent", "scheduled_elsewhere", "report_received", "closed"], "draft"),
    letter: (0, import_fields9.relationship)({ ref: "Document" }),
    ...trackingFields
  }
});
var MergeCase = (0, import_core9.list)({
  access: governed(["canManagePatients", "canApprovePatientMerge"]),
  ui: { listView: { initialColumns: ["survivor", "merged", "status", "createdAt", "revertibleUntil"] } },
  fields: {
    survivor: (0, import_fields9.relationship)({ ref: "Patient", ...readOnly }),
    merged: (0, import_fields9.relationship)({ ref: "Patient", ...readOnly }),
    evidence: (0, import_fields9.json)({ defaultValue: {}, ...readOnly }),
    reason: systemText(),
    status: lifecycle(["proposed", "approved", "applied", "reverted", "rejected"]),
    approval: (0, import_fields9.relationship)({ ref: "ApprovalRequest", ...readOnly }),
    proposedBy: (0, import_fields9.relationship)({ ref: "User", ...readOnly }),
    appliedAt: (0, import_fields9.timestamp)({ ...readOnly }),
    revertibleUntil: (0, import_fields9.timestamp)({ ...readOnly }),
    revertedAt: (0, import_fields9.timestamp)({ ...readOnly }),
    mergedStatusBefore: systemText(),
    entries: (0, import_fields9.relationship)({ ref: "MergeMap.mergeCase", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var MergeMap = (0, import_core9.list)({
  access: immutable(["canManagePatients", "canApprovePatientMerge"]),
  ui: { listView: { initialColumns: ["mergeCase", "listKey", "rowId", "field"] } },
  fields: {
    mergeCase: (0, import_fields9.relationship)({ ref: "MergeCase.entries", ...readOnly }),
    listKey: systemText({ required: true }),
    rowId: systemText({ required: true }),
    field: systemText({ required: true }),
    fromId: systemText({ required: true }),
    toId: systemText({ required: true }),
    seq: (0, import_fields9.integer)({ ...readOnly, defaultValue: 0 }),
    ...trackingFields
  }
});

// features/keystone/models/scheduling.ts
var scheduling_exports = {};
__export(scheduling_exports, {
  ACTIVE_APPOINTMENT_STATUSES: () => ACTIVE_APPOINTMENT_STATUSES,
  APPOINTMENT_CATEGORIES: () => APPOINTMENT_CATEGORIES,
  APPOINTMENT_SOURCES: () => APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES: () => APPOINTMENT_STATUSES,
  Appointment: () => Appointment,
  AppointmentSegment: () => AppointmentSegment,
  AppointmentType: () => AppointmentType,
  AsapEntry: () => AsapEntry,
  BookingHold: () => BookingHold,
  BrokenAppointmentEvent: () => BrokenAppointmentEvent,
  CONFIRMATION_METHODS: () => CONFIRMATION_METHODS,
  ClosureDay: () => ClosureDay,
  ConfirmationAttempt: () => ConfirmationAttempt,
  OPERATORY_KINDS: () => OPERATORY_KINDS,
  Operatory: () => Operatory,
  ProductionGoal: () => ProductionGoal,
  SEGMENT_ROLES: () => SEGMENT_ROLES,
  ScheduleTemplate: () => ScheduleTemplate,
  TemplateBlock: () => TemplateBlock
});
var import_core10 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");
var OPERATORY_KINDS = ["doctor", "hygiene", "flex", "consult", "surgery"];
var APPOINTMENT_CATEGORIES = [
  "new_patient",
  "recall_hygiene",
  "perio_maintenance",
  "restorative",
  "crown_prep",
  "crown_seat",
  "endo",
  "extraction",
  "emergency",
  "consult",
  "ortho",
  "other"
];
var SEGMENT_ROLES = ["provider", "assistant", "hygienist", "exam"];
var APPOINTMENT_STATUSES = ["planned", "scheduled", "confirmed", "arrived", "seated", "ready_for_checkout", "completed", "cancelled", "broken", "rescheduled"];
var ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "confirmed", "arrived", "seated", "ready_for_checkout"];
var CONFIRMATION_METHODS = ["sms_reply", "email_link", "phone", "in_person", "portal_api"];
var APPOINTMENT_SOURCES = ["staff", "online_booking", "agent_proposal", "import", "recall_auto"];
var SCHEDULE_READERS = ["canReadSchedule", "canManageSchedule"];
var scheduleRead = [...SCHEDULE_READERS];
var Operatory = (0, import_core10.list)({
  access: scopedManaged(scheduleRead, ["canManageTemplates", "canManagePractice"], locationFilter()),
  ui: { labelField: "name", listView: { initialColumns: ["location", "code", "name", "kind", "sortOrder", "isActive"] } },
  fields: {
    location: (0, import_fields10.relationship)({ ref: "Location" }),
    code: (0, import_fields10.text)({ validation: { isRequired: true, match: { regex: /^[A-Z0-9-]{1,8}$/, explanation: "Up to 8 capital letters, digits or dashes (OP3, H1)" } } }),
    name: (0, import_fields10.text)({ validation: { isRequired: true } }),
    kind: choice(OPERATORY_KINDS, "doctor"),
    equipmentTags: (0, import_fields10.json)({ defaultValue: [] }),
    sortOrder: (0, import_fields10.integer)({ defaultValue: 0 }),
    isActive: (0, import_fields10.checkbox)({ defaultValue: true }),
    isSynthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var AppointmentType = (0, import_core10.list)({
  access: managed("signedIn", "canManageTemplates"),
  ui: { labelField: "name", listView: { initialColumns: ["code", "name", "category", "defaultDurationUnits", "onlineBookable", "isActive"] } },
  fields: {
    name: (0, import_fields10.text)({ validation: { isRequired: true } }),
    code: (0, import_fields10.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z0-9_]{2,24}$/, explanation: "2-24 capital letters, digits or underscores" } } }),
    category: choice(APPOINTMENT_CATEGORIES, "other"),
    defaultPattern: (0, import_fields10.json)({
      defaultValue: [{ role: "provider", units: 6 }],
      ui: { description: 'Units in order, e.g. [{"role":"assistant","units":1},{"role":"provider","units":4},{"role":"assistant","units":1}]. One unit is the practice schedule unit (10 minutes by default).' }
    }),
    defaultDurationUnits: (0, import_fields10.integer)({ defaultValue: 6, validation: { isRequired: true, min: 1, max: 96 } }),
    onlineBookable: (0, import_fields10.checkbox)({ defaultValue: false }),
    newPatientOnly: (0, import_fields10.checkbox)({ defaultValue: false }),
    requiresDentistOnSite: (0, import_fields10.checkbox)({ defaultValue: false, ui: { description: "Hygiene visits that need a dentist in the building (I-S5). The jurisdiction pack decides whether it is a hard stop or a warning." } }),
    requiresMedicalHistoryReview: (0, import_fields10.checkbox)({ defaultValue: true }),
    defaultProductionMinor: minor({ defaultValue: 0n, description: "Practice estimate of production for this visit in cents, used for scheduled production until planned procedures with fees are attached." }),
    publicName: (0, import_fields10.text)({ ui: { description: "Practice-authored name shown by the online booking API." } }),
    colour: (0, import_fields10.text)({ defaultValue: "#64748b", validation: { match: { regex: /^#[0-9a-fA-F]{6}$/ } } }),
    isActive: (0, import_fields10.checkbox)({ defaultValue: true }),
    isSynthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var ScheduleTemplate = (0, import_core10.list)({
  access: scopedManaged(scheduleRead, "canManageTemplates", locationFilter()),
  ui: { labelField: "name", listView: { initialColumns: ["location", "name", "status", "effectiveFrom", "effectiveTo"] } },
  fields: {
    location: (0, import_fields10.relationship)({ ref: "Location" }),
    name: (0, import_fields10.text)({ validation: { isRequired: true } }),
    effectiveFrom: (0, import_fields10.calendarDay)({ validation: { isRequired: true } }),
    effectiveTo: (0, import_fields10.calendarDay)(),
    status: lifecycle(["draft", "active", "retired"]),
    blocks: (0, import_fields10.relationship)({ ref: "TemplateBlock.template", many: true }),
    publishedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    publishedBy: (0, import_fields10.relationship)({ ref: "User", ...readOnly }),
    version: versionField(),
    isSynthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var TemplateBlock = (0, import_core10.list)({
  access: scopedManaged(scheduleRead, "canManageTemplates", locationFilter(["template", "location"])),
  ui: { labelField: "label", listView: { initialColumns: ["template", "weekday", "operatory", "provider", "startLocal", "endLocal", "onlineBookable"] } },
  fields: {
    template: (0, import_fields10.relationship)({ ref: "ScheduleTemplate.blocks" }),
    weekday: (0, import_fields10.integer)({ validation: { isRequired: true, min: 0, max: 6 }, ui: { description: "0 = Sunday \u2026 6 = Saturday" } }),
    operatory: (0, import_fields10.relationship)({ ref: "Operatory" }),
    provider: (0, import_fields10.relationship)({ ref: "ProviderProfile" }),
    startLocal: (0, import_fields10.text)({ validation: { isRequired: true, match: { regex: /^([01]\d|2[0-3]):[0-5]\d$/, explanation: "HH:mm" } } }),
    endLocal: (0, import_fields10.text)({ validation: { isRequired: true, match: { regex: /^([01]\d|2[0-3]):[0-5]\d$/, explanation: "HH:mm" } } }),
    allowedTypes: (0, import_fields10.relationship)({ ref: "AppointmentType", many: true, ui: { description: "Empty means any type." } }),
    label: (0, import_fields10.text)(),
    onlineBookable: (0, import_fields10.checkbox)({ defaultValue: false }),
    ...trackingFields
  }
});
var ProductionGoal = (0, import_core10.list)({
  access: scopedManaged(scheduleRead, ["canManageTemplates", "canManagePractice"], locationFilter()),
  ui: { listView: { initialColumns: ["provider", "location", "weekday", "date", "goalMinor"] } },
  fields: {
    provider: (0, import_fields10.relationship)({ ref: "ProviderProfile" }),
    location: (0, import_fields10.relationship)({ ref: "Location" }),
    weekday: (0, import_fields10.integer)({ validation: { min: 0, max: 6 }, ui: { description: "A standing goal for this weekday, or leave empty and set a date." } }),
    date: (0, import_fields10.calendarDay)(),
    goalMinor: minor({ required: true, description: "Scheduled production goal in cents." }),
    ...trackingFields
  }
});
var ClosureDay = (0, import_core10.list)({
  access: scopedManaged(scheduleRead, ["canManageTemplates", "canManagePractice"], ({ session }) => {
    const filter = locationFilter()({ session });
    return filter === true || filter === false ? filter : { OR: [filter, { location: null }] };
  }),
  ui: { labelField: "reason", listView: { initialColumns: ["location", "date", "reason", "isHalfDay"] } },
  fields: {
    location: (0, import_fields10.relationship)({ ref: "Location", ui: { description: "Empty closes every location." } }),
    date: (0, import_fields10.calendarDay)({ validation: { isRequired: true } }),
    reason: (0, import_fields10.text)({ validation: { isRequired: true } }),
    isHalfDay: (0, import_fields10.checkbox)({ defaultValue: false }),
    startLocal: (0, import_fields10.text)({ validation: { match: { regex: /^(([01]\d|2[0-3]):[0-5]\d)?$/, explanation: "HH:mm" } } }),
    endLocal: (0, import_fields10.text)({ validation: { match: { regex: /^(([01]\d|2[0-3]):[0-5]\d)?$/, explanation: "HH:mm" } } }),
    ...trackingFields
  }
});
var Appointment = (0, import_core10.list)({
  access: scopedGoverned(scheduleRead, locationFilter()),
  ui: {
    labelField: "ref",
    listView: { initialColumns: ["ref", "startsAt", "patient", "operatory", "type", "status"], initialSort: { field: "startsAt", direction: "DESC" } }
  },
  fields: {
    ref: systemText({ indexed: "unique", required: true }),
    patient: (0, import_fields10.relationship)({ ref: "Patient.appointments", ...readOnly }),
    location: (0, import_fields10.relationship)({ ref: "Location", ...readOnly }),
    operatory: (0, import_fields10.relationship)({ ref: "Operatory", ...readOnly }),
    type: (0, import_fields10.relationship)({ ref: "AppointmentType", ...readOnly }),
    startsAt: (0, import_fields10.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    endsAt: (0, import_fields10.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    localDate: (0, import_fields10.calendarDay)({ ...readOnly, isIndexed: true }),
    bufferAfterMinutes: (0, import_fields10.integer)({ defaultValue: 0, ...readOnly }),
    status: lifecycle(APPOINTMENT_STATUSES, "scheduled"),
    confirmedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    confirmationMethod: systemText(),
    arrivedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    seatedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    readyAt: (0, import_fields10.timestamp)({ ...readOnly }),
    completedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    cancelledAt: (0, import_fields10.timestamp)({ ...readOnly }),
    cancelReason: systemText(),
    brokenKind: systemText(),
    rescheduledTo: (0, import_fields10.relationship)({ ref: "Appointment", ...readOnly }),
    primaryProvider: (0, import_fields10.relationship)({ ref: "ProviderProfile", ...readOnly }),
    supervisingDentist: (0, import_fields10.relationship)({ ref: "ProviderProfile", ...readOnly }),
    segments: (0, import_fields10.relationship)({ ref: "AppointmentSegment.appointment", many: true, ...readOnly }),
    confirmations: (0, import_fields10.relationship)({ ref: "ConfirmationAttempt.appointment", many: true, ...readOnly }),
    alertAckBy: (0, import_fields10.relationship)({ ref: "User", ...readOnly }),
    alertAckAt: (0, import_fields10.timestamp)({ ...readOnly }),
    note: systemText(),
    warnings: (0, import_fields10.json)({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: "Booking warnings accepted when the appointment was made (supervision, template)." } }),
    source: fixedChoice(APPOINTMENT_SOURCES),
    bookedViaHold: (0, import_fields10.relationship)({ ref: "BookingHold", ...readOnly }),
    proposal: (0, import_fields10.relationship)({ ref: "Proposal", ...readOnly }),
    bookedBy: (0, import_fields10.relationship)({ ref: "User", ...readOnly }),
    productionScheduledMinor: minor({ defaultValue: 0n }),
    isSynthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AppointmentSegment = (0, import_core10.list)({
  access: scopedGoverned(scheduleRead, locationFilter(["appointment", "location"])),
  ui: { listView: { initialColumns: ["appointment", "role", "provider", "startsAt", "endsAt", "concurrencyKind"] } },
  fields: {
    appointment: (0, import_fields10.relationship)({ ref: "Appointment.segments", ...readOnly }),
    role: fixedChoice(SEGMENT_ROLES),
    provider: (0, import_fields10.relationship)({ ref: "ProviderProfile", ...readOnly }),
    startsAt: (0, import_fields10.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    endsAt: (0, import_fields10.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    concurrencyKind: fixedChoice(["none", "hygiene_exam_float", "approved_override"]),
    overrideReason: systemText(),
    isActive: (0, import_fields10.checkbox)({ defaultValue: true, ...readOnly, ui: { ...readOnly.ui, description: "False once the appointment is cancelled, broken or rescheduled: the time is free again." } }),
    ...trackingFields
  }
});
var BookingHold = (0, import_core10.list)({
  access: scopedGoverned(scheduleRead, locationFilter()),
  ui: { listView: { initialColumns: ["location", "operatory", "startsAt", "endsAt", "holderKind", "status", "expiresAt"] } },
  fields: {
    location: (0, import_fields10.relationship)({ ref: "Location", ...readOnly }),
    operatory: (0, import_fields10.relationship)({ ref: "Operatory", ...readOnly }),
    provider: (0, import_fields10.relationship)({ ref: "ProviderProfile", ...readOnly }),
    type: (0, import_fields10.relationship)({ ref: "AppointmentType", ...readOnly }),
    startsAt: (0, import_fields10.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    endsAt: (0, import_fields10.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    segments: (0, import_fields10.json)({ defaultValue: [], ...readOnly }),
    holderKind: fixedChoice(["staff", "public_api", "agent_offer"]),
    holderRef: systemText({ indexed: true, required: true }),
    patient: (0, import_fields10.relationship)({ ref: "Patient", ...readOnly }),
    asapEntry: (0, import_fields10.relationship)({ ref: "AsapEntry", ...readOnly }),
    status: lifecycle(["held", "converted", "expired", "released"]),
    expiresAt: (0, import_fields10.timestamp)({ ...readOnly, isIndexed: true, validation: { isRequired: true } }),
    convertedTo: (0, import_fields10.relationship)({ ref: "Appointment", ...readOnly }),
    isSynthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AsapEntry = (0, import_core10.list)({
  access: scopedGoverned(scheduleRead, locationFilter()),
  ui: { listView: { initialColumns: ["patient", "location", "appointmentType", "provider", "earliestDate", "status", "priority"] } },
  fields: {
    patient: (0, import_fields10.relationship)({ ref: "Patient.asapEntries", ...readOnly }),
    location: (0, import_fields10.relationship)({ ref: "Location", ...readOnly }),
    appointmentType: (0, import_fields10.relationship)({ ref: "AppointmentType", ...readOnly }),
    provider: (0, import_fields10.relationship)({ ref: "ProviderProfile", ...readOnly }),
    preferredWindows: (0, import_fields10.json)({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: '[{ "weekday": 2, "from": "07:30", "to": "12:00" }, \u2026] local time.' } }),
    earliestDate: (0, import_fields10.calendarDay)({ ...readOnly }),
    note: systemText(),
    status: lifecycle(["active", "offered", "booked", "declined", "expired"]),
    priority: (0, import_fields10.integer)({ defaultValue: 0, ...readOnly }),
    bookedAppointment: (0, import_fields10.relationship)({ ref: "Appointment", ...readOnly }),
    isSynthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ConfirmationAttempt = (0, import_core10.list)({
  access: scopedGoverned(scheduleRead, locationFilter(["appointment", "location"])),
  ui: { listView: { initialColumns: ["appointment", "channel", "scheduledFor", "status", "suppressedReason"] } },
  fields: {
    appointment: (0, import_fields10.relationship)({ ref: "Appointment.confirmations", ...readOnly }),
    channel: fixedChoice(["email", "sms", "voice", "portal", "manual"]),
    scheduledFor: (0, import_fields10.timestamp)({ ...readOnly, isIndexed: true, validation: { isRequired: true } }),
    contactPoint: (0, import_fields10.relationship)({ ref: "ContactPoint", ...readOnly }),
    message: (0, import_fields10.relationship)({ ref: "Message", ...readOnly }),
    status: lifecycle(["scheduled", "sent", "replied_confirm", "replied_cancel", "replied_other", "no_reply", "suppressed"]),
    suppressedReason: systemText(),
    attemptedAt: (0, import_fields10.timestamp)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var BrokenAppointmentEvent = (0, import_core10.list)({
  access: immutable(scheduleRead),
  ui: { listView: { initialColumns: ["appointment", "patient", "kind", "at"] } },
  fields: {
    appointment: (0, import_fields10.relationship)({ ref: "Appointment", ...readOnly }),
    patient: (0, import_fields10.relationship)({ ref: "Patient", ...readOnly }),
    kind: fixedChoice(["no_show", "late_cancel"]),
    at: (0, import_fields10.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    recordedBy: (0, import_fields10.relationship)({ ref: "User", ...readOnly }),
    reason: systemText(),
    ...trackingFields
  }
});

// features/keystone/models/messaging.ts
var messaging_exports = {};
__export(messaging_exports, {
  CONSENT_CHANNELS: () => CONSENT_CHANNELS,
  CONSENT_PURPOSES: () => CONSENT_PURPOSES,
  ConsentGrant: () => ConsentGrant,
  Conversation: () => Conversation,
  MESSAGE_CHANNELS: () => MESSAGE_CHANNELS,
  Message: () => Message,
  MessageTemplate: () => MessageTemplate
});
var import_core11 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var CONSENT_CHANNELS = ["sms", "voice", "email"];
var CONSENT_PURPOSES = [
  "appointment_reminders",
  "recall",
  "treatment_follow_up",
  "billing_statements",
  "payment_reminders",
  "marketing",
  "reviews",
  "ai_text_outbound",
  "ai_voice_outbound"
];
var MESSAGE_CHANNELS = ["sms", "email", "web_chat", "portal", "voice", "manual"];
var ConsentGrant = (0, import_core11.list)({
  access: governed(["canMessagePatients", "canManagePatients", "canReadDemographics"]),
  ui: { listView: { initialColumns: ["contactPoint", "channel", "purpose", "status", "source", "grantedAt"] } },
  fields: {
    contactPoint: (0, import_fields11.relationship)({ ref: "ContactPoint.consentGrants", ...readOnly }),
    channel: fixedChoice(CONSENT_CHANNELS),
    purpose: fixedChoice(CONSENT_PURPOSES),
    status: lifecycle(["granted", "revoked", "expired"]),
    source: fixedChoice(["intake_form", "portal_api", "verbal_staff", "sms_keyword", "import"]),
    evidence: (0, import_fields11.json)({ defaultValue: {}, ...readOnly }),
    recordedBy: (0, import_fields11.relationship)({ ref: "User", ...readOnly }),
    grantedAt: (0, import_fields11.timestamp)({ ...readOnly }),
    revokedAt: (0, import_fields11.timestamp)({ ...readOnly }),
    revokeReason: systemText(),
    needsReconfirmation: (0, import_fields11.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var MessageTemplate = (0, import_core11.list)({
  access: managed(["canMessagePatients", "canManageTemplates"], "canManageTemplates"),
  ui: { labelField: "key", listView: { initialColumns: ["key", "channel", "purpose", "phiLevel", "locale", "status"] } },
  fields: {
    key: (0, import_fields11.text)({ validation: { isRequired: true, match: { regex: /^[a-z0-9_.]{3,60}$/, explanation: "lowercase letters, digits, dots and underscores" } } }),
    channel: choice(["sms", "email", "voice", "portal"], "email"),
    purpose: choice(CONSENT_PURPOSES, "appointment_reminders"),
    phiLevel: choice(["none", "minimal", "clinical"], "minimal"),
    subject: (0, import_fields11.text)(),
    body: (0, import_fields11.text)({ validation: { isRequired: true }, ui: { displayMode: "textarea", description: "Variables: {{patient.preferredName}}, {{appointment.when}}, {{location.name}}, {{location.phone}}, {{confirm.url}}." } }),
    locale: (0, import_fields11.text)({ defaultValue: "en" }),
    templateVersion: (0, import_fields11.integer)({ defaultValue: 1 }),
    status: choice(["draft", "active", "retired"], "active"),
    ...trackingFields
  }
});
var Conversation = (0, import_core11.list)({
  access: governed(["canMessagePatients", "canManagePatients"]),
  ui: { listView: { initialColumns: ["patient", "channel", "status", "assignedTo", "updatedAt"] } },
  fields: {
    patient: (0, import_fields11.relationship)({ ref: "Patient", ...readOnly }),
    contactPoint: (0, import_fields11.relationship)({ ref: "ContactPoint", ...readOnly }),
    channel: fixedChoice(MESSAGE_CHANNELS),
    status: lifecycle(["open", "agent_active", "human_active", "closed"]),
    aiDisclosureAt: (0, import_fields11.timestamp)({ ...readOnly }),
    agent: (0, import_fields11.relationship)({ ref: "AgentIdentity", ...readOnly }),
    assignedTo: (0, import_fields11.relationship)({ ref: "User", ...readOnly }),
    messages: (0, import_fields11.relationship)({ ref: "Message.conversation", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var Message = (0, import_core11.list)({
  access: governed(["canMessagePatients", "canManagePatients"]),
  ui: { listView: { initialColumns: ["conversation", "direction", "channel", "purpose", "status", "sentAt"] } },
  fields: {
    conversation: (0, import_fields11.relationship)({ ref: "Conversation.messages", ...readOnly }),
    direction: fixedChoice(["outbound", "inbound"]),
    channel: fixedChoice(MESSAGE_CHANNELS),
    template: (0, import_fields11.relationship)({ ref: "MessageTemplate", ...readOnly }),
    toAddress: systemText(),
    subject: systemText(),
    body: systemText(),
    purpose: systemText(),
    status: lifecycle(["draft", "queued", "suppressed", "accepted", "delivered", "failed", "unknown", "received"]),
    suppressedReason: systemText(),
    adapterKey: systemText(),
    adapterMode: systemText(),
    providerMessageId: systemText({ indexed: true }),
    proposal: (0, import_fields11.relationship)({ ref: "Proposal", ...readOnly }),
    sentAt: (0, import_fields11.timestamp)({ ...readOnly }),
    isSynthetic: (0, import_fields11.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});

// features/keystone/models/portal.ts
var portal_exports = {};
__export(portal_exports, {
  IntakeSession: () => IntakeSession,
  OnlineBookingPolicy: () => OnlineBookingPolicy,
  PORTAL_CAPABILITIES: () => PORTAL_CAPABILITIES,
  PORTAL_RELATIONSHIPS: () => PORTAL_RELATIONSHIPS,
  PortalAccount: () => PortalAccount,
  PortalScope: () => PortalScope,
  PublicBookingRequest: () => PublicBookingRequest,
  StorefrontSite: () => StorefrontSite
});
var import_core12 = require("@keystone-6/core");
var import_access12 = require("@keystone-6/core/access");
var import_fields12 = require("@keystone-6/core/fields");
var secretField = { access: { read: import_access12.denyAll, create: import_access12.denyAll, update: import_access12.denyAll }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } } };
var PORTAL_CAPABILITIES = ["appointments", "forms", "plans_accept", "statements_pay", "records", "messages", "membership", "preferences"];
var PORTAL_RELATIONSHIPS = ["self", "guarantor", "guardian", "personal_representative"];
var StorefrontSite = (0, import_core12.list)({
  access: managed("signedIn", "canManagePractice"),
  ui: { labelField: "slug", listView: { initialColumns: ["slug", "location", "headline", "isPublished"] } },
  fields: {
    location: (0, import_fields12.relationship)({ ref: "Location", ui: { description: "Empty means the whole practice." } }),
    slug: (0, import_fields12.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[a-z0-9-]{2,60}$/, explanation: "lowercase letters, digits and dashes" } } }),
    headline: (0, import_fields12.text)({ validation: { isRequired: true } }),
    about: (0, import_fields12.text)({ ui: { displayMode: "textarea" } }),
    services: (0, import_fields12.json)({ defaultValue: [], ui: { description: "Practice-authored service names and descriptions. Never paste licensed code descriptors here." } }),
    providersShown: (0, import_fields12.relationship)({ ref: "ProviderProfile", many: true }),
    seo: (0, import_fields12.json)({ defaultValue: {} }),
    brand: (0, import_fields12.json)({ defaultValue: {} }),
    isPublished: (0, import_fields12.checkbox)({ defaultValue: false }),
    isSynthetic: (0, import_fields12.checkbox)({ defaultValue: false, ...readOnly }),
    ...trackingFields
  }
});
var OnlineBookingPolicy = (0, import_core12.list)({
  access: scopedManaged(["canReadSchedule", "canManageSchedule", "canManagePractice"], ["canManagePractice", "canManageTemplates"], locationFilter()),
  ui: { listView: { initialColumns: ["location", "newPatientAllowed", "leadTimeHours", "horizonDays", "holdMinutes", "isActive"] } },
  fields: {
    location: (0, import_fields12.relationship)({ ref: "Location" }),
    appointmentTypes: (0, import_fields12.relationship)({ ref: "AppointmentType", many: true, ui: { description: "Types the public API may book. Each must also be marked online-bookable." } }),
    newPatientAllowed: (0, import_fields12.checkbox)({ defaultValue: true }),
    leadTimeHours: (0, import_fields12.integer)({ defaultValue: 4, validation: { isRequired: true, min: 0, max: 336 } }),
    horizonDays: (0, import_fields12.integer)({ defaultValue: 60, validation: { isRequired: true, min: 1, max: 365 } }),
    holdMinutes: (0, import_fields12.integer)({ defaultValue: 10, validation: { isRequired: true, min: 2, max: 30 } }),
    requireCardOnFile: (0, import_fields12.checkbox)({ defaultValue: false }),
    depositMinor: minor({ defaultValue: 0n, description: "Optional deposit in cents, collected through the payments adapter (Stripe test mode in the sample practice)." }),
    requireInsuranceCapture: (0, import_fields12.checkbox)({ defaultValue: false }),
    rateLimit: (0, import_fields12.json)({ defaultValue: { perClientPerHour: 30, perContactPerDay: 5, globalPerMinute: 120 } }),
    isActive: (0, import_fields12.checkbox)({ defaultValue: true }),
    ...trackingFields
  }
});
var PublicBookingRequest = (0, import_core12.list)({
  access: scopedGoverned(["canManageSchedule", "canManagePatients"], locationFilter()),
  ui: { listView: { initialColumns: ["createdAt", "status", "matchStatus", "appointment", "reviewedAt"] } },
  fields: {
    site: (0, import_fields12.relationship)({ ref: "StorefrontSite", ...readOnly }),
    location: (0, import_fields12.relationship)({ ref: "Location", ...readOnly }),
    publicRef: systemText({ indexed: "unique", required: true }),
    hold: (0, import_fields12.relationship)({ ref: "BookingHold", ...readOnly }),
    contact: (0, import_fields12.json)({ defaultValue: {}, ...readOnly }),
    patientMatch: (0, import_fields12.relationship)({ ref: "Patient", ...readOnly }),
    matchStatus: fixedChoice(["new_patient", "matched", "possible_duplicate"]),
    matchEvidence: (0, import_fields12.json)({ defaultValue: {}, ...readOnly }),
    intake: (0, import_fields12.json)({ defaultValue: {}, ...readOnly }),
    insuranceCapture: (0, import_fields12.json)({ defaultValue: {}, ...readOnly }),
    appointment: (0, import_fields12.relationship)({ ref: "Appointment", ...readOnly }),
    status: lifecycle(["started", "submitted", "booked", "abandoned", "rejected_spam"], "submitted"),
    reviewedAt: (0, import_fields12.timestamp)({ ...readOnly }),
    reviewedBy: (0, import_fields12.relationship)({ ref: "User", ...readOnly }),
    reviewNote: systemText(),
    ipHash: (0, import_fields12.text)({ ...secretField }),
    userAgentHash: (0, import_fields12.text)({ ...secretField }),
    captchaScore: systemText(),
    isSynthetic: (0, import_fields12.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var PortalAccount = (0, import_core12.list)({
  access: governed(["canManagePatients"]),
  ui: { labelField: "email", listView: { initialColumns: ["email", "status", "identityVerifiedAt", "lastLoginAt"] } },
  fields: {
    email: systemText({ indexed: "unique", required: true }),
    status: lifecycle(["invited", "active", "suspended", "revoked"]),
    verifiedContact: (0, import_fields12.relationship)({ ref: "ContactPoint", ...readOnly }),
    identityVerifiedAt: (0, import_fields12.timestamp)({ ...readOnly }),
    invitedBy: (0, import_fields12.relationship)({ ref: "User", ...readOnly }),
    lastLoginAt: (0, import_fields12.timestamp)({ ...readOnly }),
    scopes: (0, import_fields12.relationship)({ ref: "PortalScope.account", many: true, ...readOnly }),
    // One-time sign-in code (hashed) and the token generation; bumping authVersion ends every portal session.
    codeHash: (0, import_fields12.text)({ ...secretField, db: { isNullable: true } }),
    codeExpiresAt: (0, import_fields12.timestamp)({ ...secretField, db: { isNullable: true } }),
    codeFailures: (0, import_fields12.integer)({ defaultValue: 0, ...secretField }),
    authVersion: (0, import_fields12.integer)({ defaultValue: 1, ...readOnly }),
    isSynthetic: (0, import_fields12.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var PortalScope = (0, import_core12.list)({
  access: governed(["canManagePatients"]),
  ui: { listView: { initialColumns: ["account", "patient", "relationship", "status", "expiresAt"] } },
  fields: {
    account: (0, import_fields12.relationship)({ ref: "PortalAccount.scopes", ...readOnly }),
    patient: (0, import_fields12.relationship)({ ref: "Patient", ...readOnly }),
    relationship: fixedChoice(PORTAL_RELATIONSHIPS),
    capabilities: (0, import_fields12.json)({ defaultValue: ["appointments", "preferences"], ...readOnly }),
    confidentialItemsHidden: (0, import_fields12.checkbox)({ defaultValue: false, ...readOnly }),
    status: lifecycle(["active", "revoked"]),
    grantedBy: (0, import_fields12.relationship)({ ref: "User", ...readOnly }),
    expiresAt: (0, import_fields12.timestamp)({ ...readOnly }),
    validUntilMajority: (0, import_fields12.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "Guardian access that ends when the patient reaches the age of majority in the location\u2019s jurisdiction pack." } }),
    version: versionField(),
    ...trackingFields
  }
});
var IntakeSession = (0, import_core12.list)({
  access: governed(["canManagePatients"]),
  ui: { listView: { initialColumns: ["portalAccount", "publicBookingRequest", "status", "expiresAt"] } },
  fields: {
    portalAccount: (0, import_fields12.relationship)({ ref: "PortalAccount", ...readOnly }),
    publicBookingRequest: (0, import_fields12.relationship)({ ref: "PublicBookingRequest", ...readOnly }),
    status: lifecycle(["open", "completed", "expired"]),
    dueOn: (0, import_fields12.calendarDay)({ ...readOnly }),
    expiresAt: (0, import_fields12.timestamp)({ ...readOnly }),
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
  BreakGlassEvent: { reason: "clin" },
  // Phase 1: patients, scheduling, messaging, portal (SCHEMA §3, §4, §15, §16)
  Patient: {
    firstName: "dem",
    middleName: "dem",
    lastName: "dem",
    preferredName: "dem",
    suffix: "dem",
    dateOfBirth: "dem",
    sexAssignedAtBirth: "dem",
    genderIdentity: "dem",
    pronouns: "dem",
    preferredLanguage: "dem",
    address: "dem",
    referredBy: "dem",
    dateOfDeath: "dem"
  },
  PatientIdentifier: { value: "dem" },
  FamilyGroup: { name: "dem", primaryAddress: "dem", notes: "dem" },
  Guarantor: { personName: "fin" },
  ContactPoint: { value: "dem", valueNormalized: "dem" },
  PatientAlert: { text: "clin" },
  Referral: { reason: "clin" },
  MergeCase: { evidence: "dem", reason: "dem" },
  Appointment: { note: "dem", cancelReason: "dem" },
  AsapEntry: { note: "dem" },
  ConsentGrant: { evidence: "dem" },
  Message: { toAddress: "dem", subject: "dem", body: "dem" },
  PublicBookingRequest: { contact: "dem", intake: "dem", insuranceCapture: "ins", reviewNote: "dem" },
  PortalAccount: { email: "dem" }
};
var PHI_FIELD_NAMES = new Set(Object.values(PHI_FIELDS).flatMap((fields) => Object.keys(fields)));
function applyPhiTiers(models2) {
  for (const [listKey, list11] of Object.entries(models2)) {
    const tiers = PHI_FIELDS[listKey];
    if (!tiers) continue;
    for (const [fieldKey, tier] of Object.entries(tiers)) {
      const original = list11.fields?.[fieldKey];
      if (typeof original !== "function") throw new Error(`PHI_FIELDS names ${listKey}.${fieldKey}, which does not exist.`);
      list11.fields[fieldKey] = (args) => {
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
  Proposal,
  ...listsOf(patients_exports),
  ...listsOf(scheduling_exports),
  ...listsOf(messaging_exports),
  ...listsOf(portal_exports)
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
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
  DUPLICATE_SUSPECTED: "DUPLICATE_SUSPECTED",
  LATE_CANCEL_WINDOW: "LATE_CANCEL_WINDOW",
  LAB_CASE_NOT_READY: "LAB_CASE_NOT_READY",
  PORTAL_SCOPE_DENIED: "PORTAL_SCOPE_DENIED",
  PORTAL_SESSION_INVALID: "PORTAL_SESSION_INVALID",
  OUTSIDE_LOCATION_SCOPE: "OUTSIDE_LOCATION_SCOPE",
  MERGE_CONFLICT: "MERGE_CONFLICT"
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
var systemActor = (name) => ({ kind: "system", name });
function can(actor2, permission) {
  return actor2.kind === "user" && actor2.permissions.has(permission);
}
function requirePermission(actor2, ...anyOf2) {
  if (actor2.kind === "system") return;
  if (actor2.kind === "agent") throw new DomainError(Codes.NOT_AUTHORIZED, "Agents act only through their tool grants.");
  if (!anyOf2.some((permission) => actor2.permissions.has(permission))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `This needs the ${anyOf2.join(" or ")} permission.`);
  }
}
var principalKey = (actor2) => actor2.kind === "user" ? `user:${actor2.userId}` : actor2.kind === "agent" ? `agent:${actor2.agentId}` : `system:${actor2.name}`;
var actorUserId = (actor2) => actor2.kind === "user" ? actor2.userId : null;
var actorAgentId = (actor2) => actor2.kind === "agent" ? actor2.agentId : null;

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
  const text12 = String(value).trim();
  if (!DECIMAL_TEXT.test(text12)) throw new Error(`Not a decimal number: ${JSON.stringify(text12).slice(0, 40)}`);
  return new Decimal(text12);
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
var sha256 = (text12) => (0, import_node_crypto2.createHash)("sha256").update(text12).digest("hex");
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
var NOT_STARTED = /Unable to start a transaction in the given time/i;
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
      if (attempt < 6 && NOT_STARTED.test(message)) {
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt + Math.floor(Math.random() * 400)));
        continue;
      }
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
function auditCreate(uow, actor2, model, id, eventType, after, extra = {}) {
  uow.audit({
    eventType,
    entityType: model,
    entityId: id,
    actorUserId: actorUserId(actor2),
    actorAgentId: actorAgentId(actor2),
    reason: extra.reason ?? null,
    after,
    metadata: { ...extra.metadata ?? {}, ...actor2.kind === "system" ? { system: actor2.name } : {} }
  });
}

// features/keystone/lib/time.ts
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function assertDate(date) {
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || (/* @__PURE__ */ new Date(`${date}T00:00:00Z`)).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date ${date}`);
  }
}
function assertHhmm(value) {
  if (!HHMM.test(value)) throw new Error(`Invalid local time ${value} (expected HH:mm)`);
}
function addDays(date, days) {
  assertDate(date);
  const t = Date.parse(`${date}T12:00:00Z`) + days * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}
var weekdayOf = (date) => {
  assertDate(date);
  return (/* @__PURE__ */ new Date(`${date}T12:00:00Z`)).getUTCDay();
};
var zoneParts = (timeZone, at) => Object.fromEntries(
  new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((p) => [p.type, p.value])
);
function localDate(timeZone, at) {
  const p = zoneParts(timeZone, typeof at === "number" ? at : at.getTime());
  return `${p.year}-${p.month}-${p.day}`;
}
function zonedInstant(timeZone, date, hhmm) {
  assertDate(date);
  assertHhmm(hhmm);
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  const target = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m);
  const wall = (at) => {
    const p = zoneParts(timeZone, at);
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  };
  const offsetBefore = wall(target - 864e5) - (target - 864e5);
  const offsetAfter = wall(target + 864e5) - (target + 864e5);
  const valid = [target - offsetBefore, target - offsetAfter].filter((at) => wall(at) === target).sort((x, y) => x - y);
  return new Date(valid[0] ?? target - offsetBefore);
}
var minutesOf = (hhmm) => {
  assertHhmm(hhmm);
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
};
var overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

// features/keystone/scheduling/engine.ts
var MS_PER_MINUTE = 6e4;
function parsePattern(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("An appointment type needs at least one unit in its pattern.");
  return value.map((entry, index) => {
    const role = entry?.role;
    const units = Number(entry?.units);
    if (!["provider", "assistant", "hygienist", "exam"].includes(role)) throw new Error(`Pattern unit ${index + 1} has an unknown role.`);
    if (!Number.isInteger(units) || units < 1 || units > 96) throw new Error(`Pattern unit ${index + 1} needs a whole number of units from 1 to 96.`);
    return { role, units };
  });
}
var patternUnits = (pattern) => pattern.reduce((sum, unit) => sum + unit.units, 0);
function expandPattern(pattern, unitMinutes, startMs, providers) {
  const segments = [];
  let at = startMs;
  for (const unit of pattern) {
    const endMs = at + unit.units * unitMinutes * MS_PER_MINUTE;
    const providerId = unit.role === "assistant" ? null : unit.role === "exam" ? providers.examProviderId ?? null : providers.providerId;
    const concurrencyKind = unit.role === "exam" ? "hygiene_exam_float" : "none";
    const last = segments[segments.length - 1];
    if (last && last.role === unit.role && last.providerId === providerId && last.endMs === at) last.endMs = endMs;
    else segments.push({ role: unit.role, providerId, startMs: at, endMs, concurrencyKind });
    at = endMs;
  }
  return segments;
}
function subtract(start, end, cut0, cut1) {
  if (!overlaps(start, end, cut0, cut1)) return [[start, end]];
  const out = [];
  if (cut0 > start) out.push([start, cut0]);
  if (cut1 < end) out.push([cut1, end]);
  return out;
}
function materialiseBlocks(date, timeZone, blocks, closures) {
  const weekday = weekdayOf(date);
  const dayClosures = closures.filter((c) => c.date === date);
  if (dayClosures.some((c) => !c.isHalfDay)) return [];
  const cuts = dayClosures.flatMap((c) => c.startLocal && c.endLocal ? [[zonedInstant(timeZone, date, c.startLocal).getTime(), zonedInstant(timeZone, date, c.endLocal).getTime()]] : []);
  const windows = [];
  for (const block of blocks) {
    if (block.weekday !== weekday) continue;
    if (minutesOf(block.endLocal) <= minutesOf(block.startLocal)) continue;
    let pieces = [[zonedInstant(timeZone, date, block.startLocal).getTime(), zonedInstant(timeZone, date, block.endLocal).getTime()]];
    for (const [c0, c1] of cuts) pieces = pieces.flatMap(([s, e]) => subtract(s, e, c0, c1));
    for (const [startMs, endMs] of pieces) {
      if (endMs > startMs) windows.push({ blockId: block.id, operatoryId: block.operatoryId, providerId: block.providerId, providerType: block.providerType ?? null, startMs, endMs, allowedTypeIds: block.allowedTypeIds, onlineBookable: block.onlineBookable });
    }
  }
  return windows.sort((a, b) => a.startMs - b.startMs || a.operatoryId.localeCompare(b.operatoryId));
}
function chairClash(startMs, endMs, bufferAfterMinutes, busy) {
  const end = endMs + bufferAfterMinutes * MS_PER_MINUTE;
  return busy.some((b) => overlaps(startMs, end, b.startMs, b.endMs + (b.bufferAfterMinutes ?? 0) * MS_PER_MINUTE));
}
function providerClashes(segments, busy) {
  const clashes = [];
  for (const segment of segments) {
    if (!segment.providerId || segment.role === "assistant" || segment.concurrencyKind === "approved_override") continue;
    for (const other of busy) {
      if (other.providerId !== segment.providerId || other.role === "assistant" || other.concurrencyKind === "approved_override") continue;
      if (!overlaps(segment.startMs, segment.endMs, other.startMs, other.endMs)) continue;
      const segmentIsExam = segment.role === "exam";
      const otherIsExam = other.role === "exam";
      if (segmentIsExam !== otherIsExam) continue;
      clashes.push({ segment, with: other });
    }
  }
  return clashes;
}
function templateWindowFor(windows, operatoryId, typeId, startMs, endMs, options = {}) {
  return windows.find((w) => w.operatoryId === operatoryId && w.startMs <= startMs && endMs <= w.endMs && (w.allowedTypeIds.length === 0 || w.allowedTypeIds.includes(typeId)) && (!options.onlineOnly || w.onlineBookable)) ?? null;
}
function dentistsOnSite(windows, startMs, endMs) {
  const ids = windows.filter((w) => w.providerType === "dentist" && w.providerId && w.startMs <= startMs && endMs <= w.endMs).map((w) => w.providerId);
  return [...new Set(ids)].sort();
}
function planSegments(input) {
  const endMs = input.startMs + patternUnits(input.pattern) * input.unitMinutes * MS_PER_MINUTE;
  const needsExam = input.pattern.some((u) => u.role === "exam");
  const candidates = !needsExam ? [null] : input.examProviderId ? [input.examProviderId] : dentistsOnSite(input.windows, input.startMs, endMs);
  let fallback = null;
  for (const examProviderId of candidates.length ? candidates : [null]) {
    const segments = expandPattern(input.pattern, input.unitMinutes, input.startMs, { providerId: input.providerId, examProviderId });
    const clashes = providerClashes(segments, input.providerBusy);
    if (!clashes.length) return { segments, clashes, examProviderId, endMs };
    fallback ??= { segments, clashes };
  }
  return { segments: fallback.segments, clashes: fallback.clashes, examProviderId: null, endMs };
}
function findSlots(q) {
  const out = [];
  const step = q.unitMinutes * MS_PER_MINUTE;
  const duration = q.durationMinutes * MS_PER_MINUTE;
  const earliest = q.nowMs + q.leadMinutes * MS_PER_MINUTE;
  for (const w of q.windows) {
    if (q.operatoryIds && !q.operatoryIds.includes(w.operatoryId)) continue;
    if (w.allowedTypeIds.length && !w.allowedTypeIds.includes(q.typeId)) continue;
    if (q.onlineOnly && !w.onlineBookable) continue;
    const providerId = q.providerId ?? w.providerId;
    if (q.providerId && w.providerId && w.providerId !== q.providerId) continue;
    for (let start = w.startMs; start + duration <= w.endMs; start += step) {
      if (start < earliest) continue;
      const end = start + duration;
      if (chairClash(start, end, q.bufferAfterMinutes, q.chairBusy[w.operatoryId] ?? [])) continue;
      if (q.patientBusy && q.patientBusy.some((b) => overlaps(start, end, b.startMs, b.endMs))) continue;
      const plan = planSegments({ pattern: q.pattern, unitMinutes: q.unitMinutes, startMs: start, providerId, windows: q.windows, providerBusy: q.providerBusy });
      if (plan.clashes.length) continue;
      out.push({ operatoryId: w.operatoryId, providerId, startMs: start, endMs: end, blockId: w.blockId });
      if (q.limit && out.length >= q.limit) return out;
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.operatoryId.localeCompare(b.operatoryId));
}

// features/keystone/seed/schedule.ts
var TZ = "America/New_York";
var meta = { metadata: { seed: true, synthetic: true } };
var OPERATORIES = [
  { id: "seed_op_tpa_op1", locationId: "seed_loc_tpa", code: "OP1", name: "Operatory 1", kind: "doctor", sortOrder: 1 },
  { id: "seed_op_tpa_op2", locationId: "seed_loc_tpa", code: "OP2", name: "Operatory 2", kind: "doctor", sortOrder: 2 },
  { id: "seed_op_tpa_op3", locationId: "seed_loc_tpa", code: "OP3", name: "Operatory 3", kind: "doctor", sortOrder: 3 },
  { id: "seed_op_tpa_op4", locationId: "seed_loc_tpa", code: "OP4", name: "Operatory 4 (surgery)", kind: "surgery", sortOrder: 4 },
  { id: "seed_op_tpa_h1", locationId: "seed_loc_tpa", code: "H1", name: "Hygiene 1", kind: "hygiene", sortOrder: 5 },
  { id: "seed_op_tpa_h2", locationId: "seed_loc_tpa", code: "H2", name: "Hygiene 2", kind: "hygiene", sortOrder: 6 },
  { id: "seed_op_stp_op1", locationId: "seed_loc_stp", code: "OP1", name: "Operatory 1", kind: "doctor", sortOrder: 1 },
  { id: "seed_op_stp_op2", locationId: "seed_loc_stp", code: "OP2", name: "Operatory 2", kind: "doctor", sortOrder: 2 },
  { id: "seed_op_stp_h1", locationId: "seed_loc_stp", code: "H1", name: "Hygiene 1", kind: "hygiene", sortOrder: 3 },
  { id: "seed_op_stp_h2", locationId: "seed_loc_stp", code: "H2", name: "Hygiene 2", kind: "hygiene", sortOrder: 4 }
];
var P = (units) => ({ role: "provider", units });
var A = (units) => ({ role: "assistant", units });
var H = (units) => ({ role: "hygienist", units });
var E = (units) => ({ role: "exam", units });
var APPOINTMENT_TYPES = [
  { id: "seed_apt_np", code: "NEW_PATIENT", name: "New patient exam and cleaning", publicName: "New patient visit", category: "new_patient", pattern: [H(5), E(1), H(3)], onlineBookable: true, newPatientOnly: true, requiresDentistOnSite: true, production: 32500n, colour: "#0ea5e9" },
  { id: "seed_apt_recall", code: "RECALL", name: "Recall exam and cleaning", publicName: "Cleaning and check-up", category: "recall_hygiene", pattern: [H(4), E(1), H(1)], onlineBookable: true, newPatientOnly: false, requiresDentistOnSite: true, production: 21000n, colour: "#10b981" },
  { id: "seed_apt_perio", code: "PERIO_MAINT", name: "Periodontal maintenance", publicName: "Gum maintenance visit", category: "perio_maintenance", pattern: [H(5), E(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: true, production: 19500n, colour: "#14b8a6" },
  { id: "seed_apt_filling", code: "FILLING", name: "Filling(s)", publicName: "", category: "restorative", pattern: [A(1), P(4), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 38000n, colour: "#6366f1" },
  { id: "seed_apt_crown_prep", code: "CROWN_PREP", name: "Crown preparation", publicName: "", category: "crown_prep", pattern: [A(2), P(6), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 125000n, colour: "#8b5cf6" },
  { id: "seed_apt_crown_seat", code: "CROWN_SEAT", name: "Crown seat", publicName: "", category: "crown_seat", pattern: [A(1), P(2), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 0n, colour: "#a855f7" },
  { id: "seed_apt_endo", code: "ENDO", name: "Root canal treatment", publicName: "", category: "endo", pattern: [A(1), P(8), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 110000n, colour: "#ec4899" },
  { id: "seed_apt_ext", code: "EXTRACTION", name: "Extraction", publicName: "", category: "extraction", pattern: [A(1), P(3), A(1)], onlineBookable: false, newPatientOnly: false, requiresDentistOnSite: false, production: 29000n, colour: "#f97316" },
  { id: "seed_apt_emerg", code: "EMERGENCY", name: "Emergency visit", publicName: "Tooth pain or emergency", category: "emergency", pattern: [A(1), P(2)], onlineBookable: true, newPatientOnly: false, requiresDentistOnSite: false, production: 15500n, colour: "#ef4444" },
  { id: "seed_apt_consult", code: "CONSULT", name: "Treatment consultation", publicName: "Consultation", category: "consult", pattern: [P(3)], onlineBookable: true, newPatientOnly: false, requiresDentistOnSite: false, production: 0n, colour: "#64748b" }
];
var HYGIENE_TYPES = ["seed_apt_np", "seed_apt_recall", "seed_apt_perio"];
var DOCTOR_TYPES = ["seed_apt_filling", "seed_apt_crown_prep", "seed_apt_crown_seat", "seed_apt_endo", "seed_apt_ext", "seed_apt_emerg", "seed_apt_consult"];
function templateBlocks() {
  const out = [];
  const add = (loc, weekdays, op2, provider, start, end, types, online, label) => {
    for (const w of weekdays) out.push({ id: `seed_blk_${loc}_${op2}_${w}_${start.replace(":", "")}`, weekday: w, operatoryId: `seed_op_${loc}_${op2}`, providerId: provider, startLocal: start, endLocal: end, types, online, label });
  };
  add("tpa", [1, 2, 3, 4], "op1", "seed_prov_okafor", "08:00", "12:00", DOCTOR_TYPES, false, "Dr. Okafor AM");
  add("tpa", [1, 2, 3, 4], "op1", "seed_prov_okafor", "13:00", "17:00", DOCTOR_TYPES, false, "Dr. Okafor PM");
  add("tpa", [1, 2, 3, 4], "op2", "seed_prov_reyes", "08:00", "12:00", DOCTOR_TYPES, false, "Dr. Reyes AM");
  add("tpa", [1, 2, 3, 4], "op2", "seed_prov_reyes", "13:00", "17:00", DOCTOR_TYPES, true, "Dr. Reyes PM (online emergencies)");
  add("tpa", [1, 3], "op3", "seed_prov_okafor", "13:00", "16:00", ["seed_apt_consult", "seed_apt_emerg"], true, "Consults and emergencies");
  add("tpa", [4], "op4", "seed_prov_reyes", "08:00", "12:00", ["seed_apt_ext", "seed_apt_endo"], false, "Surgery morning");
  add("tpa", [5], "op1", "seed_prov_okafor", "08:00", "13:00", DOCTOR_TYPES, false, "Friday short day");
  add("tpa", [1, 2, 3, 4], "h1", "seed_prov_hale", "08:00", "12:00", HYGIENE_TYPES, true, "Hygiene AM");
  add("tpa", [1, 2, 3, 4], "h1", "seed_prov_hale", "13:00", "17:00", HYGIENE_TYPES, true, "Hygiene PM");
  add("tpa", [1, 2, 3, 4], "h2", "seed_prov_brandt", "08:00", "12:00", HYGIENE_TYPES, true, "Hygiene AM");
  add("tpa", [1, 2, 3, 4], "h2", "seed_prov_brandt", "13:00", "17:00", HYGIENE_TYPES, false, "Hygiene PM");
  add("tpa", [5], "h1", "seed_prov_ortiz", "08:00", "13:00", HYGIENE_TYPES, true, "Friday hygiene");
  add("stp", [1, 2, 3, 4], "op1", "seed_prov_natarajan", "08:00", "12:00", DOCTOR_TYPES, false, "Dr. Natarajan AM");
  add("stp", [1, 2, 3, 4], "op1", "seed_prov_natarajan", "13:00", "17:00", DOCTOR_TYPES, true, "Dr. Natarajan PM");
  add("stp", [2, 4], "op2", "seed_prov_okafor", "08:00", "12:00", DOCTOR_TYPES, false, "Dr. Okafor (St. Pete)");
  add("stp", [1, 2, 3, 4], "h1", "seed_prov_kim", "08:00", "12:00", HYGIENE_TYPES, true, "Hygiene AM");
  add("stp", [1, 2, 3, 4], "h1", "seed_prov_kim", "13:00", "17:00", HYGIENE_TYPES, true, "Hygiene PM");
  add("stp", [1, 3], "h2", "seed_prov_ortiz", "08:00", "12:00", HYGIENE_TYPES, false, "Hygiene AM");
  return out;
}
var FIRST_F = ["Ava", "Sofia", "Maria", "Grace", "Chloe", "Layla", "Isabel", "Nora", "Hannah", "Leah", "Camila", "Zoe", "Ruth", "Elena", "Priya", "Mei", "Aaliyah", "Ivy", "June", "Rosa"];
var FIRST_M = ["Liam", "Noah", "Mateo", "Elijah", "James", "Lucas", "Henry", "Owen", "Samuel", "Diego", "Marcus", "Theo", "Isaac", "Andre", "Kai", "Omar", "Felix", "Hugo", "Ezra", "Walter"];
var LAST = ["Alvarez", "Bennett", "Castillo", "Dawson", "Ellison", "Fuentes", "Garrison", "Holloway", "Ibarra", "Jennings", "Kowalski", "Lindgren", "Mercado", "Nakamura", "Oyelaran", "Pruitt", "Quintero", "Ramsey", "Sandoval", "Thibodeaux", "Underwood", "Valencia", "Whitfield", "Yamada", "Zelinski", "Abernathy", "Beaumont", "Calloway", "Delacroix", "Espinoza", "Fairbanks", "Guerrero", "Hargrove", "Iverson", "Jardine", "Kaminski", "Lachance", "Montoya", "Nightingale", "Ortega"];
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function samplePatients(today2) {
  const rand = rng(20261107);
  const pick = (list11) => list11[Math.floor(rand() * list11.length)];
  const year = Number(today2.slice(0, 4));
  const dobFor = (age) => {
    const month = 1 + Math.floor(rand() * 12);
    const dayOf = 1 + Math.floor(rand() * 28);
    return `${year - age}-${String(month).padStart(2, "0")}-${String(dayOf).padStart(2, "0")}`;
  };
  const out = [];
  let n = 0;
  const phone = () => `+1813555${String(1e3 + Math.floor(rand() * 8999)).slice(0, 4)}`;
  for (let f = 0; f < 70; f += 1) {
    const last = LAST[f % LAST.length] + (f >= LAST.length ? "-" + LAST[f * 7 % LAST.length] : "");
    const familyId = `seed_fam_${String(f + 1).padStart(3, "0")}`;
    const homeLocationId = f % 3 === 2 ? "seed_loc_stp" : "seed_loc_tpa";
    const language = f % 6 === 1 ? "es" : "en";
    const size = 1 + Math.floor(rand() * 6);
    const adults = Math.min(size, size >= 3 ? 2 : 1 + Math.floor(rand() * 2));
    let head = null;
    for (let m = 0; m < size; m += 1) {
      n += 1;
      const id = `seed_pt_${String(n).padStart(4, "0")}`;
      const isAdult = m < adults;
      const sex = (m + f) % 2 === 0 ? "female" : "male";
      const first = sex === "female" ? pick(FIRST_F) : pick(FIRST_M);
      const age = isAdult ? 24 + Math.floor(rand() * 64) : 3 + Math.floor(rand() * 14);
      const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
      const alerts = [];
      if (isAdult && rand() < 0.08) alerts.push({ kind: "premedication", severity: "critical", text: "Premedicate before invasive procedures (joint replacement); confirm with the orthopaedic surgeon." });
      if (isAdult && rand() < 0.07) alerts.push({ kind: "anticoagulant", severity: "caution", text: "Takes an anticoagulant; check the latest INR before extractions." });
      if (rand() < 0.04) alerts.push({ kind: "latex", severity: "critical", text: "Latex allergy: use nitrile gloves and latex-free dam." });
      out.push({
        id,
        chart: `PT-SEED-${String(n).padStart(4, "0")}`,
        familyId,
        first,
        last,
        preferred: "",
        dob: dobFor(age),
        sex,
        language,
        homeLocationId,
        status: rand() < 0.08 ? "inactive" : "active",
        email: isAdult ? personalEmail(slug, rand) : void 0,
        mobile: isAdult ? phone() : void 0,
        guarantorOf: m === 0 ? null : head,
        relationship: m === 0 ? "self" : isAdult ? "spouse" : "parent",
        alerts
      });
      if (m === 0) head = id;
    }
  }
  const dupSource = [out[4], out[40]];
  dupSource.forEach((p, i) => {
    n += 1;
    out.push({ ...p, id: `seed_pt_${String(n).padStart(4, "0")}`, chart: `PT-SEED-${String(n).padStart(4, "0")}`, first: i === 0 ? p.first.slice(0, Math.max(3, p.first.length - 1)) : p.first, status: "prospect", guarantorOf: null, relationship: "self", alerts: [], email: p.email, mobile: void 0 });
  });
  const deceased = out.find((p) => p.relationship === "self" && Number(p.dob.slice(0, 4)) < year - 75);
  if (deceased) {
    deceased.status = "deceased";
    deceased.dateOfDeath = addDays(today2, -40);
  }
  return out;
}
async function seedPhase1(uow, actor2) {
  const { tx, now } = uow;
  const today2 = localDate(TZ, now);
  const created = { operatories: 0, appointmentTypes: 0, templates: 0, blocks: 0, goals: 0, closures: 0, patients: 0, contacts: 0, consents: 0, alerts: 0, appointments: 0, asap: 0, bookingPolicies: 0, messageTemplates: 0, storefront: 0, portal: 0 };
  const haveOps = new Set((await tx.operatory.findMany({ where: { id: { in: OPERATORIES.map((o) => o.id) } }, select: { id: true } })).map((o) => o.id));
  const newOps = OPERATORIES.filter((o) => !haveOps.has(o.id));
  if (newOps.length) {
    await tx.operatory.createMany({ data: newOps.map((o) => ({ ...o, isSynthetic: true })) });
    created.operatories = newOps.length;
  }
  const haveTypes = new Set((await tx.appointmentType.findMany({ where: { id: { in: APPOINTMENT_TYPES.map((t) => t.id) } }, select: { id: true } })).map((t) => t.id));
  for (const t of APPOINTMENT_TYPES.filter((type) => !haveTypes.has(type.id))) {
    await tx.appointmentType.create({ data: { id: t.id, code: t.code, name: t.name, publicName: t.publicName, category: t.category, defaultPattern: t.pattern, defaultDurationUnits: patternUnits(t.pattern), onlineBookable: t.onlineBookable, newPatientOnly: t.newPatientOnly, requiresDentistOnSite: t.requiresDentistOnSite, defaultProductionMinor: t.production, colour: t.colour, isSynthetic: true } });
    created.appointmentTypes += 1;
  }
  const effectiveFrom = `${addDays(today2, -60).slice(0, 7)}-01`;
  const blocks = templateBlocks();
  for (const loc of ["tpa", "stp"]) {
    const templateId = `seed_tpl_${loc}`;
    if (await tx.scheduleTemplate.findUnique({ where: { id: templateId } })) continue;
    await tx.scheduleTemplate.create({ data: { id: templateId, locationId: `seed_loc_${loc}`, name: loc === "tpa" ? "Tampa standard week" : "St. Petersburg standard week", effectiveFrom: /* @__PURE__ */ new Date(`${effectiveFrom}T00:00:00Z`), status: "active", publishedAt: now, isSynthetic: true } });
    const mine = blocks.filter((x) => x.operatoryId.startsWith(`seed_op_${loc}_`));
    await tx.templateBlock.createMany({ data: mine.map((b) => ({ id: b.id, templateId, weekday: b.weekday, operatoryId: b.operatoryId, providerId: b.providerId, startLocal: b.startLocal, endLocal: b.endLocal, label: b.label, onlineBookable: b.online })) });
    const pairs = mine.flatMap((b) => b.types.map((t) => [t, b.id]));
    await tx.$executeRawUnsafe(`INSERT INTO "_TemplateBlock_allowedTypes" ("A", "B") SELECT * FROM unnest($1::text[], $2::text[]) ON CONFLICT DO NOTHING`, pairs.map((x) => x[0]), pairs.map((x) => x[1]));
    created.blocks += mine.length;
    auditCreate(uow, actor2, "ScheduleTemplate", templateId, "template.published", { location: loc, effectiveFrom }, meta);
    created.templates += 1;
  }
  const goals = [
    ["seed_prov_okafor", "seed_loc_tpa", 520000n],
    ["seed_prov_reyes", "seed_loc_tpa", 420000n],
    ["seed_prov_hale", "seed_loc_tpa", 160000n],
    ["seed_prov_brandt", "seed_loc_tpa", 150000n],
    ["seed_prov_natarajan", "seed_loc_stp", 400000n],
    ["seed_prov_kim", "seed_loc_stp", 150000n]
  ];
  const goalRows = goals.flatMap(([providerId, locationId, goalMinor]) => [1, 2, 3, 4].map((weekday) => ({ id: `seed_goal_${providerId.slice(10)}_${weekday}`, providerId, locationId, weekday, goalMinor })));
  created.goals = (await tx.productionGoal.createMany({ data: goalRows, skipDuplicates: true })).count;
  const holiday = nextWeekday(addDays(today2, 18), 4);
  if (!await tx.closureDay.findUnique({ where: { id: "seed_closure_holiday" } })) {
    await tx.closureDay.create({ data: { id: "seed_closure_holiday", date: /* @__PURE__ */ new Date(`${holiday}T00:00:00Z`), reason: "Practice holiday (all locations)", isHalfDay: false } });
    await tx.closureDay.create({ data: { id: "seed_closure_training", locationId: "seed_loc_stp", date: /* @__PURE__ */ new Date(`${nextWeekday(addDays(today2, 9), 3)}T00:00:00Z`), reason: "Staff CPR training", isHalfDay: true, startLocal: "13:00", endLocal: "17:00" } });
    created.closures = 2;
  }
  const people = samplePatients(today2);
  const havePatients = new Set((await tx.patient.findMany({ where: { id: { in: people.map((p) => p.id) } }, select: { id: true } })).map((p) => p.id));
  const fresh = people.filter((p) => !havePatients.has(p.id));
  if (fresh.length) {
    const families = [...new Set(fresh.map((p) => p.familyId))];
    const haveFamilies = new Set((await tx.familyGroup.findMany({ where: { id: { in: families } }, select: { id: true } })).map((f) => f.id));
    const newFamilies = families.filter((id) => !haveFamilies.has(id));
    if (newFamilies.length) await tx.familyGroup.createMany({ data: newFamilies.map((id) => ({ id, name: `${people.find((p) => p.familyId === id).last} household`, isSynthetic: true })) });
    await tx.patient.createMany({
      data: fresh.map((p) => ({
        id: p.id,
        chartNumber: p.chart,
        status: p.status,
        firstName: p.first,
        lastName: p.last,
        preferredName: p.preferred,
        dateOfBirth: /* @__PURE__ */ new Date(`${p.dob}T00:00:00Z`),
        sexAssignedAtBirth: p.sex,
        preferredLanguage: p.language,
        homeLocationId: p.homeLocationId,
        familyId: p.status === "prospect" ? null : p.familyId,
        primaryProviderId: p.homeLocationId === "seed_loc_tpa" ? "seed_prov_okafor" : "seed_prov_natarajan",
        dateOfDeath: p.dateOfDeath ? /* @__PURE__ */ new Date(`${p.dateOfDeath}T00:00:00Z`) : null,
        statementHold: p.status === "deceased",
        address: { line1: `${100 + Number(p.id.slice(-3))} Palmetto Way`, city: p.homeLocationId === "seed_loc_tpa" ? "Tampa" : "St. Petersburg", state: "FL", postal: "33600", country: "US" },
        isSynthetic: true
      }))
    });
    created.patients = fresh.length;
    await tx.guarantor.createMany({ data: fresh.filter((p) => p.relationship === "self").map((p) => ({ id: `seed_gtr_${p.id.slice(8)}`, patientId: p.id, isSynthetic: true })) });
    const startsOn = /* @__PURE__ */ new Date(`${addDays(today2, -700)}T00:00:00Z`);
    await tx.guarantorLink.createMany({
      data: fresh.map((p) => ({ id: `seed_gl_${p.id.slice(8)}`, patientId: p.id, guarantorId: `seed_gtr_${(p.guarantorOf ?? p.id).slice(8)}`, relationship: p.relationship, status: "active", startsOn }))
    });
    const contacts = fresh.flatMap((p) => [
      ...p.email ? [{ id: `seed_cp_${p.id.slice(8)}_e`, patientId: p.id, kind: "email", value: p.email, valueNormalized: p.email, isPrimary: true, isActive: true }] : [],
      ...p.mobile ? [{ id: `seed_cp_${p.id.slice(8)}_m`, patientId: p.id, kind: "mobile", value: `(${p.mobile.slice(2, 5)}) ${p.mobile.slice(5, 8)}-${p.mobile.slice(8)}`, valueNormalized: p.mobile, isPrimary: true, isActive: true }] : []
    ]);
    await tx.contactPoint.createMany({ data: contacts });
    created.contacts = contacts.length;
    const consents = contacts.filter((c, i) => p_alive(fresh, c.patientId) && (c.kind === "email" || i % 9 !== 0)).map((c) => ({
      id: `seed_cg_${c.id.slice(8)}`,
      contactPointId: c.id,
      channel: c.kind === "email" ? "email" : "sms",
      purpose: "appointment_reminders",
      status: "granted",
      source: "intake_form",
      evidence: { form: "paper intake", note: "Sample practice: synthetic data" },
      grantedAt: /* @__PURE__ */ new Date(`${addDays(today2, -400)}T15:00:00Z`)
    }));
    await tx.consentGrant.createMany({ data: consents });
    created.consents = consents.length;
    const alerts = fresh.flatMap((p) => p.alerts.map((a, i) => ({ id: `seed_al_${p.id.slice(8)}_${i}`, patientId: p.id, kind: a.kind, severity: a.severity, text: a.text, source: "history_answer", activeFrom: /* @__PURE__ */ new Date(`${addDays(today2, -300)}T12:00:00Z`) })));
    if (alerts.length) await tx.patientAlert.createMany({ data: alerts });
    created.alerts = alerts.length;
    auditCreate(uow, actor2, "Patient", "seed", "patients.sample_loaded", { patients: fresh.length, families: newFamilies.length, contacts: contacts.length }, meta);
  }
  if (!await tx.appointment.findFirst({ where: { id: { startsWith: "seed_appt_" } }, select: { id: true } })) {
    created.appointments = await seedAppointments(uow, people, today2);
  }
  const asapPatients = people.filter((p) => p.status === "active").slice(30, 35);
  for (const [i, p] of asapPatients.entries()) {
    const id = `seed_asap_${i + 1}`;
    if (await tx.asapEntry.findUnique({ where: { id } })) continue;
    await tx.asapEntry.create({ data: { id, patientId: p.id, locationId: p.homeLocationId, appointmentTypeId: i % 2 ? "seed_apt_filling" : "seed_apt_recall", preferredWindows: [{ weekday: 1 + i % 4, from: i % 2 ? "08:00" : "13:00", to: i % 2 ? "12:00" : "17:00" }], note: i === 0 ? "Can come in on 30 minutes notice" : "", status: "active", priority: 5 - i, isSynthetic: true } });
    created.asap += 1;
  }
  for (const loc of ["seed_loc_tpa", "seed_loc_stp"]) {
    const id = `seed_obp_${loc.slice(9)}`;
    if (await tx.onlineBookingPolicy.findUnique({ where: { id } })) continue;
    await tx.onlineBookingPolicy.create({ data: { id, locationId: loc, newPatientAllowed: true, leadTimeHours: 4, horizonDays: 60, holdMinutes: 10, depositMinor: 0n, requireInsuranceCapture: false, rateLimit: { perClientPerHour: 30, perContactPerDay: 5, globalPerMinute: 120 }, isActive: true, appointmentTypes: { connect: APPOINTMENT_TYPES.filter((t) => t.onlineBookable).map((t) => ({ id: t.id })) } } });
    created.bookingPolicies += 1;
  }
  const templates = [
    { id: "seed_mt_reminder_email", key: "appointment.reminder", channel: "email", subject: "Your visit at {{location.name}}", body: "Hi {{patient.preferredName}},\n\nThis is a reminder of your visit at {{location.name}} on {{appointment.when}}.\nReply C to confirm, or call {{location.phone}} if you need to change it.\n\nBayview Family Dental" },
    { id: "seed_mt_reminder_sms", key: "appointment.reminder", channel: "sms", subject: "", body: "Bayview Family Dental: reminder of your visit {{appointment.when}}. Reply C to confirm or call {{location.phone}}. Reply STOP to opt out." }
  ];
  for (const t of templates) {
    if (await tx.messageTemplate.findUnique({ where: { id: t.id } })) continue;
    await tx.messageTemplate.create({ data: { ...t, purpose: "appointment_reminders", phiLevel: "minimal", locale: "en", status: "active" } });
    created.messageTemplates += 1;
  }
  if (!await tx.storefrontSite.findUnique({ where: { id: "seed_site" } })) {
    await tx.storefrontSite.create({ data: { id: "seed_site", slug: "bayview", headline: "Family dentistry on Tampa Bay", about: "Sample practice: synthetic data.", services: [{ name: "Cleanings and check-ups" }, { name: "Fillings and crowns" }, { name: "Emergency visits" }], isPublished: true, isSynthetic: true, providersShown: { connect: [{ id: "seed_prov_okafor" }, { id: "seed_prov_reyes" }, { id: "seed_prov_natarajan" }, { id: "seed_prov_hale" }] } } });
    created.storefront = 1;
  }
  const parent = people.find((p) => p.relationship === "self" && p.email && people.some((c) => c.guarantorOf === p.id && c.relationship === "parent"));
  if (parent && !await tx.portalAccount.findUnique({ where: { id: "seed_portal_1" } })) {
    const child = people.find((c) => c.guarantorOf === parent.id && c.relationship === "parent");
    await tx.portalAccount.create({ data: { id: "seed_portal_1", email: parent.email, status: "active", identityVerifiedAt: now, isSynthetic: true } });
    await tx.portalScope.create({ data: { id: "seed_ps_self", accountId: "seed_portal_1", patientId: parent.id, relationship: "self", capabilities: ["appointments", "preferences", "forms", "statements_pay"], status: "active" } });
    await tx.portalScope.create({ data: { id: "seed_ps_child", accountId: "seed_portal_1", patientId: child.id, relationship: "guardian", capabilities: ["appointments", "preferences", "forms"], status: "active", validUntilMajority: true } });
    created.portal = 1;
  }
  return created;
}
var p_alive = (people, id) => people.find((p) => p.id === id)?.status !== "deceased";
function nextWeekday(date, weekday) {
  let d = date;
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}
async function seedAppointments(uow, people, today2) {
  const { tx, now } = uow;
  const rand = rng(77);
  const types = new Map(APPOINTMENT_TYPES.map((t) => [t.id, t]));
  const blocks = templateBlocks();
  const providerType = (id) => id.includes("hale") || id.includes("brandt") || id.includes("ortiz") || id.includes("kim") ? "hygienist" : "dentist";
  const bookable = people.filter((p) => p.status === "active" || p.status === "inactive");
  const patientBusy = /* @__PURE__ */ new Map();
  const providerBusy = [];
  let count = 0;
  let pi = 0;
  const appointments = [];
  const segments = [];
  const broken = [];
  const holiday = await tx.closureDay.findMany({ select: { date: true, isHalfDay: true, startLocal: true, endLocal: true, locationId: true } });
  for (let offset = -21; offset <= 14; offset += 1) {
    const date = addDays(today2, offset);
    for (const loc of ["tpa", "stp"]) {
      const input = blocks.filter((b) => b.operatoryId.startsWith(`seed_op_${loc}_`)).map((b) => ({ id: b.id, weekday: b.weekday, operatoryId: b.operatoryId, providerId: b.providerId, providerType: providerType(b.providerId), startLocal: b.startLocal, endLocal: b.endLocal, allowedTypeIds: b.types, onlineBookable: b.online }));
      const closures = holiday.filter((c) => !c.locationId || c.locationId === `seed_loc_${loc}`).map((c) => ({ date: c.date.toISOString().slice(0, 10), isHalfDay: c.isHalfDay, startLocal: c.startLocal, endLocal: c.endLocal }));
      const windows = materialiseBlocks(date, TZ, input, closures);
      const fill = offset < 0 ? 0.85 : offset <= 2 ? 0.8 : Math.max(0.25, 0.75 - offset * 0.04);
      for (const w of windows) {
        let at = w.startMs;
        while (at < w.endMs) {
          const typeId = pickType(w, rand);
          const type = types.get(typeId);
          const pattern = parsePattern(type.pattern);
          const endMs = at + patternUnits(pattern) * 10 * MS_PER_MINUTE;
          if (endMs > w.endMs) break;
          if (rand() > fill) {
            at += 10 * MS_PER_MINUTE * (1 + Math.floor(rand() * 3));
            continue;
          }
          const plan = planSegments({ pattern, unitMinutes: 10, startMs: at, providerId: w.providerId, windows, providerBusy });
          const patient = nextPatient(bookable, w, at, endMs, patientBusy, () => pi++);
          if (plan.clashes.length || !patient || offset === 1 && w.operatoryId.endsWith("_h1") && at === w.startMs + 120 * MS_PER_MINUTE) {
            at += 10 * MS_PER_MINUTE;
            continue;
          }
          const id = `seed_appt_${String(++count).padStart(5, "0")}`;
          const status = offset < 0 ? pastOutcome(rand) : offset === 0 ? at < now.getTime() ? "completed" : at < now.getTime() + 36e5 ? "arrived" : "confirmed" : rand() < (offset <= 2 ? 0.6 : 0.3) ? "confirmed" : "scheduled";
          const brokenKind = status === "broken" ? rand() < 0.6 ? "no_show" : "late_cancel" : "";
          const active = ["scheduled", "confirmed", "arrived", "seated", "ready_for_checkout"].includes(status);
          appointments.push({
            id,
            ref: `APT-SEED-${String(count).padStart(5, "0")}`,
            patientId: patient.id,
            locationId: `seed_loc_${loc}`,
            operatoryId: w.operatoryId,
            typeId,
            startsAt: new Date(at),
            endsAt: new Date(endMs),
            localDate: /* @__PURE__ */ new Date(`${date}T00:00:00Z`),
            status,
            brokenKind,
            confirmedAt: status === "confirmed" ? new Date(at - 864e5) : null,
            confirmationMethod: status === "confirmed" ? rand() < 0.6 ? "sms_reply" : "phone" : "",
            arrivedAt: ["arrived", "completed"].includes(status) ? new Date(at - 5 * MS_PER_MINUTE) : null,
            completedAt: status === "completed" ? new Date(endMs) : null,
            cancelledAt: status === "cancelled" ? new Date(at - 3 * 864e5) : null,
            cancelReason: status === "cancelled" ? "Patient asked to move to next month" : "",
            primaryProviderId: w.providerId,
            supervisingDentistId: plan.examProviderId,
            source: "import",
            productionScheduledMinor: type.production,
            warnings: [],
            isSynthetic: true
          });
          plan.segments.forEach((seg, i) => segments.push({ id: `${id}_s${i}`, appointmentId: id, role: seg.role, providerId: seg.providerId, startsAt: new Date(seg.startMs), endsAt: new Date(seg.endMs), concurrencyKind: seg.concurrencyKind, isActive: active || status === "completed" }));
          if (status === "broken") broken.push({ id: `${id}_b`, appointmentId: id, patientId: patient.id, kind: brokenKind, at: new Date(at), reason: "Sample practice: synthetic data" });
          if (active || status === "completed") {
            for (const seg of plan.segments) if (seg.providerId) providerBusy.push({ providerId: seg.providerId, startMs: seg.startMs, endMs: seg.endMs, concurrencyKind: seg.concurrencyKind, role: seg.role });
            patientBusy.set(patient.id, [...patientBusy.get(patient.id) ?? [], [at, endMs]]);
          }
          at = endMs;
        }
      }
    }
  }
  for (let i = 0; i < appointments.length; i += 500) await tx.appointment.createMany({ data: appointments.slice(i, i + 500) });
  for (let i = 0; i < segments.length; i += 1e3) await tx.appointmentSegment.createMany({ data: segments.slice(i, i + 1e3) });
  if (broken.length) await tx.brokenAppointmentEvent.createMany({ data: broken });
  await tx.$executeRawUnsafe(`
    UPDATE "Patient" p SET "firstVisitOn" = v.first, "lastVisitOn" = v.last
    FROM (SELECT a.patient, min((a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE l."timeZone")::date) AS first, max((a."startsAt" AT TIME ZONE 'UTC' AT TIME ZONE l."timeZone")::date) AS last
          FROM "Appointment" a JOIN "Location" l ON l.id = a.location WHERE a.status = 'completed' AND a.id LIKE 'seed_%' GROUP BY a.patient) v
    WHERE p.id = v.patient AND p."isSynthetic"`);
  return count;
}
var MAIL_DOMAINS = ["gmail.com", "gmail.com", "gmail.com", "yahoo.com", "outlook.com", "icloud.com", "hotmail.com", "aol.com", "comcast.net"];
function personalEmail(slug, rand) {
  const [first, last] = slug.split(".");
  const forms = [`${first}.${last}`, `${first}${last}`, `${first[0]}${last}`, `${first}.${last}${10 + Math.floor(rand() * 80)}`, `${first}${last[0]}${Math.floor(rand() * 9e3) + 1e3}`];
  return `${forms[Math.floor(rand() * forms.length)]}@${MAIL_DOMAINS[Math.floor(rand() * MAIL_DOMAINS.length)]}`;
}
function pickType(w, rand) {
  const allowed = w.allowedTypeIds;
  if (allowed.includes("seed_apt_recall")) {
    const r2 = rand();
    return r2 < 0.7 ? "seed_apt_recall" : r2 < 0.85 ? "seed_apt_perio" : "seed_apt_np";
  }
  const weights = [["seed_apt_filling", 0.4], ["seed_apt_crown_prep", 0.15], ["seed_apt_crown_seat", 0.1], ["seed_apt_endo", 0.08], ["seed_apt_ext", 0.1], ["seed_apt_emerg", 0.1], ["seed_apt_consult", 0.07]];
  const options = weights.filter(([id]) => allowed.includes(id));
  const total = options.reduce((s, [, x]) => s + x, 0);
  let r = rand() * total;
  for (const [id, x] of options) {
    r -= x;
    if (r <= 0) return id;
  }
  return options[0]?.[0] ?? allowed[0];
}
function pastOutcome(rand) {
  const r = rand();
  return r < 0.86 ? "completed" : r < 0.93 ? "broken" : "cancelled";
}
function nextPatient(people, w, startMs, endMs, busy, next) {
  const location = w.operatoryId.includes("_stp_") ? "seed_loc_stp" : "seed_loc_tpa";
  for (let tries = 0; tries < people.length; tries += 1) {
    const p = people[next() % people.length];
    if (p.homeLocationId !== location) continue;
    if ((busy.get(p.id) ?? []).some(([s, e]) => s < endMs && startMs < e)) continue;
    return p;
  }
  return null;
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
function parsePackRules(rules2) {
  return packRulesSchema.parse(rules2);
}

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
    email: "tampa@bayviewfamilydental.com",
    hours: { 1: [["07:30", "17:00"]], 2: [["07:30", "17:00"]], 3: [["08:00", "18:00"]], 4: [["07:30", "17:00"]], 5: [["07:30", "14:00"]] }
  },
  {
    id: "seed_loc_stp",
    code: "STP",
    name: "Bayview Family Dental \u2014 St. Petersburg",
    timeZone: "America/New_York",
    address: { line1: "880 Pelican Shore Drive", line2: "", city: "St. Petersburg", state: "FL", postal: "33701", country: "US" },
    phone: "(727) 555-0187",
    email: "stpete@bayviewfamilydental.com",
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
  { id: "seed_user_okafor", name: "Dr. Maya Okafor", email: "maya.okafor@bayviewfamilydental.com", title: "Owner dentist", roleId: "seed_role_owner", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"], provider: { id: "seed_prov_okafor", abbreviation: "MOK", type: "dentist", npi: "1999000015", colour: "#2563eb", supervisionClass: "dentist" } },
  { id: "seed_user_reyes", name: "Dr. Daniel Reyes", email: "daniel.reyes@bayviewfamilydental.com", title: "Associate dentist", roleId: "seed_role_associate", kind: "staff", locations: ["seed_loc_tpa"], provider: { id: "seed_prov_reyes", abbreviation: "DRE", type: "dentist", npi: "1999000023", colour: "#7c3aed", supervisionClass: "dentist" } },
  { id: "seed_user_natarajan", name: "Dr. Priya Natarajan", email: "priya.natarajan@bayviewfamilydental.com", title: "Associate dentist", roleId: "seed_role_associate", kind: "staff", locations: ["seed_loc_stp"], provider: { id: "seed_prov_natarajan", abbreviation: "PNA", type: "dentist", npi: "1999000031", colour: "#0891b2", supervisionClass: "dentist" } },
  { id: "seed_user_hale", name: "Jenna Hale, RDH", email: "jenna.hale@bayviewfamilydental.com", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_tpa"], provider: { id: "seed_prov_hale", abbreviation: "JHA", type: "hygienist", npi: "1999000049", colour: "#059669", supervisionClass: "rdh_general" } },
  { id: "seed_user_brandt", name: "Marcus Brandt, RDH", email: "marcus.brandt@bayviewfamilydental.com", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_tpa"], provider: { id: "seed_prov_brandt", abbreviation: "MBR", type: "hygienist", npi: "1999000056", colour: "#16a34a", supervisionClass: "rdh_general" } },
  { id: "seed_user_ortiz", name: "Lucia Ortiz, RDH", email: "lucia.ortiz@bayviewfamilydental.com", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"], provider: { id: "seed_prov_ortiz", abbreviation: "LOR", type: "hygienist", npi: "1999000064", colour: "#65a30d", supervisionClass: "rdh_general" } },
  { id: "seed_user_kim", name: "Grace Kim, RDH", email: "grace.kim@bayviewfamilydental.com", title: "Hygienist", roleId: "seed_role_hygienist", kind: "staff", locations: ["seed_loc_stp"], provider: { id: "seed_prov_kim", abbreviation: "GKI", type: "hygienist", npi: "1999000072", colour: "#0d9488", supervisionClass: "rdh_general" } },
  { id: "seed_user_dupree", name: "Tasha Dupree", email: "tasha.dupree@bayviewfamilydental.com", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_novak", name: "Eli Novak", email: "eli.novak@bayviewfamilydental.com", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_mendes", name: "Carla Mendes", email: "carla.mendes@bayviewfamilydental.com", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_stp"] },
  { id: "seed_user_baptiste", name: "Rene Baptiste", email: "rene.baptiste@bayviewfamilydental.com", title: "Dental assistant", roleId: "seed_role_assistant", kind: "staff", locations: ["seed_loc_stp"] },
  { id: "seed_user_walsh", name: "Kerry Walsh", email: "kerry.walsh@bayviewfamilydental.com", title: "Front desk", roleId: "seed_role_front_office", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_ibrahim", name: "Noor Ibrahim", email: "noor.ibrahim@bayviewfamilydental.com", title: "Front desk", roleId: "seed_role_front_office", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_tran", name: "Vivian Tran", email: "vivian.tran@bayviewfamilydental.com", title: "Front desk", roleId: "seed_role_front_office", kind: "staff", locations: ["seed_loc_stp"] },
  { id: "seed_user_foster", name: "Dana Foster", email: "dana.foster@bayviewfamilydental.com", title: "Insurance coordinator", roleId: "seed_role_insurance", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"] },
  { id: "seed_user_morales", name: "Rosa Morales", email: "rosa.morales@bayviewfamilydental.com", title: "Office manager", roleId: "seed_role_office_manager", kind: "staff", locations: ["seed_loc_tpa", "seed_loc_stp"] },
  { id: "seed_user_quinn", name: "Avery Quinn", email: "avery.quinn@bayviewfamilydental.com", title: "Treatment coordinator", roleId: "seed_role_tc", kind: "staff", locations: ["seed_loc_tpa"] },
  { id: "seed_user_shah", name: "Imran Shah", email: "imran.shah@bayviewfamilydental.com", title: "Privacy officer", roleId: "seed_role_privacy", kind: "staff", locations: [] },
  { id: "seed_user_lindqvist", name: "M. Lindqvist", email: "m.lindqvist@gulfcoastcpa.com", title: "Bookkeeper, Gulf Coast CPA", roleId: "seed_role_bookkeeper", kind: "auditor", locations: [], accessDays: 30 }
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
async function seedPracticePlatform(uow, actor2) {
  if (process.env.NODE_ENV === "production" && process.env.DENTAL_ALLOW_SAMPLE_PRACTICE !== "true") {
    throw new Error("The sample practice cannot be loaded into a production deployment (I-G3). Set DENTAL_ALLOW_SAMPLE_PRACTICE=true only on a QA deployment.");
  }
  const { tx, now } = uow;
  const created = { practice: 0, jurisdictionPacks: 0, locations: 0, roles: 0, staff: 0, assignments: 0, providers: 0, approvalPolicies: 0 };
  const meta2 = { metadata: { seed: true, synthetic: true } };
  if (!await tx.practiceSettings.findUnique({ where: { id: 1 } })) {
    await tx.practiceSettings.create({ data: { id: 1, ...PRACTICE, isSynthetic: true } });
    auditCreate(uow, actor2, "PracticeSettings", "1", "practice.created", PRACTICE, meta2);
    created.practice += 1;
  }
  for (const pack of PACKS) {
    const label = `${pack.key}@${pack.version}`;
    if (await tx.jurisdictionPack.findUnique({ where: { label } })) continue;
    const row = await tx.jurisdictionPack.create({ data: { label, key: pack.key, version: pack.version, name: pack.name, rules: pack.rules, sources: pack.sources, status: "active" } });
    auditCreate(uow, actor2, "JurisdictionPack", row.id, "jurisdiction_pack.loaded", { label }, meta2);
    created.jurisdictionPacks += 1;
  }
  const florida = await tx.jurisdictionPack.findUniqueOrThrow({ where: { label: "US-FL@2026.1" }, select: { id: true } });
  for (const location of LOCATIONS) {
    if (await tx.location.findUnique({ where: { id: location.id } })) continue;
    await tx.location.create({ data: { id: location.id, code: location.code, name: location.name, timeZone: location.timeZone, address: location.address, phone: location.phone, email: location.email, hours: location.hours, jurisdictionId: florida.id, isSynthetic: true } });
    auditCreate(uow, actor2, "Location", location.id, "location.created", { code: location.code, name: location.name }, meta2);
    created.locations += 1;
  }
  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
  const newRoles = ROLES.filter((role) => !haveRoles.has(role.id));
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map((role) => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map((name) => [name, role.permissions.includes(name) && !NEVER_DEFAULT.includes(name)])) })) });
    for (const role of newRoles) auditCreate(uow, actor2, "Role", role.id, "role.created", { name: role.name, permissions: role.permissions }, meta2);
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
    for (const person of newStaff) auditCreate(uow, actor2, "User", person.id, "user.created", { name: person.name, title: person.title, role: person.roleId, kind: person.kind }, meta2);
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
      auditCreate(uow, actor2, "ProviderProfile", p.id, "provider.created", { abbreviation: p.abbreviation, type: p.type }, meta2);
    }
    created.providers = providers.length;
  }
  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map((p) => p.action));
  for (const policy of APPROVAL_POLICIES.filter((p) => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes, thresholdMinor: policy.thresholdMinor ?? null } });
    auditCreate(uow, actor2, "ApprovalPolicy", row.id, "approval_policy.created", { action: policy.action, requiredPermission: policy.requiredPermission }, meta2);
    created.approvalPolicies += 1;
  }
  Object.assign(created, await seedPhase1(uow, actor2));
  return created;
}

// features/keystone/mutations/setup.ts
async function loadPracticeSetup(_root, args, context) {
  const actor2 = actorFromSession(context.session);
  requirePermission(actor2, "canManageOnboarding");
  const result = await command(context.prisma, { name: "setup.load_practice", actor: actor2, idempotencyKey: args.idempotencyKey, params: {} }, (uow) => seedPracticePlatform(uow, actor2));
  return { replay: result.replay, created: result.value };
}

// features/keystone/mutations/audit.ts
async function verifyAuditChain2(_root, _args, context) {
  const actor2 = actorFromSession(context.session);
  requirePermission(actor2, "canReadAudit");
  return verifyAuditChain(context.prisma);
}

// features/keystone/lib/separationOfDuties.ts
var SELF_APPROVAL_MESSAGE = "You can't approve your own request.";
var AGENT_APPROVAL_MESSAGE = "An agent can propose but never approve.";
function assertCanDecide(actor2, requesterUserId, requesterAgentOwnerId, strictAgentOwner = true) {
  if (actor2.kind !== "user") throw new DomainError(Codes.AGENT_CANNOT_APPROVE, AGENT_APPROVAL_MESSAGE);
  if (requesterUserId && requesterUserId === actor2.userId) throw new DomainError(Codes.SELF_APPROVAL, SELF_APPROVAL_MESSAGE);
  if (strictAgentOwner && requesterAgentOwnerId && requesterAgentOwnerId === actor2.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve a proposal made by your own agent.");
}

// features/keystone/lib/approval.ts
async function requestApproval(uow, actor2, input) {
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
      requestedById: actorUserId(actor2),
      requestedByAgentId: actorAgentId(actor2),
      status: "pending",
      expiresAt: new Date(uow.now.getTime() + minutes * 6e4)
    }
  });
  uow.audit({ eventType: "approval.requested", entityType: "ApprovalRequest", entityId: created.id, actorUserId: actorUserId(actor2), actorAgentId: actorAgentId(actor2), after: { action: input.action, targetList: input.targetList, targetId: input.targetId, payloadHash: created.payloadHash, requiredPermission } });
  uow.emit({ topic: "notify.approval", aggregateType: "ApprovalRequest", aggregateId: created.id, payload: { action: input.action, requiredPermission }, dedupeKey: `notify.approval:${created.id}` });
  return created;
}
async function decideApproval(uow, actor2, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  let agentOwnerId = null;
  if (request.requestedByAgentId) {
    const agent = await uow.tx.agentIdentity.findUnique({ where: { id: request.requestedByAgentId }, select: { ownerId: true } });
    agentOwnerId = agent?.ownerId ?? null;
  }
  assertCanDecide(actor2, request.requestedById, agentOwnerId, input.strictAgentOwner ?? true);
  if (actor2.kind !== "user" || !actor2.permissions.has(request.requiredPermission)) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `Deciding this needs the ${request.requiredPermission} permission.`);
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) {
    await transition(uow, { model: "ApprovalRequest", id: input.requestId, from: ["pending"], to: "expired", actor: actor2, eventType: "approval.expired" });
    throw new DomainError(Codes.GUARD_FAILED, "This approval request has expired.");
  }
  const to = input.decision === "approve" ? "approved" : "rejected";
  const updated = await transition(uow, {
    model: "ApprovalRequest",
    id: input.requestId,
    from: ["pending"],
    to,
    expectedVersion: input.expectedVersion,
    actor: actor2,
    eventType: `approval.${to}`,
    reason: input.reason ?? null,
    approverId: actor2.userId
  });
  await uow.tx.approvalDecision.create({ data: { requestId: input.requestId, decidedById: actor2.userId, decision: input.decision, reason: input.reason ?? "", at: uow.now } });
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
async function requestPracticeControlsChange(uow, actor2, input, reason) {
  const changes = validatePracticeControls(input);
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 } });
  if (!practice) throw new DomainError(Codes.NOT_FOUND, "Practice settings are not set up yet.");
  return requestApproval(uow, actor2, {
    action: "practice.controls",
    targetList: "PracticeSettings",
    targetId: "1",
    payload: { changes, baseVersion: practice.version },
    requiredPermission: "canApproveAutonomy",
    summary: `Change practice controls: ${Object.keys(changes).join(", ")}${reason ? ` (${reason})` : ""}`
  });
}
registerApplier("practice.controls", async (uow, actor2, request) => {
  const [row] = await uow.tx.$queryRaw`SELECT version FROM "PracticeSettings" WHERE id = 1 FOR UPDATE`;
  if (!row) throw new DomainError(Codes.NOT_FOUND, "Practice settings are not set up yet.");
  const { changes, baseVersion } = request.payload;
  if (row.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, "Practice settings changed after this was approved. Request the change again.", { currentVersion: row.version });
  const before = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { aiAutonomyAllowed: true, strictAgentOwnerSoD: true, breakGlassMinutes: true, requireStaffMfa: true } });
  const updated = await uow.tx.practiceSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...changes, version: { increment: 1 } } });
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, "Practice settings changed while applying.");
  uow.audit({ eventType: "practice.controls_changed", entityType: "PracticeSettings", entityId: "1", actorUserId: actor2.kind === "user" ? actor2.userId : null, before, after: changes });
  return { applied: Object.keys(changes) };
});

// features/keystone/mutations/approvals.ts
async function decideApprovalRequest(_root, args, context) {
  const actor2 = actorFromSession(context.session);
  requirePermission(actor2, "canAccessDashboard");
  if (args.decision !== "approve" && args.decision !== "reject") throw new DomainError(Codes.INVALID_INPUT, "Decision must be approve or reject.");
  if (args.decision === "reject" && !args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why you are rejecting it.", { field: "reason" });
  const result = await command(context.prisma, { name: "approval.decide", actor: actor2, idempotencyKey: args.idempotencyKey, params: { requestId: args.requestId, decision: args.decision, reason: args.reason ?? "", expectedVersion: args.expectedVersion } }, async (uow) => {
    const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true } });
    const decided = await decideApproval(uow, actor2, { requestId: args.requestId, decision: args.decision, reason: args.reason ?? void 0, expectedVersion: args.expectedVersion, strictAgentOwner: practice?.strictAgentOwnerSoD ?? true });
    let applied = null;
    const registration = applierFor(String(decided.action));
    if (args.decision === "approve" && registration?.applyOnApprove) {
      const request = await uow.tx.approvalRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      await consumeApproval(uow, { requestId: request.id, action: request.action, targetList: request.targetList, targetId: request.targetId, payload: request.payload });
      applied = await registration.apply(uow, actor2, request);
    }
    return { id: decided.id, status: decided.status, applied };
  });
  return { replay: result.replay, ...result.value };
}
async function cancelApprovalRequest(_root, args, context) {
  const actor2 = actorFromSession(context.session);
  requirePermission(actor2, "canAccessDashboard");
  const result = await command(context.prisma, { name: "approval.cancel", actor: actor2, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const row = await transition(uow, {
      model: "ApprovalRequest",
      id: args.requestId,
      from: ["pending"],
      to: "cancelled",
      expectedVersion: args.expectedVersion,
      actor: actor2,
      eventType: "approval.cancelled",
      reason: args.reason ?? null,
      guard: (request) => {
        if (actor2.kind !== "user" || request.requestedById !== actor2.userId) throw new DomainError(Codes.NOT_AUTHORIZED, "Only the person who asked can withdraw a request.");
      }
    });
    return { id: row.id, status: row.status };
  });
  return { replay: result.replay, ...result.value };
}
async function requestPracticeControls(_root, args, context) {
  const actor2 = actorFromSession(context.session);
  requirePermission(actor2, "canManagePractice");
  if (!args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why the controls should change.", { field: "reason" });
  const result = await command(context.prisma, { name: "practice.controls.request", actor: actor2, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const request = await requestPracticeControlsChange(uow, actor2, args.changes, args.reason.trim());
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
  const text12 = String(value || "").trim();
  if (!text12) throw new Error("DENTAL_SECRET_KEY is not set: secrets cannot be stored or read.");
  const key = /^[a-f0-9]{64}$/i.test(text12) ? Buffer.from(text12, "hex") : Buffer.from(text12, "base64");
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
  const secret4 = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-development-session-secret-change-me-now");
  if (secret4.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return secret4;
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
function decodeSecret(secret4) {
  if (!/^[A-Z2-7]{32}$/.test(secret4)) throw new Error("Invalid authenticator secret.");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of secret4) {
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
function totp(secret4, counter) {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error("Invalid authenticator counter.");
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const hash = (0, import_node_crypto6.createHmac)("sha1", decodeSecret(secret4)).update(input).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 2147483647) % 1e6).padStart(6, "0");
}
function verifyTotp(secret4, code, lastCounter, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) throw new DomainError(Codes.INVALID_INPUT, "Enter the six-digit code from your authenticator app.", { field: "code" });
  const current = Math.floor(now / 3e4);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter >= 0 && counter > lastCounter && (0, import_node_crypto6.timingSafeEqual)(Buffer.from(totp(secret4, counter)), Buffer.from(code))) return counter;
  }
  throw new DomainError(Codes.MFA_REQUIRED, "That code is wrong, expired or already used. Wait for the next code and try again.");
}
var provisioningUri = (issuer, account, secret4) => `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret4}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
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
        const secret4 = newMfaSecret();
        const box = await storeSecret(uow.tx, `mfa:${id}`, secret4);
        await uow.tx.user.update({ where: { id }, data: { mfaPendingSecretId: box.id, mfaPendingExpiresAt: new Date(uow.now.getTime() + 10 * 6e4) } });
        audit(uow, id, "mfa.enrolment_started");
        return { secret: secret4, provisioningUri: provisioningUri("Openfront Dental", user.email, secret4), expiresInMinutes: 10 };
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

// features/keystone/lib/sequence.ts
var import_node_crypto7 = require("node:crypto");
async function nextReference(tx, prefix, now = /* @__PURE__ */ new Date(), width = 6) {
  if (!/^[A-Z]{2,5}$/.test(prefix)) throw new Error("Reference prefix must be 2-5 capital letters");
  const key = `${prefix}-${now.getUTCFullYear()}`;
  await advisoryLock(tx, `sequence:${key}`);
  const row = await tx.sequence.upsert({ where: { key }, create: { key, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  const value = row.nextValue - 1;
  return `${key}-${String(value).padStart(width, "0")}`;
}
var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function publicCode(prefix, groups = 2) {
  const bytes = (0, import_node_crypto7.randomBytes)(groups * 4);
  const chars = Array.from(bytes, (byte) => CROCKFORD[byte % 32]);
  const parts = Array.from({ length: groups }, (_, i) => chars.slice(i * 4, i * 4 + 4).join(""));
  return `${prefix}-${parts.join("-")}`;
}

// features/keystone/scheduling/service.ts
var ACTIVE = [...ACTIVE_APPOINTMENT_STATUSES];
async function lockResources(tx, input) {
  const keys = [
    ...uniq(input.operatoryIds).map((id) => `operatory:${id}`),
    ...uniq(input.providerIds).map((id) => `provider:${id}`),
    ...uniq(input.patientIds).map((id) => `patient:${id}`)
  ];
  if (!keys.length) return keys;
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtextextended(t.k, 0)) FROM (SELECT k FROM unnest($1::text[]) WITH ORDINALITY AS u(k, n) ORDER BY n) AS t",
    keys
  );
  return keys;
}
async function expireStaleHolds(tx, operatoryIds, now) {
  const stale = await tx.bookingHold.findMany({ where: { operatoryId: { in: operatoryIds }, status: "held", expiresAt: { lte: now } }, select: { id: true } });
  if (!stale.length) return 0;
  const result = await tx.bookingHold.updateMany({ where: { id: { in: stale.map((h) => h.id) }, status: "held", expiresAt: { lte: now } }, data: { status: "expired", version: { increment: 1 } } });
  return result.count;
}
var uniq = (ids) => [...new Set((ids ?? []).filter((id) => !!id))].sort();
async function loadLocationDay(tx, locationId, date) {
  const location = await tx.location.findUnique({ where: { id: locationId }, select: { id: true, timeZone: true, name: true, isActive: true, jurisdiction: { select: { rules: true } } } });
  if (!location || !location.isActive) throw new DomainError(Codes.NOT_FOUND, "That location does not exist or is closed.");
  const practice = await tx.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } });
  const day2 = /* @__PURE__ */ new Date(`${date}T00:00:00.000Z`);
  const template = await tx.scheduleTemplate.findFirst({
    where: { locationId, status: "active", effectiveFrom: { lte: day2 }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day2 } }] },
    orderBy: { effectiveFrom: "desc" },
    select: { blocks: { select: { id: true, weekday: true, operatoryId: true, providerId: true, startLocal: true, endLocal: true, onlineBookable: true, allowedTypes: { select: { id: true } }, provider: { select: { providerType: true } }, operatory: { select: { isActive: true } } } } }
  });
  const closures = await tx.closureDay.findMany({ where: { date: day2, OR: [{ locationId }, { locationId: null }] } });
  const blocks = (template?.blocks ?? []).filter((b) => b.operatoryId && b.operatory?.isActive !== false).map((b) => ({
    id: b.id,
    weekday: b.weekday,
    operatoryId: b.operatoryId,
    providerId: b.providerId,
    providerType: b.provider?.providerType ?? null,
    startLocal: b.startLocal,
    endLocal: b.endLocal,
    allowedTypeIds: b.allowedTypes.map((t) => t.id),
    onlineBookable: b.onlineBookable
  }));
  const windows = materialiseBlocks(date, location.timeZone, blocks, closures.map((c) => ({ date: c.date.toISOString().slice(0, 10), isHalfDay: c.isHalfDay, startLocal: c.startLocal, endLocal: c.endLocal })));
  let supervision = { enforcement: "hard", hygieneGeneralAllowed: false, verify: true };
  try {
    if (location.jurisdiction?.rules) {
      const rules2 = parsePackRules(location.jurisdiction.rules);
      supervision = { enforcement: rules2.supervision.value.enforcement, hygieneGeneralAllowed: rules2.supervision.value.hygieneGeneralAllowed, verify: rules2.supervision.verify };
    }
  } catch {
  }
  return { location: { id: location.id, timeZone: location.timeZone, name: location.name }, date, windows, unitMinutes: practice?.scheduleUnitMinutes ?? 10, supervision };
}
async function loadChairBusy(tx, operatoryIds, fromMs, toMs, now, ignore = {}) {
  const from = new Date(fromMs - 4 * 60 * MS_PER_MINUTE);
  const to = new Date(toMs + 4 * 60 * MS_PER_MINUTE);
  const [appointments, holds] = await Promise.all([
    tx.appointment.findMany({ where: { operatoryId: { in: operatoryIds }, status: { in: ACTIVE }, startsAt: { lt: to }, endsAt: { gt: from }, id: { notIn: ignore.appointmentIds ?? [] } }, select: { operatoryId: true, startsAt: true, endsAt: true, bufferAfterMinutes: true } }),
    tx.bookingHold.findMany({ where: { operatoryId: { in: operatoryIds }, status: "held", expiresAt: { gt: now }, startsAt: { lt: to }, endsAt: { gt: from }, id: { notIn: ignore.holdIds ?? [] } }, select: { operatoryId: true, startsAt: true, endsAt: true } })
  ]);
  const busy = {};
  for (const a of appointments) (busy[a.operatoryId] ??= []).push({ startMs: a.startsAt.getTime(), endMs: a.endsAt.getTime(), bufferAfterMinutes: a.bufferAfterMinutes ?? 0 });
  for (const h of holds) (busy[h.operatoryId] ??= []).push({ startMs: h.startsAt.getTime(), endMs: h.endsAt.getTime() });
  return busy;
}
async function loadProviderBusy(tx, fromMs, toMs, now, ignore = {}) {
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const [segments, holds] = await Promise.all([
    tx.appointmentSegment.findMany({
      where: { providerId: { not: null }, startsAt: { lt: to }, endsAt: { gt: from }, appointment: { status: { in: ACTIVE }, id: { notIn: ignore.appointmentIds ?? [] } } },
      select: { providerId: true, startsAt: true, endsAt: true, concurrencyKind: true, role: true }
    }),
    tx.bookingHold.findMany({ where: { status: "held", expiresAt: { gt: now }, startsAt: { lt: to }, endsAt: { gt: from }, id: { notIn: ignore.holdIds ?? [] } }, select: { segments: true } })
  ]);
  const out = segments.map((s) => ({ providerId: s.providerId, startMs: s.startsAt.getTime(), endMs: s.endsAt.getTime(), concurrencyKind: s.concurrencyKind, role: s.role }));
  for (const hold of holds) {
    for (const s of Array.isArray(hold.segments) ? hold.segments : []) {
      if (s?.providerId && Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && overlapsRange(s.startMs, s.endMs, fromMs, toMs)) out.push({ providerId: s.providerId, startMs: s.startMs, endMs: s.endMs, concurrencyKind: s.concurrencyKind ?? "none", role: s.role });
    }
  }
  return out;
}
var overlapsRange = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
async function loadPatientBusy(tx, patientId, fromMs, toMs, ignore = {}) {
  const rows = await tx.appointment.findMany({ where: { patientId, status: { in: ACTIVE }, startsAt: { lt: new Date(toMs) }, endsAt: { gt: new Date(fromMs) }, id: { notIn: ignore.appointmentIds ?? [] } }, select: { startsAt: true, endsAt: true } });
  return rows.map((r) => ({ startMs: r.startsAt.getTime(), endMs: r.endsAt.getTime() }));
}
async function checkSlot(tx, now, req) {
  const [type, operatory, practice] = await Promise.all([
    tx.appointmentType.findUnique({ where: { id: req.typeId } }),
    tx.operatory.findUnique({ where: { id: req.operatoryId }, select: { id: true, locationId: true, isActive: true, location: { select: { timeZone: true } } } }),
    tx.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } })
  ]);
  if (!type || !type.isActive) throw new DomainError(Codes.INVALID_INPUT, "That appointment type does not exist or is retired.", { field: "typeId" });
  if (!operatory || !operatory.isActive || operatory.locationId !== req.locationId || !operatory.location) throw new DomainError(Codes.INVALID_INPUT, "That operatory is not an active chair at this location.", { field: "operatoryId" });
  const unitMinutes = practice?.scheduleUnitMinutes ?? 10;
  const pattern = parsePattern(type.defaultPattern);
  const startMs = req.startsAt.getTime();
  if (!Number.isFinite(startMs)) throw new DomainError(Codes.INVALID_INPUT, "Choose a start time.", { field: "startsAt" });
  if (startMs % (unitMinutes * MS_PER_MINUTE) !== 0) throw new DomainError(Codes.INVALID_INPUT, `Appointments start on a ${unitMinutes}-minute boundary.`, { field: "startsAt" });
  const endMs = startMs + patternUnits(pattern) * unitMinutes * MS_PER_MINUTE;
  const bufferAfterMinutes = 0;
  const chair = await loadChairBusy(tx, [req.operatoryId], startMs, endMs, now, req.ignore);
  if (chairClash(startMs, endMs, bufferAfterMinutes, chair[req.operatoryId] ?? [])) throw new DomainError(Codes.SLOT_TAKEN, "That chair is already booked or held for this time.");
  const date = localDate(operatory.location.timeZone, req.startsAt);
  const day2 = await loadLocationDay(tx, req.locationId, date);
  const warnings = [];
  const window = templateWindowFor(day2.windows, req.operatoryId, req.typeId, startMs, endMs, { onlineOnly: req.onlineOnly });
  if (!window) {
    if (!req.overrideTemplate || req.onlineOnly) throw new DomainError(Codes.OUTSIDE_TEMPLATE, "That time is outside the schedule template for this chair and appointment type.");
    warnings.push("outside_template");
  }
  const providerId = req.providerId ?? window?.providerId ?? null;
  if (!providerId) throw new DomainError(Codes.INVALID_INPUT, "Choose a provider for this appointment.", { field: "providerId" });
  const provider = await tx.providerProfile.findUnique({ where: { id: providerId }, select: { id: true, providerType: true, isActive: true } });
  if (!provider || !provider.isActive) throw new DomainError(Codes.INVALID_INPUT, "That provider is not active.", { field: "providerId" });
  if (req.patientId) {
    const patientBusy = await loadPatientBusy(tx, req.patientId, startMs, endMs, req.ignore);
    if (patientBusy.length) throw new DomainError(Codes.PATIENT_UNAVAILABLE, "The patient already has an appointment at this time.");
  }
  const providerBusy = await loadProviderBusy(tx, startMs, endMs, now, req.ignore);
  const plan = planSegments({ pattern, unitMinutes, startMs, providerId, windows: day2.windows, providerBusy });
  if (plan.clashes.length) {
    if (!req.overrideProviderClash) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, "The provider is already committed for part of this time.");
    for (const c of plan.clashes) c.segment.concurrencyKind = "approved_override";
    warnings.push("provider_overlap_override");
  }
  let supervisingDentistId = plan.examProviderId;
  if (type.requiresDentistOnSite) {
    const onSite = dentistsOnSite(day2.windows, startMs, endMs);
    supervisingDentistId = supervisingDentistId && onSite.includes(supervisingDentistId) ? supervisingDentistId : onSite[0] ?? null;
    if (!supervisingDentistId && day2.supervision.hygieneGeneralAllowed) warnings.push("general_supervision");
    else if (!supervisingDentistId) {
      if (day2.supervision.enforcement === "hard" || req.onlineOnly) throw new DomainError(Codes.SUPERVISION_REQUIRED, "No dentist is scheduled on site for this hygiene visit, and this location\u2019s jurisdiction pack requires one.");
      warnings.push("no_dentist_on_site");
    }
  }
  return {
    startsAt: new Date(startMs),
    endsAt: new Date(endMs),
    localDate: date,
    bufferAfterMinutes,
    providerId,
    supervisingDentistId,
    segments: plan.segments,
    warnings,
    productionMinor: BigInt(type.defaultProductionMinor ?? 0n),
    type: { id: type.id, name: type.name, requiresDentistOnSite: type.requiresDentistOnSite, onlineBookable: type.onlineBookable }
  };
}
async function preflight(tx, req) {
  const [type, operatory, practice] = await Promise.all([
    tx.appointmentType.findUnique({ where: { id: req.typeId }, select: { defaultPattern: true } }),
    tx.operatory.findUnique({ where: { id: req.operatoryId }, select: { locationId: true, location: { select: { timeZone: true } } } }),
    tx.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } })
  ]);
  if (!type || !operatory?.location || operatory.locationId !== req.locationId) return { providerIds: req.providerId ? [req.providerId] : [] };
  let pattern;
  try {
    pattern = parsePattern(type.defaultPattern);
  } catch {
    return { providerIds: req.providerId ? [req.providerId] : [] };
  }
  const startMs = req.startsAt.getTime();
  const endMs = startMs + patternUnits(pattern) * (practice?.scheduleUnitMinutes ?? 10) * MS_PER_MINUTE;
  const day2 = await loadLocationDay(tx, req.locationId, localDate(operatory.location.timeZone, req.startsAt));
  const window = day2.windows.find((w) => w.operatoryId === req.operatoryId && w.startMs <= startMs && endMs <= w.endMs);
  const providerIds = [req.providerId ?? window?.providerId ?? null];
  if (pattern.some((u) => u.role === "exam")) providerIds.push(...dentistsOnSite(day2.windows, startMs, endMs));
  return { providerIds: providerIds.filter((id) => !!id) };
}
async function labGate(_tx, _appointmentId) {
  return { blocked: false };
}
function asSlotTaken(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/exclusion constraint|exclusion_violation|23P01|is held for this time|already has an appointment/i.test(message)) {
    if (/patient_overlap/i.test(message)) throw new DomainError(Codes.PATIENT_UNAVAILABLE, "The patient already has an appointment at this time.");
    throw new DomainError(Codes.SLOT_TAKEN, "That chair was just booked or held by someone else. Pick another time.");
  }
  throw error;
}

// features/keystone/mutations/shared.ts
function staff(context) {
  const actor2 = actorFromSession(context.session);
  const locationIds = sessionLocationIds(context.session);
  return { actor: actor2, locationIds, session: context.session };
}
function assertLocation(locationIds, locationId) {
  if (!locationId) throw new DomainError(Codes.INVALID_INPUT, "Choose a location.", { field: "locationId" });
  if (locationIds !== null && !locationIds.includes(locationId)) {
    throw new DomainError(Codes.OUTSIDE_LOCATION_SCOPE, "You are not assigned to that location today.");
  }
}
async function assertPatientInScope(tx, locationIds, patientId) {
  const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { id: true, status: true, homeLocationId: true, version: true } });
  if (!patient) throw new DomainError(Codes.NOT_FOUND, "Patient not found.");
  if (locationIds === null) return patient;
  if (patient.homeLocationId && locationIds.includes(patient.homeLocationId)) return patient;
  const since = new Date(Date.now() - PATIENT_LOCATION_LOOKBACK_YEARS * 365.25 * 864e5);
  const seen = await tx.appointment.findFirst({ where: { patientId, locationId: { in: locationIds }, startsAt: { gte: since } }, select: { id: true } });
  if (!seen) throw new DomainError(Codes.NOT_FOUND, "Patient not found.");
  return patient;
}
async function resolvePatientRef(tx, ref) {
  const value = String(ref ?? "").trim();
  if (!value.startsWith("chart:")) return value;
  const chartNumber = value.slice(6).trim().toUpperCase();
  const patient = chartNumber ? await tx.patient.findUnique({ where: { chartNumber }, select: { id: true } }) : null;
  if (!patient) throw new DomainError(Codes.NOT_FOUND, "No patient has that chart number.", { field: "patientId" });
  return patient.id;
}
var BOOKABLE_PATIENT = /* @__PURE__ */ new Set(["prospect", "active", "inactive"]);
function assertBookablePatient(patient) {
  if (!BOOKABLE_PATIENT.has(patient.status)) {
    throw new DomainError(Codes.GUARD_FAILED, patient.status === "merged_into" ? "This record was merged; book on the surviving record." : `A ${patient.status} patient can't be booked.`, { currentStatus: patient.status });
  }
}
var toDate = (value, field) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new DomainError(Codes.INVALID_INPUT, `Enter a valid ${field}.`, { field });
  return date;
};
var requireText = (value, field, max = 500) => {
  const text12 = String(value ?? "").trim();
  if (!text12) throw new DomainError(Codes.INVALID_INPUT, `Enter a ${field}.`, { field });
  if (text12.length > max) throw new DomainError(Codes.INVALID_INPUT, `The ${field} is too long.`, { field });
  return text12;
};
var optionalText = (value, max = 2e3) => String(value ?? "").trim().slice(0, max);
function normalizeContact(kind, value) {
  const raw = String(value ?? "").trim();
  if (kind === "email") {
    const email = raw.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new DomainError(Codes.INVALID_INPUT, "Enter a valid email address.", { field: "value" });
    return { value: raw, normalized: email };
  }
  const digits = raw.replace(/\D/g, "");
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  if (!e164) throw new DomainError(Codes.INVALID_INPUT, "Enter a valid phone number.", { field: "value" });
  return { value: raw, normalized: e164 };
}

// features/keystone/mutations/scheduling.ts
var ACTIVE2 = [...ACTIVE_APPOINTMENT_STATUSES];
var STAFF_HOLD_MINUTES = 5;
var MAX_SEARCH_DAYS = 31;
async function findAvailability(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canReadSchedule", "canManageSchedule");
  assertLocation(locationIds, args.locationId);
  if (args.patientId) await assertPatientInScope(context.prisma, locationIds, args.patientId);
  return availability(context.prisma, { ...args, onlineOnly: false, leadMinutes: 0 });
}
async function availability(db, args) {
  const days = Math.min(Math.max(1, Number(args.days ?? 7)), args.horizonDays ?? MAX_SEARCH_DAYS);
  const type = await db.appointmentType.findUnique({ where: { id: args.typeId } });
  if (!type || !type.isActive || args.onlineOnly && !type.onlineBookable) throw new DomainError(Codes.INVALID_INPUT, "That appointment type is not available.", { field: "typeId" });
  const pattern = parsePattern(type.defaultPattern);
  const practice = await db.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } });
  const unitMinutes = practice?.scheduleUnitMinutes ?? 10;
  const now = /* @__PURE__ */ new Date();
  const limit = Math.min(Math.max(1, Number(args.limit ?? 50)), 200);
  const slots = [];
  for (let i = 0; i < days && slots.length < limit; i += 1) {
    const date = addDays(args.fromDate, i);
    const day2 = await loadLocationDay(db, args.locationId, date);
    if (!day2.windows.length) continue;
    const from = Math.min(...day2.windows.map((w) => w.startMs));
    const to = Math.max(...day2.windows.map((w) => w.endMs));
    const operatoryIds = [...new Set(day2.windows.map((w) => w.operatoryId))];
    const [chairBusy, providerBusy, patientBusy] = await Promise.all([
      loadChairBusy(db, operatoryIds, from, to, now),
      loadProviderBusy(db, from, to, now),
      args.patientId ? db.appointment.findMany({ where: { patientId: args.patientId, status: { in: ACTIVE2 }, startsAt: { lt: new Date(to) }, endsAt: { gt: new Date(from) } }, select: { startsAt: true, endsAt: true } }) : Promise.resolve([])
    ]);
    const found = findSlots({
      windows: day2.windows,
      typeId: type.id,
      durationMinutes: patternUnits(pattern) * unitMinutes,
      unitMinutes,
      bufferAfterMinutes: 0,
      chairBusy,
      providerBusy,
      patientBusy: patientBusy.map((b) => ({ startMs: b.startsAt.getTime(), endMs: b.endsAt.getTime() })),
      pattern,
      nowMs: now.getTime(),
      leadMinutes: args.leadMinutes,
      onlineOnly: args.onlineOnly,
      operatoryIds: args.operatoryIds ?? void 0,
      providerId: args.providerId ?? null,
      limit: limit - slots.length
    });
    const usable = type.requiresDentistOnSite && (day2.supervision.enforcement === "hard" || args.onlineOnly) && !day2.supervision.hygieneGeneralAllowed ? found.filter((s) => day2.windows.some((w) => w.providerType === "dentist" && w.startMs <= s.startMs && s.endMs <= w.endMs)) : found;
    for (const s of usable) slots.push({ operatoryId: s.operatoryId, providerId: s.providerId, startsAt: new Date(s.startMs).toISOString(), endsAt: new Date(s.endMs).toISOString(), localDate: date });
  }
  return { typeId: type.id, unitMinutes, durationMinutes: patternUnits(pattern) * unitMinutes, slots };
}
async function placeHold(uow, actor2, input) {
  const startsAt = toDate(input.startsAt, "startsAt");
  const pre = await preflight(uow.tx, { ...input, startsAt });
  await lockResources(uow.tx, { operatoryIds: [input.operatoryId], providerIds: pre.providerIds, patientIds: [input.patientId] });
  await expireStaleHolds(uow.tx, [input.operatoryId], uow.now);
  const check = await checkSlot(uow.tx, uow.now, { locationId: input.locationId, operatoryId: input.operatoryId, typeId: input.typeId, startsAt, providerId: input.providerId, patientId: input.patientId, onlineOnly: input.onlineOnly });
  const expiresAt = new Date(uow.now.getTime() + input.minutes * 6e4);
  const hold = await uow.tx.bookingHold.create({
    data: {
      locationId: input.locationId,
      operatoryId: input.operatoryId,
      providerId: check.providerId,
      typeId: input.typeId,
      startsAt: check.startsAt,
      endsAt: check.endsAt,
      segments: check.segments.map(serializeSegment),
      holderKind: input.holderKind,
      holderRef: input.holderRef,
      patientId: input.patientId ?? null,
      asapEntryId: input.asapEntryId ?? null,
      status: "held",
      expiresAt,
      isSynthetic: input.isSynthetic ?? false,
      createdAt: uow.now
    }
  }).catch(asSlotTaken);
  auditCreate(uow, actor2, "BookingHold", hold.id, "hold.placed", { operatoryId: hold.operatoryId, startsAt: hold.startsAt, endsAt: hold.endsAt, holderKind: hold.holderKind, expiresAt });
  return { hold, check };
}
var serializeSegment = (s) => ({ role: s.role, providerId: s.providerId, startMs: s.startMs, endMs: s.endMs, concurrencyKind: s.concurrencyKind });
async function holdSlot(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  assertLocation(locationIds, args.locationId);
  const result = await command(context.prisma, { name: "schedule.hold", actor: actor2, idempotencyKey: args.idempotencyKey, params: { ...args, idempotencyKey: void 0 } }, async (uow) => {
    if (args.patientId) await assertPatientInScope(uow.tx, locationIds, args.patientId);
    const { hold } = await placeHold(uow, actor2, { ...args, holderKind: "staff", holderRef: actor2.kind === "user" ? `user:${actor2.userId}` : "system", minutes: STAFF_HOLD_MINUTES });
    return { holdId: hold.id, expiresAt: hold.expiresAt.toISOString(), startsAt: hold.startsAt.toISOString(), endsAt: hold.endsAt.toISOString() };
  });
  return { replay: result.replay, ...result.value };
}
async function releaseHold(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  const result = await command(context.prisma, { name: "schedule.release_hold", actor: actor2, idempotencyKey: args.idempotencyKey, params: { holdId: args.holdId } }, async (uow) => {
    const hold = await uow.tx.bookingHold.findUnique({ where: { id: args.holdId } });
    if (!hold) throw new DomainError(Codes.NOT_FOUND, "Hold not found.");
    assertLocation(locationIds, hold.locationId);
    const updated = await transition(uow, { model: "BookingHold", id: args.holdId, from: ["held"], to: "released", actor: actor2, eventType: "hold.released" });
    return { holdId: updated.id, status: updated.status };
  });
  return { replay: result.replay, ...result.value };
}
async function createAppointment(uow, actor2, input) {
  const startsAt = toDate(input.startsAt, "startsAt");
  const pre = await preflight(uow.tx, { ...input, startsAt });
  await lockResources(uow.tx, { operatoryIds: [input.operatoryId], providerIds: pre.providerIds, patientIds: [input.patientId] });
  const patient = await uow.tx.patient.findUnique({ where: { id: input.patientId }, select: { id: true, status: true, homeLocationId: true, isSynthetic: true } });
  if (!patient) throw new DomainError(Codes.NOT_FOUND, "Patient not found.");
  assertBookablePatient(patient);
  let hold = null;
  if (input.holdId) {
    hold = await uow.tx.bookingHold.findUnique({ where: { id: input.holdId } });
    if (!hold) throw new DomainError(Codes.NOT_FOUND, "Hold not found.");
    const expectedHolder = input.holderRef ?? (actor2.kind === "user" ? `user:${actor2.userId}` : null);
    if (hold.holderRef !== expectedHolder) throw new DomainError(Codes.NOT_AUTHORIZED, "That hold belongs to someone else.");
    if (hold.status !== "held" || hold.expiresAt.getTime() <= uow.now.getTime()) {
      if (hold.status === "held") await uow.tx.bookingHold.updateMany({ where: { id: hold.id, status: "held" }, data: { status: "expired", version: { increment: 1 } } });
      throw new DomainError(Codes.HOLD_EXPIRED, "The hold on this time has expired. Pick the time again.");
    }
    if (hold.operatoryId !== input.operatoryId || hold.startsAt.getTime() !== startsAt.getTime() || hold.typeId !== input.typeId) {
      throw new DomainError(Codes.INVALID_INPUT, "The booking does not match the held time.");
    }
    if (hold.patientId && hold.patientId !== input.patientId) throw new DomainError(Codes.INVALID_INPUT, "The hold was placed for a different patient.");
  }
  await expireStaleHolds(uow.tx, [input.operatoryId], uow.now);
  const overrideTemplate = !!input.overrideTemplate;
  const overrideProviderClash = !!input.overrideProviderClash;
  if (overrideTemplate) requirePermission(actor2, "canOverrideTemplate");
  if (overrideProviderClash) requirePermission(actor2, "canOverrideSchedule");
  const overrideReason = overrideTemplate || overrideProviderClash ? requireText(input.overrideReason, "override reason") : "";
  const check = await checkSlot(uow.tx, uow.now, {
    locationId: input.locationId,
    operatoryId: input.operatoryId,
    typeId: input.typeId,
    startsAt,
    providerId: input.providerId ?? hold?.providerId,
    patientId: input.patientId,
    overrideTemplate,
    overrideProviderClash,
    onlineOnly: input.source === "online_booking",
    ignore: hold ? { holdIds: [hold.id] } : void 0
  });
  if (hold) {
    const converted = await uow.tx.bookingHold.updateMany({ where: { id: hold.id, status: "held", version: hold.version }, data: { status: "converted", version: { increment: 1 } } });
    if (converted.count !== 1) throw new DomainError(Codes.STALE_STATE, "The hold changed while booking. Try again.");
  }
  const ref = await nextReference(uow.tx, "APT", uow.now);
  const appointment = await uow.tx.appointment.create({
    data: {
      ref,
      patientId: input.patientId,
      locationId: input.locationId,
      operatoryId: input.operatoryId,
      typeId: input.typeId,
      startsAt: check.startsAt,
      endsAt: check.endsAt,
      localDate: /* @__PURE__ */ new Date(`${check.localDate}T00:00:00Z`),
      bufferAfterMinutes: check.bufferAfterMinutes,
      status: "scheduled",
      primaryProviderId: check.providerId,
      supervisingDentistId: check.supervisingDentistId,
      note: optionalText(input.note),
      warnings: check.warnings,
      source: input.source ?? "staff",
      bookedViaHoldId: hold?.id ?? null,
      proposalId: input.proposalId ?? null,
      bookedById: actor2.kind === "user" ? actor2.userId : null,
      productionScheduledMinor: check.productionMinor,
      isSynthetic: input.isSynthetic ?? patient.isSynthetic,
      segments: {
        create: check.segments.map((s) => ({
          role: s.role,
          providerId: s.providerId,
          startsAt: new Date(s.startMs),
          endsAt: new Date(s.endMs),
          concurrencyKind: s.concurrencyKind,
          overrideReason: s.concurrencyKind === "approved_override" ? overrideReason : ""
        }))
      }
    }
  }).catch(asSlotTaken);
  if (hold) await uow.tx.bookingHold.update({ where: { id: hold.id }, data: { convertedToId: appointment.id } });
  if (patient.status === "prospect" && !patient.homeLocationId) await uow.tx.patient.update({ where: { id: patient.id }, data: { homeLocationId: input.locationId } });
  auditCreate(uow, actor2, "Appointment", appointment.id, "appointment.booked", {
    ref,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    operatoryId: input.operatoryId,
    providerId: check.providerId,
    typeId: input.typeId,
    source: appointment.source,
    warnings: check.warnings,
    holdId: hold?.id ?? null
  }, { reason: overrideReason || null });
  await scheduleConfirmations(uow, appointment);
  uow.emit({ topic: "notify.staff", aggregateType: "Appointment", aggregateId: appointment.id, payload: { kind: "appointment.booked", locationId: input.locationId }, dedupeKey: `notify.staff:appointment.booked:${appointment.id}` });
  return appointment;
}
async function bookAppointment(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  assertLocation(locationIds, args.locationId);
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "schedule.book", actor: actor2, idempotencyKey, params }, async (uow) => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId).catch(async (error) => {
      const p = await uow.tx.patient.findUnique({ where: { id: args.patientId }, select: { homeLocationId: true } });
      if (!p || p.homeLocationId) throw error;
    });
    const appointment = await createAppointment(uow, actor2, { ...params, source: "staff" });
    return { appointmentId: appointment.id, ref: appointment.ref, status: appointment.status, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString(), warnings: appointment.warnings };
  });
  return { replay: result.replay, ...result.value };
}
async function scheduleConfirmations(uow, appointment) {
  if (!appointment.patientId) return;
  const contacts = await uow.tx.contactPoint.findMany({ where: { patientId: appointment.patientId, isActive: true, isPrimary: true }, select: { id: true, kind: true } });
  const offsets = [48, 24];
  for (const contact of contacts) {
    const channel = contact.kind === "email" ? "email" : contact.kind === "mobile" ? "sms" : null;
    if (!channel) continue;
    for (const hours of offsets) {
      const scheduledFor = new Date(appointment.startsAt.getTime() - hours * 36e5);
      if (scheduledFor.getTime() <= uow.now.getTime()) continue;
      const attempt = await uow.tx.confirmationAttempt.create({ data: { appointmentId: appointment.id, channel, scheduledFor, contactPointId: contact.id, status: "scheduled" } });
      uow.emit({ topic: "confirmation.dispatch", aggregateType: "ConfirmationAttempt", aggregateId: attempt.id, payload: { attemptId: attempt.id }, dedupeKey: `confirmation.dispatch:${attempt.id}`, availableAt: scheduledFor });
    }
  }
}
async function loadScoped(tx, locationIds, appointmentId) {
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new DomainError(Codes.NOT_FOUND, "Appointment not found.");
  assertLocation(locationIds, appointment.locationId);
  return appointment;
}
async function cancelFollowUps(uow, appointmentId) {
  await uow.tx.confirmationAttempt.updateMany({ where: { appointmentId, status: "scheduled" }, data: { status: "suppressed", suppressedReason: "appointment_closed", version: { increment: 1 } } });
  await uow.tx.appointmentSegment.updateMany({ where: { appointmentId }, data: { isActive: false } });
}
async function confirmAppointment(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  if (!CONFIRMATION_METHODS.includes(args.method)) throw new DomainError(Codes.INVALID_INPUT, "Choose how the patient confirmed.", { field: "method" });
  return runTransition(context, actor2, "schedule.confirm", args, async (uow) => {
    await loadScoped(uow.tx, locationIds, args.appointmentId);
    return confirmIn(uow, actor2, args.appointmentId, args.method, args.expectedVersion);
  });
}
async function confirmIn(uow, actor2, appointmentId, method, expectedVersion) {
  const updated = await transition(uow, {
    model: "Appointment",
    id: appointmentId,
    from: ["scheduled"],
    to: "confirmed",
    expectedVersion,
    actor: actor2,
    eventType: "appointment.confirmed",
    data: { confirmedAt: uow.now, confirmationMethod: method },
    metadata: { method }
  });
  await uow.tx.confirmationAttempt.updateMany({ where: { appointmentId, status: "scheduled" }, data: { status: "suppressed", suppressedReason: "already_confirmed", version: { increment: 1 } } });
  return updated;
}
async function markArrived(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  return runTransition(context, actor2, "schedule.arrive", args, async (uow) => {
    const appointment = await loadScoped(uow.tx, locationIds, args.appointmentId);
    const location = await uow.tx.location.findUniqueOrThrow({ where: { id: appointment.locationId }, select: { timeZone: true } });
    const today2 = localDate(location.timeZone, uow.now);
    if (localDate(location.timeZone, appointment.startsAt) !== today2 && !can(actor2, "canOverrideSchedule")) {
      throw new DomainError(Codes.GUARD_FAILED, "Only today\u2019s appointments can be checked in.");
    }
    const gate = await labGate(uow.tx, appointment.id);
    if (gate.blocked) {
      if (!args.overrideLabGate) throw new DomainError(Codes.LAB_CASE_NOT_READY, gate.reason);
      requirePermission(actor2, "canOverrideLabGate");
      requireText(args.reason, "override reason");
    }
    const updated = await transition(uow, { model: "Appointment", id: appointment.id, from: ["scheduled", "confirmed"], to: "arrived", expectedVersion: args.expectedVersion, actor: actor2, eventType: "appointment.arrived", reason: args.reason ?? null, data: { arrivedAt: uow.now } });
    const patient = await uow.tx.patient.findUnique({ where: { id: appointment.patientId }, select: { id: true, status: true, version: true } });
    if (patient && (patient.status === "prospect" || patient.status === "inactive")) {
      await transition(uow, { model: "Patient", id: patient.id, from: ["prospect", "inactive"], to: "active", actor: actor2, eventType: "patient.activated", metadata: { by: "arrival", appointmentId: appointment.id }, data: patient.status === "prospect" ? { firstVisitOn: /* @__PURE__ */ new Date(`${today2}T00:00:00Z`) } : {} });
    }
    await uow.tx.confirmationAttempt.updateMany({ where: { appointmentId: appointment.id, status: "scheduled" }, data: { status: "suppressed", suppressedReason: "arrived", version: { increment: 1 } } });
    return updated;
  });
}
async function seatPatient(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule", "canChart");
  return runTransition(context, actor2, "schedule.seat", args, async (uow) => {
    const appointment = await loadScoped(uow.tx, locationIds, args.appointmentId);
    const alerts = await uow.tx.patientAlert.count({ where: { patientId: appointment.patientId, endedAt: null, severity: { in: ["caution", "critical"] } } });
    if (alerts && !args.acknowledgeAlerts) throw new DomainError(Codes.GUARD_FAILED, `This patient has ${alerts} active medical alert${alerts === 1 ? "" : "s"}. Review and acknowledge them before seating.`);
    return transition(uow, {
      model: "Appointment",
      id: appointment.id,
      from: ["arrived"],
      to: "seated",
      expectedVersion: args.expectedVersion,
      actor: actor2,
      eventType: "appointment.seated",
      data: { seatedAt: uow.now, ...alerts ? { alertAckById: actor2.kind === "user" ? actor2.userId : null, alertAckAt: uow.now } : {} },
      metadata: { alertsAcknowledged: alerts }
    });
  });
}
async function markReadyForCheckout(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule", "canChart");
  return runTransition(context, actor2, "schedule.ready", args, async (uow) => {
    await loadScoped(uow.tx, locationIds, args.appointmentId);
    return transition(uow, { model: "Appointment", id: args.appointmentId, from: ["seated"], to: "ready_for_checkout", expectedVersion: args.expectedVersion, actor: actor2, eventType: "appointment.ready", reason: args.reason ?? null, data: { readyAt: uow.now } });
  });
}
async function completeAppointment(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule", "canCompleteProcedures");
  return runTransition(context, actor2, "schedule.complete", args, async (uow) => {
    const appointment = await loadScoped(uow.tx, locationIds, args.appointmentId);
    const location = await uow.tx.location.findUniqueOrThrow({ where: { id: appointment.locationId }, select: { timeZone: true } });
    const updated = await transition(uow, { model: "Appointment", id: appointment.id, from: ["ready_for_checkout"], to: "completed", expectedVersion: args.expectedVersion, actor: actor2, eventType: "appointment.completed", data: { completedAt: uow.now } });
    await uow.tx.patient.update({ where: { id: appointment.patientId }, data: { lastVisitOn: /* @__PURE__ */ new Date(`${localDate(location.timeZone, appointment.startsAt)}T00:00:00Z`) } });
    uow.emit({ topic: "notify.staff", aggregateType: "Appointment", aggregateId: appointment.id, payload: { kind: "appointment.completed" }, dedupeKey: `notify.staff:appointment.completed:${appointment.id}` });
    return updated;
  });
}
async function cancelAppointment(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  const reason = requireText(args.reason, "reason");
  return runTransition(context, actor2, "schedule.cancel", args, async (uow) => {
    await loadScoped(uow.tx, locationIds, args.appointmentId);
    return cancelIn(uow, actor2, args.appointmentId, reason, args.expectedVersion);
  });
}
async function cancelIn(uow, actor2, appointmentId, reason, expectedVersion) {
  const appointment = await uow.tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { lateCancelHours: true } });
  const lateHours = practice?.lateCancelHours ?? 24;
  const late = appointment.startsAt.getTime() - uow.now.getTime() < lateHours * 36e5;
  if (late) return breakIn(uow, actor2, appointmentId, "late_cancel", reason, expectedVersion);
  const updated = await transition(uow, { model: "Appointment", id: appointmentId, from: ["scheduled", "confirmed"], to: "cancelled", expectedVersion, actor: actor2, eventType: "appointment.cancelled", reason, data: { cancelledAt: uow.now, cancelReason: reason } });
  await cancelFollowUps(uow, appointmentId);
  emitOpenTime(uow, appointment);
  return updated;
}
async function withdrawIn(uow, actor2, appointmentId, reason) {
  const appointment = await uow.tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  const updated = await transition(uow, { model: "Appointment", id: appointmentId, from: ["scheduled", "confirmed"], to: "cancelled", actor: actor2, eventType: "appointment.withdrawn", reason, data: { cancelledAt: uow.now, cancelReason: reason } });
  await cancelFollowUps(uow, appointmentId);
  emitOpenTime(uow, appointment);
  return updated;
}
async function markBroken(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  if (args.kind !== "no_show" && args.kind !== "late_cancel") throw new DomainError(Codes.INVALID_INPUT, "Choose no-show or late cancel.", { field: "kind" });
  return runTransition(context, actor2, "schedule.break", args, async (uow) => {
    await loadScoped(uow.tx, locationIds, args.appointmentId);
    return breakIn(uow, actor2, args.appointmentId, args.kind, args.reason ?? "", args.expectedVersion);
  });
}
async function breakIn(uow, actor2, appointmentId, kind, reason, expectedVersion) {
  const appointment = await uow.tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  const from = kind === "no_show" ? ["scheduled", "confirmed", "arrived"] : ["scheduled", "confirmed"];
  const updated = await transition(uow, { model: "Appointment", id: appointmentId, from, to: "broken", expectedVersion, actor: actor2, eventType: "appointment.broken", reason: reason || null, data: { brokenKind: kind, cancelledAt: kind === "late_cancel" ? uow.now : void 0, cancelReason: reason }, metadata: { kind } });
  await uow.tx.brokenAppointmentEvent.create({ data: { appointmentId, patientId: appointment.patientId, kind, at: uow.now, recordedById: actor2.kind === "user" ? actor2.userId : null, reason } });
  await cancelFollowUps(uow, appointmentId);
  emitOpenTime(uow, appointment);
  return updated;
}
function emitOpenTime(uow, appointment) {
  uow.emit({ topic: "notify.staff", aggregateType: "Appointment", aggregateId: appointment.id, payload: { kind: "schedule.open_time", locationId: appointment.locationId, operatoryId: appointment.operatoryId, startsAt: appointment.startsAt, endsAt: appointment.endsAt }, dedupeKey: `notify.staff:open_time:${appointment.id}` });
}
async function rescheduleAppointment(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  assertLocation(locationIds, args.locationId);
  return runTransition(context, actor2, "schedule.reschedule", args, async (uow) => {
    const old = await loadScoped(uow.tx, locationIds, args.appointmentId);
    return rescheduleIn(uow, actor2, old, args);
  });
}
async function rescheduleIn(uow, actor2, old, args) {
  if (!["scheduled", "confirmed"].includes(old.status)) throw new DomainError(Codes.INVALID_TRANSITION, `A ${old.status} appointment can't be rescheduled.`, { currentStatus: old.status });
  if (args.expectedVersion !== void 0 && args.expectedVersion !== null && old.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, "The appointment changed since you loaded it.", { currentVersion: old.version });
  const retired = await transition(uow, { model: "Appointment", id: old.id, from: ["scheduled", "confirmed"], to: "rescheduled", expectedVersion: old.version, actor: actor2, eventType: "appointment.rescheduled", reason: args.reason ?? null, data: { cancelledAt: uow.now } });
  await cancelFollowUps(uow, old.id);
  const fresh = await createAppointment(uow, actor2, {
    locationId: args.locationId,
    operatoryId: args.operatoryId,
    typeId: args.typeId,
    startsAt: args.startsAt,
    providerId: args.providerId,
    patientId: old.patientId,
    holdId: args.holdId,
    holderRef: args.holderRef,
    note: old.note,
    overrideTemplate: args.overrideTemplate,
    overrideProviderClash: args.overrideProviderClash,
    overrideReason: args.overrideReason,
    source: args.source ?? "staff",
    isSynthetic: old.isSynthetic
  });
  await uow.tx.appointment.update({ where: { id: old.id }, data: { rescheduledToId: fresh.id } });
  emitOpenTime(uow, old);
  return { ...fresh, previous: { id: retired.id, status: retired.status } };
}
async function runTransition(context, actor2, name, args, work) {
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name, actor: actor2, idempotencyKey, params }, async (uow) => {
    const row = await work(uow);
    return { appointmentId: row.id, ref: row.ref, status: row.status, version: row.version, startsAt: row.startsAt?.toISOString?.() ?? row.startsAt, brokenKind: row.brokenKind ?? "", previous: row.previous ?? null };
  });
  return { replay: result.replay, ...result.value };
}
async function addAsapEntry(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  assertLocation(locationIds, args.locationId);
  const windows = Array.isArray(args.preferredWindows) ? args.preferredWindows : [];
  for (const w of windows) {
    if (!Number.isInteger(w?.weekday) || w.weekday < 0 || w.weekday > 6 || !/^\d{2}:\d{2}$/.test(String(w?.from)) || !/^\d{2}:\d{2}$/.test(String(w?.to)) || w.to <= w.from) {
      throw new DomainError(Codes.INVALID_INPUT, "Each preferred window needs a weekday (0\u20136) and a from/to time (HH:mm).", { field: "preferredWindows" });
    }
  }
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "schedule.asap_add", actor: actor2, idempotencyKey, params }, async (uow) => {
    const patientId = await resolvePatientRef(uow.tx, args.patientId);
    const patient = await assertPatientInScope(uow.tx, locationIds, patientId);
    assertBookablePatient(patient);
    const entry = await uow.tx.asapEntry.create({
      data: {
        patientId,
        locationId: args.locationId,
        appointmentTypeId: args.appointmentTypeId ?? null,
        providerId: args.providerId ?? null,
        preferredWindows: windows,
        earliestDate: args.earliestDate ? /* @__PURE__ */ new Date(`${args.earliestDate}T00:00:00Z`) : null,
        note: optionalText(args.note),
        status: "active",
        priority: Math.max(0, Math.min(9, Number(args.priority ?? 0)))
      }
    });
    auditCreate(uow, actor2, "AsapEntry", entry.id, "asap.added", { patientId, locationId: args.locationId });
    return { asapEntryId: entry.id, status: entry.status };
  });
  return { replay: result.replay, ...result.value };
}
async function closeAsapEntry(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  if (args.status !== "declined" && args.status !== "expired") throw new DomainError(Codes.INVALID_INPUT, "Choose declined or expired.");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "schedule.asap_close", actor: actor2, idempotencyKey, params }, async (uow) => {
    const entry = await uow.tx.asapEntry.findUnique({ where: { id: args.asapEntryId } });
    if (!entry) throw new DomainError(Codes.NOT_FOUND, "ASAP entry not found.");
    assertLocation(locationIds, entry.locationId);
    const updated = await transition(uow, { model: "AsapEntry", id: entry.id, from: ["active", "offered"], to: args.status, expectedVersion: args.expectedVersion, actor: actor2, eventType: `asap.${args.status}`, reason: args.reason ?? null });
    return { asapEntryId: updated.id, status: updated.status, version: updated.version };
  });
  return { replay: result.replay, ...result.value };
}
async function publishScheduleTemplate(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageTemplates", "canManagePractice");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "schedule.template_publish", actor: actor2, idempotencyKey, params }, async (uow) => {
    const template = await uow.tx.scheduleTemplate.findUnique({ where: { id: args.templateId }, include: { blocks: true } });
    if (!template) throw new DomainError(Codes.NOT_FOUND, "Template not found.");
    assertLocation(locationIds, template.locationId);
    if (!template.blocks.length) throw new DomainError(Codes.GUARD_FAILED, "Add at least one block before publishing.");
    const effectiveFrom = template.effectiveFrom.toISOString().slice(0, 10);
    const dayBefore = /* @__PURE__ */ new Date(`${addDays(effectiveFrom, -1)}T00:00:00Z`);
    const previous = await uow.tx.scheduleTemplate.findMany({ where: { locationId: template.locationId, status: "active", id: { not: template.id } } });
    for (const p of previous) {
      if (p.effectiveFrom.getTime() >= template.effectiveFrom.getTime()) {
        await transition(uow, { model: "ScheduleTemplate", id: p.id, from: ["active"], to: "retired", actor: actor2, eventType: "template.retired", metadata: { supersededBy: template.id } });
      } else if (!p.effectiveTo || p.effectiveTo.getTime() >= template.effectiveFrom.getTime()) {
        await uow.tx.scheduleTemplate.update({ where: { id: p.id }, data: { effectiveTo: dayBefore, version: { increment: 1 } } });
        uow.audit({ eventType: "template.ended", entityType: "ScheduleTemplate", entityId: p.id, actorUserId: actor2.kind === "user" ? actor2.userId : null, after: { effectiveTo: dayBefore } });
      }
    }
    const published = await transition(uow, { model: "ScheduleTemplate", id: template.id, from: ["draft"], to: "active", expectedVersion: args.expectedVersion, actor: actor2, eventType: "template.published", data: { publishedAt: uow.now, publishedById: actor2.kind === "user" ? actor2.userId : null } });
    const location = await uow.tx.location.findUniqueOrThrow({ where: { id: template.locationId }, select: { timeZone: true } });
    const upcoming = await uow.tx.appointment.findMany({ where: { locationId: template.locationId, status: { in: ACTIVE2 }, startsAt: { gte: zonedInstant(location.timeZone, effectiveFrom, "00:00") } }, select: { id: true, ref: true, operatoryId: true, typeId: true, startsAt: true, endsAt: true }, take: 500 });
    const outside = [];
    const cache = /* @__PURE__ */ new Map();
    for (const a of upcoming) {
      const date = localDate(location.timeZone, a.startsAt);
      if (!cache.has(date)) cache.set(date, await loadLocationDay(uow.tx, template.locationId, date));
      const day2 = cache.get(date);
      const fits = day2.windows.some((w) => w.operatoryId === a.operatoryId && w.startMs <= a.startsAt.getTime() && a.endsAt.getTime() <= w.endMs && (!w.allowedTypeIds.length || w.allowedTypeIds.includes(a.typeId)));
      if (!fits) outside.push(a.ref);
    }
    return { templateId: published.id, status: published.status, appointmentsOutsideTemplate: outside };
  });
  return { replay: result.replay, ...result.value };
}

// features/keystone/mutations/patients.ts
var DOB = /^\d{4}-\d{2}-\d{2}$/;
function cleanPatient(input, today2) {
  const firstName = requireText(input.firstName, "first name", 100);
  const lastName = requireText(input.lastName, "last name", 100);
  if (!DOB.test(String(input.dateOfBirth ?? "")) || Number.isNaN(Date.parse(`${input.dateOfBirth}T00:00:00Z`))) throw new DomainError(Codes.INVALID_INPUT, "Enter the date of birth as YYYY-MM-DD.", { field: "dateOfBirth" });
  if (input.dateOfBirth > today2 || input.dateOfBirth < "1880-01-01") throw new DomainError(Codes.INVALID_INPUT, "The date of birth is not plausible.", { field: "dateOfBirth" });
  const sex = input.sexAssignedAtBirth ?? "unknown";
  if (!SEX_AT_BIRTH.includes(sex)) throw new DomainError(Codes.INVALID_INPUT, "Unknown sex assigned at birth.", { field: "sexAssignedAtBirth" });
  return {
    firstName,
    lastName,
    middleName: optionalText(input.middleName, 100),
    preferredName: optionalText(input.preferredName, 100),
    dateOfBirth: /* @__PURE__ */ new Date(`${input.dateOfBirth}T00:00:00Z`),
    sexAssignedAtBirth: sex,
    pronouns: optionalText(input.pronouns, 40),
    preferredLanguage: optionalText(input.preferredLanguage, 20) || "en",
    address: input.address ?? {}
  };
}
async function findDuplicates(tx, input) {
  const contacts = (input.contacts ?? []).filter(Boolean);
  const rows = await tx.$queryRawUnsafe(
    `SELECT p.id, p."chartNumber",
            public.similarity(lower(p."lastName" || ' ' || p."firstName"), lower($2)) AS name_score,
            EXISTS (SELECT 1 FROM "ContactPoint" c WHERE c.patient = p.id AND c."isActive" AND c."valueNormalized" = ANY($3::text[])) AS contact_match,
            lower(p."lastName") = lower($4) AS last_exact
       FROM "Patient" p
      WHERE p."dateOfBirth" = $1::date AND p.status <> 'merged_into' AND ($5::text IS NULL OR p.id <> $5)
      ORDER BY name_score DESC LIMIT 10`,
    input.dateOfBirth,
    `${input.lastName} ${input.firstName}`,
    contacts,
    input.lastName,
    input.excludeId ?? null
  );
  return rows.map((r) => {
    const evidence = ["date_of_birth"];
    if (r.name_score >= 0.45) evidence.push("similar_name");
    if (r.last_exact) evidence.push("same_last_name");
    if (r.contact_match) evidence.push("shared_contact");
    const score = Math.round((0.4 + Math.min(0.4, Number(r.name_score) * 0.4) + (r.contact_match ? 0.2 : 0)) * 100) / 100;
    return { patientId: r.id, chartNumber: r.chartNumber, score, evidence };
  }).filter((c) => c.evidence.includes("similar_name") || c.evidence.includes("shared_contact"));
}
async function createPatientIn(uow, actor2, input) {
  const location = await uow.tx.location.findUnique({ where: { id: input.homeLocationId }, select: { timeZone: true } });
  if (!location) throw new DomainError(Codes.INVALID_INPUT, "Choose a home location.", { field: "homeLocationId" });
  const clean = cleanPatient(input, localDate(location.timeZone, uow.now));
  const contacts = (input.contacts ?? []).map((c) => {
    if (!CONTACT_KINDS.includes(c.kind)) throw new DomainError(Codes.INVALID_INPUT, "Unknown contact kind.", { field: "contacts" });
    return { kind: c.kind, isPrimary: c.isPrimary ?? true, ...normalizeContact(c.kind, c.value) };
  });
  const chartNumber = await nextReference(uow.tx, "PT", uow.now);
  const patient = await uow.tx.patient.create({
    data: {
      ...clean,
      chartNumber,
      status: input.status ?? "prospect",
      homeLocationId: input.homeLocationId,
      primaryProviderId: input.primaryProviderId ?? null,
      referralSourceId: input.referralSourceId ?? null,
      isSynthetic: input.isSynthetic ?? false
    }
  });
  const seenPrimary = /* @__PURE__ */ new Set();
  for (const c of contacts) {
    const primary = c.isPrimary && !seenPrimary.has(c.kind);
    if (primary) seenPrimary.add(c.kind);
    await uow.tx.contactPoint.create({ data: { patientId: patient.id, kind: c.kind, value: c.value, valueNormalized: c.normalized, isPrimary: primary, isActive: true } });
  }
  const guarantor = await uow.tx.guarantor.create({ data: { patientId: patient.id, isSynthetic: patient.isSynthetic } });
  await uow.tx.guarantorLink.create({ data: { patientId: patient.id, guarantorId: guarantor.id, relationship: "self", status: "active", startsOn: /* @__PURE__ */ new Date(`${localDate(location.timeZone, uow.now)}T00:00:00Z`) } });
  auditCreate(uow, actor2, "Patient", patient.id, "patient.created", { chartNumber, homeLocationId: input.homeLocationId, contacts: contacts.length });
  return patient;
}
async function registerPatient(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  assertLocation(locationIds, args.data?.homeLocationId);
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.create", actor: actor2, idempotencyKey, params }, async (uow) => {
    await advisoryLock(uow.tx, `patient-dob:${args.data.dateOfBirth}`);
    const contacts = (args.data.contacts ?? []).map((c) => {
      try {
        return normalizeContact(c.kind, c.value).normalized;
      } catch {
        return "";
      }
    });
    const duplicates = await findDuplicates(uow.tx, { firstName: args.data.firstName, lastName: args.data.lastName, dateOfBirth: args.data.dateOfBirth, contacts });
    if (duplicates.length && !args.acknowledgeDuplicates) {
      throw new DomainError(Codes.DUPLICATE_SUSPECTED, `This may be an existing patient (chart ${duplicates.map((d) => d.chartNumber).join(", ")}). Open that record, or confirm this is a different person.`, { problems: duplicates.map((d) => ({ chartNumber: d.chartNumber, evidence: d.evidence })) });
    }
    const patient = await createPatientIn(uow, actor2, args.data);
    if (duplicates.length) uow.audit({ eventType: "patient.duplicate_acknowledged", entityType: "Patient", entityId: patient.id, actorUserId: actor2.kind === "user" ? actor2.userId : null, after: { candidates: duplicates.map((d) => d.chartNumber) } });
    return { patientId: patient.id, chartNumber: patient.chartNumber, status: patient.status };
  });
  return { replay: result.replay, ...result.value };
}
var DEMOGRAPHIC_FIELDS = ["firstName", "lastName", "middleName", "preferredName", "dateOfBirth", "sexAssignedAtBirth", "pronouns", "preferredLanguage", "address", "genderIdentity", "suffix"];
async function updatePatientDemographics(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  const keys = Object.keys(args.changes ?? {});
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, "Nothing to change.");
  const unknown = keys.filter((k) => !DEMOGRAPHIC_FIELDS.includes(k));
  if (unknown.length) throw new DomainError(Codes.INVALID_INPUT, `These fields can't be changed here: ${unknown.join(", ")}.`, { field: unknown[0] });
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.update_demographics", actor: actor2, idempotencyKey, params }, async (uow) => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId);
    const row = await lockRow(uow.tx, "Patient", args.patientId);
    if (row.version !== args.expectedVersion) throw new DomainError(Codes.STALE_STATE, "This patient changed since you loaded it. Reload and try again.", { currentVersion: row.version });
    if (row.status === "merged_into") throw new DomainError(Codes.GUARD_FAILED, "This record was merged; edit the surviving record.");
    const merged = { ...row, dateOfBirth: row.dateOfBirth.toISOString().slice(0, 10), ...args.changes };
    const location = await uow.tx.location.findUnique({ where: { id: row.homeLocationId ?? "" }, select: { timeZone: true } });
    const clean = cleanPatient({ ...merged, homeLocationId: row.homeLocationId }, localDate(location?.timeZone ?? "UTC", uow.now));
    const data = {};
    for (const k of keys) data[k] = k in clean ? clean[k] : optionalText(args.changes[k], 100);
    const before = Object.fromEntries(keys.map((k) => [k, row[k]]));
    const updated = await uow.tx.patient.updateMany({ where: { id: row.id, version: row.version }, data: { ...data, version: { increment: 1 } } });
    if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, "This patient changed while saving.");
    uow.audit({ eventType: "patient.demographics_updated", entityType: "Patient", entityId: row.id, actorUserId: actor2.kind === "user" ? actor2.userId : null, reason: args.reason ?? null, before, after: data });
    return { patientId: row.id, version: row.version + 1 };
  });
  return { replay: result.replay, ...result.value };
}
async function addContactPoint(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  if (!CONTACT_KINDS.includes(args.kind)) throw new DomainError(Codes.INVALID_INPUT, "Unknown contact kind.", { field: "kind" });
  const { value, normalized } = normalizeContact(args.kind, args.value);
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.add_contact", actor: actor2, idempotencyKey, params }, async (uow) => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId);
    await advisoryLock(uow.tx, `patient:${args.patientId}`);
    if (args.isPrimary) await uow.tx.contactPoint.updateMany({ where: { patientId: args.patientId, kind: args.kind, isPrimary: true }, data: { isPrimary: false } });
    const contact = await uow.tx.contactPoint.create({ data: { patientId: args.patientId, kind: args.kind, value, valueNormalized: normalized, isPrimary: !!args.isPrimary, isActive: true } });
    auditCreate(uow, actor2, "ContactPoint", contact.id, "contact.added", { patientId: args.patientId, kind: args.kind, isPrimary: contact.isPrimary });
    return { contactPointId: contact.id };
  });
  return { replay: result.replay, ...result.value };
}
async function deactivateContactPoint(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  const reason = requireText(args.reason, "reason");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.deactivate_contact", actor: actor2, idempotencyKey, params }, async (uow) => {
    const contact = await uow.tx.contactPoint.findUnique({ where: { id: args.contactPointId } });
    if (!contact?.patientId) throw new DomainError(Codes.NOT_FOUND, "Contact not found.");
    await assertPatientInScope(uow.tx, locationIds, contact.patientId);
    await uow.tx.contactPoint.update({ where: { id: contact.id }, data: { isActive: false, isPrimary: false } });
    const revoked = await uow.tx.consentGrant.updateMany({ where: { contactPointId: contact.id, status: "granted" }, data: { status: "revoked", revokedAt: uow.now, revokeReason: "contact_deactivated", version: { increment: 1 } } });
    uow.audit({ eventType: "contact.deactivated", entityType: "ContactPoint", entityId: contact.id, actorUserId: actor2.kind === "user" ? actor2.userId : null, reason, after: { consentsRevoked: revoked.count } });
    return { contactPointId: contact.id, consentsRevoked: revoked.count };
  });
  return { replay: result.replay, ...result.value };
}
async function grantConsentIn(uow, actor2, input) {
  if (!CONSENT_CHANNELS.includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, "Unknown consent channel.", { field: "channel" });
  if (!CONSENT_PURPOSES.includes(input.purpose)) throw new DomainError(Codes.INVALID_INPUT, "Unknown consent purpose.", { field: "purpose" });
  const contact = await uow.tx.contactPoint.findUnique({ where: { id: input.contactPointId } });
  if (!contact || !contact.isActive) throw new DomainError(Codes.NOT_FOUND, "Contact not found.");
  const fits = input.channel === "email" ? contact.kind === "email" : contact.kind !== "email";
  if (!fits) throw new DomainError(Codes.INVALID_INPUT, `A ${contact.kind} contact can't carry ${input.channel} consent.`, { field: "channel" });
  await advisoryLock(uow.tx, `consent:${contact.id}`);
  const existing = await uow.tx.consentGrant.findFirst({ where: { contactPointId: contact.id, channel: input.channel, purpose: input.purpose, status: "granted" } });
  if (existing) return existing;
  const grant = await uow.tx.consentGrant.create({
    data: { contactPointId: contact.id, channel: input.channel, purpose: input.purpose, status: "granted", source: input.source, evidence: input.evidence ?? {}, recordedById: actor2.kind === "user" ? actor2.userId : null, grantedAt: uow.now }
  });
  auditCreate(uow, actor2, "ConsentGrant", grant.id, "consent.granted", { contactPointId: contact.id, channel: input.channel, purpose: input.purpose, source: input.source });
  return grant;
}
async function revokeConsentIn(uow, actor2, input) {
  const where = { contactPointId: input.contactPointId, channel: input.channel, status: "granted", ...input.purpose ? { purpose: input.purpose } : {} };
  const grants = await uow.tx.consentGrant.findMany({ where, select: { id: true, purpose: true } });
  if (!grants.length) return 0;
  await uow.tx.consentGrant.updateMany({ where: { id: { in: grants.map((g) => g.id) } }, data: { status: "revoked", revokedAt: uow.now, revokeReason: input.reason, version: { increment: 1 } } });
  for (const g of grants) uow.audit({ eventType: "consent.revoked", entityType: "ConsentGrant", entityId: g.id, actorUserId: actor2.kind === "user" ? actor2.userId : null, reason: input.reason, after: { purpose: g.purpose } });
  return grants.length;
}
async function recordConsent(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients", "canMessagePatients");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "consent.record", actor: actor2, idempotencyKey, params }, async (uow) => {
    const contact = await uow.tx.contactPoint.findUnique({ where: { id: args.contactPointId }, select: { patientId: true } });
    if (!contact?.patientId) throw new DomainError(Codes.NOT_FOUND, "Contact not found.");
    await assertPatientInScope(uow.tx, locationIds, contact.patientId);
    if (args.granted) {
      const evidence = args.evidence ?? (args.reason?.trim() ? { note: args.reason.trim(), recordedVia: "staff_dashboard" } : {});
      if (args.source === "verbal_staff" && !String(evidence.note ?? "").trim()) throw new DomainError(Codes.INVALID_INPUT, "Note what the patient said and when.", { field: "evidence" });
      const grant = await grantConsentIn(uow, actor2, { contactPointId: args.contactPointId, channel: args.channel, purpose: args.purpose, source: args.source ?? "verbal_staff", evidence });
      return { consentGrantId: grant.id, status: "granted" };
    }
    const revoked = await revokeConsentIn(uow, actor2, { contactPointId: args.contactPointId, channel: args.channel, purpose: args.purpose, reason: requireText(args.reason, "reason") });
    return { revoked, status: "revoked" };
  });
  return { replay: result.replay, ...result.value };
}
async function addPatientAlert(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients", "canChart");
  if (!ALERT_KINDS.includes(args.kind)) throw new DomainError(Codes.INVALID_INPUT, "Unknown alert kind.", { field: "kind" });
  if (!["info", "caution", "critical"].includes(args.severity)) throw new DomainError(Codes.INVALID_INPUT, "Choose info, caution or critical.", { field: "severity" });
  const text12 = requireText(args.text, "alert text", 500);
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.alert_add", actor: actor2, idempotencyKey, params }, async (uow) => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId);
    const alert = await uow.tx.patientAlert.create({ data: { patientId: args.patientId, kind: args.kind, severity: args.severity, text: text12, source: "manual", activeFrom: uow.now, recordedById: actor2.kind === "user" ? actor2.userId : null } });
    auditCreate(uow, actor2, "PatientAlert", alert.id, "alert.added", { patientId: args.patientId, kind: args.kind, severity: args.severity });
    return { alertId: alert.id };
  });
  return { replay: result.replay, ...result.value };
}
async function endPatientAlert(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients", "canChart");
  const reason = requireText(args.reason, "reason");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.alert_end", actor: actor2, idempotencyKey, params }, async (uow) => {
    const alert = await uow.tx.patientAlert.findUnique({ where: { id: args.alertId } });
    if (!alert?.patientId) throw new DomainError(Codes.NOT_FOUND, "Alert not found.");
    await assertPatientInScope(uow.tx, locationIds, alert.patientId);
    if (alert.endedAt) return { alertId: alert.id, endedAt: alert.endedAt.toISOString() };
    await uow.tx.patientAlert.update({ where: { id: alert.id }, data: { endedAt: uow.now, version: { increment: 1 } } });
    uow.audit({ eventType: "alert.ended", entityType: "PatientAlert", entityId: alert.id, actorUserId: actor2.kind === "user" ? actor2.userId : null, reason });
    return { alertId: alert.id, endedAt: uow.now.toISOString() };
  });
  return { replay: result.replay, ...result.value };
}
async function linkGuarantor(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  if (!GUARANTOR_RELATIONSHIPS.includes(args.relationship)) throw new DomainError(Codes.INVALID_INPUT, "Unknown relationship.", { field: "relationship" });
  if (!args.guarantorPatientId && !String(args.personName?.lastName ?? "").trim()) throw new DomainError(Codes.INVALID_INPUT, "Choose a guarantor or enter their name.", { field: "personName" });
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.link_guarantor", actor: actor2, idempotencyKey, params }, async (uow) => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId);
    await advisoryLock(uow.tx, `patient:${args.patientId}`);
    const patient = await uow.tx.patient.findUniqueOrThrow({ where: { id: args.patientId }, select: { homeLocation: { select: { timeZone: true } }, isSynthetic: true } });
    const today2 = /* @__PURE__ */ new Date(`${localDate(patient.homeLocation?.timeZone ?? "UTC", uow.now)}T00:00:00Z`);
    let guarantor = args.guarantorPatientId ? await uow.tx.guarantor.findFirst({ where: { patientId: args.guarantorPatientId } }) : null;
    if (!guarantor) guarantor = await uow.tx.guarantor.create({ data: { patientId: args.guarantorPatientId ?? null, personName: args.guarantorPatientId ? {} : args.personName, isSynthetic: patient.isSynthetic } });
    const current = await uow.tx.guarantorLink.findFirst({ where: { patientId: args.patientId, status: "active" } });
    if (current?.guarantorId === guarantor.id) return { guarantorId: guarantor.id, guarantorLinkId: current.id, changed: false };
    if (current) await transition(uow, { model: "GuarantorLink", id: current.id, from: ["active"], to: "ended", actor: actor2, eventType: "guarantor.unlinked", data: { endsOn: today2 } });
    const link = await uow.tx.guarantorLink.create({ data: { patientId: args.patientId, guarantorId: guarantor.id, relationship: args.relationship, status: "active", startsOn: today2 } });
    auditCreate(uow, actor2, "GuarantorLink", link.id, "guarantor.linked", { patientId: args.patientId, guarantorId: guarantor.id, relationship: args.relationship });
    return { guarantorId: guarantor.id, guarantorLinkId: link.id, changed: true };
  });
  return { replay: result.replay, ...result.value };
}
async function setPatientStatus(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  const reason = requireText(args.reason, "reason");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.set_status", actor: actor2, idempotencyKey, params }, async (uow) => {
    await assertPatientInScope(uow.tx, locationIds, args.patientId);
    const future = await uow.tx.appointment.findMany({ where: { patientId: args.patientId, status: { in: [...ACTIVE_APPOINTMENT_STATUSES] }, startsAt: { gt: uow.now } }, select: { id: true, status: true } });
    const from = { active: ["prospect", "inactive"], inactive: ["active"], archived: ["prospect", "active", "inactive"], deceased: ["prospect", "active", "inactive", "archived"] };
    if (!from[args.status]) throw new DomainError(Codes.INVALID_INPUT, "Choose active, inactive, archived or deceased.", { field: "status" });
    let data = {};
    if (args.status === "archived" || args.status === "inactive") {
      if (future.length) throw new DomainError(Codes.GUARD_FAILED, `Cancel the ${future.length} upcoming appointment${future.length === 1 ? "" : "s"} first.`);
    }
    if (args.status === "deceased") {
      if (!args.dateOfDeath || !DOB.test(args.dateOfDeath)) throw new DomainError(Codes.INVALID_INPUT, "Enter the date of death.", { field: "dateOfDeath" });
      data = { dateOfDeath: /* @__PURE__ */ new Date(`${args.dateOfDeath}T00:00:00Z`), statementHold: true };
    }
    const updated = await transition(uow, { model: "Patient", id: args.patientId, from: from[args.status], to: args.status, expectedVersion: args.expectedVersion, actor: actor2, eventType: `patient.${args.status}`, reason, data });
    if (args.status === "deceased") {
      for (const a of future.filter((f) => f.status === "scheduled" || f.status === "confirmed")) await withdrawIn(uow, actor2, a.id, "deceased");
      await uow.tx.asapEntry.updateMany({ where: { patientId: args.patientId, status: { in: ["active", "offered"] } }, data: { status: "expired", version: { increment: 1 } } });
      const contacts = await uow.tx.contactPoint.findMany({ where: { patientId: args.patientId }, select: { id: true } });
      await uow.tx.consentGrant.updateMany({ where: { contactPointId: { in: contacts.map((c) => c.id) }, status: "granted" }, data: { status: "revoked", revokedAt: uow.now, revokeReason: "deceased", version: { increment: 1 } } });
    }
    return { patientId: updated.id, status: updated.status, version: updated.version };
  });
  return { replay: result.replay, ...result.value };
}
var MERGE_CHILDREN = [
  { list: "Appointment", field: "patientId" },
  { list: "AsapEntry", field: "patientId" },
  { list: "BookingHold", field: "patientId" },
  { list: "PatientAlert", field: "patientId" },
  { list: "ContactPoint", field: "patientId" },
  { list: "PatientIdentifier", field: "patientId" },
  { list: "Referral", field: "patientId" },
  { list: "PortalScope", field: "patientId" },
  { list: "Conversation", field: "patientId" },
  { list: "PublicBookingRequest", field: "patientMatchId" }
];
async function proposeMergeIn(uow, actor2, input) {
  if (input.survivorId === input.mergedId) throw new DomainError(Codes.INVALID_INPUT, "Choose two different records.");
  const [survivor, merged] = await Promise.all([uow.tx.patient.findUnique({ where: { id: input.survivorId } }), uow.tx.patient.findUnique({ where: { id: input.mergedId } })]);
  if (!survivor || !merged) throw new DomainError(Codes.NOT_FOUND, "Patient not found.");
  if (survivor.status === "merged_into" || merged.status === "merged_into") throw new DomainError(Codes.GUARD_FAILED, "One of these records was already merged.");
  const open = await uow.tx.mergeCase.findFirst({ where: { status: { in: ["proposed", "approved"] }, OR: [{ survivorId: input.survivorId, mergedId: input.mergedId }, { survivorId: input.mergedId, mergedId: input.survivorId }] } });
  if (open) return { mergeCase: open, approvalId: open.approvalId };
  const mergeCase = await uow.tx.mergeCase.create({ data: { survivorId: input.survivorId, mergedId: input.mergedId, evidence: input.evidence ?? {}, reason: input.reason, status: "proposed", proposedById: actor2.kind === "user" ? actor2.userId : null } });
  const approval = await requestApproval(uow, actor2, {
    action: "patient.merge",
    targetList: "MergeCase",
    targetId: mergeCase.id,
    requiredPermission: "canApprovePatientMerge",
    payload: { mergeCaseId: mergeCase.id, survivorId: input.survivorId, mergedId: input.mergedId },
    summary: `Merge chart ${merged.chartNumber} into ${survivor.chartNumber}`
  });
  await uow.tx.mergeCase.update({ where: { id: mergeCase.id }, data: { approvalId: approval.id } });
  auditCreate(uow, actor2, "MergeCase", mergeCase.id, "merge.proposed", { survivorId: input.survivorId, mergedId: input.mergedId }, { reason: input.reason });
  return { mergeCase, approvalId: approval.id };
}
async function proposeMerge(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  const reason = requireText(args.reason, "reason");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.merge_propose", actor: actor2, idempotencyKey, params }, async (uow) => {
    const survivorId = await resolvePatientRef(uow.tx, args.survivorId);
    const mergedId = await resolvePatientRef(uow.tx, args.mergedId);
    await assertPatientInScope(uow.tx, locationIds, survivorId);
    await assertPatientInScope(uow.tx, locationIds, mergedId);
    const { mergeCase, approvalId } = await proposeMergeIn(uow, actor2, { survivorId, mergedId, reason, evidence: { proposedBy: "staff" } });
    return { mergeCaseId: mergeCase.id, approvalId, status: mergeCase.status };
  });
  return { replay: result.replay, ...result.value };
}
async function applyMergeIn(uow, actor2, mergeCaseId, approverId) {
  const mergeCase = await lockRow(uow.tx, "MergeCase", mergeCaseId);
  if (mergeCase.status !== "proposed" && mergeCase.status !== "approved") throw new DomainError(Codes.INVALID_TRANSITION, `A ${mergeCase.status} merge can't be applied.`, { currentStatus: mergeCase.status });
  const { survivorId, mergedId } = mergeCase;
  await lockResourcesForMerge(uow.tx, survivorId, mergedId);
  const merged = await lockRow(uow.tx, "Patient", mergedId);
  const survivor = await lockRow(uow.tx, "Patient", survivorId);
  if (merged.status === "merged_into" || survivor.status === "merged_into") throw new DomainError(Codes.GUARD_FAILED, "One of these records was already merged.");
  if (mergeCase.status === "proposed") await transition(uow, { model: "MergeCase", id: mergeCaseId, from: ["proposed"], to: "approved", actor: actor2, eventType: "merge.approved", approverId });
  let seq = 0;
  const entries = [];
  const survivorPrimary = new Set((await uow.tx.contactPoint.findMany({ where: { patientId: survivorId, isPrimary: true, isActive: true }, select: { kind: true } })).map((c) => c.kind));
  for (const { list: list11, field } of MERGE_CHILDREN) {
    const rows = await delegateOf(uow.tx, list11).findMany({ where: { [field]: mergedId }, select: { id: true, ...list11 === "ContactPoint" ? { kind: true, isPrimary: true, isActive: true } : {} } });
    for (const row of rows) {
      if (list11 === "ContactPoint" && row.isPrimary && row.isActive && survivorPrimary.has(row.kind)) {
        await uow.tx.contactPoint.update({ where: { id: row.id }, data: { isPrimary: false } });
        entries.push({ listKey: list11, rowId: row.id, field: "isPrimary", fromId: "true", toId: "false", seq: seq++ });
      }
      try {
        await delegateOf(uow.tx, list11).update({ where: { id: row.id }, data: { [field]: survivorId } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/exclusion constraint|unique constraint|Unique constraint/i.test(message)) throw new DomainError(Codes.MERGE_CONFLICT, `The two records have conflicting ${list11 === "Appointment" ? "overlapping appointments" : list11} rows. Resolve them before merging.`);
        throw error;
      }
      entries.push({ listKey: list11, rowId: row.id, field, fromId: mergedId, toId: survivorId, seq: seq++ });
    }
  }
  if (entries.length) await uow.tx.mergeMap.createMany({ data: entries.map((e) => ({ ...e, mergeCaseId })) });
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { mergeRevertDays: true } });
  const revertibleUntil = new Date(uow.now.getTime() + (practice?.mergeRevertDays ?? 30) * 864e5);
  await uow.tx.patient.update({ where: { id: mergedId }, data: { status: "merged_into", mergedIntoId: survivorId, version: { increment: 1 } } });
  uow.audit({ eventType: "patient.merged_into", entityType: "Patient", entityId: mergedId, actorUserId: actor2.kind === "user" ? actor2.userId : null, approverId, before: { status: merged.status }, after: { status: "merged_into", mergedIntoId: survivorId } });
  const applied = await transition(uow, { model: "MergeCase", id: mergeCaseId, from: ["approved"], to: "applied", actor: actor2, eventType: "merge.applied", approverId, data: { appliedAt: uow.now, revertibleUntil, mergedStatusBefore: merged.status }, metadata: { moved: entries.length } });
  return { mergeCaseId: applied.id, status: applied.status, moved: entries.length, revertibleUntil: revertibleUntil.toISOString() };
}
async function lockResourcesForMerge(tx, a, b) {
  for (const id of [a, b].sort()) await advisoryLock(tx, `patient:${id}`);
}
registerApplier("patient.merge", async (uow, actor2, request) => {
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: "approve" }, orderBy: { at: "desc" } });
  return applyMergeIn(uow, actor2, String(request.payload.mergeCaseId), decision?.decidedById ?? null);
}, { applyOnApprove: true });
async function revertMerge(_root, args, context) {
  const { actor: actor2 } = staff(context);
  requirePermission(actor2, "canApprovePatientMerge", "canManagePatients");
  const reason = requireText(args.reason, "reason");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "patient.merge_revert", actor: actor2, idempotencyKey, params }, async (uow) => revertMergeIn(uow, actor2, args.mergeCaseId, reason, args.expectedVersion));
  return { replay: result.replay, ...result.value };
}
async function revertMergeIn(uow, actor2, mergeCaseId, reason, expectedVersion) {
  const mergeCase = await lockRow(uow.tx, "MergeCase", mergeCaseId);
  if (mergeCase.status !== "applied") throw new DomainError(Codes.INVALID_TRANSITION, `A ${mergeCase.status} merge can't be reverted.`, { currentStatus: mergeCase.status });
  if (!mergeCase.revertibleUntil || mergeCase.revertibleUntil.getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "The revert window has passed; this merge is permanent.");
  await lockResourcesForMerge(uow.tx, mergeCase.survivorId, mergeCase.mergedId);
  const entries = await uow.tx.mergeMap.findMany({ where: { mergeCaseId }, orderBy: { seq: "desc" } });
  for (const e of entries) {
    const delegate = delegateOf(uow.tx, e.listKey);
    if (e.field === "isPrimary") {
      await delegate.update({ where: { id: e.rowId }, data: { isPrimary: e.fromId === "true" } });
      continue;
    }
    const row = await delegate.findUnique({ where: { id: e.rowId }, select: { id: true, [e.field]: true } });
    if (!row || row[e.field] !== e.toId) continue;
    await delegate.update({ where: { id: e.rowId }, data: { [e.field]: e.fromId } });
  }
  await uow.tx.patient.update({ where: { id: mergeCase.mergedId }, data: { status: mergeCase.mergedStatusBefore || "active", mergedIntoId: null, version: { increment: 1 } } });
  uow.audit({ eventType: "patient.unmerged", entityType: "Patient", entityId: mergeCase.mergedId, actorUserId: actor2.kind === "user" ? actor2.userId : null, reason, after: { status: mergeCase.mergedStatusBefore || "active" } });
  const reverted = await transition(uow, { model: "MergeCase", id: mergeCaseId, from: ["applied"], to: "reverted", expectedVersion, actor: actor2, eventType: "merge.reverted", reason, data: { revertedAt: uow.now } });
  return { mergeCaseId: reverted.id, status: reverted.status, restored: entries.length };
}

// features/keystone/mutations/public.ts
var import_node_crypto11 = require("node:crypto");

// features/keystone/security/publicRateLimit.ts
var import_node_crypto10 = require("node:crypto");

// features/keystone/security/rateLimit.ts
var import_node_crypto9 = require("node:crypto");
var import_graphql3 = require("graphql");

// features/keystone/security/internalIdentity.ts
var import_node_crypto8 = require("node:crypto");
var INTERNAL_IDENTITY_MAX_AGE_MS = 9e4;
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && (0, import_node_crypto8.timingSafeEqual)(leftBuffer, rightBuffer);
}
function verifiedInternalIdentity(headers, socketAddress, secret4, now) {
  const loopback = /^(?:127\.|::1$|::ffff:127\.)/.test(String(socketAddress || ""));
  if (!loopback || secret4.length < 32) return null;
  const identity = String(headers["x-openfront-client-identity"] || "");
  const timestamp10 = String(headers["x-openfront-client-timestamp"] || "");
  const signature = String(headers["x-openfront-client-signature"] || "");
  if (!/^[a-f0-9]{64}$/.test(identity) || !/^\d{10}$/.test(timestamp10) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const age = Math.abs(now - Number(timestamp10) * 1e3);
  if (!Number.isFinite(age) || age > INTERNAL_IDENTITY_MAX_AGE_MS) return null;
  const expected = (0, import_node_crypto8.createHmac)("sha256", secret4).update(`${timestamp10}:${identity}`).digest("hex");
  return safeEqual(signature, expected) ? `forwarded:${identity}` : null;
}

// features/keystone/security/rateLimit.ts
var LIMITS = {
  /** Per client address (or verified forwarded identity). */
  client: { max: 30, windowMs: 15 * 6e4 },
  /** Per account (email or signed-in user), across all addresses. */
  account: { max: 10, windowMs: 15 * 6e4 }
};
async function hit(prisma, key, limit, now = /* @__PURE__ */ new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / limit.windowMs) * limit.windowMs);
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO "RateLimitBucket" ("id", "key", "windowStart", "count", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 1, $4, $4)
     ON CONFLICT ("key") DO UPDATE SET
       "count" = CASE WHEN "RateLimitBucket"."windowStart" = EXCLUDED."windowStart" THEN "RateLimitBucket"."count" + 1 ELSE 1 END,
       "windowStart" = EXCLUDED."windowStart",
       "updatedAt" = EXCLUDED."updatedAt"
     RETURNING "count"`,
    (0, import_node_crypto9.randomUUID)(),
    key,
    windowStart,
    now
  );
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= limit.max, count, retryAfterSeconds: Math.ceil((windowStart.getTime() + limit.windowMs - now.getTime()) / 1e3) };
}
function clientKey(req, secret4, now = Date.now()) {
  const headers = req?.headers ?? {};
  const socket = req?.socket?.remoteAddress ?? null;
  const forwarded = verifiedInternalIdentity(headers, socket, secret4, now);
  if (forwarded) return forwarded;
  const edge = process.env.RAILWAY_ENVIRONMENT ? String(headers["x-real-ip"] || "").split(",")[0].trim() : "";
  return `addr:${edge || socket || "unknown"}`;
}

// features/keystone/security/publicRateLimit.ts
var DEFAULT_PUBLIC_LIMITS = { perClientPerHour: 30, perContactPerDay: 5, globalPerMinute: 120 };
var keyHash = (value) => (0, import_node_crypto10.createHash)("sha256").update(value).digest("hex").slice(0, 40);
var secret2 = () => process.env.SESSION_SECRET || "local-development-session-secret-change-me-now";
var clientFingerprint = (req) => (0, import_node_crypto10.createHmac)("sha256", secret2()).update(clientKey(req, secret2())).digest("hex").slice(0, 32);
var userAgentFingerprint = (req) => (0, import_node_crypto10.createHmac)("sha256", secret2()).update(String(req?.headers?.["user-agent"] ?? "")).digest("hex").slice(0, 32);
function limitsFrom(json9) {
  const value = json9 && typeof json9 === "object" ? json9 : {};
  const pick = (n, fallback, max) => Number.isInteger(n) && Number(n) > 0 ? Math.min(Number(n), max) : fallback;
  return {
    perClientPerHour: pick(value.perClientPerHour, DEFAULT_PUBLIC_LIMITS.perClientPerHour, 1e3),
    perContactPerDay: pick(value.perContactPerDay, DEFAULT_PUBLIC_LIMITS.perContactPerDay, 100),
    globalPerMinute: pick(value.globalPerMinute, DEFAULT_PUBLIC_LIMITS.globalPerMinute, 1e4)
  };
}
async function enforcePublicLimit(prisma, input) {
  const limits = input.limits ?? DEFAULT_PUBLIC_LIMITS;
  const now = input.now ?? /* @__PURE__ */ new Date();
  const checks = [
    [`public:global:${input.scope}`, { max: limits.globalPerMinute, windowMs: 6e4 }],
    [`public:client:${input.scope}:${keyHash(clientKey(input.req, secret2()))}`, { max: limits.perClientPerHour, windowMs: 36e5 }],
    ...(input.contacts ?? []).filter(Boolean).map((c) => [`public:contact:${input.scope}:${keyHash(c.toLowerCase())}`, { max: limits.perContactPerDay, windowMs: 864e5 }])
  ];
  let refused = null;
  try {
    for (const [key, limit] of checks) {
      const result = await hit(prisma, key, limit, now);
      if (!result.allowed) refused = Math.max(refused ?? 0, result.retryAfterSeconds);
    }
  } catch {
    refused = 60;
  }
  if (refused !== null) throw new DomainError(Codes.RATE_LIMITED, `Too many requests. Try again in ${Math.max(1, Math.ceil(refused / 60))} minutes.`, { reason: "rate_limited" });
}
async function verifyCaptcha(token, fetchImpl = fetch) {
  const key = process.env.TURNSTILE_SECRET_KEY;
  if (!key) return { ok: true, score: "not_configured" };
  if (!token) return { ok: false, score: "missing" };
  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: key, response: token }) });
    const body = await response.json();
    return { ok: body.success === true, score: body.success ? "passed" : "failed" };
  } catch {
    return { ok: false, score: "unreachable" };
  }
}

// features/keystone/mutations/public.ts
var actor = systemActor("public-booking");
var sha = (value) => (0, import_node_crypto11.createHash)("sha256").update(value).digest("hex");
async function siteAndPolicy(db, slug, locationId) {
  const site = await db.storefrontSite.findUnique({ where: { slug: String(slug ?? "") }, include: { location: true } });
  if (!site || !site.isPublished) throw new DomainError(Codes.NOT_FOUND, "Practice not found.");
  const location = locationId ?? site.locationId;
  if (!location) throw new DomainError(Codes.INVALID_INPUT, "Choose a location.", { field: "locationId" });
  if (site.locationId && site.locationId !== location) throw new DomainError(Codes.NOT_FOUND, "Location not found.");
  const policy = await db.onlineBookingPolicy.findFirst({ where: { locationId: location, isActive: true }, include: { appointmentTypes: { select: { id: true } }, location: { select: { id: true, name: true, timeZone: true, isActive: true, isSynthetic: true } } } });
  if (!policy || !policy.location?.isActive) throw new DomainError(Codes.NOT_FOUND, "Online booking is not available at this location.");
  return { site, policy, limits: limitsFrom(policy.rateLimit) };
}
function assertTypeAllowed(policy, typeId) {
  if (!policy.appointmentTypes.some((t) => t.id === typeId)) throw new DomainError(Codes.INVALID_INPUT, "That visit type can\u2019t be booked online.", { field: "typeId" });
}
async function publicSite(_root, args, context) {
  await enforcePublicLimit(context.prisma, { scope: "site", req: context.req });
  const site = await context.prisma.storefrontSite.findUnique({ where: { slug: String(args.slug ?? "") }, include: { providersShown: { where: { isActive: true }, select: { id: true, displayName: true, providerType: true, specialty: true } } } });
  if (!site || !site.isPublished) throw new DomainError(Codes.NOT_FOUND, "Practice not found.");
  const practice = await context.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { displayName: true, isSynthetic: true } });
  const locations = await context.prisma.location.findMany({
    where: { isActive: true, ...site.locationId ? { id: site.locationId } : {} },
    select: { id: true, name: true, address: true, phone: true, timeZone: true, hours: true },
    orderBy: { name: "asc" }
  });
  const policies = await context.prisma.onlineBookingPolicy.findMany({
    where: { isActive: true, locationId: { in: locations.map((l) => l.id) } },
    include: { appointmentTypes: { where: { isActive: true, onlineBookable: true }, select: { id: true, name: true, publicName: true, category: true, defaultPattern: true, newPatientOnly: true } } }
  });
  const unit = (await context.prisma.practiceSettings.findUnique({ where: { id: 1 }, select: { scheduleUnitMinutes: true } }))?.scheduleUnitMinutes ?? 10;
  return {
    slug: site.slug,
    headline: site.headline,
    about: site.about,
    services: site.services,
    seo: site.seo,
    brand: site.brand,
    practiceName: practice?.displayName ?? "",
    sample: practice?.isSynthetic ? "Sample practice: synthetic data" : null,
    providers: site.providersShown.map((p) => ({ id: p.id, name: p.displayName, kind: p.providerType, specialty: p.specialty })),
    locations: locations.map((l) => {
      const policy = policies.find((p) => p.locationId === l.id);
      return {
        ...l,
        onlineBooking: policy ? {
          newPatientAllowed: policy.newPatientAllowed,
          leadTimeHours: policy.leadTimeHours,
          horizonDays: policy.horizonDays,
          holdMinutes: policy.holdMinutes,
          depositMinor: String(policy.depositMinor ?? 0n),
          requireInsuranceCapture: policy.requireInsuranceCapture,
          visitTypes: policy.appointmentTypes.map((t) => ({ id: t.id, name: t.publicName || t.name, category: t.category, minutes: minutesOf2(t.defaultPattern, unit), newPatientOnly: t.newPatientOnly }))
        } : null
      };
    })
  };
}
async function publicAvailability(_root, args, context) {
  const { policy, limits } = await siteAndPolicy(context.prisma, args.slug, args.locationId);
  await enforcePublicLimit(context.prisma, { scope: "availability", req: context.req, limits });
  assertTypeAllowed(policy, args.typeId);
  const today2 = localDate(policy.location.timeZone, /* @__PURE__ */ new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(args.fromDate)) && args.fromDate > today2 ? args.fromDate : today2;
  const lastDay = addDays(today2, policy.horizonDays);
  if (from > lastDay) return { slots: [], durationMinutes: 0 };
  const result = await availability(context.prisma, {
    locationId: policy.locationId,
    typeId: args.typeId,
    fromDate: from,
    days: Math.min(Number(args.days ?? 7), 14),
    providerId: args.providerId,
    onlineOnly: true,
    leadMinutes: policy.leadTimeHours * 60,
    limit: 120,
    horizonDays: 14
  });
  return {
    durationMinutes: result.durationMinutes,
    slots: result.slots.filter((s) => s.localDate <= lastDay).map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, operatoryId: s.operatoryId, providerId: s.providerId, localDate: s.localDate }))
  };
}
async function publicHoldSlot(_root, args, context) {
  const { policy, limits } = await siteAndPolicy(context.prisma, args.slug, args.locationId);
  await enforcePublicLimit(context.prisma, { scope: "hold", req: context.req, limits });
  assertTypeAllowed(policy, args.typeId);
  const captcha = await verifyCaptcha(args.captchaToken);
  if (!captcha.ok) throw new DomainError(Codes.GUARD_FAILED, "Please complete the verification and try again.", { reason: "captcha" });
  const startsAt = new Date(String(args.startsAt));
  if (Number.isNaN(startsAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, "Choose a time.", { field: "startsAt" });
  if (startsAt.getTime() < Date.now() + policy.leadTimeHours * 36e5) throw new DomainError(Codes.OUTSIDE_TEMPLATE, "That time is too soon to book online. Please call the office.");
  const token = (0, import_node_crypto11.randomBytes)(24).toString("base64url");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "public.hold", actor, idempotencyKey: `public-hold:${sha(`${idempotencyKey}:${clientFingerprint(context.req)}`).slice(0, 48)}`, params: { ...params, captchaToken: void 0 } }, async (uow) => {
    const { hold } = await placeHold(uow, actor, {
      locationId: policy.locationId,
      operatoryId: args.operatoryId,
      typeId: args.typeId,
      startsAt: args.startsAt,
      providerId: args.providerId,
      holderKind: "public_api",
      holderRef: `public:${sha(token)}`,
      minutes: policy.holdMinutes,
      onlineOnly: true,
      isSynthetic: policy.location.isSynthetic
    });
    return { holdId: hold.id, expiresAt: hold.expiresAt.toISOString(), startsAt: hold.startsAt.toISOString(), endsAt: hold.endsAt.toISOString(), tokenHash: sha(token) };
  });
  return { replay: result.replay, holdId: result.value.holdId, expiresAt: result.value.expiresAt, startsAt: result.value.startsAt, endsAt: result.value.endsAt, holdToken: result.replay ? null : token };
}
async function publicSubmitBooking(_root, args, context) {
  const hold = await context.prisma.bookingHold.findUnique({ where: { id: String(args.holdId ?? "") }, select: { locationId: true } });
  const { site, policy, limits } = await siteAndPolicy(context.prisma, args.slug, hold?.locationId);
  const contact = args.contact ?? {};
  const email = contact.email ? normalizeContact("email", contact.email) : null;
  const phone = contact.phone ? normalizeContact("mobile", contact.phone) : null;
  if (!email && !phone) throw new DomainError(Codes.INVALID_INPUT, "Enter an email address or mobile number.", { field: "contact" });
  await enforcePublicLimit(context.prisma, { scope: "submit", req: context.req, limits, contacts: [email?.normalized ?? "", phone?.normalized ?? ""] });
  const captcha = await verifyCaptcha(args.captchaToken);
  if (!captcha.ok) throw new DomainError(Codes.GUARD_FAILED, "Please complete the verification and try again.", { reason: "captcha" });
  if (!hold) throw new DomainError(Codes.HOLD_EXPIRED, "That time is no longer held. Please pick a time again.");
  if (policy.requireInsuranceCapture && !args.insuranceCapture) throw new DomainError(Codes.INVALID_INPUT, 'Add your insurance details, or choose "I don\u2019t have dental insurance".', { field: "insuranceCapture" });
  const holderRef = `public:${sha(String(args.holdToken ?? ""))}`;
  const fingerprint = clientFingerprint(context.req);
  const result = await command(context.prisma, { name: "public.submit", actor, idempotencyKey: `public-submit:${sha(`${args.idempotencyKey}:${args.holdId}`).slice(0, 48)}`, params: { holdId: args.holdId, holderRef } }, async (uow) => {
    const held = await uow.tx.bookingHold.findUnique({ where: { id: args.holdId } });
    if (!held || !safeEqual2(held.holderRef, holderRef)) throw new DomainError(Codes.HOLD_EXPIRED, "That time is no longer held. Please pick a time again.");
    const firstName = requireText(contact.firstName, "first name", 100);
    const lastName = requireText(contact.lastName, "last name", 100);
    const candidates = await findDuplicates(uow.tx, { firstName, lastName, dateOfBirth: String(contact.dateOfBirth ?? ""), contacts: [email?.normalized ?? "", phone?.normalized ?? ""] });
    const strong = candidates.filter((c) => c.evidence.includes("shared_contact") && (c.evidence.includes("similar_name") || c.evidence.includes("same_last_name")));
    let matchStatus;
    let patientId;
    if (strong.length === 1) {
      matchStatus = "matched";
      patientId = strong[0].patientId;
      const existing = await uow.tx.patient.findUniqueOrThrow({ where: { id: patientId }, select: { status: true } });
      if (!["prospect", "active", "inactive"].includes(existing.status)) throw new DomainError(Codes.GUARD_FAILED, "We couldn\u2019t book this online. Please call the office.");
    } else {
      if (!policy.newPatientAllowed && !candidates.length) throw new DomainError(Codes.GUARD_FAILED, "This location isn\u2019t taking new patients online. Please call the office.");
      matchStatus = candidates.length ? "possible_duplicate" : "new_patient";
      const created = await createPatientIn(uow, actor, {
        firstName,
        lastName,
        dateOfBirth: String(contact.dateOfBirth ?? ""),
        homeLocationId: policy.locationId,
        contacts: [...email ? [{ kind: "email", value: email.value, isPrimary: true }] : [], ...phone ? [{ kind: "mobile", value: phone.value, isPrimary: true }] : []],
        isSynthetic: policy.location.isSynthetic
      });
      patientId = created.id;
    }
    const appointment = await createAppointment(uow, actor, {
      locationId: held.locationId,
      operatoryId: held.operatoryId,
      typeId: held.typeId,
      startsAt: held.startsAt.toISOString(),
      providerId: held.providerId,
      patientId,
      holdId: held.id,
      holderRef,
      source: "online_booking",
      note: "Booked online",
      isSynthetic: policy.location.isSynthetic
    });
    const points = await uow.tx.contactPoint.findMany({ where: { patientId, isActive: true, valueNormalized: { in: [email?.normalized ?? "", phone?.normalized ?? ""].filter(Boolean) } } });
    const evidence = { form: "online_booking", siteSlug: site.slug, clientHash: fingerprint, at: uow.now.toISOString() };
    for (const p of points) {
      if (p.kind === "email" && contact.emailReminders !== false) await grantConsentIn(uow, actor, { contactPointId: p.id, channel: "email", purpose: "appointment_reminders", source: "intake_form", evidence });
      if (p.kind === "mobile" && contact.smsConsent === true) await grantConsentIn(uow, actor, { contactPointId: p.id, channel: "sms", purpose: "appointment_reminders", source: "intake_form", evidence });
    }
    const publicRef = publicCode("BK");
    await uow.tx.publicBookingRequest.create({
      data: {
        siteId: site.id,
        locationId: held.locationId,
        publicRef,
        holdId: held.id,
        contact: { firstName, lastName, email: email?.normalized ?? "", phone: phone?.normalized ?? "", dateOfBirth: contact.dateOfBirth },
        patientMatchId: patientId,
        matchStatus,
        matchEvidence: { candidates: candidates.map((c) => ({ chartNumber: c.chartNumber, evidence: c.evidence, score: c.score })) },
        intake: args.intake ?? {},
        insuranceCapture: args.insuranceCapture ?? {},
        appointmentId: appointment.id,
        status: "booked",
        ipHash: fingerprint,
        userAgentHash: userAgentFingerprint(context.req),
        captchaScore: captcha.score,
        isSynthetic: policy.location.isSynthetic
      }
    });
    uow.emit({ topic: "notify.staff", aggregateType: "PublicBookingRequest", aggregateId: publicRef, payload: { kind: "online_booking", matchStatus, locationId: held.locationId }, dedupeKey: `notify.staff:online_booking:${publicRef}` });
    return { publicRef, status: "booked", startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString(), locationName: policy.location.name };
  });
  return { replay: result.replay, ...result.value };
}
function safeEqual2(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && (0, import_node_crypto11.timingSafeEqual)(left, right);
}
function minutesOf2(pattern, unit) {
  try {
    return patternUnits(parsePattern(pattern)) * unit;
  } catch {
    return null;
  }
}
async function reviewBookingRequest(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManageSchedule");
  if (!["accept", "link", "reject_spam"].includes(args.decision)) throw new DomainError(Codes.INVALID_INPUT, "Choose accept, link or reject.", { field: "decision" });
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "booking_request.review", actor: actor2, idempotencyKey, params }, async (uow) => {
    const request = await uow.tx.publicBookingRequest.findUnique({ where: { id: args.requestId } });
    if (!request) throw new DomainError(Codes.NOT_FOUND, "Booking request not found.");
    assertLocation(locationIds, request.locationId);
    if (request.reviewedAt) throw new DomainError(Codes.INVALID_TRANSITION, "This request was already reviewed.", { currentStatus: request.status });
    const note = optionalText(args.note, 2e3) ?? "";
    let status = request.status;
    let mergeCaseId = null;
    if (args.decision === "reject_spam") {
      if (request.appointmentId) {
        const appointment = await uow.tx.appointment.findUnique({ where: { id: request.appointmentId }, select: { status: true } });
        if (appointment && ["scheduled", "confirmed"].includes(appointment.status)) await withdrawIn(uow, actor2, request.appointmentId, "online booking rejected as spam");
      }
      if (request.patientMatchId && request.matchStatus !== "matched") {
        const prospect = await uow.tx.patient.findUnique({ where: { id: request.patientMatchId }, select: { status: true } });
        if (prospect?.status === "prospect") await transition(uow, { model: "Patient", id: request.patientMatchId, from: ["prospect"], to: "archived", actor: actor2, eventType: "patient.archived", reason: "online booking rejected as spam" });
      }
      status = "rejected_spam";
    } else if (args.decision === "link") {
      if (!args.existingPatientId || !request.patientMatchId) throw new DomainError(Codes.INVALID_INPUT, "Choose the existing patient.", { field: "existingPatientId" });
      const existingId = await resolvePatientRef(uow.tx, args.existingPatientId);
      if (existingId === request.patientMatchId) throw new DomainError(Codes.INVALID_INPUT, "That is the record the booking is already on.", { field: "existingPatientId" });
      await assertPatientInScope(uow.tx, locationIds, existingId);
      const proposed = await proposeMergeIn(uow, actor2, { survivorId: existingId, mergedId: request.patientMatchId, reason: `Online booking ${request.publicRef} is the same person${note ? `: ${note}` : ""}` });
      mergeCaseId = proposed.mergeCase.id;
    }
    const updated = await transition(uow, {
      model: "PublicBookingRequest",
      id: request.id,
      from: [request.status],
      to: status,
      expectedVersion: args.expectedVersion,
      actor: actor2,
      eventType: `booking_request.${args.decision}`,
      reason: note || args.decision,
      data: { reviewedAt: uow.now, reviewedById: actor2.kind === "user" ? actor2.userId : null, reviewNote: note }
    });
    return { requestId: updated.id, status: updated.status, version: updated.version, mergeCaseId };
  });
  return { replay: result.replay, ...result.value };
}

// features/keystone/mutations/portal.ts
var import_node_crypto13 = require("node:crypto");

// features/keystone/security/phiReadAudit.ts
var import_node_crypto12 = require("node:crypto");
var import_graphql4 = require("graphql");
function referenceToken(secret4, list11, id) {
  if (!secret4 || secret4.length < 32) throw new Error("A strong PHI audit reference secret (SESSION_SECRET) is required.");
  return (0, import_node_crypto12.createHmac)("sha256", secret4).update(`${list11}\0${id}`).digest("hex");
}
async function recordPhiReadAudit(prisma, actor2, descriptor) {
  await prisma.phiReadAudit.create({
    data: {
      actorUserId: actor2.userId ?? null,
      actorAgentId: actor2.agentId ?? null,
      actorReference: actor2.userId ? `user:${actor2.userId}` : actor2.agentId ? `agent:${actor2.agentId}` : "system",
      purpose: actor2.purpose ?? "operations",
      operationType: descriptor.operationType,
      operationName: descriptor.operationName.slice(0, 200),
      listKeys: descriptor.listKeys,
      tiers: descriptor.tiers,
      fields: descriptor.fields,
      fieldSetDigest: descriptor.fieldSetDigest,
      recordCount: descriptor.recordCount,
      recordIdsDigest: descriptor.recordIdsDigest,
      resourceReferences: descriptor.resourceReferences,
      breakGlassId: actor2.breakGlassId ?? null,
      success: descriptor.success,
      correlationReference: actor2.correlationReference ?? "",
      at: /* @__PURE__ */ new Date()
    }
  });
}
async function recordDirectPhiRead(prisma, actor2, input, secret4 = process.env.SESSION_SECRET || "") {
  const refs = input.ids.map((id) => ({ list: input.list, ref: referenceToken(secret4, input.list, id) }));
  const fields = input.fields.map((f) => `${input.list}.${f}`).sort();
  await recordPhiReadAudit(prisma, actor2, {
    operationType: "query",
    operationName: input.operationName,
    listKeys: [input.list],
    tiers: [...new Set(input.tiers)].sort(),
    fields,
    fieldSetDigest: (0, import_node_crypto12.createHash)("sha256").update(fields.join("\n")).digest("hex"),
    recordCount: refs.length,
    recordIdsDigest: refs.length ? (0, import_node_crypto12.createHash)("sha256").update(refs.map((r) => `${r.list}:${r.ref}`).join("\0")).digest("hex") : "",
    resourceReferences: refs,
    success: true
  });
}

// features/keystone/mutations/portal.ts
var CODE_TTL_MS = 10 * 6e4;
var CODE_MAX_FAILURES = 5;
var TOKEN_TTL_MS = 2 * 36e5;
var TOKEN_HEADER = "x-portal-token";
var secret3 = () => {
  const value = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-development-session-secret-change-me-now");
  if (value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return value;
};
var mac = (purpose, value) => (0, import_node_crypto13.createHmac)("sha256", secret3()).update(`${purpose}\0${value}`).digest("base64url");
var portalActor = (accountId) => systemActor(`portal:${accountId}`);
function equal(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && (0, import_node_crypto13.timingSafeEqual)(left, right);
}
async function issuePortalCode(db, email, now = /* @__PURE__ */ new Date()) {
  const normalized = normalizeContact("email", email).normalized;
  const account = await db.portalAccount.findUnique({ where: { email: normalized } });
  if (!account || !["invited", "active"].includes(account.status)) return null;
  const code = String((0, import_node_crypto13.randomInt)(0, 1e6)).padStart(6, "0");
  await db.portalAccount.update({ where: { id: account.id }, data: { codeHash: mac("portal-code", `${account.id}:${code}`), codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS), codeFailures: 0 } });
  return { accountId: account.id, code, email: normalized };
}
async function portalRequestCode(_root, args, context) {
  const email = normalizeContact("email", args.email).normalized;
  await enforcePublicLimit(context.prisma, { scope: "portal-code", req: context.req, contacts: [email] });
  const issued = await issuePortalCode(context.prisma, email);
  if (issued) {
    await command(context.prisma, { name: "portal.code_sent", actor: portalActor(issued.accountId), idempotencyKey: `portal-code:${issued.accountId}:${Date.now()}`, params: { accountId: issued.accountId } }, async (uow) => {
      uow.emit({ topic: "message.send", aggregateType: "PortalAccount", aggregateId: issued.accountId, payload: { kind: "portal_code", to: issued.email, code: issued.code }, dedupeKey: `portal_code:${issued.accountId}:${uow.now.getTime()}` });
      uow.audit({ eventType: "portal.code_sent", entityType: "PortalAccount", entityId: issued.accountId });
      return null;
    });
  }
  return { sent: true };
}
async function portalSession(_root, args, context) {
  const email = normalizeContact("email", args.email).normalized;
  await enforcePublicLimit(context.prisma, { scope: "portal-session", req: context.req, contacts: [email] });
  const invalid = () => new DomainError(Codes.PORTAL_SESSION_INVALID, "That code is not valid. Request a new one.");
  const now = /* @__PURE__ */ new Date();
  const account = await context.prisma.portalAccount.findUnique({ where: { email } });
  if (!account || !["invited", "active"].includes(account.status) || !account.codeHash || !account.codeExpiresAt || account.codeExpiresAt.getTime() <= now.getTime()) throw invalid();
  const presented = mac("portal-code", `${account.id}:${String(args.code ?? "").trim()}`);
  if (!equal(presented, account.codeHash)) {
    const failures = Number(account.codeFailures ?? 0) + 1;
    await context.prisma.portalAccount.update({ where: { id: account.id }, data: failures >= CODE_MAX_FAILURES ? { codeHash: null, codeExpiresAt: null, codeFailures: failures } : { codeFailures: failures } });
    throw invalid();
  }
  const result = await command(context.prisma, { name: "portal.sign_in", actor: portalActor(account.id), idempotencyKey: `portal-sign-in:${account.id}:${presented.slice(0, 16)}`, params: { accountId: account.id } }, async (uow) => {
    const updated = await uow.tx.portalAccount.updateMany({ where: { id: account.id, codeHash: account.codeHash }, data: { codeHash: null, codeExpiresAt: null, codeFailures: 0, lastLoginAt: uow.now, status: "active", identityVerifiedAt: account.identityVerifiedAt ?? uow.now, version: { increment: 1 } } });
    if (updated.count !== 1) throw invalid();
    uow.audit({ eventType: "portal.signed_in", entityType: "PortalAccount", entityId: account.id });
    return { accountId: account.id };
  });
  if (result.replay) throw invalid();
  return { token: signPortalToken({ accountId: account.id, authVersion: Number(account.authVersion ?? 1) }, now), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString() };
}
function signPortalToken(claims, now = /* @__PURE__ */ new Date()) {
  const body = Buffer.from(JSON.stringify({ a: claims.accountId, v: claims.authVersion, e: now.getTime() + TOKEN_TTL_MS })).toString("base64url");
  return `pt1.${body}.${mac("portal-token", body)}`;
}
function readToken(token, now = Date.now()) {
  const [prefix, body, signature] = String(token ?? "").split(".");
  if (prefix !== "pt1" || !body || !signature || !equal(mac("portal-token", body), signature)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!claims.a || !Number.isFinite(claims.e) || claims.e <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
var ageOn2 = (dob, at) => {
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || m === 0 && at.getUTCDate() < dob.getUTCDate()) age -= 1;
  return age;
};
async function portalPrincipal(context, now = /* @__PURE__ */ new Date()) {
  const header = context.req?.headers?.[TOKEN_HEADER];
  const claims = readToken(Array.isArray(header) ? header[0] : header, now.getTime());
  if (!claims) throw new DomainError(Codes.PORTAL_SESSION_INVALID, "Your session has ended. Sign in again.");
  const account = await context.prisma.portalAccount.findUnique({ where: { id: claims.a }, select: { id: true, status: true, authVersion: true } });
  if (!account || account.status !== "active" || Number(account.authVersion ?? 1) !== Number(claims.v)) throw new DomainError(Codes.PORTAL_SESSION_INVALID, "Your session has ended. Sign in again.");
  const scopes = await context.prisma.portalScope.findMany({
    where: { accountId: account.id, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    include: { patient: { select: { id: true, status: true, dateOfBirth: true, homeLocation: { select: { jurisdiction: { select: { rules: true } } } } } } }
  });
  const valid = scopes.filter((s) => {
    if (!s.patient || ["merged_into", "archived"].includes(s.patient.status)) return false;
    if (!s.validUntilMajority) return true;
    let majority = 18;
    try {
      if (s.patient.homeLocation?.jurisdiction?.rules) majority = parsePackRules(s.patient.homeLocation.jurisdiction.rules).retention.value.majorityAge;
    } catch {
      majority = 18;
    }
    return ageOn2(s.patient.dateOfBirth, now) < majority;
  });
  return { accountId: account.id, scopes: valid.map((s) => ({ id: s.id, patientId: s.patientId, relationship: s.relationship, capabilities: Array.isArray(s.capabilities) ? s.capabilities : [], confidentialItemsHidden: s.confidentialItemsHidden })) };
}
function assertPortalScope(principal, patientId, capability) {
  const scope = principal.scopes.find((s) => s.patientId === patientId);
  if (!scope || !scope.capabilities.includes(capability)) throw new DomainError(Codes.PORTAL_SCOPE_DENIED, "You don\u2019t have access to that.");
  return scope;
}
async function auditPortalRead(context, principal, operationName, list11, ids, fields) {
  await recordDirectPhiRead(context.prisma, { purpose: "patient_request", correlationReference: `portal:${principal.accountId}` }, { operationName, list: list11, ids, fields, tiers: ["dem"] });
}
async function portalMe(_root, _args, context) {
  const principal = await portalPrincipal(context);
  const patients = await context.prisma.patient.findMany({ where: { id: { in: principal.scopes.map((s) => s.patientId) } }, select: { id: true, firstName: true, preferredName: true } });
  await auditPortalRead(context, principal, "portalMe", "Patient", patients.map((p) => p.id), ["firstName", "preferredName"]);
  return {
    people: principal.scopes.map((s) => {
      const p = patients.find((x) => x.id === s.patientId);
      return { patientId: s.patientId, name: p?.preferredName || p?.firstName || "", relationship: s.relationship, capabilities: s.capabilities };
    })
  };
}
async function portalAppointments(_root, args, context) {
  const principal = await portalPrincipal(context);
  assertPortalScope(principal, args.patientId, "appointments");
  const since = new Date(Date.now() - 365 * 864e5);
  const rows = await context.prisma.appointment.findMany({
    where: { patientId: args.patientId, startsAt: { gte: since }, status: { notIn: ["planned", "rescheduled"] } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, endsAt: true, status: true, version: true, type: { select: { publicName: true, name: true } }, location: { select: { name: true, phone: true, timeZone: true } }, primaryProvider: { select: { displayName: true } } },
    take: 100
  });
  await auditPortalRead(context, principal, "portalAppointments", "Appointment", rows.map((r) => r.id), ["startsAt", "status", "type"]);
  return {
    appointments: rows.map((r) => ({
      id: r.id,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      version: r.version,
      visit: r.type?.publicName || r.type?.name || "",
      location: r.location?.name ?? "",
      locationPhone: r.location?.phone ?? "",
      timeZone: r.location?.timeZone ?? "",
      provider: r.primaryProvider?.displayName ?? "",
      canConfirm: r.status === "scheduled",
      canChange: ["scheduled", "confirmed"].includes(r.status) && r.startsAt.getTime() > Date.now()
    }))
  };
}
async function portalAppointmentCommand(context, name, args, work) {
  const principal = await portalPrincipal(context);
  const actor2 = portalActor(principal.accountId);
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name, actor: actor2, idempotencyKey: `portal:${principal.accountId}:${idempotencyKey}`.slice(0, 200), params }, async (uow) => {
    const appointment = await uow.tx.appointment.findUnique({ where: { id: args.appointmentId } });
    if (!appointment) throw new DomainError(Codes.PORTAL_SCOPE_DENIED, "You don\u2019t have access to that.");
    assertPortalScope(principal, appointment.patientId, "appointments");
    const row = await work(uow, actor2, appointment);
    return { appointmentId: row.id, status: row.status, version: row.version, startsAt: row.startsAt?.toISOString?.() ?? null };
  });
  return { replay: result.replay, ...result.value };
}
async function assertOutsideLateWindow(uow, appointment) {
  const practice = await uow.tx.practiceSettings.findUnique({ where: { id: 1 }, select: { lateCancelHours: true } });
  const hours = practice?.lateCancelHours ?? 24;
  if (appointment.startsAt.getTime() - uow.now.getTime() < hours * 36e5) {
    throw new DomainError(Codes.LATE_CANCEL_WINDOW, `This visit is less than ${hours} hours away. Please call the office to change it.`);
  }
}
async function portalConfirm(_root, args, context) {
  return portalAppointmentCommand(context, "portal.confirm", args, (uow, actor2, appointment) => confirmIn(uow, actor2, appointment.id, "portal_api", args.expectedVersion));
}
async function portalCancel(_root, args, context) {
  return portalAppointmentCommand(context, "portal.cancel", args, async (uow, actor2, appointment) => {
    await assertOutsideLateWindow(uow, appointment);
    return cancelIn(uow, actor2, appointment.id, `Cancelled by patient online${args.reason ? `: ${String(args.reason).slice(0, 200)}` : ""}`, args.expectedVersion);
  });
}
async function portalReschedule(_root, args, context) {
  return portalAppointmentCommand(context, "portal.reschedule", args, async (uow, actor2, appointment) => {
    await assertOutsideLateWindow(uow, appointment);
    const policy = await uow.tx.onlineBookingPolicy.findFirst({ where: { locationId: appointment.locationId, isActive: true }, include: { appointmentTypes: { select: { id: true } } } });
    if (!policy || !policy.appointmentTypes.some((t) => t.id === appointment.typeId)) throw new DomainError(Codes.GUARD_FAILED, "This visit can\u2019t be moved online. Please call the office.");
    const startsAt = new Date(String(args.startsAt));
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < uow.now.getTime() + policy.leadTimeHours * 36e5) throw new DomainError(Codes.OUTSIDE_TEMPLATE, "That time is too soon to book online.");
    return rescheduleIn(uow, actor2, appointment, {
      appointmentId: appointment.id,
      expectedVersion: args.expectedVersion ?? appointment.version,
      reason: "Rescheduled by patient online",
      locationId: appointment.locationId,
      operatoryId: args.operatoryId,
      typeId: appointment.typeId,
      startsAt: args.startsAt,
      providerId: args.providerId,
      source: "online_booking"
    });
  });
}
async function portalPreferences(_root, args, context) {
  const principal = await portalPrincipal(context);
  assertPortalScope(principal, args.patientId, "preferences");
  const actor2 = portalActor(principal.accountId);
  const changes = args.changes ?? [];
  if (changes.length) {
    if (!args.idempotencyKey) throw new DomainError(Codes.IDEMPOTENCY_KEY_REQUIRED, "An idempotency key is required.");
    await command(context.prisma, { name: "portal.preferences", actor: actor2, idempotencyKey: `portal:${principal.accountId}:${args.idempotencyKey}`.slice(0, 200), params: { patientId: args.patientId, changes } }, async (uow) => {
      for (const change of changes.slice(0, 20)) {
        const contact = await uow.tx.contactPoint.findUnique({ where: { id: change.contactPointId }, select: { patientId: true } });
        if (!contact || contact.patientId !== args.patientId) throw new DomainError(Codes.PORTAL_SCOPE_DENIED, "You don\u2019t have access to that.");
        if (change.granted) await grantConsentIn(uow, actor2, { contactPointId: change.contactPointId, channel: change.channel, purpose: change.purpose, source: "portal_api", evidence: { portalAccount: principal.accountId, at: uow.now.toISOString() } });
        else await revokeConsentIn(uow, actor2, { contactPointId: change.contactPointId, channel: change.channel, purpose: change.purpose, reason: "portal_preference" });
      }
      return null;
    });
  }
  const contacts = await context.prisma.contactPoint.findMany({ where: { patientId: args.patientId, isActive: true }, select: { id: true, kind: true, valueNormalized: true, consentGrants: { where: { status: "granted" }, select: { channel: true, purpose: true } } } });
  await auditPortalRead(context, principal, "portalPreferences", "ContactPoint", contacts.map((c) => c.id), ["valueNormalized"]);
  return { contacts: contacts.map((c) => ({ id: c.id, kind: c.kind, masked: mask(c.kind, c.valueNormalized), consents: c.consentGrants })) };
}
var mask = (kind, value) => kind === "email" ? value.replace(/^(.).*(@.*)$/, "$1\u2022\u2022\u2022$2") : `\u2022\u2022\u2022${value.slice(-4)}`;
async function grantPortalAccess(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  if (!PORTAL_RELATIONSHIPS.includes(args.relationship)) throw new DomainError(Codes.INVALID_INPUT, "Unknown relationship.", { field: "relationship" });
  const capabilities = (args.capabilities?.length ? args.capabilities : ["appointments", "preferences"]).filter((c) => PORTAL_CAPABILITIES.includes(c));
  const email = normalizeContact("email", args.email).normalized;
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "portal.grant", actor: actor2, idempotencyKey, params }, async (uow) => {
    const patient = await assertPatientInScope(uow.tx, locationIds, args.patientId);
    if (["merged_into", "archived", "deceased"].includes(patient.status)) throw new DomainError(Codes.GUARD_FAILED, `A ${patient.status} patient can't be given portal access.`);
    let account = await uow.tx.portalAccount.findUnique({ where: { email } });
    if (!account) {
      account = await uow.tx.portalAccount.create({ data: { email, status: "invited", invitedById: actor2.kind === "user" ? actor2.userId : null, isSynthetic: false } });
      auditCreate(uow, actor2, "PortalAccount", account.id, "portal.account_invited", { relationship: args.relationship });
    }
    const existing = await uow.tx.portalScope.findFirst({ where: { accountId: account.id, patientId: args.patientId, status: "active" } });
    if (existing) await transition(uow, { model: "PortalScope", id: existing.id, from: ["active"], to: "revoked", actor: actor2, eventType: "portal.scope_replaced" });
    const scope = await uow.tx.portalScope.create({
      data: {
        accountId: account.id,
        patientId: args.patientId,
        relationship: args.relationship,
        capabilities,
        status: "active",
        grantedById: actor2.kind === "user" ? actor2.userId : null,
        expiresAt: args.expiresAt ? new Date(args.expiresAt) : null,
        validUntilMajority: args.validUntilMajority ?? args.relationship === "guardian"
      }
    });
    auditCreate(uow, actor2, "PortalScope", scope.id, "portal.scope_granted", { patientId: args.patientId, relationship: args.relationship, capabilities });
    return { portalAccountId: account.id, portalScopeId: scope.id };
  });
  return { replay: result.replay, ...result.value };
}
async function revokePortalScope(_root, args, context) {
  const { actor: actor2, locationIds } = staff(context);
  requirePermission(actor2, "canManagePatients");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "portal.revoke", actor: actor2, idempotencyKey, params }, async (uow) => {
    const scope = await uow.tx.portalScope.findUnique({ where: { id: args.portalScopeId } });
    if (!scope?.patientId) throw new DomainError(Codes.NOT_FOUND, "Portal access not found.");
    await assertPatientInScope(uow.tx, locationIds, scope.patientId);
    const updated = await transition(uow, { model: "PortalScope", id: scope.id, from: ["active"], to: "revoked", actor: actor2, eventType: "portal.scope_revoked", reason: args.reason });
    return { portalScopeId: updated.id, status: updated.status };
  });
  return { replay: result.replay, ...result.value };
}
async function suspendPortalAccount(_root, args, context) {
  const { actor: actor2 } = staff(context);
  requirePermission(actor2, "canManagePatients");
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: "portal.suspend", actor: actor2, idempotencyKey, params }, async (uow) => {
    const updated = await transition(uow, { model: "PortalAccount", id: args.portalAccountId, from: ["invited", "active"], to: "suspended", actor: actor2, eventType: "portal.account_suspended", reason: args.reason, data: { authVersion: { increment: 1 }, codeHash: null, codeExpiresAt: null } });
    return { portalAccountId: updated.id, status: updated.status };
  });
  return { replay: result.replay, ...result.value };
}

// features/keystone/mutations/index.ts
var graphql2 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql2`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
        mfaStatus: JSON
        findAvailability(locationId: ID!, typeId: ID!, fromDate: String!, days: Int, providerId: ID, operatoryIds: [ID!], patientId: ID, limit: Int): JSON
        publicSite(slug: String!): JSON
        publicAvailability(slug: String!, locationId: ID, typeId: ID!, fromDate: String!, days: Int, providerId: ID): JSON
        portalMe: JSON
        portalAppointments(patientId: ID!): JSON
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

        registerPatient(data: JSON!, acknowledgeDuplicates: Boolean, idempotencyKey: String!): JSON
        updatePatientDemographics(patientId: ID!, expectedVersion: Int!, changes: JSON!, reason: String, idempotencyKey: String!): JSON
        addContactPoint(patientId: ID!, kind: String!, value: String!, isPrimary: Boolean, idempotencyKey: String!): JSON
        deactivateContactPoint(contactPointId: ID!, reason: String!, idempotencyKey: String!): JSON
        recordConsent(contactPointId: ID!, channel: String!, purpose: String!, granted: Boolean!, source: String, evidence: JSON, reason: String, idempotencyKey: String!): JSON
        addPatientAlert(patientId: ID!, kind: String!, severity: String!, text: String!, idempotencyKey: String!): JSON
        endPatientAlert(alertId: ID!, reason: String!, idempotencyKey: String!): JSON
        linkGuarantor(patientId: ID!, guarantorPatientId: ID, personName: JSON, relationship: String!, idempotencyKey: String!): JSON
        setPatientStatus(patientId: ID!, status: String!, expectedVersion: Int!, dateOfDeath: String, reason: String!, idempotencyKey: String!): JSON
        proposeMerge(survivorId: ID!, mergedId: ID!, reason: String!, idempotencyKey: String!): JSON
        revertMerge(mergeCaseId: ID!, expectedVersion: Int!, reason: String!, idempotencyKey: String!): JSON

        holdSlot(locationId: ID!, operatoryId: ID!, typeId: ID!, startsAt: String!, providerId: ID, patientId: ID, idempotencyKey: String!): JSON
        releaseHold(holdId: ID!, idempotencyKey: String!): JSON
        bookAppointment(locationId: ID!, operatoryId: ID!, typeId: ID!, startsAt: String!, providerId: ID, patientId: ID!, holdId: ID, note: String, overrideTemplate: Boolean, overrideProviderClash: Boolean, overrideReason: String, idempotencyKey: String!): JSON
        confirmAppointment(appointmentId: ID!, expectedVersion: Int!, method: String!, idempotencyKey: String!): JSON
        markArrived(appointmentId: ID!, expectedVersion: Int!, overrideLabGate: Boolean, reason: String, idempotencyKey: String!): JSON
        seatPatient(appointmentId: ID!, expectedVersion: Int!, acknowledgeAlerts: Boolean, idempotencyKey: String!): JSON
        markReadyForCheckout(appointmentId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        completeAppointment(appointmentId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelAppointment(appointmentId: ID!, expectedVersion: Int!, reason: String!, idempotencyKey: String!): JSON
        markBroken(appointmentId: ID!, expectedVersion: Int!, kind: String!, reason: String, idempotencyKey: String!): JSON
        rescheduleAppointment(appointmentId: ID!, expectedVersion: Int!, locationId: ID!, operatoryId: ID!, typeId: ID!, startsAt: String!, providerId: ID, holdId: ID, overrideTemplate: Boolean, overrideProviderClash: Boolean, overrideReason: String, reason: String, idempotencyKey: String!): JSON
        addAsapEntry(patientId: ID!, locationId: ID!, appointmentTypeId: ID, providerId: ID, preferredWindows: JSON, earliestDate: String, note: String, priority: Int, idempotencyKey: String!): JSON
        closeAsapEntry(asapEntryId: ID!, status: String!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        publishScheduleTemplate(templateId: ID!, expectedVersion: Int!, idempotencyKey: String!): JSON

        grantPortalAccess(patientId: ID!, email: String!, relationship: String!, capabilities: [String!], expiresAt: String, validUntilMajority: Boolean, idempotencyKey: String!): JSON
        revokePortalScope(portalScopeId: ID!, reason: String!, idempotencyKey: String!): JSON
        suspendPortalAccount(portalAccountId: ID!, reason: String!, idempotencyKey: String!): JSON

        publicHoldSlot(slug: String!, locationId: ID, typeId: ID!, operatoryId: ID!, startsAt: String!, providerId: ID, captchaToken: String, idempotencyKey: String!): JSON
        publicSubmitBooking(slug: String!, holdId: ID!, holdToken: String!, contact: JSON!, intake: JSON, insuranceCapture: JSON, captchaToken: String, idempotencyKey: String!): JSON
        reviewBookingRequest(requestId: ID!, decision: String!, expectedVersion: Int!, existingPatientId: ID, note: String, idempotencyKey: String!): JSON
        portalRequestCode(email: String!): JSON
        portalSession(email: String!, code: String!): JSON
        portalConfirm(appointmentId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        portalCancel(appointmentId: ID!, expectedVersion: Int, reason: String, idempotencyKey: String!): JSON
        portalReschedule(appointmentId: ID!, expectedVersion: Int, operatoryId: ID!, startsAt: String!, providerId: ID, idempotencyKey: String!): JSON
        portalPreferences(patientId: ID!, changes: JSON, idempotencyKey: String): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        verifyAuditChain: op(verifyAuditChain2),
        mfaStatus: op(mfaStatus),
        findAvailability: op(findAvailability),
        publicSite: op(publicSite),
        publicAvailability: op(publicAvailability),
        portalMe: op(portalMe),
        portalAppointments: op(portalAppointments)
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        loadPracticeSetup: op(loadPracticeSetup),
        decideApprovalRequest: op(decideApprovalRequest),
        cancelApprovalRequest: op(cancelApprovalRequest),
        requestPracticeControls: op(requestPracticeControls),
        verifyMfa: op(verifyMfa),
        manageMfa: op(manageMfa),
        registerPatient: op(registerPatient),
        updatePatientDemographics: op(updatePatientDemographics),
        addContactPoint: op(addContactPoint),
        deactivateContactPoint: op(deactivateContactPoint),
        recordConsent: op(recordConsent),
        addPatientAlert: op(addPatientAlert),
        endPatientAlert: op(endPatientAlert),
        linkGuarantor: op(linkGuarantor),
        setPatientStatus: op(setPatientStatus),
        proposeMerge: op(proposeMerge),
        revertMerge: op(revertMerge),
        holdSlot: op(holdSlot),
        releaseHold: op(releaseHold),
        bookAppointment: op(bookAppointment),
        confirmAppointment: op(confirmAppointment),
        markArrived: op(markArrived),
        seatPatient: op(seatPatient),
        markReadyForCheckout: op(markReadyForCheckout),
        completeAppointment: op(completeAppointment),
        cancelAppointment: op(cancelAppointment),
        markBroken: op(markBroken),
        rescheduleAppointment: op(rescheduleAppointment),
        addAsapEntry: op(addAsapEntry),
        closeAsapEntry: op(closeAsapEntry),
        publishScheduleTemplate: op(publishScheduleTemplate),
        grantPortalAccess: op(grantPortalAccess),
        revokePortalScope: op(revokePortalScope),
        suspendPortalAccount: op(suspendPortalAccount),
        portalRequestCode: op(portalRequestCode),
        portalSession: op(portalSession),
        portalConfirm: op(portalConfirm),
        portalCancel: op(portalCancel),
        portalReschedule: op(portalReschedule),
        portalPreferences: op(portalPreferences),
        publicHoldSlot: op(publicHoldSlot),
        publicSubmitBooking: op(publicSubmitBooking),
        reviewBookingRequest: op(reviewBookingRequest)
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
  AgentToolGrant: ['@@index([agentId, scope], map: "AgentToolGrant_agent_scope_idx")'],
  // Phase 1 (SCHEMA §2–§4, §21 hot paths)
  Operatory: ['@@unique([locationId, code], map: "Operatory_location_code_key")'],
  PatientIdentifier: ['@@unique([system, value], map: "PatientIdentifier_system_value_key")'],
  Patient: ['@@index([lastName, firstName, dateOfBirth], map: "Patient_name_dob_idx")'],
  Appointment: [
    '@@index([locationId, localDate, status], map: "Appointment_location_day_status_idx")',
    '@@index([operatoryId, startsAt], map: "Appointment_operatory_start_idx")'
  ],
  AppointmentSegment: ['@@index([providerId, startsAt], map: "AppointmentSegment_provider_start_idx")'],
  BookingHold: ['@@index([status, expiresAt], map: "BookingHold_status_expiry_idx")'],
  ConfirmationAttempt: ['@@index([status, scheduledFor], map: "ConfirmationAttempt_status_due_idx")'],
  Message: ['@@index([conversationId, createdAt], map: "Message_conversation_created_idx")']
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

// features/keystone/lib/keystonePrismaErrors.ts
var RAW_METHOD = /^\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|queryRawTyped|runCommandRaw)$/;
var clients = /* @__PURE__ */ new WeakMap();
var delegates = /* @__PURE__ */ new WeakMap();
function isKeystonePrismaError(value) {
  return value instanceof Error && value.extensions?.code === "KS_PRISMA_ERROR";
}
function rethrowKeystonePrismaError(value) {
  if (!isKeystonePrismaError(value)) return value;
  const prisma = value.extensions.prisma ?? {};
  throw Object.assign(value, { code: prisma.code, meta: prisma.meta, clientVersion: prisma.clientVersion });
}
function throwing(result) {
  if (!result || typeof result.then !== "function") return rethrowKeystonePrismaError(result);
  const settled = () => result.then(rethrowKeystonePrismaError);
  return new Proxy(result, {
    get(target, key) {
      if (key === "then") return (ok, fail) => settled().then(ok, fail);
      if (key === "catch") return (fail) => settled().catch(fail);
      if (key === "finally") return (done) => settled().finally(done);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
function throwingDelegate(delegate) {
  const cached = delegates.get(delegate);
  if (cached) return cached;
  const wrapped = new Proxy(delegate, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? (...args) => throwing(value.apply(target, args)) : value;
    }
  });
  delegates.set(delegate, wrapped);
  return wrapped;
}
function throwKeystonePrismaErrors(client) {
  const cached = clients.get(client);
  if (cached) return cached;
  const wrapped = new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === "$transaction" && typeof value === "function") {
        return (work, ...options) => {
          if (typeof work === "function") return value.call(target, (tx) => work(throwKeystonePrismaErrors(tx)), ...options);
          return Promise.resolve(value.call(target, work, ...options)).then((results) => Array.isArray(results) ? results.map(rethrowKeystonePrismaError) : results);
        };
      }
      if (key === "$extends" && typeof value === "function") return (...args) => throwKeystonePrismaErrors(value.apply(target, args));
      if (typeof key === "string" && RAW_METHOD.test(key) && typeof value === "function") return (...args) => throwing(value.apply(target, args));
      if (typeof value === "function") return value.bind(target);
      if (typeof key === "string" && !key.startsWith("$") && value && typeof value === "object" && typeof value.findFirst === "function") return throwingDelegate(value);
      return value;
    }
  });
  clients.set(client, wrapped);
  return wrapped;
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
  (0, import_core14.config)({
    db: {
      provider: "postgresql",
      url: databaseURL,
      extendPrismaSchema: addDatabaseConstraints,
      // Keystone 6.5 returns failed queries instead of throwing; inside $transaction later writes would still commit.
      extendPrismaClient: throwKeystonePrismaErrors
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

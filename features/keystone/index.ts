import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { extendGraphqlSchema } from "./mutations";
import { sendPasswordResetEmail } from "./lib/mail";
import { withMcpBearerSessions } from "./mcp-oauth/session";
import { isSignedIn, NEVER_DEFAULT, permissionNames, type Session } from "./access";
import { dentalSessions } from "./lib/session";
import { addDatabaseConstraints } from "./prismaConstraints";
import { throwKeystonePrismaErrors } from "./lib/keystonePrismaErrors";

const databaseURL = process.env.DATABASE_URL || "file:./keystone.db";

const {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com",
} = process.env;

const { withAuth } = createAuth({
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
          ...Object.fromEntries(permissionNames.filter((name) => !NEVER_DEFAULT.includes(name)).map((name) => [name, true])),
        },
      },
    },
  },
  passwordResetLink: {
    async sendToken(args) {
      // send the email
      await sendPasswordResetEmail(args.token, args.identity);
    },
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
  `,
});

export default withAuth(
  config({
    db: {
      provider: "postgresql",
      url: databaseURL,
      extendPrismaSchema: addDatabaseConstraints,
      // Keystone 6.5 returns failed queries instead of throwing; inside $transaction later writes would still commit.
      extendPrismaClient: throwKeystonePrismaErrors,
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
        signed: { expiry: 5000 },
        forcePathStyle: true,
      },
    },
    ui: {
      isAccessAllowed: ({ session }) =>
        isSignedIn({ session: session as Session | undefined }) && (session as Session | undefined)?.data.role?.canAccessDashboard === true,
    },
    // Staff cookies: 12 h ceiling, second-factor pending state, authVersion revocation (lib/session).
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions(dentalSessions()),
    graphql: {
      extendGraphqlSchema,
    },
  })
);
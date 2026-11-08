import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import exactMoney from "./eslint-rules/index.mjs";

// Money, percentages and quantities: exact arithmetic only (SCHEMA G2-G4, G13).
const EXACT_PATHS = [
  "features/keystone/lib/**/*.ts",
  "features/keystone/mutations/**/*.ts",
  "features/accounting/**/*.ts",
  "features/scheduling/**/*.ts",
  "features/integrations/**/*.ts",
];

export default defineConfig([
  globalIgnores([".keystone/**", ".runtime/**", "node_modules/**", "migrations/**"]),
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "react/no-unescaped-entities": "warn",
      "react/no-children-prop": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // React 19 compiler-adoption debt inherited from the starter UI remains visible.
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: EXACT_PATHS,
    // lib/decimal and lib/money are the one sanctioned conversion layer (Decimal#toFixed is exact there).
    ignores: ["**/*.test.ts", "features/keystone/lib/decimal.ts", "features/keystone/lib/money.ts"],
    plugins: { "openfront-dental": exactMoney },
    rules: { "openfront-dental/no-number-on-money": "error" },
  },
  {
    files: ["features/keystone/models/**/*.ts"],
    plugins: { "openfront-dental": exactMoney },
    rules: { "openfront-dental/no-float-fields": "error" },
  },
  {
    // PHI discipline (BUILD-PLAN §0): model rows never reach the console. Log through lib/log, which
    // redacts tiered fields by name.
    files: ["features/keystone/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.node-test.ts", "features/keystone/lib/log.ts", "features/keystone/view-order/**"],
    rules: { "no-console": ["error", { allow: ["error", "warn"] }] },
  },
  {
    // Layering (BUILD-PLAN CI; enforced here in place of dependency-cruiser): the domain core is
    // framework-free, and screens reach it only through GraphQL.
    files: ["features/keystone/lib/**/*.ts", "features/scheduling/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.node-test.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["next", "next/*", "react", "react-dom", "@/features/dashboard/*", "@/features/platform/*", "@/components/*", "**/mutations/*"], message: "The domain core must not import UI, Next.js or GraphQL resolver code." },
        ],
      }],
    },
  },
  {
    files: ["features/platform/**/*.{ts,tsx}", "features/dashboard/**/*.{ts,tsx}", "app/dashboard/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@prisma/client", "@/features/keystone/lib/*", "@/features/keystone/mutations/*", "!@/features/keystone/lib/teeth", "!@/features/keystone/lib/perio", "!@/features/keystone/mutations/phase2Args"], message: "Screens go through GraphQL (keystoneClient) so access rules and commands apply." },
        ],
      }],
    },
  },
]);

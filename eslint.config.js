import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Only the rules CODING_STANDARDS.md would otherwise leave to the reviewer.
// Formatting is Prettier's job.
export default tseslint.config(
  {
    ignores: [
      "build/",
      ".react-router/",
      "drizzle/",
      ".claude/",
      ".agents/",
      "reports/",
      ".outbox/",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);

import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "playwright-report",
      "test-results",
      "supabase/.temp",
      ".remember",
      // Transient git worktrees an isolated agent run creates. They are
      // whole COPIES of this repository, so linting them both duplicates
      // every file and breaks the TS parser outright — several candidate
      // tsconfig roots, no way to pick one. Same category as dist and
      // node_modules: never source. Git already excludes the path; CI
      // never sees one because it checks out fresh.
      ".claude/worktrees",
    ],
  },
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Mount-time data loads and prop-sync effects predate this
      // React-Compiler-era rule; revisit if the app adopts the compiler.
      "react-hooks/set-state-in-effect": "off",
    },
  },
);

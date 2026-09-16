import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "node_modules/**",
      // Gitignored local research inputs, never our code (see CLAUDE.md).
      "poc/**",
      "reference-material/**",
      "calview/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // NFR-7 currency formatting deliberately joins the number and code with
      // U+00A0 (non-breaking space) inside template literals — see
      // src/i18n/format.ts. Template literals are exempt; string/JSX text is not.
      "no-irregular-whitespace": ["error", { skipTemplates: true }],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Must stay last so it can disable any stylistic rule that would otherwise
  // conflict with Prettier's formatting.
  eslintConfigPrettier,
);

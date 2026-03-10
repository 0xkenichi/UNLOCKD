import globals from "globals";
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/artifacts/**",
      "**/cache/**",
      "**/deployments/**",
      "**/.cursor/**",
      "**/.vercel/**",
      "**/*.min.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["backend/**/*.js", "scripts/**/*.js", "test/**/*.js", "deploy/**/*.js", "sdk/**/*.js", "**/*.cjs", "*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "warn",
      "no-undef": "warn",
      "no-empty": "warn",
      "no-redeclare": "warn",
    },
  },
  {
    files: ["frontend/**/*.{js,jsx,mjs}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unknown-property": "off",
      "react/no-unescaped-entities": "off",
      "no-unused-vars": "warn",
      "no-empty": "warn",
      "no-redeclare": "warn",
      "no-constant-binary-expression": "warn",
      "no-undef": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
];

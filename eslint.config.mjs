import globals from "globals";

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
      "**/*.min.js",
    ],
  },
  {
    files: ["backend/**/*.js", "scripts/**/*.js", "test/**/*.js", "deploy/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
    rules: {},
  },
  {
    files: ["frontend/**/*.{js,jsx,mjs}"],
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
    rules: {},
  },
];

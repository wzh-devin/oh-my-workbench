import { fixupConfigRules } from "@eslint/compat"
import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import jsxA11y from "eslint-plugin-jsx-a11y"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/coverage/**",
    ".next/**",
    "apps/web/src/components/ui/**",
    "apps/web/src/components/reui/**",
    "apps/web/src/components/blocks/**",
    "apps/web/src/components/examples/**",
    ".agents/**",
    ".claude/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...fixupConfigRules([
    react.configs.flat.recommended,
    {
      plugins: { "jsx-a11y": jsxA11y },
      // Preserve the accessibility checks enabled by the previous Next config.
      rules: {
        "jsx-a11y/alt-text": "warn",
        "jsx-a11y/aria-props": "warn",
        "jsx-a11y/aria-proptypes": "warn",
        "jsx-a11y/aria-unsupported-elements": "warn",
        "jsx-a11y/role-has-required-aria-props": "warn",
        "jsx-a11y/role-supports-aria-props": "warn",
      },
    },
  ]),
  reactHooks.configs.flat.recommended,
  {
    settings: { react: { version: "19.3" } },
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react-hooks/incompatible-library": "off",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
    },
  },
])

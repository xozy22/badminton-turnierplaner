import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Context modules deliberately export a provider component *and* its
    // hook. Splitting them would only satisfy Fast Refresh's granularity
    // rule while spreading one concept across two files — a trade this
    // project does not want. Must come after the shared block: in flat
    // config the later entry wins (REVIEW-BACKLOG.md D3).
    files: ['src/lib/*Context.tsx', 'src/pages/Settings.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])

// api/eslint.config.mjs
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Express error middleware and stubbed-out signatures (e.g. lib/ssm.ts before Phase 3)
      // need to keep unused parameters to match a required arity or a future implementation.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
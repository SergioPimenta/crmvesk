import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Regras de bug (erro) + higiene (aviso). O objetivo é o CI barrar problemas reais sem travar o time por estilo.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'scraper/**', 'exemplo/**', 'public/sw.js'] },

  js.configs.recommended,

  // Frontend (React + TypeScript)
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  },

  // Servidor, API e scripts (Node)
  {
    files: ['server/**/*.js', 'api/**/*.js', 'scripts/**/*.mjs', '*.js', '*.mjs'],
    languageOptions: { globals: globals.node, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Regras novas do ESLint 10 (estilo de tratamento de erro): aviso, não bloqueiam o CI.
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
    },
  }
);

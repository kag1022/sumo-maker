import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.tmp',
      '.lint-report.json',
      'scripts/tests/run_sim_tests.cjs',
      'scripts/reports/**',
      'scripts/remove_bg.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'indent': ['warn', 2, { SwitchCase: 1 }],
      'no-multiple-empty-lines': ['warn', { max: 1, maxEOF: 0 }],
      'eol-last': ['warn', 'always'],
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: [
      'scripts/tests/current/**/*.ts',
      'scripts/tests/compat/index.ts',
      'scripts/tests/shared/currentHelpers.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);

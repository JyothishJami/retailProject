/**
 * Root ESLint config. Module-boundary rules (ADR-2) live in apps/api/.eslintrc.cjs
 * so that only the API workspace pays the cost of the type-aware resolver.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  env: { node: true, es2022: true },
  settings: {
    'import/resolver': {
      typescript: { alwaysTryTypes: true, project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'] },
    },
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-default-export': 'error',
    'no-console': 'error',
    eqeqeq: ['error', 'always'],
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.cjs', '*.config.js'],
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
      env: { jest: true },
      rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
  ],
};

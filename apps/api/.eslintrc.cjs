module.exports = {
  extends: ['../../.eslintrc.cjs'],
  rules: {
    // Nest resolves constructor dependencies from emitted decorator metadata,
    // which `import type` erases.
    '@typescript-eslint/consistent-type-imports': 'off',
    // ADR-2: modules may only reach into a sibling module's public surface
    // (its `*.module.ts`, `public/` barrel, or events), never its internals.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '../*/services/*',
              '../*/repositories/*',
              '../*/entities/*',
              '../../modules/*/services/*',
              '../../modules/*/repositories/*',
              '../../modules/*/entities/*',
            ],
            message:
              'Cross-module imports must go through the module public surface (public/index.ts) or a domain event.',
          },
        ],
      },
    ],
  },
};

const preset = require('@quickpick/config/jest.preset.cjs');

// `@quickpick/shared` resolves through the workspace symlink to its built
// `dist`, so `turbo test` builds it first (see turbo.json dependsOn ^build).
module.exports = {
  ...preset,
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  // Declarative Nest wiring (modules, bootstrap, entrypoint) is exercised by the
  // e2e suite, which boots the real application; unit coverage tracks the logic.
  collectCoverageFrom: [
    ...preset.collectCoverageFrom,
    '!src/main.ts',
    '!src/bootstrap.ts',
    '!src/**/*.module.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90,
    },
  },
};

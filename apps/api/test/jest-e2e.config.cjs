const preset = require('@quickpick/config/jest.preset.cjs');

module.exports = {
  ...preset,
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  collectCoverageFrom: undefined,
};

const preset = require('@quickpick/config/jest.preset.cjs');

module.exports = {
  ...preset,
  rootDir: '.',
  // ADR: the order state machine is the correctness core shared by every client,
  // so it is held to 100% branch coverage.
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    '**/src/orders/order-state-machine.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};

module.exports = {
  rootDir: '..',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/postgres/**/*.spec.ts'],
  setupFiles: ['dotenv/config', '<rootDir>/test/setup.ts'],
  testTimeout: 60000,
};

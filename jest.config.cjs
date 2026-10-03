module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/test/postgres/'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  clearMocks: true,
};

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/helpers/setupEnv.js'],
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/middleware/**/*.js',
    'src/utils/**/*.js',
    'src/validators/**/*.js',
    'src/config/environment.js',
    'src/config/logger.js',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
    './src/utils/tokenGenerator.js': { branches: 90 },
  },
};
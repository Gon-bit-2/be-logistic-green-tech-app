const path = require('path')

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  modulePaths: [path.resolve(__dirname, '..')],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/uuid-mock.js',
  },
  testRegex: '.e2e-spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
}

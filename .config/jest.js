export default function commonConfig(outputName) {
  return {
    modulePathIgnorePatterns: ['<rootDir>/website'],
    testRegex: '/__tests__/(server-only\\.)?test-[^\\/]+\\.js',
    setupFiles: ['<rootDir>/__tests__/jest.setup.js'],
    moduleNameMapper: {
      '^dimorphic-git$': '<rootDir>/src',
      '^dimorphic-git/http$': '<rootDir>/src/http/node',
      '^dimorphic-git/(.+)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: ['src/*.js', 'src/**/*.js'],
    coverageReporters: ['lcov', 'cobertura'],
    reporters: [
      'default',
      [
        'jest-junit',
        {
          outputDirectory: 'junit',
          outputName: `${outputName}.xml`,
        },
      ],
    ],
    testTimeout: 120000,
    workerIdleMemoryLimit: '200MB',
  }
}

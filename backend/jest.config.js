/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Fail the run if coverage of the routes and app regresses below what the
  // harness established. Raise these as coverage grows; never lower them.
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts", "!src/**/__tests__/**"],
  coverageThreshold: { global: { lines: 90, functions: 90, branches: 75 } },
};

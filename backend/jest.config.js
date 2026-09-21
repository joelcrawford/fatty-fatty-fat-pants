/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Fail the run if coverage of the routes and app regresses below what the
  // harness established. Raise these as coverage grows; never lower them.
  // index.ts and scripts/ are thin process entry points; they are exercised by
  // the end-to-end smoke test, not by Jest.
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts", "!src/scripts/**", "!src/**/__tests__/**"],
  coverageThreshold: { global: { lines: 90, functions: 90, branches: 75 } },
};

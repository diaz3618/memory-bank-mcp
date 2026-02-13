# Memory Bank MCP Testing Guide

This guide explains how to run tests and maintain test coverage for the Memory Bank MCP project.

## Running Tests

Memory Bank MCP uses Bun's built-in test runner for fast and efficient testing. To run the tests:

```bash
# Run all tests
bun test

# Run tests with coverage report
bun test --coverage

# Run a specific test file
bun test src/__tests__/fileUtils.test.ts

# Run tests matching a specific pattern
bun test --pattern "FileUtils"
```

## Test Structure

Tests are organized in the `src/__tests__` directory, with test files named according to the module they test:

- `fileUtils.test.ts` - Tests for the FileUtils class
- `memoryBankManager.test.ts` - Tests for the MemoryBankManager class
- `progressTracker.test.ts` - Tests for the ProgressTracker class
- `migrationUtils.test.ts` - Tests for the MigrationUtils class
- `clinerules-integration.test.ts` - Integration tests for the clinerules functionality

## Writing Tests

When writing tests, follow these guidelines:

1. **Test file naming**: Name test files after the module they test, with the `.test.ts` suffix.
2. **Test organization**: Use `describe` blocks to group related tests and `test` blocks for individual test cases.
3. **Setup and teardown**: Use `beforeEach` and `afterEach` for test setup and cleanup.
4. **Assertions**: Use Bun's built-in assertions (`expect`) for test assertions.
5. **Mocking**: Use Bun's `mock` function for mocking dependencies.

Example test structure:

```typescript
import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { SomeClass } from "../path/to/module.js";

describe("SomeClass Tests", () => {
  let instance: SomeClass;

  beforeEach(() => {
    // Setup code
    instance = new SomeClass();
  });

  afterEach(() => {
    // Cleanup code
  });

  test("Should do something", () => {
    // Test code
    const result = instance.someMethod();
    expect(result).toBe(expectedValue);
  });
});
```

## Test Coverage

Memory Bank MCP aims to maintain high test coverage:

- **Line coverage**: At least 90% of all lines should be covered by tests.
- **Function coverage**: At least 90% of all functions should be covered by tests.

When adding new features or fixing bugs, always add or update tests to maintain or improve coverage.

### Current Coverage

As of the latest update, the project has:

- **Line coverage**: 92.41%
- **Function coverage**: 90.80%

### Improving Coverage

To improve test coverage:

1. Identify uncovered code using the coverage report.
2. Write tests that exercise the uncovered code paths.
3. Focus on testing edge cases and error handling.
4. Use mocking to test code that depends on external resources.

## Testing File Naming Convention Migration

The project includes a migration utility to convert Memory Bank files from camelCase to kebab-case naming convention. When testing this functionality:

1. Create test files with the old naming convention.
2. Run the migration utility.
3. Verify that files are correctly renamed.
4. Test error handling for various scenarios (non-existent directories, existing target files, etc.).

## Continuous Integration

Tests are automatically run in the CI pipeline on GitHub Actions for every pull request and push to the main branch. The CI pipeline will fail if tests fail or if coverage drops below the required thresholds.

## Troubleshooting

If you encounter issues with tests:

1. **Test failures**: Check the error message and stack trace to identify the issue.
2. **Coverage issues**: Use the coverage report to identify uncovered code.
3. **Slow tests**: Look for tests that access the file system or external resources and consider mocking them.
4. **Flaky tests**: Identify and fix tests that fail intermittently, often due to race conditions or external dependencies.

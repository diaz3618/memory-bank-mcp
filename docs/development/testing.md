# Testing with Bun

This document describes how to run tests for the Memory Bank Server using Bun's built-in test runner.

## Overview

The Memory Bank Server uses Bun's built-in test runner for testing. Bun provides a fast and efficient way to run tests with a Jest-like API.

## Running Tests

To run all tests, use the following command:

```bash
bun test
```

This will run all test files in the project that match the pattern `*.test.ts` or `*.spec.ts`.

To run a specific test file, you can specify the file path:

```bash
bun test src/__tests__/clinerules-integration.test.ts
```

## Test Structure

Tests are organized in the `src/__tests__` directory. Each test file follows the naming convention `*.test.ts` or `*.spec.ts`.

### Clinerules Integration Tests

The `clinerules-integration.test.ts` file contains tests for the integration with `.clinerules` files. These tests verify that:

1. The server can detect and load `.clinerules` files
2. The server can switch between different modes
3. The UMB (Update Memory Bank) command works correctly
4. Mode triggers are detected and handled properly
5. The Memory Bank status is updated correctly
6. Events are emitted correctly when modes change or UMB is activated/deactivated
7. The integration with the MemoryBankManager works correctly

## Writing Tests

When writing tests, use the following imports from `bun:test`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
```

### Test Structure

Tests should be organized using `describe` blocks for grouping related tests, and `test` blocks for individual test cases:

```typescript
describe("Feature Name", () => {
  beforeEach(() => {
    // Setup code
  });

  afterEach(() => {
    // Cleanup code
  });

  test("should do something", () => {
    // Test code
    expect(result).toBe(expectedValue);
  });
});
```

### Asynchronous Tests

For asynchronous tests, use async/await:

```typescript
test("should do something asynchronously", async () => {
  const result = await someAsyncFunction();
  expect(result).toBe(expectedValue);
});
```

### Testing Events

For testing events, use promises:

```typescript
test("should emit an event", async () => {
  return new Promise<void>((resolve) => {
    emitter.on("event", (data) => {
      expect(data).toBe(expectedValue);
      resolve();
    });

    emitter.emit("event", value);
  });
});
```

## Test Coverage

Bun provides built-in test coverage reporting. To run tests with coverage, use:

```bash
bun test --coverage
```

This will generate a coverage report showing which parts of the code are covered by tests.

## Continuous Integration

Tests are automatically run as part of the CI/CD pipeline. Make sure all tests pass before submitting a pull request.

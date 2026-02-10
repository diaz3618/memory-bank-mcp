# Building with Bun

This document describes how to build the Memory Bank Server using Bun.

## Prerequisites

- [Bun](https://bun.sh/) installed on your system

## Build Commands

The following commands are available for building and running the project:

### Clean Build Directory

```bash
bun run clean
```

This command removes the `build` directory and all its contents.

### Build the Project

```bash
bun run build
```

This command cleans the build directory and then builds the project using Bun. The output is placed in the `build` directory.

### Start the Server

```bash
bun run start
```

This command starts the server using Bun.

### Build and Start

```bash
bun run build:start
```

This command builds the project and then starts the server in a single command.

### Development Mode

```bash
bun run dev
```

This command starts the server in development mode with hot reloading.

## Build Configuration

The build configuration is defined in the `bunbuild.toml` file. The following options are available:

```toml
[build]
entrypoints = ["./src/index.ts"]
outdir = "./build"
target = "node"
format = "esm"
minify = true
sourcemap = "external"

[define]
process.env.NODE_ENV = "production"
```

- `entrypoints`: The entry points for the build.
- `outdir`: The output directory for the build.
- `target`: The target environment for the build.
- `format`: The module format for the build.
- `minify`: Whether to minify the output.
- `sourcemap`: The type of source map to generate.
- `define`: Environment variables to define during the build.

## Performance

Building with Bun is significantly faster than building with TypeScript directly. Bun also provides better performance when running the server.

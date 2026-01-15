---
sidebar_position: 3
---
# Node.js v23 Features

## Native TypeScript Support

Run TypeScript files directly without compilation:

```bash
# Enable experimental TypeScript stripping
node --experimental-strip-types app.ts

# With type checking disabled (faster)
node --experimental-strip-types --no-warnings app.ts
```

**Limitations**:
- Type annotations are stripped, not checked
- No `tsconfig.json` support
- Use `tsc` for full type checking

## On-disk Code Caching

Improve startup time with compiled code caching:

```bash
# Generate cache
node --experimental-modules-cache=./cache app.js

# Benefits:
# - Faster subsequent starts
# - Reduced parsing overhead
# - Better for serverless/containers
```

## Module Loader Hooks

Customize module resolution and loading:

```javascript
// loader.mjs
export async function resolve(specifier, context, nextResolve) {
  console.log(`Resolving: ${specifier}`);
  
  // Custom resolution logic
  if (specifier.startsWith('@custom/')) {
    return {
      url: new URL(`./custom-modules/${specifier.slice(8)}.js`, import.meta.url).href,
      shortCircuit: true
    };
  }
  
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  console.log(`Loading: ${url}`);
  return nextLoad(url, context);
}
```

```bash
# Use custom loader
node --experimental-loader=./loader.mjs app.js
```

## Permission Model

Fine-grained security controls:

```bash
# Block all file system access
node --experimental-permission --no-allow-fs-read --no-allow-fs-write app.js

# Allow specific paths
node --experimental-permission \
  --allow-fs-read=/app/data \
  --allow-fs-write=/app/logs \
  app.js

# Block network access
node --experimental-permission --no-allow-net app.js

# Allow specific domains
node --experimental-permission \
  --allow-net=api.example.com:443 \
  app.js

# Block child processes
node --experimental-permission --no-allow-child-process app.js
```

**Use cases**:
- Sandboxing untrusted code
- Microservices security
- Compliance requirements
- Defense in depth

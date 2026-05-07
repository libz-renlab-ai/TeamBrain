---
schema-version: 1
---

# Happy-path fixture — two valid install-step blocks, no expected errors during dry-run.

```yaml install-step
id: step-1
command: pnpm install
progress: "1/2"
explanation: Downloads all dependencies. Takes about 30–60 seconds.
common_errors:
  - pattern: "ETIMEDOUT"
    fix: "pnpm install --prefer-offline"
```

```yaml install-step
id: step-2
command: pnpm build
progress: "2/2"
explanation: Compiles source code into runnable form. Takes about 30 seconds.
```

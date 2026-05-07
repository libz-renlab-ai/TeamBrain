---
schema-version: 1
---

# missing-pnpm fixture — first step has pnpm install + common_error for "pnpm: command not found".

```yaml install-step
id: step-1
command: pnpm install
progress: "1/2"
explanation: Downloads all dependencies. If pnpm is not installed, the error below will appear.
common_errors:
  - pattern: "pnpm: command not found"
    fix: "curl -fsSL https://get.pnpm.io/install.sh | sh -"
  - pattern: "EACCES|permission denied"
    fix: "sudo chown -R $(whoami) ~/.npm && pnpm install"
```

```yaml install-step
id: step-2
command: pnpm build
progress: "2/2"
explanation: Compiles source code into runnable form.
```

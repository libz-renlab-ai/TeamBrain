# TeamBrain — release branch

This branch is the **consumer-facing distribution** of [TeamBrain](https://github.com/libz-renlab-ai/TeamBrain). It carries only the artefacts a user needs to install (`install.sh`, the published tarball, `dist/`, `package.json`, and `postinstall.mjs`). Source code, docs, plans, and tests live on [`main`](https://github.com/libz-renlab-ai/TeamBrain/tree/main).

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh -o /tmp/teambrain-install.sh
cat /tmp/teambrain-install.sh   # review before exec (recommended)
bash /tmp/teambrain-install.sh
```

Or, for trusted environments / CI:

```bash
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | bash
```

SHA-256 checksum of the installer is published at [`install.sh.sha256`](https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh.sha256) on this branch and attached to each [GitHub Release](https://github.com/libz-renlab-ai/TeamBrain/releases).

## After install

```bash
cd <your-project>
teamagent init     # ~30s — registers PreToolUse hook + universal pack
teamagent try      # 30s, see 5 hook intercepts in action
```

## Where is everything else?

- **Documentation, design docs, ADRs** → [`main` branch](https://github.com/libz-renlab-ai/TeamBrain/tree/main)
- **Source code** → [`main`/packages](https://github.com/libz-renlab-ai/TeamBrain/tree/main/packages)
- **Issues / discussions** → [Issues tab](https://github.com/libz-renlab-ai/TeamBrain/issues)
- **Release notes** → [Releases tab](https://github.com/libz-renlab-ai/TeamBrain/releases)

This branch is force-pushed by the [`release-branch.yml`](https://github.com/libz-renlab-ai/TeamBrain/blob/main/.github/workflows/release-branch.yml) workflow on every `main` push. Don't open PRs against this branch.

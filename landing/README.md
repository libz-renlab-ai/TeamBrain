# landing/

TeamBrain GitHub Pages frontend, served from
`https://libz-renlab-ai.github.io/TeamBrain/`.

The deployed page is the **RocketTeam** Next.js app (upstream
`hrdAI3/RocketTeam`, vendored here as a submodule under `landing/rocketteam/`)
running in `output: 'export'` static-export mode with a TeamBrain-side overlay
(`landing/overlay/`) and a CI build script (`landing/build-static.sh`).

## Pieces

| Path | Role |
|------|------|
| `landing/rocketteam/` | Git submodule of `hrdAI3/RocketTeam`. **Do not edit in place** — upstream is the source of truth. Any TeamBrain-specific patches live in `landing/overlay/` and are applied during CI. |
| `landing/overlay/` | TeamBrain-side overlay files mirroring the submodule tree. Currently overrides `next.config.js`, `tsconfig.json`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/org/page.tsx`, `src/app/agents/[name]/page.tsx` (+ `Client.tsx`), `src/components/StaticFetchShim.tsx`, `tools/inline-static-data.ts`, `tools/generate-demo-data.ts`. |
| `landing/build-static.sh` | Overlay-then-build script. Strips server-only routes (`src/app/api`, `src/app/live`, `src/app/sim`, `src/app/agents/[name]`), `cp`s overlay files in, seeds demo data via `bun tools/generate-demo-data.ts`, dumps JSON snapshots via `bun tools/inline-static-data.ts`, then runs `STATIC_EXPORT=1 next build`. |
| `.github/workflows/landing-deploy.yml` | Runs `landing/build-static.sh` on push to `main` (paths: `landing/**`), uploads `landing/rocketteam/out` as the Pages artefact. |

## How it works

```
                ┌───────────────────────┐
hrdAI3/         │ landing/rocketteam/   │  ← upstream SSR app, ~30 API routes
RocketTeam      │   (submodule pristine)│    + dynamic [name]/[id]/[file]
upstream        └───────────┬───────────┘
                            │
                            │  landing/build-static.sh
                            │   1. strip src/app/api
                            │   2. strip dynamic [id]/[file] under live/, sim/
                            │   3. cp landing/overlay/** onto submodule
                            │   4. generate-demo-data.ts → private/*.json
                            │   5. inline-static-data.ts → public/data/*.json
                            │   6. STATIC_EXPORT=1 next build
                            ▼
                ┌───────────────────────┐
                │ landing/rocketteam/out│  ← 22 static HTML pages,
                │   index.html          │    self-contained ~2.2 MB,
                │   agents/             │    fetch('/api/X') is rewritten
                │   agents/<name>/      │    to fetch('/data/X.json') by
                │   tasks/  org/  ...   │    StaticFetchShim at runtime.
                │   data/*.json         │
                └───────────┬───────────┘
                            │
                            │  upload-pages-artifact + deploy-pages
                            ▼
        https://libz-renlab-ai.github.io/TeamBrain/
```

## Local build

```sh
# From repo root
git submodule update --init --recursive
STATIC_BASE_PATH=/TeamBrain DEMO_SEED=1 bash landing/build-static.sh

# Preview the artefact under a basePath-mimicking directory
mkdir -p /tmp/preview/TeamBrain
cp -R landing/rocketteam/out/. /tmp/preview/TeamBrain/
(cd /tmp/preview && python3 -m http.server 4567) &
open "http://localhost:4567/TeamBrain/"
```

## GH Pages source-mode caveat

`gh api repos/libz-renlab-ai/TeamBrain/pages` currently reports
`build_type: "legacy"` (source = `gh-pages` branch). The new workflow uses
`actions/deploy-pages@v5` which requires the source to be set to **GitHub
Actions**. Flip it once in repo settings → Pages → Source = "GitHub Actions"
before the first deploy.

## Demo data

`landing/overlay/tools/generate-demo-data.ts` seeds 8 agents across 5
departments (老板/研发/产品/职能/运营), 6 tasks (mix of pending/assigned/
completed), 4 resources (subscription/api_key/domain), and 10 timeline events.
Set `DEMO_SEED=1` in CI to refresh the seed each deploy; unset it in
production builds where real `private/` is supplied by another mechanism.

## Why an overlay (and not a direct submodule patch)?

The submodule tracks **upstream `hrdAI3/RocketTeam`**, not a TeamBrain fork.
Pushing our static-export patches back upstream is out of scope. An overlay
gives us:

1. **Upstream stays clean.** Pulling a new submodule SHA does not conflict
   with our patches as long as the touched files don't drift heavily.
2. **Patches live in TeamBrain history.** `git log landing/overlay/` shows
   every TeamBrain-side change without traversing the submodule.
3. **CI reproducibility.** The build script is idempotent: re-running it
   any number of times produces the same `out/` (given the same submodule
   SHA and overlay tree).

If the overlay starts conflicting with upstream often, the natural escalation
is to fork RocketTeam under the TeamBrain org and point `.gitmodules` at the
fork instead.

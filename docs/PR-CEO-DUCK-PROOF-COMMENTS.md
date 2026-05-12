# PR CEO duck proof comments

This file records the fresh CEO-duck proof-of-work image comment backfill for
merged TeamBrain PRs.

## What landed

On 2026-05-12, every PR in the GitHub `merged` snapshot received one Chinese
CEO-duck proof-of-work image comment.

- Source repo: `libz-renlab-ai/TeamBrain`
- Snapshot size: 272 merged PRs
- PR range in snapshot: merged PRs from `#1` through `#394`
- Imagehost-only repo:
  `LiuShiyuMath/teambrain-pr-ceo-duck-proof-images`
- Image manifest:
  `https://github.com/LiuShiyuMath/teambrain-pr-ceo-duck-proof-images/blob/main/manifest.json`
- Raw image pattern:
  `https://raw.githubusercontent.com/LiuShiyuMath/teambrain-pr-ceo-duck-proof-images/main/images/pr-0394.png`
- Imagehost commit: `e257de7`

The imagehost repo is not a TeamBrain source repo. It exists only to host PNG
cards, the `image_gen.imagegen` CEO-duck background, and a machine-readable
manifest.

## Comment contract

Each comment contains this hidden marker:

```html
<!-- teambrain-pr-ceo-duck-proof:image:v1 pr=<N> -->
```

The marker is the idempotency guard. Before adding or repairing CEO-duck proof
comments, scan GitHub issue comments and skip any PR that already has this
marker for its PR number.

Each comment includes:

- Chinese heading: `CEO 鸭鸭中文 proof-of-work 人审图`
- a short CEO-duck explanation for human review
- the hosted PNG card for that PR
- the imagehost repo link
- the manifest link

These are Bucket (c) human-facing comments under
`docs/PR-ISSUE-COMMENT-LANGUAGES.md`. Chinese is allowed because the comment is
not a judge-harness machine input, `/review` rebuttal, or grill payload.

## Verification

Marker coverage:

```bash
gh api 'repos/libz-renlab-ai/TeamBrain/issues/comments?per_page=100' --paginate \
  | jq -r '.[].body' \
  | grep -c 'teambrain-pr-ceo-duck-proof:image:v1'
```

Expected for the 2026-05-12 snapshot: `272`.

Manifest coverage:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/LiuShiyuMath/teambrain-pr-ceo-duck-proof-images/main/manifest.json \
  | jq '.snapshotCount'
```

Expected for the 2026-05-12 snapshot: `272`.


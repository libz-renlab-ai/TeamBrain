# PR proof image comments

This file records the one-time proof-of-work image comment backfill for merged
TeamBrain PRs.

## What landed

On 2026-05-12, every merged PR in the GitHub `merged` snapshot was given one
human-facing Chinese proof-of-work image comment.

- Source repo: `libz-renlab-ai/TeamBrain`
- Snapshot size: 271 merged PRs
- PR range in snapshot: merged PRs from `#1` through `#393`
- Imagehost repo: `LiuShiyuMath/teambrain-pr-proof-images`
- Image manifest:
  `https://github.com/LiuShiyuMath/teambrain-pr-proof-images/blob/main/manifest.json`
- Raw image pattern:
  `https://raw.githubusercontent.com/LiuShiyuMath/teambrain-pr-proof-images/main/images/pr-0001.png`

The imagehost repo is imagehost-only: it stores PNG proof cards, the generated
`image_gen.imagegen` cover/background, and the machine-readable manifest. It is
not a TeamBrain source-of-truth repo for product or rule docs.

## Comment contract

Each PR comment contains this hidden marker:

```html
<!-- teambrain-pr-proof-work:image:v1 pr=<N> -->
```

The marker is the idempotency guard. Before adding or repairing proof comments,
scan GitHub issue comments and skip any PR that already has a marker for its PR
number.

Each comment then shows:

- a Chinese heading: `中文 proof-of-work 人审图`
- one hosted PNG card for that PR
- a link to the imagehost repo
- a link to the imagehost manifest

These comments are Bucket (c) human-facing comments under
`docs/PR-ISSUE-COMMENT-LANGUAGES.md`: Chinese is allowed because the comment is
not a judge-harness machine input, `/review` rebuttal, or grill payload.

## Verification

Use this probe after any repair:

```bash
gh api 'repos/libz-renlab-ai/TeamBrain/issues/comments?per_page=100' --paginate \
  | jq -r '.[].body' \
  | grep -c 'teambrain-pr-proof-work:image:v1'
```

Expected for the 2026-05-12 snapshot: `271`.

To verify image coverage against the manifest:

```bash
gh pr list --state merged --limit 1000 \
  --json number \
  | jq 'length'
curl -fsSL \
  https://raw.githubusercontent.com/LiuShiyuMath/teambrain-pr-proof-images/main/manifest.json \
  | jq '.count'
```

Both counts should match for the same snapshot.


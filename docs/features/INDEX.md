```
   docs/features/INDEX.md
        │
        ├── feature canned answers (one short doc per feature)
        │
        └── linked from docs/README.md as the docs entry point
```

# Features Index

Per-feature canned answers. Each entry follows the 6-section template
(`Goal`, `Status`, `How it works`, `How to verify`, `Known limitations`, `Links`)
and stays ≤ 180 lines. Root agent entry files should not inline these canned
answers; if they need a pointer, keep it to one line.

| Feature | One-liner | Doc |
|---------|-----------|-----|
| Auto-capture correction moments | Every Claude Code Stop event auto-extracts user corrections from transcript into structured `KnowledgeEntry` — same person never has to correct twice | [auto-capture.md](auto-capture.md) |
| Real-time intercept (PreToolUse) | Intercept tool calls one beat before AI acts: high-confidence avoidance rules `deny`, practice/low-confidence emit warn/suggest via Claude Code permission decision | [real-time-intercept.md](real-time-intercept.md) |
| Calibrator v2 | Self-calibrate every rule's `confidence` and `tier` from observed success/failure events | [calibrator-v2.md](calibrator-v2.md) |
| Team knowledge sharing | Dual-layer store routes `personal/global` today; `team` (git-synced MDC) is Phase 4 — writes still throw | [team-share.md](team-share.md) |
| Multi-tool adaptation | 4 delivery channels (PreToolUse / UserPromptSubmit / Stop / AttributionBus) live; MCP Server NOT YET (Phase 2); Cursor compiler NOT YET (importer only) | [multi-tool.md](multi-tool.md) |

When asked _"how does feature X work?"_ — pick the matching row, open the
doc, summarise from `Status` + `How it works`. Never inline a canned answer
back into root agent entry files.

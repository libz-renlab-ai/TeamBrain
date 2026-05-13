#!/usr/bin/env node
"use strict";

// teamagent-statusline-bpp.cjs — BPP (Best-Practice Push) statusline segment.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.2
//   row "CC statusline | 默认开启 | 显示 '📬 N 条新推送'".
//
// Input:  inbox JSON on stdin. Two shapes accepted:
//   (a) array of InboxItem-like objects, each with `status` field
//   (b) object `{ items: [...] }` wrapping the array
//
// Output: a single line on stdout shaped:
//   📬 N pending best practices
//
// where N = count of items with `status === "pending"`. We deliberately always
// emit the formula (even for N=0) so consumers can `.includes("📬 N")` to
// assert; the task spec accepts "空字符串或 `📬 0`" and a single non-branching
// formula is simpler than special-casing zero.
//
// Behavior on malformed / empty stdin: emit `📬 0 pending best practices` and
// exit 0. We never want a bad JSON parse to corrupt the CC statusline render.
//
// Not wired into scripts/teamagent-statusline.cjs yet — Phase 3 ships this as
// a standalone, composable building block. Integration (concat with the main
// status row) lands in a later PR.

const fs = require("node:fs");

function readStdinSync() {
  try {
    if (process.stdin.isTTY) return "";
    return fs.readFileSync(0, { encoding: "utf-8" });
  } catch {
    return "";
  }
}

function extractItems(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && Array.isArray(parsed.items)) return parsed.items;
  return [];
}

function countPending(items) {
  let n = 0;
  for (const it of items) {
    if (it && typeof it === "object" && it.status === "pending") n += 1;
  }
  return n;
}

function main() {
  const raw = readStdinSync();
  let parsed = null;
  if (raw && raw.trim().length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const items = extractItems(parsed);
  const n = countPending(items);
  process.stdout.write(`📬 ${n} pending best practices`);
}

main();

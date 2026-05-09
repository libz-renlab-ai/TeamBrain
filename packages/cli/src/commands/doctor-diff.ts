// packages/cli/src/commands/doctor-diff.ts
// Issue #172: line-based unified diff for `teamagent doctor --fix --dry-run`.
// Self-contained — no `diff` npm dep, since this is the only consumer in @teamagent/cli.

type DiffOp = { type: "eq" | "del" | "add"; line: string };

function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", line: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", line: a[i]! });
      i++;
    } else {
      ops.push({ type: "add", line: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", line: a[i++]! });
  while (j < m) ops.push({ type: "add", line: b[j++]! });
  return ops;
}

/**
 * Render a minimal POSIX-ish unified diff between `before` and `after`.
 * `after === null` means the file is being deleted (header becomes `+++ /dev/null`).
 * Hunks split when an unchanged run exceeds 2 * context lines (git-like).
 * Returns "" when before == after (no diff to render).
 */
export function unifiedDiff(
  filePath: string,
  before: string,
  after: string | null,
  context: number = 3,
): string {
  const beforeLines = before.split("\n");
  const afterLines = after === null ? [] : after.split("\n");
  const ops = diffLines(beforeLines, afterLines);
  if (ops.every((op) => op.type === "eq")) return "";

  // Map each ops position to its old/new line number (1-based).
  const oldLineAt: number[] = new Array(ops.length + 1);
  const newLineAt: number[] = new Array(ops.length + 1);
  oldLineAt[0] = 1;
  newLineAt[0] = 1;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    oldLineAt[i + 1] = oldLineAt[i]! + (op.type === "add" ? 0 : 1);
    newLineAt[i + 1] = newLineAt[i]! + (op.type === "del" ? 0 : 1);
  }

  // Build hunk ranges by expanding each changed op by `context` on both sides
  // and merging overlapping/adjacent ranges.
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.type === "eq") continue;
    const start = Math.max(0, i - context);
    const end = Math.min(ops.length - 1, i + context);
    const last = ranges[ranges.length - 1];
    if (last && last[1] >= start - 1) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  const out: string[] = [];
  out.push(`--- ${filePath}`);
  out.push(after === null ? `+++ /dev/null` : `+++ ${filePath}`);

  for (const [start, end] of ranges) {
    const hunkOps = ops.slice(start, end + 1);
    const oldStart = oldLineAt[start]!;
    const newStart = newLineAt[start]!;
    const oldCount = hunkOps.filter((o) => o.type !== "add").length;
    const newCount = hunkOps.filter((o) => o.type !== "del").length;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const op of hunkOps) {
      const prefix = op.type === "eq" ? " " : op.type === "del" ? "-" : "+";
      out.push(prefix + op.line);
    }
  }

  return out.join("\n") + "\n";
}

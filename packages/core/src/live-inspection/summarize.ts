import type { InspectionResult } from "./types.js";

/**
 * Escape backticks, fenced-block markers, and control characters from
 * user-controlled strings (commit messages, PR/issue titles, event kinds)
 * before splicing into Markdown. The events.db is filled by hook channels
 * that can carry attacker-influenced text — un-escaped, a commit message
 * like `](javascript:alert(1))` or three backticks could pivot if the
 * Markdown is later rendered in an HTML viewer.
 *
 * We do NOT call sanitizeUserFacingText here because that strips ANSI /
 * C1 controls but leaves backticks and `]` intact; the Markdown renderer
 * is what we're defending against, not a terminal.
 */
function escapeMdInline(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/[\r\n]+/g, " ")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Render an inspection result as Markdown for human terminal display.
 * Pure function: no IO, no side effects.
 */
export function summarize(result: InspectionResult): string {
  const lines: string[] = [];
  lines.push(`## Inspection summary`);
  lines.push("");
  lines.push(`- **member**: \`${escapeMdInline(result.member)}\``);
  if (result.project)
    lines.push(`- **project**: \`${escapeMdInline(result.project)}\``);
  lines.push(
    `- **window**: ${result.window.since} → ${result.window.until}`
  );
  lines.push(`- **generated at**: ${result.generatedAt}`);
  lines.push("");

  lines.push(`### Counts`);
  lines.push("");
  const c = result.counts;
  lines.push(`- AI events: **${c.events}**`);
  lines.push(`- commits: **${c.commits}**`);
  lines.push(
    `- PRs: **${c.prsOpened}** opened, **${c.prsMerged}** merged`
  );
  lines.push(`- issues opened: **${c.issuesOpened}**`);
  lines.push(`- pre-tool-use denies: **${c.preDenied}**`);
  lines.push(`- narrative recurrences: **${c.narrativeRecurred}**`);
  lines.push(`- prompt injections: **${c.userPromptInjected}**`);
  lines.push("");

  if (result.abnormalSignals.length > 0) {
    lines.push(`### 🚨 abnormal signals`);
    lines.push("");
    for (const s of result.abnormalSignals) {
      lines.push(`- **${s.id}**: ${s.message}`);
    }
    lines.push("");
  } else {
    lines.push(`### Status`);
    lines.push("");
    lines.push(`healthy — no abnormal signals detected.`);
    lines.push("");
  }

  if (result.timeline.length > 0) {
    lines.push(`### Recent timeline (${result.timeline.length} entries)`);
    lines.push("");
    for (const entry of result.timeline.slice(-20)) {
      lines.push(`- \`${entry.at}\` ${renderEntry(entry)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderEntry(
  entry: import("./types.js").TimelineEntry
): string {
  switch (entry.kind) {
    case "event":
      return `event \`${escapeMdInline(entry.event.kind)}\``;
    case "commit":
      return `commit \`${entry.commit.sha.slice(0, 7)}\` ${escapeMdInline(
        entry.commit.message
      )}`;
    case "pull-request":
      return `PR #${entry.pr.number} (${entry.pr.state}) ${escapeMdInline(
        entry.pr.title
      )}`;
    case "issue":
      return `issue #${entry.issue.number} (${
        entry.issue.state
      }) ${escapeMdInline(entry.issue.title)}`;
  }
}

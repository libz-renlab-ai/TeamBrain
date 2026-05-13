import type { InspectionResult } from "./types.js";

/**
 * Render an inspection result as Markdown for human terminal display.
 * Pure function: no IO, no side effects.
 */
export function summarize(result: InspectionResult): string {
  const lines: string[] = [];
  lines.push(`## Inspection summary`);
  lines.push("");
  lines.push(`- **member**: \`${result.member}\``);
  if (result.project) lines.push(`- **project**: \`${result.project}\``);
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
      return `event \`${entry.event.kind}\``;
    case "commit":
      return `commit \`${entry.commit.sha.slice(0, 7)}\` ${
        entry.commit.message
      }`;
    case "pull-request":
      return `PR #${entry.pr.number} (${entry.pr.state}) ${entry.pr.title}`;
    case "issue":
      return `issue #${entry.issue.number} (${entry.issue.state}) ${entry.issue.title}`;
  }
}

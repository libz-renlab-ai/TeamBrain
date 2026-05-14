// Build-time script: reads private/ via the same lib functions the API routes
// use, dumps JSON snapshots to public/data/*.json so the static export can be
// fully self-contained on GitHub Pages (no /api routes at runtime).
//
// Run via: bun tools/inline-static-data.ts
// Or implicitly via package.json "build:static" before next build.
//
// Each /api/* GET endpoint the client uses has a corresponding /data/*.json.
// The StaticFetchShim in src/components/StaticFetchShim.tsx rewrites at runtime.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { listAgents, getState } from '../src/lib/agents';
import { listTasks } from '../src/lib/tasks';
import { listResources } from '../src/lib/resources';
import { listMeetings, listSlackTranscripts, readMeeting } from '../src/lib/meetings';
import { readTimeline } from '../src/lib/timeline';
import { parseOrgChart } from '../src/bootstrap/extract';

const OUT_DIR = join(process.cwd(), 'public', 'data');

async function writeJson(rel: string, data: unknown): Promise<void> {
  const target = join(OUT_DIR, rel);
  await fs.mkdir(join(target, '..'), { recursive: true });
  await fs.writeFile(target, JSON.stringify(data, null, 2));
  console.log(`✓ ${rel}`);
}

async function dumpAgents(): Promise<void> {
  const [names, orgEntries] = await Promise.all([listAgents(), parseOrgChart().catch(() => [])]);
  const orgIndex = new Map(orgEntries.map((e) => [e.name, e]));
  const agents = await Promise.all(
    names.map(async (n) => {
      try {
        const profile = await getState(n);
        const org = orgIndex.get(n);
        if (org) {
          return { ...profile, dept: org.dept || profile.dept, role: org.role || profile.role };
        }
        return profile;
      } catch {
        return { name: n, _error: 'profile_corrupted' };
      }
    })
  );
  await writeJson('agents.json', { agents });
  // Per-agent dump so the dynamic [name] detail route can resolve /api/agents/<name>
  // via the StaticFetchShim. File names are raw UTF-8 (HTTP servers decode the
  // percent-encoded URL once before hitting disk); the shim builds the URL via
  // encodeURIComponent and the on-disk name decodes to match.
  for (const agent of agents) {
    if (!agent || (agent as { _error?: string })._error) continue;
    const name = (agent as { name: string }).name;
    if (!name) continue;
    await writeJson(join('agents', `${name}.json`), agent);
  }
}

async function dumpTasks(): Promise<void> {
  const tasks = await listTasks().catch(() => []);
  await writeJson('tasks.json', { tasks });
  for (const t of tasks) {
    const id = (t as { id?: string }).id;
    if (!id) continue;
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    await writeJson(join('tasks', `${safe}.json`), t);
  }
}

async function dumpResources(): Promise<void> {
  const resources = await listResources().catch(() => []);
  await writeJson('resources.json', { resources });
}

async function dumpMeetings(): Promise<void> {
  const meetings = await listMeetings().catch(() => []);
  await writeJson('meetings.json', { meetings });
  // Per-file content
  for (const m of meetings) {
    const content = await readMeeting(m.file).catch(() => null);
    if (content == null) continue;
    const safe = m.file.replace(/\.txt$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    await writeJson(join('meetings', `${safe}.json`), { file: m.file, content });
  }
}

async function dumpSlack(): Promise<void> {
  const transcripts = await listSlackTranscripts().catch(() => []);
  await writeJson('slack_transcripts.json', { transcripts });
  // Static export has no real connection. Render a believable "disconnected" status.
  await writeJson('slack_status.json', { connected: false, workspace: null, channels: [] });
  await writeJson('slack_channels.json', { channels: [] });
}

async function dumpGithub(): Promise<void> {
  await writeJson('github_status.json', { connected: false, repos: [] });
  await writeJson('github_repos.json', { repos: [] });
}

async function dumpTimeline(): Promise<void> {
  const events = await readTimeline(200).catch(() => []);
  await writeJson('timeline.json', { events });
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    dumpAgents(),
    dumpTasks(),
    dumpResources(),
    dumpMeetings(),
    dumpSlack(),
    dumpGithub(),
    dumpTimeline()
  ]);
  console.log(`\nStatic data dumped to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('inline-static-data failed:', err);
  process.exit(1);
});

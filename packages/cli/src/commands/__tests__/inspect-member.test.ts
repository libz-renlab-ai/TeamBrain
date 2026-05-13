import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { InMemoryGitHubActivityPort } from "@teamagent/ports/contracts";
import {
  executeInspectMember,
  parseInspectMemberArgs,
  renderInspectMemberResult,
  InspectMemberError,
  renderInspectMemberHelp,
} from "../inspect-member.js";

const FIXED_NOW = "2026-05-13T10:00:00Z";

describe("parseInspectMemberArgs", () => {
  it("requires a positional member", () => {
    expect(() => parseInspectMemberArgs([])).toThrowError(InspectMemberError);
  });

  it("parses member + project + window + now", () => {
    const opts = parseInspectMemberArgs([
      "alice",
      "--project",
      "owner/repo",
      "--window",
      "7d",
      "--now",
      FIXED_NOW,
    ]);
    expect(opts.member).toBe("alice");
    expect(opts.project).toBe("owner/repo");
    expect(opts.window).toBe("7d");
    expect(opts.now).toBe(FIXED_NOW);
  });

  it("rejects unknown --window value", () => {
    expect(() =>
      parseInspectMemberArgs(["alice", "--window", "weird"])
    ).toThrowError(InspectMemberError);
  });

  it("rejects flags that need a value but get none", () => {
    expect(() => parseInspectMemberArgs(["alice", "--window"])).toThrowError(
      InspectMemberError
    );
    expect(() => parseInspectMemberArgs(["alice", "--now"])).toThrowError(
      InspectMemberError
    );
    expect(() => parseInspectMemberArgs(["alice", "--out"])).toThrowError(
      InspectMemberError
    );
    expect(() =>
      parseInspectMemberArgs(["alice", "--teamagent-home"])
    ).toThrowError(InspectMemberError);
    expect(() =>
      parseInspectMemberArgs(["alice", "--fake-abnormal"])
    ).toThrowError(InspectMemberError);
  });

  it("rejects unknown --fake-abnormal value", () => {
    expect(() =>
      parseInspectMemberArgs(["alice", "--fake-abnormal", "weird"])
    ).toThrowError(InspectMemberError);
  });

  it("supports = form for --project / --now / --out", () => {
    const opts = parseInspectMemberArgs([
      "alice",
      "--project=owner/repo",
      "--now=" + FIXED_NOW,
      "--out=/tmp/x.json",
    ]);
    expect(opts.project).toBe("owner/repo");
    expect(opts.out).toBe("/tmp/x.json");
  });
});

describe("renderInspectMemberHelp", () => {
  it("mentions inspect-member and required args", () => {
    const help = renderInspectMemberHelp();
    expect(help).toContain("inspect-member");
    expect(help).toContain("--window");
  });
});

describe("executeInspectMember", () => {
  it("happy path writes inspection.json and returns healthy summary", async () => {
    const writes = new Map<string, string>();
    const out = await executeInspectMember(
      {
        member: "alice",
        project: "owner/repo",
        window: "24h",
        now: FIXED_NOW,
        teamagentHome: "/tmp/fake-home",
        githubFake: true,
      },
      {
        eventReader: () => [
          {
            id: "e1",
            kind: "hook-pre.matched",
            timestamp: "2026-05-13T08:00:00Z",
            schema_version: 1,
          },
        ],
        githubFactory: () =>
          new InMemoryGitHubActivityPort({
            commits: [
              {
                sha: "aaa",
                message: "feat: x",
                authoredAt: "2026-05-13T09:00:00Z",
                author: "alice",
                repo: "owner/repo",
              },
            ],
            pullRequests: [],
            issues: [],
          }),
        writeFile: (p, c) => writes.set(p, c),
        randomSuffix: () => "abcd",
      }
    );

    expect(out.incidentPath).toBeUndefined();
    expect(out.result.abnormalSignals).toEqual([]);
    expect(out.result.counts.events).toBe(1);
    expect(out.result.counts.commits).toBe(1);
    expect(writes.size).toBe(1);
    const inspKey = Array.from(writes.keys())[0]!;
    expect(inspKey).toContain("inspections");
    const json = JSON.parse(writes.get(inspKey)!);
    expect(json.member).toBe("alice");
    expect(renderInspectMemberResult(out)).toContain("## Inspection summary");
  });

  it("abnormal path writes both inspection.json and incident.json", async () => {
    const writes = new Map<string, string>();
    const out = await executeInspectMember(
      {
        member: "alice",
        project: "owner/repo",
        window: "24h",
        now: FIXED_NOW,
        teamagentHome: "/tmp/fake-home",
        githubFake: true,
        fakeAbnormal: "repeated_deny",
      },
      {
        githubFactory: () =>
          new InMemoryGitHubActivityPort({
            commits: [],
            pullRequests: [],
            issues: [],
          }),
        writeFile: (p, c) => writes.set(p, c),
        randomSuffix: () => "abcd",
      }
    );

    expect(out.incidentPath).toBeDefined();
    expect(out.result.abnormalSignals.map((s) => s.id)).toContain(
      "repeated_deny"
    );
    expect(writes.size).toBe(2);
    expect(
      Array.from(writes.keys()).some((k) => k.includes("incidents"))
    ).toBe(true);
    const incidentKey = Array.from(writes.keys()).find((k) =>
      k.includes("incidents")
    )!;
    const incident = JSON.parse(writes.get(incidentKey)!);
    expect(incident.member).toBe("alice");
    expect(incident.signals.length).toBeGreaterThan(0);
    expect(renderInspectMemberResult(out)).toContain("🚨 abnormal signals");
  });

  it("--out writes a copy to the requested path", async () => {
    const writes = new Map<string, string>();
    const outArg = "/tmp/test-out/insp.json";
    await executeInspectMember(
      {
        member: "alice",
        project: "owner/repo",
        window: "24h",
        now: FIXED_NOW,
        teamagentHome: "/tmp/fake-home",
        githubFake: true,
        out: outArg,
      },
      {
        eventReader: () => [],
        githubFactory: () =>
          new InMemoryGitHubActivityPort({
            commits: [],
            pullRequests: [],
            issues: [],
          }),
        writeFile: (p, c) => writes.set(p, c),
      }
    );
    expect(writes.has(outArg)).toBe(true);
  });

  it("derives a project slug from --project=owner/repo (uses repo segment)", async () => {
    const writes = new Map<string, string>();
    await executeInspectMember(
      {
        member: "alice",
        project: "owner/some-repo",
        window: "24h",
        now: FIXED_NOW,
        teamagentHome: "/tmp/fake-home",
        githubFake: true,
      },
      {
        eventReader: () => [],
        githubFactory: () =>
          new InMemoryGitHubActivityPort({
            commits: [],
            pullRequests: [],
            issues: [],
          }),
        writeFile: (p, c) => writes.set(p, c),
      }
    );
    const inspKey = Array.from(writes.keys())[0]!;
    expect(inspKey).toContain(path.join("fake-home", "some-repo"));
  });
});

describe("default writeFile (real fs)", () => {
  it("creates parent directories and writes the file", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inspect-real-"));
    const out = await executeInspectMember(
      {
        member: "alice",
        project: "owner/repo",
        window: "24h",
        now: FIXED_NOW,
        teamagentHome: tmp,
        githubFake: true,
      },
      {
        eventReader: () => [],
        githubFactory: () =>
          new InMemoryGitHubActivityPort({
            commits: [],
            pullRequests: [],
            issues: [],
          }),
        randomSuffix: () => "abcd",
      }
    );
    expect(fs.existsSync(out.inspectionPath)).toBe(true);
    // cleanup
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// PR-A — `teamagent bpp` namespace dispatcher + `bpp serve`.
//
// Acceptance contract: docs/plans/2026-05-13-bpp-full-system-acceptance.md
// §2 里程碑一 验证方法 step 1 ("启动一个中心服务实例"). The headline test
// (`runBppServe binds a real HTTP server`) spins up the actual digital-twin
// production server and hits it over HTTP — same code path a user runs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startMockServer,
  writeMember,
  appendAudit,
  writeRoleMetadata,
  type MockServerHandle,
  type TeamMember,
} from "@teamagent/digital-twin";
import {
  parseBppServeArgs,
  renderBppHelp,
  renderBppServeHelp,
  runBppServe,
  runBpp,
  BppArgError,
  parseBppPushArgs,
  runBppPush,
  renderBppPushHelp,
  parseBppInboxArgs,
  runBppInbox,
  renderBppInboxHelp,
  parseBppActArgs,
  runBppAct,
  renderBppActHelp,
  parseBppRevokeArgs,
  runBppRevoke,
  renderBppRevokeHelp,
  parseBppForcePushArgs,
  runBppForcePush,
  renderBppForcePushHelp,
  parseBppAuditArgs,
  runBppAudit,
  renderBppAuditHelp,
  parseBppRoleArgs,
  runBppRole,
  renderBppRoleHelp,
  parseBppJoinArgs,
  runBppJoin,
  renderBppJoinHelp,
  parseBppMineArgs,
  runBppMine,
  renderBppMineHelp,
  type RunBppServeDeps,
} from "../commands/bpp.js";

function leadMember(user_id: string): TeamMember {
  return {
    schema_version: 1,
    user_id,
    display_name: user_id,
    role: "lead",
    joined_at: "2026-05-14T00:00:00Z",
    notification_prefs: {},
  };
}

describe("parseBppServeArgs", () => {
  it("parses --port / --host / --dir", () => {
    const args = parseBppServeArgs([
      "--port=18999",
      "--host=127.0.0.1",
      "--dir=/tmp/x",
    ]);
    expect(args).toEqual({
      port: 18999,
      host: "127.0.0.1",
      dir: "/tmp/x",
      help: false,
    });
  });

  it("recognises --help and -h", () => {
    expect(parseBppServeArgs(["--help"]).help).toBe(true);
    expect(parseBppServeArgs(["-h"]).help).toBe(true);
  });

  it("defaults to no flags set", () => {
    const args = parseBppServeArgs([]);
    expect(args.port).toBeUndefined();
    expect(args.host).toBeUndefined();
    expect(args.dir).toBeUndefined();
    expect(args.help).toBe(false);
  });

  it("throws BppArgError on an unknown argument", () => {
    expect(() => parseBppServeArgs(["--bogus"])).toThrow(BppArgError);
  });
});

describe("renderBppHelp / renderBppServeHelp", () => {
  it("namespace help lists the serve subcommand", () => {
    const help = renderBppHelp();
    expect(help).toContain("teamagent bpp serve");
    expect(help).toContain("启动 BPP 中心服务");
  });

  it("serve help documents the three flags", () => {
    const help = renderBppServeHelp();
    expect(help).toContain("--port=");
    expect(help).toContain("--host=");
    expect(help).toContain("--dir=");
  });
});

describe("runBppServe", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bpp-serve-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("binds a real HTTP server on an ephemeral port and serves the dashboard", async () => {
    const handle = await runBppServe(
      { port: 0, host: "127.0.0.1", dir, help: false },
      { installSignalHandlers: false },
    );
    try {
      expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(handle.outputDir).toBe(dir);
      // Hit the running server — proves it's a real, listening socket.
      const res = await fetch(handle.url + "/");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    } finally {
      await handle.close();
    }
  });

  it("rejects an out-of-range --port", async () => {
    await expect(
      runBppServe(
        { port: 70000, dir, help: false },
        { installSignalHandlers: false },
      ),
    ).rejects.toThrow(BppArgError);
  });

  it("passes CLI flags to runProdServer as an env overlay", async () => {
    let seenEnv: NodeJS.ProcessEnv | undefined;
    const fakeRunProdServer: RunBppServeDeps["runProdServer"] = async (deps) => {
      seenEnv = deps?.env;
      deps?.onReady?.({ url: "http://fake:1", outputDir: "/fake" });
      return async () => {};
    };
    const handle = await runBppServe(
      { port: 12345, host: "0.0.0.0", dir: "/data/x", help: false },
      { installSignalHandlers: false, runProdServer: fakeRunProdServer },
    );
    expect(handle.url).toBe("http://fake:1");
    expect(seenEnv?.PORT).toBe("12345");
    expect(seenEnv?.HOST).toBe("0.0.0.0");
    expect(seenEnv?.TEAMAGENT_COLLECTOR_DIR).toBe("/data/x");
  });
});

describe("runBpp dispatcher", () => {
  function captureStdout(): { restore: () => void; text: () => string } {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string | Uint8Array): boolean => {
      chunks.push(typeof s === "string" ? s : Buffer.from(s).toString("utf8"));
      return true;
    }) as typeof process.stdout.write;
    return {
      restore: () => {
        process.stdout.write = original;
      },
      text: () => chunks.join(""),
    };
  }

  it("prints namespace help for `bpp` with no subcommand", async () => {
    const cap = captureStdout();
    try {
      await runBpp([]);
    } finally {
      cap.restore();
    }
    expect(cap.text()).toContain("teamagent bpp serve");
  });

  it("prints namespace help for `bpp --help`", async () => {
    const cap = captureStdout();
    try {
      await runBpp(["--help"]);
    } finally {
      cap.restore();
    }
    expect(cap.text()).toContain("Best-Practice Push");
  });

  it("prints serve help for `bpp serve --help`", async () => {
    const cap = captureStdout();
    try {
      await runBpp(["serve", "--help"]);
    } finally {
      cap.restore();
    }
    expect(cap.text()).toContain("teamagent bpp serve");
    expect(cap.text()).toContain("--port=");
  });

  it("throws BppArgError on an unknown subcommand", async () => {
    await expect(runBpp(["bogus-subcommand"])).rejects.toThrow(BppArgError);
  });
});

// ── PR-B — push / inbox / accept / reject HTTP clients ────────────────────
//
// Acceptance contract §2 里程碑一 验证方法 steps 4-6: external command sends
// a BestPractice to the push endpoint → it fans out to receiver inboxes →
// a receiver accepts and a SKILL.md lands in their local skill library.
// Every test here drives the CLI run-functions against a REAL ephemeral
// startMockServer over HTTP — the same code path a user runs.

describe("bpp push / inbox / accept against a real server", () => {
  let server: MockServerHandle;
  let dataDir: string;
  let homeDir: string;
  let origHome: string | undefined;
  let origUserProfile: string | undefined;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "bpp-pb-data-"));
    homeDir = mkdtempSync(join(tmpdir(), "bpp-pb-home-"));
    server = await startMockServer({
      port: 0,
      host: "127.0.0.1",
      outputDir: dataDir,
    });
    // accept-handler compiles SKILL.md under process.env.HOME/USERPROFILE;
    // point it at a temp dir so the test never touches the real ~/.claude.
    origHome = process.env.HOME;
    origUserProfile = process.env.USERPROFILE;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
  });
  afterEach(async () => {
    await server.close();
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    if (origUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = origUserProfile;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("push fans out to receiver inboxes; inbox lists the pending item", async () => {
    const pushRes = await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-001",
        "--title=任何数据库结构修改前必须先备份",
        "--body=改 schema 前先 dump 一份",
        "--receivers=xiaoli,xiaowang",
      ]),
    );
    expect(pushRes.exitCode).toBe(0);
    expect(pushRes.stdout).toContain("bp-001");
    expect(pushRes.stdout).toContain("xiaoli");
    expect(pushRes.stdout).toContain("xiaowang");

    const inboxRes = await runBppInbox(
      parseBppInboxArgs([`--server=${server.url}`, "--receiver=xiaoli"]),
    );
    expect(inboxRes.exitCode).toBe(0);
    expect(inboxRes.stdout).toContain("bp=bp-001");
    expect(inboxRes.stdout).toContain("status=pending");
  });

  it("accept compiles a real SKILL.md and reports compiled_path", async () => {
    await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-002",
        "--title=T",
        "--body=B",
        "--receivers=xiaoli",
      ]),
    );
    const inboxJson = await runBppInbox(
      parseBppInboxArgs([
        `--server=${server.url}`,
        "--receiver=xiaoli",
        "--json",
      ]),
    );
    const items = JSON.parse(inboxJson.stdout) as Array<{ id: string }>;
    expect(items).toHaveLength(1);
    const inboxId = items[0]!.id;

    const acceptRes = await runBppAct(
      parseBppActArgs(
        [
          `--server=${server.url}`,
          `--inbox-id=${inboxId}`,
          "--receiver=xiaoli",
        ],
        "accept",
      ),
      "accept",
    );
    expect(acceptRes.exitCode).toBe(0);
    expect(acceptRes.stdout).toContain("accepted");
    expect(acceptRes.stdout).toContain("已编译技能文件");

    // The SKILL.md really lands in the (temp) local skill library.
    const skillPath = join(
      homeDir,
      ".claude",
      "skills",
      "teamagent",
      "bp-002",
      "SKILL.md",
    );
    expect(existsSync(skillPath)).toBe(true);

    // ...and the inbox row flips to accepted.
    const after = await runBppInbox(
      parseBppInboxArgs([
        `--server=${server.url}`,
        "--receiver=xiaoli",
        "--json",
      ]),
    );
    const afterItems = JSON.parse(after.stdout) as Array<{ status: string }>;
    expect(afterItems[0]!.status).toBe("accepted");
  });

  it("reject flips status without compiling a skill file", async () => {
    await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-003",
        "--title=T",
        "--body=B",
        "--receivers=xiaowang",
      ]),
    );
    const items = JSON.parse(
      (
        await runBppInbox(
          parseBppInboxArgs([
            `--server=${server.url}`,
            "--receiver=xiaowang",
            "--json",
          ]),
        )
      ).stdout,
    ) as Array<{ id: string }>;
    const rejectRes = await runBppAct(
      parseBppActArgs(
        [
          `--server=${server.url}`,
          `--inbox-id=${items[0]!.id}`,
          "--receiver=xiaowang",
        ],
        "reject",
      ),
      "reject",
    );
    expect(rejectRes.exitCode).toBe(0);
    expect(rejectRes.stdout).toContain("rejected");
    expect(rejectRes.stdout).not.toContain("已编译");
  });

  it("inbox for an unknown receiver is empty, not an error", async () => {
    const res = await runBppInbox(
      parseBppInboxArgs([`--server=${server.url}`, "--receiver=nobody"]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("收件箱为空");
  });
});

describe("bpp push / inbox / accept — arg + error handling", () => {
  it("push without required flags exits 2", async () => {
    const res = await runBppPush(parseBppPushArgs(["--id=x"]));
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("--id / --title / --body / --receivers");
  });

  it("push rejects an invalid --type / --topic / --tier / --score", () => {
    expect(() => parseBppPushArgs(["--type=bogus"])).toThrow(BppArgError);
    expect(() => parseBppPushArgs(["--topic=bogus"])).toThrow(BppArgError);
    expect(() => parseBppPushArgs(["--tier=bogus"])).toThrow(BppArgError);
    expect(() => parseBppPushArgs(["--score=2"])).toThrow(BppArgError);
  });

  it("inbox without --receiver exits 2", async () => {
    const res = await runBppInbox(parseBppInboxArgs([]));
    expect(res.exitCode).toBe(2);
  });

  it("accept without --inbox-id exits 2", async () => {
    const res = await runBppAct(
      parseBppActArgs(["--receiver=x"], "accept"),
      "accept",
    );
    expect(res.exitCode).toBe(2);
  });

  it("push against a down server exits 1 with a connect hint", async () => {
    const res = await runBppPush(
      parseBppPushArgs([
        "--server=http://127.0.0.1:1",
        "--id=x",
        "--title=t",
        "--body=b",
        "--receivers=a",
      ]),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("无法连接");
  });

  it("help renderers mention the key flags", () => {
    expect(renderBppPushHelp()).toContain("--receivers=");
    expect(renderBppInboxHelp()).toContain("--receiver=");
    expect(renderBppActHelp("accept")).toContain("--inbox-id=");
    expect(renderBppActHelp("reject")).toContain("拒绝");
  });

  it("namespace help now lists push / inbox / accept / reject", () => {
    const help = renderBppHelp();
    expect(help).toContain("teamagent bpp push");
    expect(help).toContain("teamagent bpp inbox");
    expect(help).toContain("teamagent bpp accept");
    expect(help).toContain("teamagent bpp reject");
  });
});

// ── PR-C — revoke (+ skill-file cascade) and force-push HTTP clients ──────
//
// Acceptance contract §2 里程碑一 验证方法 step 8: 老张按撤回 → 5 秒内小李
// 技能库的文件消失、小王收件箱的条目消失. The revoke client drives the
// server-side cascade (accept persists compiled_path, revoke unlinks it).

describe("bpp revoke / force-push against a real server", () => {
  let server: MockServerHandle;
  let dataDir: string;
  let homeDir: string;
  let origHome: string | undefined;
  let origUserProfile: string | undefined;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "bpp-pc-data-"));
    homeDir = mkdtempSync(join(tmpdir(), "bpp-pc-home-"));
    // The /v1/revoke + /v1/bp-push/force routes are lead-gated — seed a lead.
    writeMember(dataDir, leadMember("laozhang"));
    server = await startMockServer({
      port: 0,
      host: "127.0.0.1",
      outputDir: dataDir,
    });
    origHome = process.env.HOME;
    origUserProfile = process.env.USERPROFILE;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
  });
  afterEach(async () => {
    await server.close();
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    if (origUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = origUserProfile;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("revoke cascades: an accepted BP's SKILL.md is physically deleted", async () => {
    await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-revoke-1",
        "--title=T",
        "--body=B",
        "--receivers=xiaoli",
      ]),
    );
    const items = JSON.parse(
      (
        await runBppInbox(
          parseBppInboxArgs([
            `--server=${server.url}`,
            "--receiver=xiaoli",
            "--json",
          ]),
        )
      ).stdout,
    ) as Array<{ id: string }>;
    await runBppAct(
      parseBppActArgs(
        [
          `--server=${server.url}`,
          `--inbox-id=${items[0]!.id}`,
          "--receiver=xiaoli",
        ],
        "accept",
      ),
      "accept",
    );
    const skillPath = join(
      homeDir,
      ".claude",
      "skills",
      "teamagent",
      "bp-revoke-1",
      "SKILL.md",
    );
    expect(existsSync(skillPath)).toBe(true);

    const revokeRes = await runBppRevoke(
      parseBppRevokeArgs([
        `--server=${server.url}`,
        "--bp-id=bp-revoke-1",
        "--lead-user-id=laozhang",
        "--reason=误推送",
      ]),
    );
    expect(revokeRes.exitCode).toBe(0);
    expect(revokeRes.stdout).toContain("已撤回 bp-revoke-1");
    expect(revokeRes.stdout).toContain("已级联删除 1 个本机技能文件");
    expect(existsSync(skillPath)).toBe(false);
  });

  it("revoke of a pending-only BP reports no skill files deleted", async () => {
    await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-revoke-2",
        "--title=T",
        "--body=B",
        "--receivers=xiaowang",
      ]),
    );
    const res = await runBppRevoke(
      parseBppRevokeArgs([
        `--server=${server.url}`,
        "--bp-id=bp-revoke-2",
        "--lead-user-id=laozhang",
        "--reason=cleanup",
      ]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("无已采纳的技能文件需要删除");
  });

  it("revoke from a non-lead exits 1 with a 403 hint", async () => {
    await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-revoke-3",
        "--title=T",
        "--body=B",
        "--receivers=xiaoli",
      ]),
    );
    const res = await runBppRevoke(
      parseBppRevokeArgs([
        `--server=${server.url}`,
        "--bp-id=bp-revoke-3",
        "--lead-user-id=xiaoli",
        "--reason=I disagree",
      ]),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("403");
    expect(res.stderr).toContain("不是团队负责人");
  });

  it("force-push puts a forced item directly in a member's inbox", async () => {
    // seed the BP into _bp/ by pushing it to a throwaway receiver first
    await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-force-1",
        "--title=T",
        "--body=B",
        "--receivers=seed",
      ]),
    );
    const res = await runBppForcePush(
      parseBppForcePushArgs([
        `--server=${server.url}`,
        "--bp-id=bp-force-1",
        "--receiver=xiaowang",
        "--lead-user-id=laozhang",
      ]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("已强推 bp-force-1 → xiaowang");

    const inbox = await runBppInbox(
      parseBppInboxArgs([`--server=${server.url}`, "--receiver=xiaowang"]),
    );
    expect(inbox.stdout).toContain("bp=bp-force-1");
  });

  it("force-push from a non-lead exits 1 with a 403 hint", async () => {
    await runBppPush(
      parseBppPushArgs([
        `--server=${server.url}`,
        "--id=bp-force-2",
        "--title=T",
        "--body=B",
        "--receivers=seed",
      ]),
    );
    const res = await runBppForcePush(
      parseBppForcePushArgs([
        `--server=${server.url}`,
        "--bp-id=bp-force-2",
        "--receiver=xiaowang",
        "--lead-user-id=xiaoli",
      ]),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("403");
  });
});

describe("bpp revoke / force-push — arg + error handling", () => {
  it("revoke without required flags exits 2", async () => {
    const res = await runBppRevoke(parseBppRevokeArgs(["--bp-id=x"]));
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("--bp-id / --lead-user-id / --reason");
  });

  it("force-push without required flags exits 2", async () => {
    const res = await runBppForcePush(parseBppForcePushArgs(["--bp-id=x"]));
    expect(res.exitCode).toBe(2);
  });

  it("revoke / force-push reject unknown args", () => {
    expect(() => parseBppRevokeArgs(["--bogus"])).toThrow(BppArgError);
    expect(() => parseBppForcePushArgs(["--bogus"])).toThrow(BppArgError);
  });

  it("revoke against a down server exits 1 with a connect hint", async () => {
    const res = await runBppRevoke(
      parseBppRevokeArgs([
        "--server=http://127.0.0.1:1",
        "--bp-id=x",
        "--lead-user-id=l",
        "--reason=r",
      ]),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("无法连接");
  });

  it("help renderers mention the key flags", () => {
    expect(renderBppRevokeHelp()).toContain("--bp-id=");
    expect(renderBppRevokeHelp()).toContain("--reason=");
    expect(renderBppForcePushHelp()).toContain("--receiver=");
  });

  it("namespace help now lists revoke + force-push", () => {
    const help = renderBppHelp();
    expect(help).toContain("teamagent bpp revoke");
    expect(help).toContain("teamagent bpp force-push");
  });
});

describe("bpp audit / role against a real server", () => {
  let server: MockServerHandle;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "bpp-ar-data-"));
    server = await startMockServer({
      port: 0,
      host: "127.0.0.1",
      outputDir: dataDir,
    });
  });
  afterEach(async () => {
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("audit lists the server's append-only event log", async () => {
    appendAudit(dataDir, {
      schema_version: 1,
      id: "ev-cli-1",
      event_type: "pushed",
      bp_id: "bp-1",
      actor: "laozhang",
      timestamp: "2026-05-14T10:00:00Z",
      metadata: {},
    });
    const res = await runBppAudit(parseBppAuditArgs([`--server=${server.url}`]));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("ev-cli-1");
    expect(res.stdout).toContain("pushed");
  });

  it("audit --since filters events at or after the ISO cutoff", async () => {
    appendAudit(dataDir, {
      schema_version: 1,
      id: "ev-old",
      event_type: "pushed",
      bp_id: "bp-1",
      actor: "laozhang",
      timestamp: "2026-05-12T10:00:00Z",
      metadata: {},
    });
    appendAudit(dataDir, {
      schema_version: 1,
      id: "ev-new",
      event_type: "revoked",
      bp_id: "bp-1",
      actor: "laozhang",
      timestamp: "2026-05-14T10:00:00Z",
      metadata: {},
    });
    const res = await runBppAudit(
      parseBppAuditArgs([`--server=${server.url}`, "--since=2026-05-13T00:00:00Z"]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("ev-new");
    expect(res.stdout).not.toContain("ev-old");
  });

  it("audit --json outputs the raw event array", async () => {
    appendAudit(dataDir, {
      schema_version: 1,
      id: "ev-json",
      event_type: "accepted",
      bp_id: "bp-1",
      actor: "xiaoli",
      timestamp: "2026-05-14T10:00:00Z",
      metadata: {},
    });
    const res = await runBppAudit(
      parseBppAuditArgs([`--server=${server.url}`, "--json"]),
    );
    const events = JSON.parse(res.stdout) as Array<{ id: string }>;
    expect(events.some((e) => e.id === "ev-json")).toBe(true);
  });

  it("role reports main_lead for a seeded lead", async () => {
    writeMember(dataDir, leadMember("laozhang"));
    const res = await runBppRole(
      parseBppRoleArgs([`--server=${server.url}`, "--user=laozhang"]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("laozhang");
    expect(res.stdout).toContain("main_lead");
  });

  it("role reports co_lead when role-metadata says so", async () => {
    writeMember(dataDir, leadMember("xiaoli"));
    writeRoleMetadata(dataDir, {
      schema_version: 1,
      leads: { xiaoli: "co_lead" },
    });
    const res = await runBppRole(
      parseBppRoleArgs([`--server=${server.url}`, "--user=xiaoli"]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("co_lead");
  });

  it("role reports member for an unknown user", async () => {
    const res = await runBppRole(
      parseBppRoleArgs([`--server=${server.url}`, "--user=nobody"]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("member");
  });
});

describe("bpp audit / role — arg + error handling", () => {
  it("role without --user exits 2", async () => {
    const res = await runBppRole(parseBppRoleArgs([]));
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("--user");
  });

  it("audit / role reject unknown args", () => {
    expect(() => parseBppAuditArgs(["--bogus"])).toThrow(BppArgError);
    expect(() => parseBppRoleArgs(["--bogus"])).toThrow(BppArgError);
  });

  it("audit against a down server exits 1 with a connect hint", async () => {
    const res = await runBppAudit(
      parseBppAuditArgs(["--server=http://127.0.0.1:1"]),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("无法连接");
  });

  it("role against a down server exits 1 with a connect hint", async () => {
    const res = await runBppRole(
      parseBppRoleArgs(["--server=http://127.0.0.1:1", "--user=x"]),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("无法连接");
  });

  it("help renderers mention the key flags", () => {
    expect(renderBppAuditHelp()).toContain("--since=");
    expect(renderBppRoleHelp()).toContain("--user=");
  });

  it("namespace help now lists audit + role", () => {
    const help = renderBppHelp();
    expect(help).toContain("teamagent bpp audit");
    expect(help).toContain("teamagent bpp role");
  });
});

describe("bpp join against a real server", () => {
  let server: MockServerHandle;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "bpp-join-data-"));
    server = await startMockServer({
      port: 0,
      host: "127.0.0.1",
      outputDir: dataDir,
    });
  });
  afterEach(async () => {
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("join self-registers a member; bpp role then reports member tier", async () => {
    const res = await runBppJoin(
      parseBppJoinArgs([
        `--server=${server.url}`,
        "--user-id=xiaowang",
        "--display-name=Xiao Wang",
      ]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("xiaowang");

    const role = await runBppRole(
      parseBppRoleArgs([`--server=${server.url}`, "--user=xiaowang"]),
    );
    expect(role.stdout).toContain("member");
  });

  it("join is idempotent — re-joining the same user still exits 0", async () => {
    const args = [
      `--server=${server.url}`,
      "--user-id=xiaoli",
      "--display-name=Xiao Li",
    ];
    expect((await runBppJoin(parseBppJoinArgs(args))).exitCode).toBe(0);
    expect((await runBppJoin(parseBppJoinArgs(args))).exitCode).toBe(0);
  });
});

describe("bpp join — arg + error handling", () => {
  it("join without required flags exits 2", async () => {
    const res = await runBppJoin(parseBppJoinArgs(["--user-id=x"]));
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("--user-id / --display-name");
  });

  it("join rejects unknown args", () => {
    expect(() => parseBppJoinArgs(["--bogus"])).toThrow(BppArgError);
  });

  it("join against a down server exits 1 with a connect hint", async () => {
    const res = await runBppJoin(
      parseBppJoinArgs([
        "--server=http://127.0.0.1:1",
        "--user-id=x",
        "--display-name=X",
      ]),
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("无法连接");
  });

  it("help renderer mentions the key flags", () => {
    expect(renderBppJoinHelp()).toContain("--user-id=");
    expect(renderBppJoinHelp()).toContain("--display-name=");
  });

  it("namespace help now lists join", () => {
    expect(renderBppHelp()).toContain("teamagent bpp join");
  });
});

// ── PR-M3B — `bpp mine` mining orchestrator entry point ──────────────────
//
// Acceptance contract §里程碑三 验证方法 step 3 ("trigger a mining run").
// `bpp mine` is a server-side batch job — it calls runMining directly and
// drives the on-disk mining pool / inbox / audit / budget artifacts.

describe("parseBppMineArgs", () => {
  it("parses --repo / --state in both `=` and space forms", () => {
    expect(parseBppMineArgs(["--repo=/a", "--state=/b"])).toMatchObject({
      repo: "/a",
      state: "/b",
    });
    expect(parseBppMineArgs(["--repo", "/a", "--state", "/b"])).toMatchObject({
      repo: "/a",
      state: "/b",
    });
  });

  it("parses the --seed-sample / --mock flags and --budget-usd / --team", () => {
    const args = parseBppMineArgs([
      "--repo=/a",
      "--state=/b",
      "--seed-sample",
      "--mock",
      "--budget-usd",
      "0.01",
      "--team=acme",
    ]);
    expect(args.seedSample).toBe(true);
    expect(args.mock).toBe(true);
    expect(args.budgetUsd).toBe(0.01);
    expect(args.team).toBe("acme");
  });

  it("rejects unknown args and a non-numeric --budget-usd", () => {
    expect(() => parseBppMineArgs(["--bogus"])).toThrow(BppArgError);
    expect(() => parseBppMineArgs(["--budget-usd=abc"])).toThrow(BppArgError);
  });
});

describe("renderBppMineHelp / namespace help", () => {
  it("mine help anchors on the literal command line and key flags", () => {
    const help = renderBppMineHelp();
    expect(help).toContain("teamagent bpp mine");
    expect(help).toContain("--repo");
    expect(help).toContain("--state");
    expect(help).toContain("--seed-sample");
    expect(help).toContain("--mock");
  });

  it("namespace help now lists mine", () => {
    expect(renderBppHelp()).toContain("teamagent bpp mine");
  });
});

describe("runBppMine", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("without --repo / --state exits 2", async () => {
    const res = await runBppMine(parseBppMineArgs(["--repo=/only"]));
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("--repo / --state");
  });

  it("runs a seeded sample mine end-to-end and reports the candidate counts", async () => {
    const repo = join(mkdtempSync(join(tmpdir(), "bpp-mine-")), "conv-repo");
    const state = join(mkdtempSync(join(tmpdir(), "bpp-mine-")), "mining-state");
    dirs.push(join(repo, ".."), join(state, ".."));
    const res = await runBppMine(
      parseBppMineArgs([
        "--repo",
        repo,
        "--state",
        state,
        "--seed-sample",
        "--mock",
      ]),
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("6 条候选");
    expect(res.stdout).toContain("3 条自动推送");
  });
});

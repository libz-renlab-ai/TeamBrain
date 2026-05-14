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
import { startMockServer, type MockServerHandle } from "@teamagent/digital-twin";
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
  type RunBppServeDeps,
} from "../commands/bpp.js";

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

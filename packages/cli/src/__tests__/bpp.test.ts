// PR-A — `teamagent bpp` namespace dispatcher + `bpp serve`.
//
// Acceptance contract: docs/plans/2026-05-13-bpp-full-system-acceptance.md
// §2 里程碑一 验证方法 step 1 ("启动一个中心服务实例"). The headline test
// (`runBppServe binds a real HTTP server`) spins up the actual digital-twin
// production server and hits it over HTTP — same code path a user runs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseBppServeArgs,
  renderBppHelp,
  renderBppServeHelp,
  runBppServe,
  runBpp,
  BppArgError,
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

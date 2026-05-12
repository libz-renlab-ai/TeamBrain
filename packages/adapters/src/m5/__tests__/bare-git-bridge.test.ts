import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { setupBareGitBridge, type BareGitBridge } from "../testing/bare-git-bridge.js";

/** Tracks bridges + working dirs created in a single test so we always clean up. */
interface Tracker {
  bridges: BareGitBridge[];
  workdirs: string[];
}

function newTracker(): Tracker {
  return { bridges: [], workdirs: [] };
}

async function cleanupTracker(t: Tracker): Promise<void> {
  for (const wd of t.workdirs) {
    await fs.rm(wd, { recursive: true, force: true });
  }
  for (const b of t.bridges) {
    await b.cleanup();
  }
}

async function mkWorkdir(t: Tracker, label: string): Promise<string> {
  // Create a unique parent + reserve a sub-path for the clone target.
  // The clone itself creates the final dir; we just allocate a unique parent.
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), `m5-bare-bridge-test-${label}-`),
  );
  t.workdirs.push(parent);
  return path.join(parent, label);
}

const identityA = { email: "a@example.test", name: "User A" };
const identityB = { email: "b@example.test", name: "User B" };

describe("setupBareGitBridge", () => {
  let tracker: Tracker = newTracker();
  afterEach(async () => {
    await cleanupTracker(tracker);
    tracker = newTracker();
  });

  it("returns a valid bare repo (HEAD file exists)", async () => {
    const bridge = await setupBareGitBridge();
    tracker.bridges.push(bridge);
    expect(bridge.bareRepoPath).toBeTruthy();
    const headPath = path.join(bridge.bareRepoPath, "HEAD");
    const stat = await fs.stat(headPath);
    expect(stat.isFile()).toBe(true);
  });

  it("uses default prefix 'teamagent-m5-bare' for bare repo basename", async () => {
    const bridge = await setupBareGitBridge();
    tracker.bridges.push(bridge);
    expect(path.basename(bridge.bareRepoPath).startsWith("teamagent-m5-bare"))
      .toBe(true);
  });

  it("honors custom prefix option", async () => {
    const bridge = await setupBareGitBridge({ prefix: "custom-prefix-xyz" });
    tracker.bridges.push(bridge);
    expect(path.basename(bridge.bareRepoPath).startsWith("custom-prefix-xyz"))
      .toBe(true);
  });
});

describe("BareGitBridge.cloneInto", () => {
  let tracker: Tracker = newTracker();
  afterEach(async () => {
    await cleanupTracker(tracker);
    tracker = newTracker();
  });

  it("produces a working clone with .git and origin pointing at bare repo", async () => {
    const bridge = await setupBareGitBridge();
    tracker.bridges.push(bridge);
    const target = await mkWorkdir(tracker, "clone-a");
    const cloned = await bridge.cloneInto(target, identityA);
    expect(cloned).toBe(path.resolve(target));

    const gitStat = await fs.stat(path.join(cloned, ".git"));
    expect(gitStat.isDirectory()).toBe(true);

    // .git/config must reference the bare repo as origin.
    const cfg = await fs.readFile(path.join(cloned, ".git", "config"), "utf8");
    expect(cfg).toMatch(/\[remote "origin"\]/);
    // Git normalizes paths (lowercase drive letter on Windows, mixed slashes);
    // basename is the most reliable cross-platform anchor.
    const bareBasename = path.basename(bridge.bareRepoPath);
    expect(cfg.toLowerCase()).toContain(bareBasename.toLowerCase());
  });

  it("configures git user.email and user.name in the clone", async () => {
    const bridge = await setupBareGitBridge();
    tracker.bridges.push(bridge);
    const target = await mkWorkdir(tracker, "clone-id");
    const cloned = await bridge.cloneInto(target, identityA);

    const email = execFileSync("git", ["config", "--get", "user.email"], {
      cwd: cloned,
      stdio: "pipe",
    })
      .toString("utf8")
      .trim();
    const name = execFileSync("git", ["config", "--get", "user.name"], {
      cwd: cloned,
      stdio: "pipe",
    })
      .toString("utf8")
      .trim();

    expect(email).toBe(identityA.email);
    expect(name).toBe(identityA.name);
  });

  it("push-then-pull roundtrip: A writes file → push → B pulls → sees file", async () => {
    const bridge = await setupBareGitBridge();
    tracker.bridges.push(bridge);

    const targetA = await mkWorkdir(tracker, "user-a");
    const cloneA = await bridge.cloneInto(targetA, identityA);
    const targetB = await mkWorkdir(tracker, "user-b");
    const cloneB = await bridge.cloneInto(targetB, identityB);

    // User A writes hello.txt and pushes.
    const helloPath = path.join(cloneA, "hello.txt");
    const helloContent = "hello from user A\n";
    await fs.writeFile(helloPath, helloContent, "utf8");
    execFileSync("git", ["add", "hello.txt"], { cwd: cloneA, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "add hello"], {
      cwd: cloneA,
      stdio: "pipe",
    });
    execFileSync("git", ["push", "origin", "main"], {
      cwd: cloneA,
      stdio: "pipe",
    });

    // User B pulls.
    execFileSync("git", ["pull", "origin", "main"], {
      cwd: cloneB,
      stdio: "pipe",
    });

    const seen = await fs.readFile(path.join(cloneB, "hello.txt"), "utf8");
    expect(seen).toBe(helloContent);
  });
});

describe("BareGitBridge.cleanup", () => {
  let tracker: Tracker = newTracker();
  afterEach(async () => {
    await cleanupTracker(tracker);
    tracker = newTracker();
  });

  it("removes the bare repo and is idempotent", async () => {
    const bridge = await setupBareGitBridge();
    tracker.bridges.push(bridge);
    // Sanity: dir exists.
    const beforeStat = await fs.stat(bridge.bareRepoPath);
    expect(beforeStat.isDirectory()).toBe(true);

    await bridge.cleanup();
    // Dir should now be gone.
    await expect(fs.stat(bridge.bareRepoPath)).rejects.toMatchObject({
      code: "ENOENT",
    });

    // Second cleanup must not throw.
    await expect(bridge.cleanup()).resolves.toBeUndefined();
  });
});

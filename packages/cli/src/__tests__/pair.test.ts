import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  executePairAccept,
  executePairCapsule,
  executePairKnock,
  executePairList,
  parsePairArgs,
} from "../commands/pair.js";

const PUBLIC_KEY = "ssh-ed25519 QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo= fixture";
const FINGERPRINT = "SHA256:1uxomN6H3axuWzYRcIp6ocLSmCkzScwabCmaHbcUnTg";
const PEER_ID = "tap_724cd226aa96742c";
const CREATED_AT = "2026-04-28T12:00:00.000Z";
const ACCEPTED_AT = "2026-04-28T12:05:00.000Z";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-pair-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function countFiles(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) count += countFiles(full);
    else count++;
  }
  return count;
}

function makeCapsuleFile(): string {
  const out = path.join(tmp, "macmini.capsule.json");
  executePairCapsule({
    name: "macmini",
    host: "macmini.local",
    user: "liushiyu",
    port: 2222,
    publicKey: PUBLIC_KEY,
    nonce: "nonce-0001",
    now: () => CREATED_AT,
    out,
  });
  return out;
}

describe("teamagent pair capsule", () => {
  it("generates a deterministic pasteable capsule without private key material", () => {
    const result = executePairCapsule({
      name: "macmini",
      host: "macmini.local",
      user: "liushiyu",
      port: 2222,
      publicKey: PUBLIC_KEY,
      nonce: "nonce-0001",
      now: () => CREATED_AT,
    });

    expect(result.capsule.peer).toEqual({
      id: PEER_ID,
      name: "macmini",
      hostAlias: "teamagent-macmini",
      host: "macmini.local",
      user: "liushiyu",
      port: 2222,
      publicKeyFingerprint: FINGERPRINT,
    });
    expect(result.token).toMatch(/^tap1\./);
    expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");
  });
});

describe("teamagent pair accept", () => {
  it("changes exactly three files and writes the preset macmini -> macair handshake contents", () => {
    const capsuleFile = makeCapsuleFile();
    const home = path.join(tmp, "macair-home");
    fs.mkdirSync(home);

    const before = countFiles(home);
    const result = executePairAccept({
      capsule: capsuleFile,
      homeDir: home,
      localName: "macair",
      now: () => ACCEPTED_AT,
    });
    const after = countFiles(home);

    // Windows: path.relative returns '\\'-separated; normalize to '/' so
    // expectations stay POSIX-readable across platforms.
    expect(
      result.changed.map((p) => path.relative(home, p).replace(/\\/g, "/")).sort(),
    ).toEqual([
      ".ssh/config",
      ".teamagent/pairing/peers.json",
      ".teamagent/pairing/receipts/macmini.json",
    ]);
    expect(after - before).toBe(3);

    expect(fs.readFileSync(path.join(home, ".teamagent/pairing/peers.json"), "utf-8")).toBe(`{
  "version": 1,
  "peers": [
    {
      "id": "${PEER_ID}",
      "name": "macmini",
      "hostAlias": "teamagent-macmini",
      "host": "macmini.local",
      "user": "liushiyu",
      "port": 2222,
      "publicKeyFingerprint": "${FINGERPRINT}",
      "acceptedAt": "${ACCEPTED_AT}",
      "capsuleNonce": "nonce-0001",
      "source": "capsule"
    }
  ]
}
`);

    expect(fs.readFileSync(path.join(home, ".teamagent/pairing/receipts/macmini.json"), "utf-8")).toBe(`{
  "version": 1,
  "kind": "teamagent.pair.receipt",
  "localName": "macair",
  "acceptedAt": "${ACCEPTED_AT}",
  "peer": {
    "id": "${PEER_ID}",
    "name": "macmini",
    "hostAlias": "teamagent-macmini",
    "host": "macmini.local",
    "user": "liushiyu",
    "port": 2222,
    "publicKeyFingerprint": "${FINGERPRINT}",
    "acceptedAt": "${ACCEPTED_AT}",
    "capsuleNonce": "nonce-0001",
    "source": "capsule"
  }
}
`);

    expect(fs.readFileSync(path.join(home, ".ssh/config"), "utf-8")).toBe(`# >>> teamagent peer:${PEER_ID}
Host teamagent-macmini
  HostName macmini.local
  User liushiyu
  Port 2222
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  UserKnownHostsFile ~/.ssh/known_hosts
  # TeamAgent-Peer-Fingerprint ${FINGERPRINT}
# <<< teamagent peer:${PEER_ID}
`);
  });

  it("repairs only the TeamAgent managed SSH block and preserves user config", () => {
    const capsuleFile = makeCapsuleFile();
    const home = path.join(tmp, "macair-home");
    const sshConfig = path.join(home, ".ssh", "config");
    fs.mkdirSync(path.dirname(sshConfig), { recursive: true });
    fs.writeFileSync(sshConfig, `Host github.com
  User git

# >>> teamagent peer:${PEER_ID}
Host teamagent-macmini
  HostName stale.local
  User wrong
# <<< teamagent peer:${PEER_ID}

Host lab
  HostName lab.internal
`);

    executePairAccept({
      capsule: capsuleFile,
      homeDir: home,
      localName: "macair",
      now: () => ACCEPTED_AT,
    });

    expect(fs.readFileSync(sshConfig, "utf-8")).toBe(`Host github.com
  User git

# >>> teamagent peer:${PEER_ID}
Host teamagent-macmini
  HostName macmini.local
  User liushiyu
  Port 2222
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  UserKnownHostsFile ~/.ssh/known_hosts
  # TeamAgent-Peer-Fingerprint ${FINGERPRINT}
# <<< teamagent peer:${PEER_ID}

Host lab
  HostName lab.internal
`);
  });

  it("is idempotent on repeated accept with the same capsule and timestamp", () => {
    const capsuleFile = makeCapsuleFile();
    const home = path.join(tmp, "macair-home");
    executePairAccept({ capsule: capsuleFile, homeDir: home, localName: "macair", now: () => ACCEPTED_AT });
    const second = executePairAccept({ capsule: capsuleFile, homeDir: home, localName: "macair", now: () => ACCEPTED_AT });
    expect(second.changed).toEqual([]);
    expect(countFiles(home)).toBe(3);
  });
});

describe("teamagent pair knock/list", () => {
  it("lists peers and verifies SSH knock through an injectable runner", () => {
    const capsuleFile = makeCapsuleFile();
    const home = path.join(tmp, "macair-home");
    executePairAccept({ capsule: capsuleFile, homeDir: home, localName: "macair", now: () => ACCEPTED_AT });

    expect(executePairList({ homeDir: home }).peers.map((p) => p.name)).toEqual(["macmini"]);

    const result = executePairKnock({
      peer: "macmini",
      homeDir: home,
      runner: (args) => {
        expect(args).toEqual([
          "-F",
          path.join(home, ".ssh", "config"),
          "teamagent-macmini",
          "printf",
          "%s\\\\n",
          `teamagent-pair-ok:${PEER_ID}`,
        ]);
        return { exitCode: 0, stdout: `teamagent-pair-ok:${PEER_ID}\n`, stderr: "" };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe(`teamagent-pair-ok:${PEER_ID}`);
  });

  it("supports offline macmini/macair simulation for claudefast smoke checks", () => {
    const capsuleFile = makeCapsuleFile();
    const home = path.join(tmp, "macair-home");
    executePairAccept({ capsule: capsuleFile, homeDir: home, localName: "macair", now: () => ACCEPTED_AT });

    const result = executePairKnock({ peer: "macmini", homeDir: home, simulate: true });
    expect(result).toMatchObject({
      ok: true,
      peer: "macmini",
      peerId: PEER_ID,
      hostAlias: "teamagent-macmini",
      stdout: `teamagent-pair-ok:${PEER_ID}\n`,
    });
  });
});

describe("parsePairArgs", () => {
  it("parses capsule/accept/knock commands", () => {
    expect(parsePairArgs(["capsule", "--name=macmini", "--host=macmini.local"]).subcommand).toBe("capsule");
    expect(parsePairArgs(["accept", "tap1.abc", "--local-name=macair"]).subcommand).toBe("accept");
    expect(parsePairArgs(["knock", "macmini", "--json", "--simulate"]).options).toMatchObject({
      peer: "macmini",
      json: true,
      simulate: true,
    });
  });
});

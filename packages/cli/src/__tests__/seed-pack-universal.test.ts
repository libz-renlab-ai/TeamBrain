/**
 * Contract + integration tests for `packages/teamagent/seed/packs/universal.jsonl`.
 *
 * Issue #88: 12–18 cross-language avoidance rules with literal substring
 * `wrong_pattern`, designed to hit the legacy keyword matcher within 30s of
 * `teamagent init` finishing (before the vector model is downloaded).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KnowledgeEntrySchema, type KnowledgeEntry } from "@teamagent/types";
import { matchRules } from "@teamagent/core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.resolve(
  HERE,
  "..",
  "..",
  "..",
  "teamagent",
  "seed",
  "packs",
  "universal.jsonl",
);

function loadPack(): KnowledgeEntry[] {
  const text = fs.readFileSync(PACK_PATH, "utf-8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as KnowledgeEntry);
}

describe("universal pack — static contract", () => {
  it("file exists at packages/teamagent/seed/packs/universal.jsonl", () => {
    expect(fs.existsSync(PACK_PATH)).toBe(true);
  });

  it("contains 12–18 entries (issue #88 acceptance criterion)", () => {
    const entries = loadPack();
    expect(entries.length).toBeGreaterThanOrEqual(12);
    expect(entries.length).toBeLessThanOrEqual(18);
  });

  it("every entry parses against KnowledgeEntrySchema", () => {
    const entries = loadPack();
    for (const e of entries) {
      const r = KnowledgeEntrySchema.safeParse(e);
      if (!r.success) {
        throw new Error(
          `id=${e.id} failed schema: ${JSON.stringify(r.error.issues[0])}`,
        );
      }
    }
  });

  it("every entry has channel='tool-action' (PreToolUse matcher requirement)", () => {
    for (const e of loadPack()) {
      // channel may be undefined in raw JSON; default is tool-action.
      const ch = (e as { channel?: string }).channel ?? "tool-action";
      expect(ch, `entry ${e.id}`).toBe("tool-action");
    }
  });

  it("every entry has non-empty wrong_pattern of length >= 3", () => {
    for (const e of loadPack()) {
      expect(e.wrong_pattern, `entry ${e.id}`).toBeTruthy();
      expect(e.wrong_pattern.trim().length, `entry ${e.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("every entry has enforcement='block' (issue #88 acceptance)", () => {
    for (const e of loadPack()) {
      expect(e.enforcement, `entry ${e.id}`).toBe("block");
    }
  });

  it("every entry has confidence=0.85 (issue #88 acceptance)", () => {
    for (const e of loadPack()) {
      expect(e.confidence, `entry ${e.id}`).toBe(0.85);
    }
  });

  it("every entry has source='preset' (issue #88 acceptance)", () => {
    for (const e of loadPack()) {
      expect(e.source, `entry ${e.id}`).toBe("preset");
    }
  });

  it("every entry has scope.level='global' (issue #88 acceptance)", () => {
    for (const e of loadPack()) {
      expect(e.scope.level, `entry ${e.id}`).toBe("global");
    }
  });

  it("every entry has status='active'", () => {
    for (const e of loadPack()) {
      expect(e.status, `entry ${e.id}`).toBe("active");
    }
  });

  it("all entry ids are unique", () => {
    const ids = loadPack().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * Matcher integration: feed known wrong-pattern bash commands and confirm the
 * legacy keyword matcher fires the right rule. This is the AC promise:
 * "First-time install demonstrates an interception within 30 seconds".
 */
describe("universal pack — matcher hits", () => {
  const cases: Array<{ command: string; expectId: string; description: string }> = [
    {
      command: "npm install moment",
      expectId: "seed-pack-universal-moment",
      description: "moment install",
    },
    {
      command: "cat /Users/john/.aws/credentials",
      expectId: "seed-pack-universal-users-path",
      description: "macOS hardcoded path",
    },
    {
      command: "ssh user@host 'ls /home/deploy/'",
      expectId: "seed-pack-universal-home-path",
      description: "Linux hardcoded path",
    },
    {
      command: "rm -rf /tmp/build-output",
      expectId: "seed-pack-universal-rm-rf-root",
      description: "rm -rf with absolute path",
    },
    {
      command: "chmod 777 /opt/app",
      expectId: "seed-pack-universal-chmod-777",
      description: "chmod 777",
    },
    {
      command: "node -e 'eval(process.argv[1])' \"console.log(1)\"",
      expectId: "seed-pack-universal-eval",
      description: "eval(",
    },
    {
      command: "git push --force origin main",
      expectId: "seed-pack-universal-git-push-force",
      description: "git push --force",
    },
    {
      command: "git reset --hard HEAD~3",
      expectId: "seed-pack-universal-git-reset-hard",
      description: "git reset --hard",
    },
    {
      command: "git commit -m 'wip' --no-verify",
      expectId: "seed-pack-universal-no-verify",
      description: "--no-verify",
    },
    {
      command: "cat .env",
      expectId: "seed-pack-universal-dotenv",
      description: ".env",
    },
  ];

  for (const c of cases) {
    it(`Bash: ${c.description}`, () => {
      const rules = loadPack();
      const matches = matchRules(
        { toolName: "Bash", input: { command: c.command } },
        rules,
      );
      const ids = matches.map((m) => m.id);
      expect(ids, `command=${c.command}`).toContain(c.expectId);
    });
  }

  // Edit-tool flavoured cases for the language-specific rules.
  it("Edit: pickle.loads in new_string fires Python rule", () => {
    const rules = loadPack();
    const matches = matchRules(
      {
        toolName: "Edit",
        input: {
          file_path: "loader.py",
          old_string: "data = open(p).read()",
          new_string: "import pickle; data = pickle.loads(open(p,'rb').read())",
        },
      },
      rules,
    );
    expect(matches.map((m) => m.id)).toContain("seed-pack-universal-pickle-loads");
  });

  it("Write: dangerouslySetInnerHTML fires React XSS rule", () => {
    const rules = loadPack();
    const matches = matchRules(
      {
        toolName: "Write",
        input: {
          file_path: "Comment.tsx",
          content:
            'export const Comment = ({html}) => (<div dangerouslySetInnerHTML={{__html: html}} />);',
        },
      },
      rules,
    );
    expect(matches.map((m) => m.id)).toContain("seed-pack-universal-react-xss");
  });
});

/**
 * False-positive guards. The matcher must NOT fire on adjacent words that
 * share a substring with a pattern. This is what prevents `moment` from
 * blocking `momentum`, `eval(` from blocking `evaluator`, etc.
 */
describe("universal pack — false positive guards", () => {
  const cases: Array<{ command: string; description: string }> = [
    { command: "import { momentum } from './physics'", description: "moment ≠ momentum" },
    { command: "const evaluator = (x) => x + 1", description: "eval( ≠ evaluator" },
    { command: "git push --force-with-lease origin main", description: "this is the SAFE alternative — but trailing -with-lease is not letter/digit, so the matcher will still fire (acceptable trade-off — see issue #88 false-positive analysis)" },
    { command: "cat .envoy.yaml", description: ".env ≠ .envoy" },
    { command: "echo 'no-verify is too dangerous' > readme.md", description: "--no-verify ≠ no-verify (no leading dashes)" },
  ];

  it("moment does not match momentum", () => {
    const rules = loadPack();
    const matches = matchRules(
      { toolName: "Bash", input: { command: cases[0]!.command } },
      rules,
    );
    expect(matches.find((m) => m.id === "seed-pack-universal-moment")).toBeUndefined();
  });

  it("eval( does not match evaluator", () => {
    const rules = loadPack();
    const matches = matchRules(
      { toolName: "Bash", input: { command: cases[1]!.command } },
      rules,
    );
    expect(matches.find((m) => m.id === "seed-pack-universal-eval")).toBeUndefined();
  });

  it(".env does not match .envoy", () => {
    const rules = loadPack();
    const matches = matchRules(
      { toolName: "Bash", input: { command: cases[3]!.command } },
      rules,
    );
    expect(matches.find((m) => m.id === "seed-pack-universal-dotenv")).toBeUndefined();
  });

  it("--no-verify does not match plain 'no-verify' word in prose", () => {
    const rules = loadPack();
    const matches = matchRules(
      { toolName: "Bash", input: { command: cases[4]!.command } },
      rules,
    );
    expect(
      matches.find((m) => m.id === "seed-pack-universal-no-verify"),
    ).toBeUndefined();
  });
});

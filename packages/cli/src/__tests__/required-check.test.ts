import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeRequiredCheck,
  parseRequiredCheckArgs,
  renderRequiredCheckResult,
  REQUIRED_JSON_CONTENT,
  REQUIRED_JSON_SCHEMA,
  REQUIRED_JSON_MODE,
} from "../commands/required-check.js";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "required-check-"));
  const teamagentDir = path.join(root, ".teamagent");
  nodeFs.mkdirSync(teamagentDir, { recursive: true });
  return {
    root,
    configPath: path.join(teamagentDir, "required.json"),
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

describe("executeRequiredCheck", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => tmp.cleanup());

  it("returns ok when required.json matches the canonical content", () => {
    nodeFs.writeFileSync(
      tmp.configPath,
      JSON.stringify(REQUIRED_JSON_CONTENT, null, 2) + "\n",
    );

    const r = executeRequiredCheck({ projectRoot: tmp.root });

    expect(r.status).toBe("ok");
    expect(r.exitCode).toBe(0);
    expect(r.schema).toBe(REQUIRED_JSON_SCHEMA);
    expect(r.mode).toBe(REQUIRED_JSON_MODE);
    expect(r.configPath).toBe(tmp.configPath);
  });

  it("returns config-missing (exit 2) when required.json is absent", () => {
    const r = executeRequiredCheck({ projectRoot: tmp.root });

    expect(r.status).toBe("config-missing");
    expect(r.exitCode).toBe(2);
    expect(r.reason).toContain("missing");
  });

  it("returns config-malformed (exit 2) when required.json is not JSON", () => {
    nodeFs.writeFileSync(tmp.configPath, "this is not json");

    const r = executeRequiredCheck({ projectRoot: tmp.root });

    expect(r.status).toBe("config-malformed");
    expect(r.exitCode).toBe(2);
    expect(r.reason).toContain("valid JSON");
  });

  it("returns config-malformed when JSON is an array, not object", () => {
    nodeFs.writeFileSync(tmp.configPath, "[1,2,3]");

    const r = executeRequiredCheck({ projectRoot: tmp.root });

    expect(r.status).toBe("config-malformed");
    expect(r.exitCode).toBe(2);
  });

  it("returns schema-unsupported (exit 3) when schema is wrong", () => {
    nodeFs.writeFileSync(
      tmp.configPath,
      JSON.stringify({ schema: "v999", mode: "required" }, null, 2),
    );

    const r = executeRequiredCheck({ projectRoot: tmp.root });

    expect(r.status).toBe("schema-unsupported");
    expect(r.exitCode).toBe(3);
    expect(r.schema).toBe("v999");
    expect(r.reason).toContain("schema");
  });

  it("returns schema-unsupported (exit 3) when mode is wrong", () => {
    nodeFs.writeFileSync(
      tmp.configPath,
      JSON.stringify(
        {
          schema: REQUIRED_JSON_SCHEMA,
          mode: "optional",
        },
        null,
        2,
      ),
    );

    const r = executeRequiredCheck({ projectRoot: tmp.root });

    expect(r.status).toBe("schema-unsupported");
    expect(r.exitCode).toBe(3);
    expect(r.mode).toBe("optional");
    expect(r.reason).toContain("mode");
  });

  it("uses CLAUDE_PROJECT_DIR env when projectRoot opt is absent", () => {
    nodeFs.writeFileSync(
      tmp.configPath,
      JSON.stringify(REQUIRED_JSON_CONTENT, null, 2) + "\n",
    );
    const prev = process.env["CLAUDE_PROJECT_DIR"];
    process.env["CLAUDE_PROJECT_DIR"] = tmp.root;
    try {
      const r = executeRequiredCheck({});
      expect(r.status).toBe("ok");
      expect(r.exitCode).toBe(0);
    } finally {
      if (prev === undefined) delete process.env["CLAUDE_PROJECT_DIR"];
      else process.env["CLAUDE_PROJECT_DIR"] = prev;
    }
  });
});

describe("parseRequiredCheckArgs", () => {
  it("recognizes --project <dir>", () => {
    const r = parseRequiredCheckArgs(["--project", "/some/path"]);
    expect(r.projectRoot).toBe("/some/path");
  });

  it("recognizes --project=<dir>", () => {
    const r = parseRequiredCheckArgs(["--project=/some/path"]);
    expect(r.projectRoot).toBe("/some/path");
  });

  it("recognizes --json", () => {
    const r = parseRequiredCheckArgs(["--json"]);
    expect(r.json).toBe(true);
  });

  it("returns empty options for no args", () => {
    const r = parseRequiredCheckArgs([]);
    expect(r).toEqual({});
  });
});

describe("renderRequiredCheckResult", () => {
  it("renders JSON form when json=true", () => {
    const out = renderRequiredCheckResult(
      {
        status: "ok",
        exitCode: 0,
        configPath: "/tmp/required.json",
        schema: REQUIRED_JSON_SCHEMA,
        mode: REQUIRED_JSON_MODE,
      },
      true,
    );
    const parsed = JSON.parse(out);
    expect(parsed.status).toBe("ok");
    expect(parsed.exitCode).toBe(0);
  });

  it("renders human-readable form when json=false", () => {
    const out = renderRequiredCheckResult(
      {
        status: "ok",
        exitCode: 0,
        configPath: "/tmp/required.json",
        schema: REQUIRED_JSON_SCHEMA,
        mode: REQUIRED_JSON_MODE,
      },
      false,
    );
    expect(out).toContain("ok");
    expect(out).toContain(REQUIRED_JSON_SCHEMA);
    expect(out).toContain(REQUIRED_JSON_MODE);
  });

  it("renders failure reason in human form", () => {
    const out = renderRequiredCheckResult(
      {
        status: "config-missing",
        exitCode: 2,
        configPath: "/tmp/required.json",
        reason: "missing on disk",
      },
      false,
    );
    expect(out).toContain("config-missing");
    expect(out).toContain("missing on disk");
  });
});

describe("REQUIRED_JSON_CONTENT canonical content", () => {
  it("matches the grill spec for schema, mode, scope, binary", () => {
    expect(REQUIRED_JSON_CONTENT["schema"]).toBe("teamagent.required.v1");
    expect(REQUIRED_JSON_CONTENT["mode"]).toBe("required");
    expect(REQUIRED_JSON_CONTENT["scope"]).toBe("claude-assisted-work");
    expect(REQUIRED_JSON_CONTENT["binary"]).toBe("teamagent");
  });

  it("declares the check.installed = `command -v teamagent` per grill", () => {
    const check = REQUIRED_JSON_CONTENT["check"] as Record<string, unknown>;
    expect(check["installed"]).toBe("command -v teamagent");
  });

  it("declares the check.required = `teamagent required-check ...` per grill", () => {
    const check = REQUIRED_JSON_CONTENT["check"] as Record<string, unknown>;
    expect(check["required"]).toBe(
      'teamagent required-check --project "$CLAUDE_PROJECT_DIR"',
    );
  });

  it("declares the install/update remediation command per grill", () => {
    const r = REQUIRED_JSON_CONTENT["remediation"] as Record<string, unknown>;
    expect(r["installOrUpdate"]).toBe(
      "npm install -g github:libz-renlab-ai/TeamBrain#release",
    );
  });
});

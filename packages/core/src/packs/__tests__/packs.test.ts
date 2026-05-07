import { describe, expect, it } from "vitest";
import {
  PROMPT_VERSION,
  PROMPT_OPEN_MARKER,
  PROMPT_CLOSE_MARKER,
  OBSERVED_FILE_LIST,
  parsePackMeta,
  renderPackPromptBody,
  diffPackRequest,
  packTag,
  entryHasPackTag,
} from "../index.js";

describe("packs core", () => {
  describe("parsePackMeta", () => {
    it("accepts a well-formed meta JSON string", () => {
      const json = JSON.stringify({
        name: "frontend-js",
        description: "Frontend JS / TS avoidance rules",
        tags: ["web", "react", "typescript"],
        file_hints: ["package.json", "tsconfig.json"],
        prompt_version: 1,
      });
      const meta = parsePackMeta(json);
      expect(meta.name).toBe("frontend-js");
      expect(meta.tags).toEqual(["web", "react", "typescript"]);
      expect(meta.file_hints).toEqual(["package.json", "tsconfig.json"]);
      expect(meta.prompt_version).toBe(1);
    });

    it("rejects missing required fields", () => {
      const json = JSON.stringify({ name: "no-desc", tags: [], file_hints: [] });
      expect(() => parsePackMeta(json)).toThrow();
    });

    it("rejects unsupported prompt_version", () => {
      const json = JSON.stringify({
        name: "future",
        description: "",
        tags: [],
        file_hints: [],
        prompt_version: 999,
      });
      expect(() => parsePackMeta(json)).toThrow();
    });

    it("rejects malformed JSON", () => {
      expect(() => parsePackMeta("not-json")).toThrow();
    });
  });

  describe("OBSERVED_FILE_LIST", () => {
    it("is the frozen v1 ordered list of well-known files", () => {
      expect(OBSERVED_FILE_LIST).toEqual([
        "package.json",
        "pyproject.toml",
        "Cargo.toml",
        "Dockerfile",
        "requirements.txt",
        "go.mod",
      ]);
    });
  });

  describe("renderPackPromptBody", () => {
    const front = {
      name: "frontend-js",
      description: "Frontend JS / TS avoidance rules",
      tags: ["web", "react", "typescript"],
      file_hints: ["package.json", "tsconfig.json"],
      prompt_version: 1 as const,
    };
    const ops = {
      name: "ops-safety",
      description: "Production / deploy safety rules",
      tags: ["ops", "deploy", "secrets"],
      file_hints: ["Dockerfile", ".env"],
      prompt_version: 1 as const,
    };

    it("opens with the v1 marker and closes with the v1 close marker", () => {
      const body = renderPackPromptBody({
        observed: { "package.json": true, "pyproject.toml": false, "Cargo.toml": false, "Dockerfile": false, "requirements.txt": false, "go.mod": false },
        available: [front, ops],
        installed: [],
      });
      expect(body).toContain(PROMPT_OPEN_MARKER);
      expect(body).toContain(PROMPT_CLOSE_MARKER);
      expect(PROMPT_OPEN_MARKER).toContain(`v${PROMPT_VERSION}`);
      expect(PROMPT_CLOSE_MARKER).toContain(`v${PROMPT_VERSION}`);
    });

    it("renders the 6 observed rows in fixed order with ✓ / ✗", () => {
      const body = renderPackPromptBody({
        observed: {
          "package.json": true,
          "pyproject.toml": false,
          "Cargo.toml": false,
          "Dockerfile": true,
          "requirements.txt": false,
          "go.mod": false,
        },
        available: [],
        installed: [],
      });
      const lines = body.split("\n");
      const obsIdx = lines.findIndex((l) => l.includes("Observed"));
      const observedBlock = lines.slice(obsIdx, obsIdx + 8).join("\n");
      // Must contain rows in order
      expect(observedBlock).toMatch(/package\.json[\s\S]*pyproject\.toml[\s\S]*Cargo\.toml[\s\S]*Dockerfile[\s\S]*requirements\.txt[\s\S]*go\.mod/);
      expect(observedBlock).toMatch(/✓[\s`]*package\.json/);
      expect(observedBlock).toMatch(/✗[\s`]*pyproject\.toml/);
      expect(observedBlock).toMatch(/✓[\s`]*Dockerfile/);
    });

    it("includes available pack rows with name, tags, description, file_hints", () => {
      const body = renderPackPromptBody({
        observed: { "package.json": true, "pyproject.toml": false, "Cargo.toml": false, "Dockerfile": false, "requirements.txt": false, "go.mod": false },
        available: [front],
        installed: [],
      });
      expect(body).toContain("**frontend-js**");
      expect(body).toMatch(/tags:\s*web,\s*react,\s*typescript/);
      expect(body).toContain("Frontend JS / TS avoidance rules");
      expect(body).toMatch(/file_hints:.*package\.json.*tsconfig\.json/);
    });

    it("contains the canonical CTA literal `teamagent pack add`", () => {
      const body = renderPackPromptBody({
        observed: { "package.json": true, "pyproject.toml": false, "Cargo.toml": false, "Dockerfile": false, "requirements.txt": false, "go.mod": false },
        available: [front],
        installed: [],
      });
      expect(body).toContain("teamagent pack add");
    });

    it("contains both power-user paths --pack all and --pack X,Y", () => {
      const body = renderPackPromptBody({
        observed: { "package.json": true, "pyproject.toml": false, "Cargo.toml": false, "Dockerfile": false, "requirements.txt": false, "go.mod": false },
        available: [front, ops],
        installed: [],
      });
      expect(body).toContain("--pack all");
      // Power-user X,Y example uses real available pack names joined by comma
      expect(body).toMatch(/--pack [a-z][\w-]*,[a-z][\w-]*/);
    });

    it("falls back gracefully when no packs are shipped", () => {
      const body = renderPackPromptBody({
        observed: { "package.json": true, "pyproject.toml": false, "Cargo.toml": false, "Dockerfile": false, "requirements.txt": false, "go.mod": false },
        available: [],
        installed: [],
      });
      expect(body).toContain(PROMPT_OPEN_MARKER);
      expect(body).toContain(PROMPT_CLOSE_MARKER);
      expect(body.toLowerCase()).toContain("no packs");
    });

    it("marks installed packs as already-installed", () => {
      const body = renderPackPromptBody({
        observed: { "package.json": true, "pyproject.toml": false, "Cargo.toml": false, "Dockerfile": false, "requirements.txt": false, "go.mod": false },
        available: [front, ops],
        installed: ["frontend-js"],
      });
      expect(body.toLowerCase()).toMatch(/already installed[\s\S]*frontend-js|frontend-js[\s\S]*already installed/);
    });
  });

  describe("diffPackRequest", () => {
    it("classifies requested names against available + installed", () => {
      const r = diffPackRequest({
        requested: ["frontend-js", "ops-safety", "does-not-exist"],
        available: ["frontend-js", "ops-safety", "python-data"],
        installed: ["frontend-js"],
      });
      expect(r.toAdd).toEqual(["ops-safety"]);
      expect(r.alreadyInstalled).toEqual(["frontend-js"]);
      expect(r.notFound).toEqual(["does-not-exist"]);
    });

    it("expands the special name 'all' to every available pack", () => {
      const r = diffPackRequest({
        requested: ["all"],
        available: ["frontend-js", "ops-safety"],
        installed: [],
      });
      expect(r.toAdd).toEqual(["frontend-js", "ops-safety"]);
      expect(r.alreadyInstalled).toEqual([]);
      expect(r.notFound).toEqual([]);
    });

    it("dedupes requested names", () => {
      const r = diffPackRequest({
        requested: ["frontend-js", "frontend-js"],
        available: ["frontend-js"],
        installed: [],
      });
      expect(r.toAdd).toEqual(["frontend-js"]);
    });
  });

  describe("packTag / entryHasPackTag", () => {
    it("packTag returns the canonical tag form", () => {
      expect(packTag("frontend-js")).toBe("pack:frontend-js");
    });

    it("entryHasPackTag matches when pack:<name> is present in tags", () => {
      const entry = { tags: ["foo", "pack:frontend-js", "bar"] } as { tags: string[] };
      expect(entryHasPackTag(entry, "frontend-js")).toBe(true);
      expect(entryHasPackTag(entry, "ops-safety")).toBe(false);
    });

    it("entryHasPackTag returns false when tags is missing or empty", () => {
      expect(entryHasPackTag({ tags: [] } as { tags: string[] }, "x")).toBe(false);
    });
  });
});

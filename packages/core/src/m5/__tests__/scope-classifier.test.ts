import { describe, it, expect } from "vitest";
import { runScopeClassifierPortContract } from "@teamagent/ports/contracts";
import { classifyScope, createScopeClassifier } from "../scope-classifier.js";

describe("scope-classifier (heuristic)", () => {
  runScopeClassifierPortContract(() => createScopeClassifier());
});

describe("scope-classifier W15-007 (personal markers)", () => {
  it("'我个人' + 'PR review' is treated as personal (mixed-language fix)", () => {
    const r = classifyScope("这是我个人电脑上跑的 PR review 草稿");
    expect(r.scope).toBe("personal");
  });

  it("'私人笔记' + engineering keyword is personal", () => {
    const r = classifyScope("私人笔记: codex review 流程整理");
    expect(r.scope).toBe("personal");
  });

  it("'我的电脑' marker downgrades shareable hit", () => {
    const r = classifyScope("我的电脑上 typecheck 失败");
    expect(r.scope).toBe("personal");
  });

  it("'草稿' marker on shareable text is personal", () => {
    const r = classifyScope("草稿: PR 合并必须先跑 CI");
    expect(r.scope).toBe("personal");
  });

  it("preserves: pure shareable text without personal markers stays shareable", () => {
    const r = classifyScope("PR 合并后必须跑 codex review 直到 silent");
    expect(r.scope).toBe("shareable");
  });
});

import { describe, it, expect, vi } from "vitest";
import { createPreToolUseHandler } from "../pre-tool-use-sdk.js";

describe("createPreToolUseHandler (SDK)", () => {
  it("returns allow when no rules match", async () => {
    const mockMatcher = { match: vi.fn().mockResolvedValue({ matched: [] }) };
    const mockEventLog = { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) };
    const handler = createPreToolUseHandler({ matcher: mockMatcher as any, eventLog: mockEventLog as any });

    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/a.ts", new_string: "x" },
      tool_use_id: "tu-1",
    } as any);

    expect(result.permissionDecision).toBe("allow");
    expect(mockEventLog.append).toHaveBeenCalledWith(expect.objectContaining({ kind: "hook-pre.passed" }));
  });

  it("returns deny + reason when enforced rule matches", async () => {
    const enforcedRule = {
      id: "r1",
      current_tier: "enforced",
      enforcement: "block",
      trigger: "use axios",
      correct_pattern: "use fetch",
      reasoning: "project is fetch-only",
      confidence: 0.92,
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      hit_count: 3,
    };
    const mockMatcher = { match: vi.fn().mockResolvedValue({ matched: [enforcedRule] }) };
    const mockEventLog = { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) };
    const handler = createPreToolUseHandler({ matcher: mockMatcher as any, eventLog: mockEventLog as any });

    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/a.ts", new_string: "axios.get(url)" },
      tool_use_id: "tu-2",
    } as any);

    expect(result.permissionDecision).toBe("deny");
    expect(result.permissionDecisionReason).toContain("fetch");
    expect(result.permissionDecisionReason).toMatch(/\+-- TeamAgent 阻止操作 -+\+/);
    expect(result.permissionDecisionReason).toMatch(/置信度 0\.\d+/);
    expect(mockEventLog.append).toHaveBeenCalledWith(expect.objectContaining({
      kind: "hook-pre.blocked",
      tool_name: "Edit",   // NEW: blocked event must carry tool_name for circumvention detection
    }));
  });

  it("warned rules → allow + systemMessage + tool_name in warned event", async () => {
    const warnRule = {
      id: "r1",
      current_tier: "stable",
      enforcement: "warn",
      trigger: "use axios",
      correct_pattern: "use fetch",
      reasoning: "",
      confidence: 0.92,
      created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      hit_count: 3,
    };
    const mockMatcher = { match: vi.fn().mockResolvedValue({ matched: [warnRule] }) };
    const mockEventLog = { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) };
    const handler = createPreToolUseHandler({ matcher: mockMatcher as any, eventLog: mockEventLog as any });

    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/a.ts", new_string: "axios.get(url)" },
      tool_use_id: "tu-3",
    } as any);

    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toContain("fetch");
    expect(result.systemMessage).toMatch(/\+-- TeamAgent 经验提醒 -+\+/);
    expect(result.systemMessage).toMatch(/置信度 0\.\d+/);
    expect(result.systemMessage).toMatch(/前学到/);
    expect(mockEventLog.append).toHaveBeenCalledWith(expect.objectContaining({
      kind: "hook-pre.warned",
      tool_name: "Edit",   // NEW: tool_name must be stored
    }));
  });

  it("emits ai.override.complied on clean pass after a recent warn for same tool_name", async () => {
    const recentEvents = [
      {
        kind: "hook-pre.warned",
        tool_use_id: "t-prev",
        knowledge_id: "rule-A",
        timestamp: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
        tool_name: "Write",
      },
    ];
    const appended: any[] = [];
    const handler = createPreToolUseHandler({
      matcher: { match: async () => ({ matched: [] }) } as any,
      eventLog: {
        append: (e: any) => appended.push(e),
        readLast: (_n: number) => recentEvents,
      } as any,
    });
    await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {},
      tool_use_id: "t-new",
    } as any);
    const complied = appended.filter((e: any) => e.kind === "ai.override.complied");
    expect(complied).toHaveLength(1);
    expect(complied[0]).toMatchObject({ knowledge_id: "rule-A" });
  });

  it("verbose visibility → clean pass returns systemMessage with rule count + tool name", async () => {
    const handler = createPreToolUseHandler({
      matcher: { match: async () => ({ matched: [] }) } as any,
      eventLog: { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) } as any,
      visibility: "verbose",
      ruleCount: 136,
    });
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_use_id: "tu-verbose",
    } as any);
    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toMatch(/◈ TeamAgent/);
    expect(result.systemMessage).toContain("Bash");
    expect(result.systemMessage).toContain("136");
    expect(result.systemMessage).toContain("放行");
  });

  it("verbose + semanticHits → pass message shows hit count and rule details", async () => {
    const semanticHits = [
      { id: "rule-abc", trigger: "写测试时先看红", score: 0.78 },
      { id: "rule-xyz", trigger: "提交前跑全量测试", score: 0.61 },
    ];
    const handler = createPreToolUseHandler({
      matcher: {
        match: async () => ({ matched: [], semanticHits }),
      } as any,
      eventLog: { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) } as any,
      visibility: "verbose",
      ruleCount: 87,
    });
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "pnpm test" },
      tool_use_id: "tu-sem-hits",
    } as any);

    expect(result.permissionDecision).toBe("allow");
    // 摘要行：显示命中数而非"无命中"
    expect(result.systemMessage).toContain("语义命中 2 条");
    // 每条规则的 trigger 和 score
    expect(result.systemMessage).toContain("写测试时先看红");
    expect(result.systemMessage).toContain("0.78");
    expect(result.systemMessage).toContain("rule-abc");
  });

  it("verbose + empty semanticHits → pass message shows rule count only (no 无命中)", async () => {
    const handler = createPreToolUseHandler({
      matcher: {
        match: async () => ({ matched: [], semanticHits: [] }),
      } as any,
      eventLog: { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) } as any,
      visibility: "verbose",
      ruleCount: 87,
    });
    const result = await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_use_id: "tu-sem-empty",
    } as any);

    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toContain("检查 87 条规则");
    expect(result.systemMessage).not.toContain("无命中");
    expect(result.systemMessage).not.toContain("语义命中");
  });

  it("smart/silent visibility → clean pass stays silent (no systemMessage)", async () => {
    for (const vis of ["smart", "silent"] as const) {
      const handler = createPreToolUseHandler({
        matcher: { match: async () => ({ matched: [] }) } as any,
        eventLog: { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) } as any,
        visibility: vis,
        ruleCount: 50,
      });
      const result = await handler({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
        tool_use_id: `tu-${vis}`,
      } as any);
      expect(result.permissionDecision).toBe("allow");
      expect(result.systemMessage).toBeUndefined();
    }
  });

  it("does NOT emit complied when no recent warns exist", async () => {
    const appended: any[] = [];
    const handler = createPreToolUseHandler({
      matcher: { match: async () => ({ matched: [] }) } as any,
      eventLog: {
        append: (e: any) => appended.push(e),
        readLast: (_n: number) => [],
      } as any,
    });
    await handler({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {},
      tool_use_id: "t-new",
    } as any);
    expect(appended.filter((e: any) => e.kind === "ai.override.complied")).toHaveLength(0);
  });

  describe("relativeTime edge cases (via formatWarnMessage / formatBlockReason)", () => {
    it("missing created_at → systemMessage contains '未知学到'", async () => {
      const ruleMissingDate = {
        id: "r-missing-date",
        current_tier: "stable",
        enforcement: "warn",
        trigger: "use axios",
        correct_pattern: "use fetch",
        confidence: 0.80,
        created_at: undefined,
        hit_count: 1,
      };
      const mockMatcher = { match: vi.fn().mockResolvedValue({ matched: [ruleMissingDate] }) };
      const mockEventLog = { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) };
      const handler = createPreToolUseHandler({ matcher: mockMatcher as any, eventLog: mockEventLog as any });

      const result = await handler({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
        tool_use_id: "tu-missing-date",
      } as any);

      expect(result.permissionDecision).toBe("allow");
      expect(result.systemMessage).toContain("未知学到");
    });

    it("invalid created_at → systemMessage contains '未知学到'", async () => {
      const ruleInvalidDate = {
        id: "r-invalid-date",
        current_tier: "stable",
        enforcement: "warn",
        trigger: "use axios",
        correct_pattern: "use fetch",
        confidence: 0.80,
        created_at: "not-a-date",
        hit_count: 1,
      };
      const mockMatcher = { match: vi.fn().mockResolvedValue({ matched: [ruleInvalidDate] }) };
      const mockEventLog = { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) };
      const handler = createPreToolUseHandler({ matcher: mockMatcher as any, eventLog: mockEventLog as any });

      const result = await handler({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
        tool_use_id: "tu-invalid-date",
      } as any);

      expect(result.permissionDecision).toBe("allow");
      expect(result.systemMessage).toContain("未知学到");
    });

    it("block message includes hit_count in '已触发 N 次'", async () => {
      const blockRule = {
        id: "r-block-hitcount",
        current_tier: "enforced",
        enforcement: "block",
        trigger: "use axios",
        correct_pattern: "use fetch",
        confidence: 0.92,
        created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        hit_count: 7,
      };
      const mockMatcher = { match: vi.fn().mockResolvedValue({ matched: [blockRule] }) };
      const mockEventLog = { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) };
      const handler = createPreToolUseHandler({ matcher: mockMatcher as any, eventLog: mockEventLog as any });

      const result = await handler({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
        tool_use_id: "tu-hitcount",
      } as any);

      expect(result.permissionDecision).toBe("deny");
      expect(result.permissionDecisionReason).toMatch(/已触发 \d+ 次/);
    });
  });
});

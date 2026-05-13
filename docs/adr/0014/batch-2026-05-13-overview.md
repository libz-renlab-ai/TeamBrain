---
Title: 'TeamBrain 12-issue unified batch grill — overall verdict & roadmap'
Issues: "#290, #291, #296, #297, #306, #308, #309, #310, #320, #326, #371, #372"
Saved-at: 2026-05-13
Saved-by: /grill-with-docs save-mode (batch grill from ChatGPT share)
Grill-URL: https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46
---

# TeamBrain 12-issue unified batch grill — overall verdict & roadmap

> Save-mode capture per **ADR-0014 §"Operational shape" step 3** — **not a re-grill**.
> The grill itself happened on ChatGPT; this is the durable mirror. Issue-specific §s
> live in `./<issue>.md` siblings; architecture §s in `./batch-2026-05-13-architecture.md`;
> feature specs in `./batch-2026-05-13-feature-specs.md`. Source: [chatgpt.com share](https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46).

## Sections inlined below

- §0 — Overall verdict: 12 issues form one team-lead product line
- §1 — Foundational product question: who are we serving?
- §24 — Phase-1 cutline: what must be cut
- §30 — Final grilled roadmap
- §31 — Final verdict table (one-liner per issue)
- §32 — One-sentence version

# 0. 总裁决：这些 issue 不是 12 个独立小修，而是一条 team-lead 产品主线

这些 issue 表面上分散在 Codex hook、录音、状态栏、日报、leader dashboard、证据文档，但真正的主线只有一条：

> **TeamBrain 要从 developer-local 工具，推进成 team lead 的 AI 工作可观测平台。**

不能把它拆成“状态栏修一下”“录音修一下”“Codex hook 加一下”“日报生成一下”。那样每个 issue 都能做完，但产品会散。正确做法是把所有功能归入同一个事件 / plugin / dashboard 架构。

我建议这样分组：

```txt
A. Claude/Codex 事件接入底座：
  #290, #291

B. leader app 产品价值：
  #308, #309, #371, #372

C. 状态栏 / 本地可见性：
  #306, #326

D. audio / 录音事件源：
  #296, #297, #310

E. business feature 证明体系：
  #320
```

#290 明确要求落地项目级 Codex hook 配置，至少注册 `PreToolUse`、`Stop`、`SessionStart`，并在 stdin 形状不同时加 Codex-native adapter，而且不能改动现有 Claude scripts；#291 要 `teamagent init --target=codex|both` 真的安装 / 维护 Codex hooks，重复运行要幂等，不能重复写入，也不能覆盖用户改过的 Codex 配置。citeturn596084view0turn138076view0
#308 只明确“暂定 session start 和 usersubmit prompt 事件发给服务器”，#371 要员工每天使用完 Claude 后，把多个并行项目中的操作汇总为一句话日报，#372 要 leader 实时知道成员异常状态并理解项目整体。citeturn138076view4turn138076view9turn138076view10
#296/#297/#310 是 audio 线：#296 说 `record` 和 `recording` 命名冲突，#297 说 Windows 默认录系统 loopback 而不是麦克风且没有 `--device`，#310 则要求“不需要开电脑，随时开录”。citeturn148789view0turn148789view3turn138076view6

---

# 1. 最大产品问题：我们到底在服务谁？

## Grill 问题

TeamBrain 是给 individual developer 自己用，还是给 team lead 管理团队进展用？

## 可选答案

A. 只做 developer-local memory / hook 工具
B. 只做 leader 监控平台
C. developer 工具为底，leader dashboard 为上层产品
D. 两条产品线完全分开
E. 暂不决定，先做底层 hook

## 裁决

选 **C**，但产品叙事上优先说：

> **TeamBrain 是给 team lead 用的 AI work observability platform。**

底层还是 developer agent / hook / audio / statusline，但第一商业价值要落在 leader：

```txt
leader 不用问人，也能知道：
  谁现在在推进？
  哪个项目有风险？
  哪个人 / 哪个 issue 卡住了？
  今天每个成员在每个项目上做了什么？
```

原因是 #309 明确不是在问“做一个漂亮 UI”这么简单，它说“等前端去做个花里胡哨的界面，然后我们再给界面补后端”，这其实是在逼问 app 怎么证明自己能给小 B leader 提效。citeturn138076view5

所以首页不能先放配置中心，也不能先放 statusline 美化。首页必须证明三件事：

```txt
1. 当前谁 / 哪个项目正在动？
   -> #308 green light

2. 哪里异常，需要 leader 介入？
   -> #372 live inspection / incident

3. 今天做了什么？
   -> #371 member × project daily summary
```

---

# 24. 第一阶段 cutline：必须砍掉非闭环项

## Grill 问题

第一阶段到底交付什么？

## 可选答案

A. 12 个 issue 全做完
B. 只做 Codex hooks
C. 只做 dashboard
D. 只做 audio
E. 最小 leader 闭环

## 裁决

选 **E**。

第一阶段 P0：

```txt
1. #290/#291 hook 底座
   Claude/Codex 都能上报 SessionStart/UserPromptSubmit
   init --target=both 幂等，不 clobber

2. #308 green light
   leader 首页看到 member × project presence

3. #371 GitHub-first 日报
   member × project daily summary

4. #372 点击后 live inspection
   leader 点成员/项目/green light 后，开始拉 GitHub + AI events
   有异常则生成 incident

5. 最小 statusline
   本地显示 agent active/error/project binding/upload queue
```

第一阶段 P1：

```txt
audio PWA / teamagent audio
prompt raw search
advanced plugin config UI
notification channels
4-layer evidence docs polish
```

#296/#297/#310 不能完全忽略，因为 audio 将来会成为 plugin event source；但它不应该挡住 #308/#371/#372 的 leader 闭环。citeturn148789view0turn148789view3turn138076view6

---

# 30. 最终 grilled roadmap

## Phase 1：leader 最小闭环

```txt
#290:
  project-level Codex hook config + adapters

#291:
  init --target=codex/both
  idempotent
  no clobber
  target=claude unchanged

#308:
  SessionStart/UserPromptSubmit to server
  raw prompt full store
  green light presence

#371:
  GitHub-first member × project daily summary

#372:
  click-to-inspect live inspection
  incident if abnormal

#306/#326:
  minimal local statusline using same presence state
```

## Phase 2：audio event source

```txt
#296:
  rename record -> audio
  keep record alias
  disambiguate recording memory

#297:
  default mic
  --input mic|system|both
  --device
  audio devices
  better error

#310:
  PWA one-tap recording
  audio inbox
  project page recording
  AI suggests issue/PR binding
```

## Phase 3：evidence / polish

```txt
#320:
  business feature evidence matrix
  canned answer
  grep anchors
  machine-readable proof

#309:
  dashboard polish after backend is real
```

---

# 31. 最后裁决表

| Issue | grilled 裁决 |
|---|---|
| #290 | Codex hook 作为 host adapter 接入；不改 Claude scripts；raw + normalized event 双层 |
| #291 | `init --target=both` 支持 Claude/Codex；幂等；不 clobber；默认部分成功，strict 可选 |
| #296 | audio recorder 改名为 `teamagent audio`；`record` 保留 alias；`recording` 留给 Recording Memory |
| #297 | 三平台默认 mic；第一次确认设备；`--input` / `--device` / `audio devices` |
| #306 | statusline 只是本地 presence / health 视图，不做 dashboard |
| #308 | 立即上报 SessionStart/UserPromptSubmit；green light；完整 prompt evidence |
| #309 | 首页证明 leader 提效：异常、green light、日报，不是先做花哨 UI |
| #310 | PWA 一键录音 + CLI 共用 Audio Event API |
| #320 | evidence/coding discipline，不反向决定产品设计 |
| #326 | landing → init → Claude Code statusline 作为实现线，复用 presence state |
| #371 | GitHub-first member × project daily summary |
| #372 | leader 点击后 live inspection；异常冻结成 incident |

---

# 32. 一句话版本

--- end ---

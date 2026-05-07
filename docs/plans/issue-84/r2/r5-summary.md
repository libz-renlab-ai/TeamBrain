```
 ____  ____     ____
|  _ \|___ \   / ___|_   _ _ __ ___  _ __ ___   __ _ _ __ _   _
| |_) | __) | | |   | | | | '_ ` _ \| '_ ` _ \ / _` | '__| | | |
|  _ < / __/  | |___| |_| | | | | | | | | | | | (_| | |  | |_| |
|_| \_\_____|  \____|\__,_|_| |_| |_|_| |_| |_|\__,_|_|   \__, |
                                                             |___/
 R5 Summary: apps/landing scaffolding
 worker-5 | 2026-05-07
```

# R5 Summary — apps/landing/ Scaffolding

## 产出文件

| 文件 | 路径 | 大小 | 行数 |
|------|------|------|------|
| README.md | `apps/landing/README.md` | 3554 bytes | 96 行 |
| package.json | `apps/landing/package.json` | 436 bytes | 19 行（valid JSON） |

## 关键决策来源

### 来自 spec（`docs/specs/2026-05-07-landing-copy-actually-needed.md`）
- 决策 1：landing 定位为外部转化，面向陌生访客，30 秒判断"装 or 不装"
- 决策 5：两阶段 install 入口 `curl | sh + teamagent init`，写入 README Hero 区域
- 决策 7：第二屏用 `<details>` 可折叠，P1/P2 stage 划分明确
- Leaf 1（定稿）：Hero 文案 "Claude Code 没有记忆。你纠正它的每一句话，下次都白说。"

### 来自 P5（AI-slop anti-patterns）
- 5 条 must-avoid 精选写入 README "AI-slop 反例清单"
- 核心：禁宇宙渐变背景、禁匿名推荐卡、禁营销热词、禁通用 AI 图标、禁企业独白

### 来自 P6（a11y/SEO baseline）
- Lighthouse 验收门禁：perf ≥ 85 / a11y ≥ 90 / SEO ≥ 90 写入 README 专节
- `@lhci/cli` 列入 devDependencies 作为 verify 工具

## package.json 技术决策
- 构建脚本用 `cp -r src/. dist/` 纯静态复制，零框架依赖（符合 Pretext-native 约束）
- esbuild **未引入**：源文件是纯 HTML/CSS，无需 JS bundler
- devDependencies 最小集：`htmlhint`（lint）、`serve`（preview）、`@lhci/cli`（verify）
- `type=module`、`private:true`、`engines.node>=20`

## pnpm-workspace.yaml 注意事项

**pnpm-workspace.yaml 当前 only 'packages/*'；I2 阶段需补 'apps/*' glob 才能让 pnpm install 识别 apps/landing。**
（当前未改动 pnpm-workspace.yaml，按硬约束）

## Probe 产物

| 文件 | 大小 |
|------|------|
| `.fastprobe/issue84-r2/r5-1.stream.json` | 89500 bytes |
| `.fastprobe/issue84-r2/r5-2.stream.json` | 19403 bytes |
| `.fastprobe/issue84-r2/r5-1.debug.log` | 100945 bytes |
| `.fastprobe/issue84-r2/r5-2.debug.log` | 30750 bytes |

## 已知 follow-up

- `apps/landing/src/index.html` + `src/styles.css` 尚未创建（P1 骨架实现阶段产出）
- `apps/landing/public/` 目录尚未创建（favicon、og-image 等在 P1/P2 补充）
- `lighthouserc.json` 需要在 verify 脚本可用前补充
- pnpm-workspace.yaml 需在 I2 阶段加 `apps/*` glob

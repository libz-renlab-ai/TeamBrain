# Task 02 · 修复 stale-PR detection

## 题目

`starter/stale-pr.ts` 里有一个判断 PR 是否 "stale"（过时）的函数 `isStale`。
它**有 bug**——目前所有 stale PR 都被漏报（永远返回 `false`）。

你的任务：**定位 bug 并修复**，让 `score.test.ts` 全过。

## 约束

- **不准重写整个函数**。要找出 bug 修哪里。
- **不准改 `score.test.ts`**。
- **不准改函数签名**（输入输出类型不变）。

## stale 的定义（已写在 starter 的 JSDoc 里）

PR 满足下面两条之一即算 stale：

1. 最后一次更新时间距今超过 30 天；
2. 距 base branch 最新 commit 时间超过 14 天，且 PR 没有 `keep-alive` label。

## 提示

- 函数里有 **2 个 bug**（注释里有暗示但被故意隐藏）
- 一个是边界比较运算符方向错了
- 一个是 label 判断遇到 null label 数组没处理

## score.sh

跑 `vitest run score.test.ts`，全过 = exit 0。

## 评分维度

跟 task 01 一样：
- 完成（score.sh exit 0）
- 用时（start-task.sh / end-task.sh 时间戳差）
- AI 纠正次数（correction-hook.sh 自动计数）
- 代码质量（自动工具）
- 主观 1-5（成员填）

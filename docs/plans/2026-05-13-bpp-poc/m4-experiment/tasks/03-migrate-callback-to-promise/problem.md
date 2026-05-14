# Task 03 · 把 callback API 迁移到 Promise

## 题目

`starter/legacy.ts` 里有一组 5 个 Node 风格 callback 函数（`(err, result) => void`）。
你的任务：写一个 `starter/modern.ts`，把它们包装成 Promise 形式，
满足 `score.test.ts` 的全部测试。

## 约束

- **不准改 `starter/legacy.ts`**（这是模拟"无法改"的第三方代码）
- 包装函数命名按 `score.test.ts` 的 import 来
- 必须把 callback 的 `err` 正确传播为 Promise rejection
- 必须支持 `Promise.all` 并发调用

## 函数清单（5 个 → 5 个）

| Callback | 包装后 |
|---|---|
| `readConfig(path, cb)` | `readConfigAsync(path): Promise<Config>` |
| `writeConfig(path, val, cb)` | `writeConfigAsync(path, val): Promise<void>` |
| `fetchUser(id, cb)` | `fetchUserAsync(id): Promise<User>` |
| `batchInsert(items, cb)` | `batchInsertAsync(items): Promise<number>` |
| `streamLines(path, lineCb, doneCb)` | `streamLinesAsync(path): AsyncIterable<string>` (这一个是 async iter 不是单 promise) |

## 提示

最后一个（streamLines）是迁移的难点。要把"两个 callback 的 push 模型"
转成"async iter 的 pull 模型"。可以用 deferred queue 或者直接 wrap 成 generator。

## score.sh

跑 `vitest run score.test.ts`，全过 = exit 0。

## 评分维度

完成 / 用时 / AI 纠正次数 / 代码质量 / 主观 1-5（与 task 01、02 一致）。

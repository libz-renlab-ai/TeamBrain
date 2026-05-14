# Task 01 · parseDuration

## 题目

实现 `parseDuration(input: string): number` —— 把人类可读的时长字符串转为毫秒数。

## 输入格式

支持下列单位（可串联）：

- `ms` — 毫秒
- `s` — 秒
- `m` — 分钟
- `h` — 小时
- `d` — 天

示例（必过）：

| 输入 | 期望输出 |
|---|---|
| `"500ms"` | `500` |
| `"30s"` | `30000` |
| `"5m"` | `300000` |
| `"2h"` | `7200000` |
| `"1d"` | `86400000` |
| `"1h30m"` | `5400000` |
| `"2d3h45m12s"` | `186312000` |
| `"100ms500s"` | `500100` |
| `"0s"` | `0` |
| `"  1h30m  "` | `5400000` |（容忍前后空格）

## 错误处理

下列输入必须抛 `Error`（任意 message 都接受）：

- `""` 空字符串
- `"abc"` 无法识别
- `"5x"` 未知单位
- `"5"` 缺单位
- `"5h3"` 数字后缺单位
- `null` / `undefined`
- 非字符串

## 不需要支持

- 小数（`"1.5h"` 可抛错或截断为 1h，自选）
- 负数
- 时区、日期

## 起始代码

`starter/parseDuration.ts`：

```ts
export function parseDuration(input: string): number {
  // TODO: implement me
  throw new Error('not implemented');
}
```

## 提交方式

成员在 `starter/parseDuration.ts` 里完成实现，然后跑 `./score.sh`。
exit code 0 = 过，非零 = 没过。

## score.sh 干什么

跑 `vitest run` 对照 `score.test.ts`（10+ 个测试用例，覆盖所有上表 + 错误处理）。
全过 = exit 0。

## 时间记录

成员开始这一题时跑 `bash collection/start-task.sh 01-parse-duration`，
完成时跑 `bash collection/end-task.sh 01-parse-duration --result=pass|fail`。
两次时间戳之差 = 该成员该任务用时。

## AI 错误纠正次数

每当成员对智能助手说"不对"、"再来"、"这个不对"、"你写错了"、"我让你做的是 X 不是 Y"
等类似表达，由 hook 自动记录（hook 见 `collection/correction-hook.sh`）。
该任务完成时统计 = AI 犯错纠正次数。

## 主观评价

任务结束时由 `collection/end-task.sh` 弹窗（或 CLI 提示）让成员填 1-5 分
"助手在这次任务里的表现"，记入 daily JSONL。

import fsPromises from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { parseSessionFile } from "@teamagent/core";
import type { ParsedSession } from "@teamagent/types";
import type { SessionSource } from "@teamagent/ports";

// Re-export 纯函数以保持向后兼容（测试已 import 这个名字）
export { parseSessionFile };

/**
 * 从 ~/.claude/projects/{project-dir}/*.jsonl 加载 Claude Code 会话日志。
 *
 * 日志结构（实测 Claude Code 2.1.x 实际格式）:
 *   {type:"user", message:{role:"user", content:"..."}}
 *   {type:"assistant", message:{role:"assistant", content:[{type:"text"...},{type:"tool_use"...}]}}
 *   {type:"assistant", message:{role:"assistant", content:[{type:"tool_result","tool_use_id":"t1","content":"..."}]}}
 *
 * 解析策略:
 * - 把 user/assistant 消息按时间顺序遍历
 * - 每遇到 user 消息开一个新 turn
 * - 之后的 assistant 消息追加到 turn（文本拼接、tool_use 累积、tool_result 匹配到 tool_use）
 */
export class ClaudeSessionSource implements SessionSource {
  /**
   * @param projectsRoot Claude Code 会话根目录，默认 ~/.claude/projects
   */
  constructor(private readonly projectsRoot: string) {}

  async listRecent(
    limit = 10,
  ): Promise<Array<{ sessionId: string; startTime: string; turnCount: number }>> {
    if (!fsSync.existsSync(this.projectsRoot)) return [];

    const files: Array<{ file: string; mtime: number }> = [];
    const projectDirs = await fsPromises.readdir(this.projectsRoot);
    for (const pd of projectDirs) {
      const projPath = path.join(this.projectsRoot, pd);
      let stat: fsSync.Stats;
      try {
        stat = await fsPromises.stat(projPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      const entries = await fsPromises.readdir(projPath);
      for (const entry of entries) {
        if (!entry.endsWith(".jsonl")) continue;
        const full = path.join(projPath, entry);
        try {
          const fileStat = await fsPromises.stat(full);
          files.push({ file: full, mtime: fileStat.mtimeMs });
        } catch {
          continue;
        }
      }
    }

    files.sort((a, b) => b.mtime - a.mtime);
    const top = files.slice(0, limit);

    const result: Array<{ sessionId: string; startTime: string; turnCount: number }> = [];
    for (const { file } of top) {
      try {
        const session = await this.loadById(file);
        result.push({
          sessionId: session.sessionId,
          startTime: session.startTime,
          turnCount: session.turns.length,
        });
      } catch {
        continue;
      }
    }
    return result;
  }

  async loadById(sessionIdOrPath: string): Promise<ParsedSession> {
    // B-089: distinguish "path-shaped" input from "bare session UUID" so that a
    // path that doesn't exist surfaces a clear file-existence error instead of
    // silently falling back to resolveSessionFile (which would then complain
    // "Session not found: <full-path>" by treating the path as a UUID — both
    // misleading and a path-leak).
    const looksLikePath =
      path.isAbsolute(sessionIdOrPath) ||
      sessionIdOrPath.includes(path.sep) ||
      sessionIdOrPath.endsWith(".jsonl");

    let filePath: string;
    if (looksLikePath) {
      if (!fsSync.existsSync(sessionIdOrPath)) {
        throw new Error(`Transcript file does not exist: ${sessionIdOrPath}`);
      }
      filePath = sessionIdOrPath;
    } else {
      filePath = fsSync.existsSync(sessionIdOrPath)
        ? sessionIdOrPath
        : await this.resolveSessionFile(sessionIdOrPath);
    }

    const raw = await fsPromises.readFile(filePath, "utf-8");
    return parseSessionFile(raw);
  }

  private async resolveSessionFile(sessionId: string): Promise<string> {
    if (!fsSync.existsSync(this.projectsRoot)) {
      throw new Error(`Projects root not found: ${this.projectsRoot}`);
    }
    const projectDirs = await fsPromises.readdir(this.projectsRoot);
    for (const pd of projectDirs) {
      const candidate = path.join(this.projectsRoot, pd, `${sessionId}.jsonl`);
      if (fsSync.existsSync(candidate)) return candidate;
    }
    throw new Error(`Session not found: ${sessionId}`);
  }
}

// parseSessionFile 现在从 @teamagent/core 导入（见文件顶部 re-export）

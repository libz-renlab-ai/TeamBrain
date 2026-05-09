/**
 * Incremental scan cursor for Stop hook pipeline.
 *
 * Persists per-session last_scanned_turn so each Stop only processes new turns.
 * File: .teamagent/scan-cursor.json under project cwd.
 *
 * Shape:
 *   { "sessions": { "<session_id>": { "last_scanned_turn": N, "updated_at": ISO } } }
 */
import fs from "node:fs";
import path from "node:path";
import { findTeamagentRoot } from "./find-teamagent-root.js";

export const CURSOR_FILE_RELATIVE = path.join(".teamagent", "scan-cursor.json");

interface CursorEntry {
  last_scanned_turn: number;
  updated_at: string;
  /** Seen moment signatures (sha256 hex). Cap at MAX_SEEN per session. */
  seen?: string[];
}

interface CursorFile {
  sessions: Record<string, CursorEntry>;
}

const MAX_SEEN_PER_SESSION = 500;

export function getCursorFilePath(cwd: string): string {
  const root = findTeamagentRoot(cwd);
  return path.join(root, CURSOR_FILE_RELATIVE);
}

function loadFile(cwd: string): CursorFile {
  const file = getCursorFilePath(cwd);
  if (!fs.existsSync(file)) return { sessions: {} };
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CursorFile>;
    if (!parsed || typeof parsed !== "object" || !parsed.sessions) {
      return { sessions: {} };
    }
    return { sessions: parsed.sessions };
  } catch {
    return { sessions: {} };
  }
}

function saveFile(cwd: string, data: CursorFile): void {
  const file = getCursorFilePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function readCursor(cwd: string, sessionId: string): number {
  const data = loadFile(cwd);
  const entry = data.sessions[sessionId];
  if (!entry || typeof entry.last_scanned_turn !== "number") return -1;
  return entry.last_scanned_turn;
}

export function writeCursor(
  cwd: string,
  sessionId: string,
  lastScannedTurn: number,
): void {
  const data = loadFile(cwd);
  const existing = data.sessions[sessionId];
  data.sessions[sessionId] = {
    last_scanned_turn: lastScannedTurn,
    updated_at: new Date().toISOString(),
    ...(existing?.seen ? { seen: existing.seen } : {}),
  };
  saveFile(cwd, data);
}

export function clearCursor(cwd: string, sessionId: string): void {
  const file = getCursorFilePath(cwd);
  if (!fs.existsSync(file)) return;
  const data = loadFile(cwd);
  if (!(sessionId in data.sessions)) return;
  delete data.sessions[sessionId];
  saveFile(cwd, data);
}

export function readSeen(cwd: string, sessionId: string): Set<string> {
  const data = loadFile(cwd);
  const entry = data.sessions[sessionId];
  return new Set<string>(entry?.seen ?? []);
}

export function writeSeen(
  cwd: string,
  sessionId: string,
  seen: Set<string>,
): void {
  const data = loadFile(cwd);
  const existing = data.sessions[sessionId];
  const arr = Array.from(seen).slice(-MAX_SEEN_PER_SESSION);
  data.sessions[sessionId] = {
    last_scanned_turn: existing?.last_scanned_turn ?? -1,
    updated_at: new Date().toISOString(),
    seen: arr,
  };
  saveFile(cwd, data);
}

/**
 * B-051: atomic combined write of cursor + seen in a single read→modify→write cycle.
 * Replaces calling writeCursor() then writeSeen() separately, which created a TOCTOU
 * race in async-mode concurrent Stop processes.
 */
export function writeCursorAndSeen(
  cwd: string,
  sessionId: string,
  lastScannedTurn: number,
  seen: Set<string>,
): void {
  const data = loadFile(cwd);
  const arr = Array.from(seen).slice(-MAX_SEEN_PER_SESSION);
  data.sessions[sessionId] = {
    last_scanned_turn: lastScannedTurn,
    updated_at: new Date().toISOString(),
    seen: arr,
  };
  saveFile(cwd, data);
}

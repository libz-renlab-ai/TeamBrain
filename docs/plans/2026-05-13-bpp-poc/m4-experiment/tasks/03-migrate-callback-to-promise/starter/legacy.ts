// DO NOT MODIFY — simulates third-party callback-style API
export interface Config { key: string; value: number }
export interface User { id: number; name: string }

const fakeStore = new Map<string, Config>();

export function readConfig(path: string, cb: (err: Error | null, result?: Config) => void): void {
  setTimeout(() => {
    const v = fakeStore.get(path);
    if (!v) return cb(new Error(`config not found: ${path}`));
    cb(null, v);
  }, 5);
}

export function writeConfig(path: string, val: Config, cb: (err: Error | null) => void): void {
  setTimeout(() => {
    fakeStore.set(path, val);
    cb(null);
  }, 5);
}

const users: Record<number, User> = { 1: { id: 1, name: 'alice' }, 2: { id: 2, name: 'bob' } };

export function fetchUser(id: number, cb: (err: Error | null, user?: User) => void): void {
  setTimeout(() => {
    const u = users[id];
    if (!u) return cb(new Error(`user ${id} not found`));
    cb(null, u);
  }, 5);
}

export function batchInsert(items: number[], cb: (err: Error | null, count?: number) => void): void {
  setTimeout(() => {
    if (items.some((i) => i < 0)) return cb(new Error('negative item not allowed'));
    cb(null, items.length);
  }, 5);
}

export function streamLines(
  text: string,
  lineCb: (line: string) => void,
  doneCb: (err: Error | null) => void,
): void {
  if (text === '') return doneCb(new Error('empty text'));
  setImmediate(() => {
    for (const line of text.split('\n')) lineCb(line);
    doneCb(null);
  });
}

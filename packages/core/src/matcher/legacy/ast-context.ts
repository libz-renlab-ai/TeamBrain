import { createRequire } from "node:module";
import type { Parser as ParserType } from "web-tree-sitter";

const require = createRequire(import.meta.url);

let initialized = false;
// Pre-created parser per language (setLanguage already called)
const parsers = new Map<string, ParserType>();

const WASM_MAP: Record<string, string> = {
  typescript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  javascript: "tree-sitter-typescript/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-typescript/tree-sitter-tsx.wasm",
  python: "tree-sitter-python/tree-sitter-python.wasm",
};

/**
 * 首次调用时初始化 web-tree-sitter WASM runtime + 预加载语言。幂等。
 *
 * web-tree-sitter 走动态 import：tsup 把它列在 NATIVE_EXTERNAL，staged 的
 * ~/.teamagent/hooks/bin-*.cjs 离开 monorepo node_modules 后无法解析。
 * 顶层静态 import 会在 bundle 里留下 top-level `require("web-tree-sitter")`，
 * 任何拉到 matcher 的 hook（含从不调 matcher 的 SessionStart）启动时直接
 * MODULE_NOT_FOUND。改成 await import() 后，require 仅在 initAstMatcher 真
 * 被调用时触发；找不到模块时 catch 住，让 isInsideCommentOrString 走"无
 * parser → 不过滤"保守分支。
 */
export async function initAstMatcher(): Promise<void> {
  if (initialized) return;

  let wts: typeof import("web-tree-sitter");
  try {
    wts = await import("web-tree-sitter");
  } catch {
    initialized = true;
    return;
  }

  await wts.Parser.init({
    locateFile: (name: string) => require.resolve(`web-tree-sitter/${name}`),
  });

  for (const [lang, wasmRelPath] of Object.entries(WASM_MAP)) {
    if (parsers.has(lang)) continue;
    try {
      const fullPath = require.resolve(wasmRelPath);
      const language = await wts.Language.load(fullPath);
      const parser = new wts.Parser();
      parser.setLanguage(language);
      parsers.set(lang, parser);
    } catch {
      // 该语言 WASM 不可用，跳过（unknown lang 走 false 保守路径）
    }
  }

  initialized = true;
}

/**
 * 判断 `code` 中 `offset` 处是否落在 comment / string literal 内。
 * 落在 → 过滤（返回 true）；真代码或未知语言 → 不过滤（返回 false）。
 *
 * 同步 API；调用前须已 await initAstMatcher()。
 */
export function isInsideCommentOrString(
  code: string,
  offset: number,
  lang: string
): boolean {
  const parser = parsers.get(lang);
  if (!parser) return false; // 未知语言 → 保守：当作真命中，不过滤

  const tree = parser.parse(code);
  if (!tree) return false;

  const node = tree.rootNode.descendantForIndex(offset);

  let cur: ReturnType<typeof tree.rootNode.descendantForIndex> | null = node;
  while (cur) {
    const t = cur.type;
    if (t === "comment" || t === "line_comment" || t === "block_comment") {
      tree.delete();
      return true;
    }
    if (
      t === "string" ||
      t === "string_literal" ||
      t === "string_fragment" ||
      t === "template_string"
    ) {
      if (hasAncestor(cur, new Set(["import_statement", "export_statement"]))) {
        tree.delete();
        return false;
      }
      tree.delete();
      return true;
    }
    cur = cur.parent;
  }

  tree.delete();
  return false;
}

function hasAncestor(node: any, types: Set<string>): boolean {
  let cur = node;
  while (cur) {
    if (types.has(cur.type)) return true;
    cur = cur.parent;
  }
  return false;
}

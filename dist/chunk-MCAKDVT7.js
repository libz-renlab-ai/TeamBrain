import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/changelog-loader.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
function loadBundledChangelog() {
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    const bundled = path.join(dir, "CHANGELOG.md");
    try {
      const stat = fs.statSync(bundled);
      if (stat.isFile()) return fs.readFileSync(bundled, "utf-8");
    } catch {
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

export {
  loadBundledChangelog
};

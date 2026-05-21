import {
  DEFAULT_FIRE_THRESHOLD
} from "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../adapters/src/storage/sqlite/schema.ts
init_esm_shims();
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var { DatabaseSync: DatabaseSyncCtor } = require2("node:sqlite");
var _sqliteVecLoad;
try {
  const mod = require2("sqlite-vec");
  _sqliteVecLoad = mod.load;
} catch {
}
var INIT_SQL = `
-- \u77E5\u8BC6\u4E3B\u8868
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  scope_level TEXT NOT NULL CHECK(scope_level IN ('personal','team','global')),
  scope_project TEXT,
  scope_paths TEXT,
  scope_file_types TEXT,
  scope_branches TEXT,
  category TEXT NOT NULL,
  tags TEXT,
  type TEXT NOT NULL,
  nature TEXT NOT NULL,
  trigger TEXT NOT NULL,
  wrong_pattern TEXT DEFAULT '',
  correct_pattern TEXT NOT NULL,
  correct_pattern_code_example TEXT,
  correct_pattern_import_path TEXT,
  correct_pattern_tldr TEXT,
  reasoning TEXT,
  when_expression TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  demerit REAL NOT NULL DEFAULT 0,
  demerit_last_updated TEXT,
  current_tier TEXT NOT NULL DEFAULT 'experimental'
    CHECK(current_tier IN ('experimental','probation','stable','canonical','enforced','dormant')),
  max_tier_ever TEXT NOT NULL DEFAULT 'experimental',
  tier_entered_at TEXT NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'passive',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','conflict','stale','archived','dormant')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  override_count INTEGER NOT NULL DEFAULT 0,
  resurrect_count INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  source TEXT NOT NULL,
  conflict_with TEXT,
  created_at TEXT NOT NULL,
  last_hit_at TEXT,
  last_validated_at TEXT,
  -- M4-A: \u89C4\u5219\u901A\u9053\u3002tool-action \u662F\u5411\u540E\u517C\u5BB9\u9ED8\u8BA4\u503C\u3002
  channel TEXT NOT NULL DEFAULT 'tool-action'
    CHECK(channel IN ('tool-action','ai-narrative','user-input','passive-knowledge'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tier ON knowledge(current_tier);
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge(scope_level, scope_project);
CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge(status);

-- \u89C2\u5BDF\u8868\uFF08Calibrator \u7528\uFF0Cv2 \u65B0\u589E\uFF09
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
  source_event TEXT,
  tool_use_id TEXT,
  FOREIGN KEY(knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obs_knowledge ON observations(knowledge_id, timestamp DESC);

-- \u4E8B\u4EF6\u8868\uFF08\u66FF\u4EE3 JsonlEventLog\uFF0C\u5168\u5386\u53F2 append-only\uFF09
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  knowledge_id TEXT,
  tool_use_id TEXT,
  timestamp TEXT NOT NULL,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_knowledge ON events(knowledge_id);

-- \u5019\u9009\u89C4\u5219\u961F\u5217\uFF08M2.5-half\uFF0Creview-candidates \u7528\uFF09
CREATE TABLE IF NOT EXISTS rule_candidates (
  id          TEXT PRIMARY KEY,
  entry_json  TEXT NOT NULL,
  source_signals TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','skipped')),
  created_at  TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON rule_candidates(status, created_at ASC);

-- schema \u7248\u672C\u8868\uFF08\u540E\u7EED migration \u7528\uFF09
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (1, datetime('now'));
`;
var CURRENT_SCHEMA_VERSION = 8;
var V6_FTS_ONLY = `
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id UNINDEXED,
  trigger_description,
  pattern_description,
  tokenize='porter unicode61'
);
`;
var V6_ALTER_COLUMNS = [
  "trigger_description TEXT DEFAULT ''",
  "pattern_description TEXT DEFAULT ''",
  "hard_negatives BLOB",
  "threshold_alpha REAL DEFAULT 1.0",
  "threshold_beta REAL DEFAULT 1.0",
  `fire_threshold REAL DEFAULT ${DEFAULT_FIRE_THRESHOLD}`,
  "observation_window BLOB",
  "embedder_model_id TEXT DEFAULT ''"
];
function applyV6Migration(db) {
  const existing = new Set(
    db.prepare("PRAGMA table_info(knowledge)").all().map((c) => c.name)
  );
  for (const colDef of V6_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!colName) continue;
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  try {
    db.exec(V6_FTS_ONLY);
  } catch {
  }
  if (_sqliteVecLoad) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_trigger_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_pattern_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
    } catch {
    }
  }
}
var V7_ALTER_COLUMNS = [
  "tool_context_description TEXT DEFAULT ''"
];
function applyV7Migration(db) {
  const existing = new Set(
    db.prepare("PRAGMA table_info(knowledge)").all().map((c) => c.name)
  );
  for (const colDef of V7_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!colName) continue;
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  if (_sqliteVecLoad) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_tool_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
    } catch {
    }
  }
}
function openDb(path) {
  const db = new DatabaseSyncCtor(path, { allowExtension: true });
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  if (_sqliteVecLoad) {
    try {
      _sqliteVecLoad(db);
    } catch {
    }
  }
  db.exec(INIT_SQL);
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
      knowledge_id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    )`);
  } catch {
  }
  const version = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!version || version.version < 2) {
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (2, datetime('now'))");
  }
  if (!version || version.version < 3) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
        knowledge_id TEXT PRIMARY KEY,
        embedding FLOAT[384]
      )`);
    } catch {
    }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (3, datetime('now'))");
  }
  const versionNow = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionNow || versionNow.version < 4) {
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (4, datetime('now'))");
  }
  const versionM4 = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionM4 || versionM4.version < 5) {
    try {
      db.exec("ALTER TABLE knowledge ADD COLUMN channel TEXT NOT NULL DEFAULT 'tool-action'");
    } catch {
    }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (5, datetime('now'))");
  }
  const versionM4B = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionM4B || versionM4B.version < 6) {
    applyV6Migration(db);
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (6, datetime('now'))");
  }
  applyV6Migration(db);
  const versionM6 = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionM6 || versionM6.version < 7) {
    applyV7Migration(db);
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (7, datetime('now'))");
  }
  applyV7Migration(db);
  const versionWikiDrop = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get();
  if (!versionWikiDrop || versionWikiDrop.version < 8) {
    db.exec("DROP TABLE IF EXISTS wiki_meta");
    db.exec("DROP TABLE IF EXISTS wiki_subscriptions");
    db.exec("DROP TABLE IF EXISTS wiki_rejection_log");
    db.exec("DROP TABLE IF EXISTS wiki_entries");
    db.exec("DROP TABLE IF EXISTS wiki_sources");
    db.exec("DROP TABLE IF EXISTS wiki_rejections");
    try {
      db.exec("DROP TABLE IF EXISTS wiki_entries_vec");
    } catch {
    }
    try {
      db.exec("DROP TABLE IF EXISTS wiki_entries_fts");
    } catch {
    }
    try {
      db.exec("DROP TABLE IF EXISTS wiki_vec");
    } catch {
    }
    db.exec("INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES (8, datetime('now'))");
  }
  return db;
}
function closeDb(db) {
  db.close();
}

export {
  INIT_SQL,
  CURRENT_SCHEMA_VERSION,
  openDb,
  closeDb
};

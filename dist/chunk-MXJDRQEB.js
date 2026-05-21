import {
  openDb
} from "./chunk-EHS4WAHC.js";
import {
  DEFAULT_FIRE_THRESHOLD,
  normalizeChannel
} from "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../adapters/src/storage/sqlite/dual-layer-store.ts
init_esm_shims();

// ../adapters/src/storage/sqlite/sqlite-knowledge-store.ts
init_esm_shims();

// ../adapters/src/storage/sqlite/vec-sync.ts
init_esm_shims();
function syncRuleVectors(db, ruleId, triggerVec, patternVec) {
  db.prepare("DELETE FROM knowledge_trigger_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_trigger_vec(id, vec) VALUES (?, ?)"
  ).run(ruleId, new Uint8Array(triggerVec.buffer));
  db.prepare("DELETE FROM knowledge_pattern_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_pattern_vec(id, vec) VALUES (?, ?)"
  ).run(ruleId, new Uint8Array(patternVec.buffer));
}
function deleteRuleVectors(db, ruleId) {
  db.prepare("DELETE FROM knowledge_trigger_vec WHERE id = ?").run(ruleId);
  db.prepare("DELETE FROM knowledge_pattern_vec WHERE id = ?").run(ruleId);
}
function syncToolVector(db, ruleId, vec) {
  db.prepare("DELETE FROM knowledge_tool_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_tool_vec(id, vec) VALUES (?, ?)"
  ).run(ruleId, new Uint8Array(vec.buffer));
}

// ../adapters/src/storage/sqlite/sqlite-knowledge-store.ts
function serializeEntry(entry) {
  const e = entry;
  const toJson = (value) => {
    if (value == null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  };
  return {
    id: entry.id,
    scope_level: entry.scope.level,
    scope_project: entry.scope.project ?? null,
    scope_paths: entry.scope.paths ? JSON.stringify(entry.scope.paths) : null,
    scope_file_types: entry.scope.file_types ? JSON.stringify(entry.scope.file_types) : null,
    scope_branches: entry.scope.branches ? JSON.stringify(entry.scope.branches) : null,
    category: entry.category,
    tags: JSON.stringify(entry.tags),
    type: entry.type,
    nature: entry.nature,
    trigger: entry.trigger,
    wrong_pattern: entry.wrong_pattern,
    correct_pattern: entry.correct_pattern,
    correct_pattern_code_example: e.correct_pattern_code_example ?? null,
    correct_pattern_import_path: e.correct_pattern_import_path ?? null,
    correct_pattern_tldr: e.correct_pattern_tldr ?? null,
    reasoning: entry.reasoning,
    when_expression: e.when_expression ?? null,
    confidence: entry.confidence,
    demerit: e.demerit ?? 0,
    demerit_last_updated: e.demerit_last_updated ?? null,
    current_tier: e.current_tier ?? "experimental",
    max_tier_ever: e.max_tier_ever ?? "experimental",
    tier_entered_at: e.tier_entered_at && e.tier_entered_at.length > 0 ? e.tier_entered_at : entry.created_at,
    enforcement: entry.enforcement,
    status: entry.status,
    hit_count: entry.hit_count,
    success_count: entry.success_count,
    override_count: entry.override_count,
    resurrect_count: e.resurrect_count ?? 0,
    evidence: JSON.stringify(entry.evidence),
    source: entry.source,
    conflict_with: JSON.stringify(entry.conflict_with),
    created_at: entry.created_at,
    last_hit_at: entry.last_hit_at || null,
    last_validated_at: entry.last_validated_at || null,
    channel: normalizeChannel(entry.channel),
    // v6 semantic matching fields
    trigger_description: e.trigger_description ?? null,
    pattern_description: e.pattern_description ?? null,
    hard_negatives: toJson(e.hard_negatives),
    threshold_alpha: e.threshold_alpha ?? null,
    threshold_beta: e.threshold_beta ?? null,
    fire_threshold: e.fire_threshold ?? null,
    observation_window: toJson(e.observation_window),
    embedder_model_id: e.embedder_model_id ?? null
  };
}
function deserializeRow(row) {
  const scope = {
    level: row.scope_level,
    ...row.scope_project != null ? { project: row.scope_project } : {},
    ...row.scope_paths != null ? { paths: JSON.parse(row.scope_paths) } : {},
    ...row.scope_file_types != null ? { file_types: JSON.parse(row.scope_file_types) } : {},
    ...row.scope_branches != null ? { branches: JSON.parse(row.scope_branches) } : {}
  };
  return {
    id: row.id,
    scope,
    category: row.category,
    tags: row.tags ? JSON.parse(row.tags) : [],
    type: row.type,
    nature: row.nature,
    trigger: row.trigger,
    wrong_pattern: row.wrong_pattern ?? "",
    correct_pattern: row.correct_pattern,
    reasoning: row.reasoning ?? "",
    confidence: row.confidence,
    current_tier: row.current_tier ?? "experimental",
    max_tier_ever: row.max_tier_ever ?? "experimental",
    tier_entered_at: row.tier_entered_at ?? "",
    demerit: row.demerit ?? 0,
    demerit_last_updated: row.demerit_last_updated ?? "",
    resurrect_count: row.resurrect_count ?? 0,
    enforcement: row.enforcement,
    status: row.status,
    hit_count: row.hit_count,
    success_count: row.success_count,
    override_count: row.override_count,
    evidence: row.evidence ? JSON.parse(row.evidence) : { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: row.created_at,
    last_hit_at: row.last_hit_at ?? "",
    last_validated_at: row.last_validated_at ?? "",
    source: row.source,
    conflict_with: row.conflict_with ? JSON.parse(row.conflict_with) : [],
    channel: normalizeChannel(row.channel),
    // v6 semantic matching fields (default-safe for old rows)
    trigger_description: row.trigger_description ?? "",
    pattern_description: row.pattern_description ?? "",
    fire_threshold: row.fire_threshold ?? DEFAULT_FIRE_THRESHOLD,
    threshold_alpha: row.threshold_alpha ?? 1,
    threshold_beta: row.threshold_beta ?? 1,
    embedder_model_id: row.embedder_model_id ?? "",
    hard_negatives: (() => {
      const v = row.hard_negatives;
      if (!v) return [];
      const s = typeof v === "string" ? v : Buffer.from(v).toString("utf8");
      try {
        return JSON.parse(s);
      } catch {
        return [];
      }
    })(),
    observation_window: (() => {
      const v = row.observation_window;
      if (!v) return [];
      const s = typeof v === "string" ? v : Buffer.from(v).toString("utf8");
      try {
        return JSON.parse(s);
      } catch {
        return [];
      }
    })()
  };
}
var INSERT_SQL = `
INSERT INTO knowledge (
  id, scope_level, scope_project, scope_paths, scope_file_types, scope_branches,
  category, tags, type, nature, trigger, wrong_pattern, correct_pattern,
  correct_pattern_code_example, correct_pattern_import_path, correct_pattern_tldr,
  reasoning, when_expression, confidence, demerit, demerit_last_updated,
  current_tier, max_tier_ever, tier_entered_at, enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  evidence, source, conflict_with, created_at, last_hit_at, last_validated_at,
  channel,
  trigger_description, pattern_description, hard_negatives,
  threshold_alpha, threshold_beta, fire_threshold, observation_window, embedder_model_id
) VALUES (
  @id, @scope_level, @scope_project, @scope_paths, @scope_file_types, @scope_branches,
  @category, @tags, @type, @nature, @trigger, @wrong_pattern, @correct_pattern,
  @correct_pattern_code_example, @correct_pattern_import_path, @correct_pattern_tldr,
  @reasoning, @when_expression, @confidence, @demerit, @demerit_last_updated,
  @current_tier, @max_tier_ever, @tier_entered_at, @enforcement, @status,
  @hit_count, @success_count, @override_count, @resurrect_count,
  @evidence, @source, @conflict_with, @created_at, @last_hit_at, @last_validated_at,
  @channel,
  @trigger_description, @pattern_description, @hard_negatives,
  @threshold_alpha, @threshold_beta, @fire_threshold, @observation_window, @embedder_model_id
)`;
var SELECT_BY_ID = "SELECT * FROM knowledge WHERE id = @id";
var SELECT_ALL = "SELECT * FROM knowledge";
var SELECT_BY_SCOPE = "SELECT * FROM knowledge WHERE scope_level = @level";
var SELECT_ACTIVE = "SELECT * FROM knowledge WHERE status = 'active'";
var DELETE_BY_ID = "DELETE FROM knowledge WHERE id = @id";
var SqliteKnowledgeStore = class {
  db;
  embedder;
  constructor(db, opts = {}) {
    this.db = db;
    this.embedder = opts.embedder;
  }
  /**
   * Insert + auto-embed in one shot. Behaviour:
   *   1. Persist row via add() (synchronous SQL + FTS5).
   *   2. If an embedder is wired and at least one description field is non-empty,
   *      encode trigger/pattern/tool_context descriptions, write vec0 rows,
   *      and stamp embedder_model_id so downstream semanticMatch can see the rule.
   *   3. Embedding failure is swallowed (logged to stderr) — the row is not lost;
   *      operators can run `pnpm teamagent migrate-v6 --repair-all` to retry.
   *
   * Returning a Promise lets callers (init/pitfall/extract pipelines) await
   * embedding completion before status output. Hot-path PreToolUse hook reads
   * via findActive(); this is the rule write-path, so a few hundred ms of
   * embedder latency is acceptable here.
   */
  async addWithEmbedding(entry) {
    this.add(entry);
    await this.syncEmbeddingsFor(entry).catch((err) => {
      process.stderr.write(
        `[teamagent] auto-embed failed for ${entry.id}: ${err.message}
`
      );
    });
  }
  async updateWithEmbedding(id, patch) {
    this.update(id, patch);
    const merged = this.getById(id);
    if (!merged) return;
    await this.syncEmbeddingsFor(merged).catch((err) => {
      process.stderr.write(
        `[teamagent] auto-embed update failed for ${id}: ${err.message}
`
      );
    });
  }
  async syncEmbeddingsFor(entry) {
    if (!this.embedder) return;
    const e = entry;
    const trigDescr = e.trigger_description ?? "";
    const patDescr = e.pattern_description ?? "";
    const toolDescr = e.tool_context_description ?? "";
    if (!trigDescr && !patDescr && !toolDescr) return;
    const texts = [trigDescr || " ", patDescr || " ", toolDescr || " "];
    const vecs = await this.embedder.embed(texts);
    const t = vecs?.[0];
    const p = vecs?.[1];
    if (!t || !p) {
      throw new Error("embedder returned insufficient vectors");
    }
    syncRuleVectors(this.db, entry.id, new Float32Array(t), new Float32Array(p));
    const toolVec = vecs[2];
    if (toolDescr && toolVec) {
      syncToolVector(this.db, entry.id, new Float32Array(toolVec));
    }
    this.db.prepare("UPDATE knowledge SET embedder_model_id = ? WHERE id = ?").run(this.embedder.modelId, entry.id);
  }
  add(entry) {
    const params = serializeEntry(entry);
    this.db.prepare(INSERT_SQL).run(params);
    if (entry.trigger_description || entry.pattern_description) {
      try {
        this.db.prepare(
          `INSERT OR REPLACE INTO knowledge_fts(id, trigger_description, pattern_description)
           VALUES (?, ?, ?)`
        ).run(
          entry.id,
          entry.trigger_description ?? "",
          entry.pattern_description ?? ""
        );
      } catch {
      }
    }
  }
  getById(id) {
    const row = this.db.prepare(SELECT_BY_ID).get({ id });
    return row ? deserializeRow(row) : void 0;
  }
  /** Batch fetch by a list of ids. Missing ids are silently omitted. */
  byIds(ids) {
    if (ids.length === 0) return [];
    return ids.map((id) => this.getById(id)).filter((e) => e !== void 0);
  }
  getAll() {
    const rows = this.db.prepare(SELECT_ALL).all();
    return rows.map(deserializeRow);
  }
  findByScopeLevel(level) {
    const rows = this.db.prepare(SELECT_BY_SCOPE).all({ level });
    return rows.map(deserializeRow);
  }
  findActive() {
    const rows = this.db.prepare(SELECT_ACTIVE).all();
    return rows.map(deserializeRow);
  }
  /** KnowledgeStore port compatibility */
  getActive() {
    return this.findActive();
  }
  count() {
    const row = this.db.prepare("SELECT COUNT(*) as n FROM knowledge").get();
    return row.n;
  }
  query(options = {}) {
    let entries = options.includeArchived ? this.getAll() : this.findActive();
    if (options.keyword) {
      const kw = options.keyword.toLowerCase();
      entries = entries.filter(
        (e) => e.trigger.toLowerCase().includes(kw) || e.correct_pattern.toLowerCase().includes(kw) || (e.wrong_pattern ?? "").toLowerCase().includes(kw) || e.tags.some((t) => t.toLowerCase().includes(kw))
      );
    }
    if (options.category) {
      entries = entries.filter((e) => e.category === options.category);
    }
    if (options.minConfidence !== void 0) {
      entries = entries.filter((e) => e.confidence >= options.minConfidence);
    }
    if (options.limit !== void 0) {
      entries = entries.slice(0, options.limit);
    }
    return entries;
  }
  update(id, patch) {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Knowledge entry not found: ${id}`);
    }
    const merged = { ...existing, ...patch };
    if (patch.scope) {
      merged.scope = { ...existing.scope, ...patch.scope };
    }
    const params = serializeEntry(merged);
    const setClauses = [
      "scope_level = @scope_level",
      "scope_project = @scope_project",
      "scope_paths = @scope_paths",
      "scope_file_types = @scope_file_types",
      "scope_branches = @scope_branches",
      "category = @category",
      "tags = @tags",
      "type = @type",
      "nature = @nature",
      "trigger = @trigger",
      "wrong_pattern = @wrong_pattern",
      "correct_pattern = @correct_pattern",
      "correct_pattern_code_example = @correct_pattern_code_example",
      "correct_pattern_import_path = @correct_pattern_import_path",
      "correct_pattern_tldr = @correct_pattern_tldr",
      "reasoning = @reasoning",
      "when_expression = @when_expression",
      "confidence = @confidence",
      "demerit = @demerit",
      "demerit_last_updated = @demerit_last_updated",
      "current_tier = @current_tier",
      "max_tier_ever = @max_tier_ever",
      "tier_entered_at = @tier_entered_at",
      "enforcement = @enforcement",
      "status = @status",
      "hit_count = @hit_count",
      "success_count = @success_count",
      "override_count = @override_count",
      "resurrect_count = @resurrect_count",
      "evidence = @evidence",
      "source = @source",
      "conflict_with = @conflict_with",
      "created_at = @created_at",
      "last_hit_at = @last_hit_at",
      "last_validated_at = @last_validated_at",
      "channel = @channel",
      "trigger_description = @trigger_description",
      "pattern_description = @pattern_description",
      "hard_negatives = @hard_negatives",
      "threshold_alpha = @threshold_alpha",
      "threshold_beta = @threshold_beta",
      "fire_threshold = @fire_threshold",
      "observation_window = @observation_window",
      "embedder_model_id = @embedder_model_id"
    ];
    const sql = `UPDATE knowledge SET ${setClauses.join(", ")} WHERE id = @id`;
    this.db.prepare(sql).run(params);
    const trigDescr = merged.trigger_description ?? merged.trigger_description;
    const patDescr = merged.pattern_description ?? merged.pattern_description;
    if (trigDescr || patDescr) {
      try {
        this.db.prepare(`DELETE FROM knowledge_fts WHERE id = ?`).run(id);
        this.db.prepare(
          `INSERT INTO knowledge_fts(id, trigger_description, pattern_description)
           VALUES (?, ?, ?)`
        ).run(id, trigDescr ?? "", patDescr ?? "");
      } catch {
      }
    }
  }
  delete(id) {
    this.db.prepare(DELETE_BY_ID).run({ id });
  }
  close() {
    this.db.close();
  }
};

// ../adapters/src/storage/sqlite/dual-layer-store.ts
var DualLayerStore = class {
  project;
  global;
  constructor(cfg) {
    this.project = new SqliteKnowledgeStore(openDb(cfg.projectDbPath), { embedder: cfg.embedder });
    this.global = new SqliteKnowledgeStore(openDb(cfg.userGlobalDbPath), { embedder: cfg.embedder });
  }
  add(entry) {
    switch (entry.scope.level) {
      case "personal":
      case "team":
        this.project.add(entry);
        return;
      case "global":
        this.global.add(entry);
        return;
      default:
        throw new Error(`unknown scope level: ${entry.scope.level}`);
    }
  }
  /** Same routing as add() but uses the embedder-aware path on the underlying store. */
  async addWithEmbedding(entry) {
    switch (entry.scope.level) {
      case "personal":
        await this.project.addWithEmbedding(entry);
        return;
      case "global":
        await this.global.addWithEmbedding(entry);
        return;
      case "team":
        await this.project.addWithEmbedding(entry);
        return;
      default:
        throw new Error(`unknown scope level: ${entry.scope.level}`);
    }
  }
  async updateWithEmbedding(id, patch) {
    if (this.project.getById(id) !== void 0) {
      await this.project.updateWithEmbedding(id, patch);
    } else if (this.global.getById(id) !== void 0) {
      await this.global.updateWithEmbedding(id, patch);
    } else {
      throw new Error(`Knowledge entry not found in any layer: ${id}`);
    }
  }
  getById(id) {
    return this.project.getById(id) ?? this.global.getById(id);
  }
  findActive() {
    return [...this.project.findActive(), ...this.global.findActive()];
  }
  getAll() {
    return [...this.project.getAll(), ...this.global.getAll()];
  }
  getProjectStore() {
    return this.project;
  }
  getGlobalStore() {
    return this.global;
  }
  /** B-063: implement KnowledgeStore.update() — routes to the layer that owns the entry. */
  update(id, patch) {
    if (this.project.getById(id) !== void 0) {
      this.project.update(id, patch);
    } else if (this.global.getById(id) !== void 0) {
      this.global.update(id, patch);
    } else {
      throw new Error(`Knowledge entry not found in any layer: ${id}`);
    }
  }
  /** B-063: implement KnowledgeStore.delete() */
  delete(id) {
    if (this.project.getById(id) !== void 0) {
      this.project.delete(id);
    } else {
      this.global.delete(id);
    }
  }
  /** B-063: implement KnowledgeStore.count() */
  count() {
    return this.project.count() + this.global.count();
  }
  /** B-063: implement KnowledgeStore.findByScopeLevel() */
  findByScopeLevel(level) {
    if (level === "global") return this.global.findByScopeLevel("global");
    return this.project.findByScopeLevel(level);
  }
  close() {
    this.project.close();
    this.global.close();
  }
};

export {
  syncRuleVectors,
  deleteRuleVectors,
  syncToolVector,
  deserializeRow,
  SqliteKnowledgeStore,
  DualLayerStore
};

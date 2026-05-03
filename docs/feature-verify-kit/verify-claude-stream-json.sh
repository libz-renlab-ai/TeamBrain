#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/docs/feature-verify-kit/runs"
mkdir -p "$OUT_DIR"

PROMPT='Read the section "## Canonical Feature TL;DR" in docs/系统展示.md. That section contains 7 bullet lines, each starting with one of these key names followed by ": " and a verbatim Chinese sentence: positioning, metrics, market_gap, delivered_vs_planned, hooks, knowledge_delivery, self_evolution. Return ONLY a JSON object whose 7 keys are exactly those names and whose values are the EXACT verbatim sentences from that section, copied byte-for-byte (same punctuation, same quotes, same digits). Each value must be the sentence itself, not another JSON object encoded as a string. Do not paraphrase. Do not summarize. Do not add or remove any character. Do not include the leading "key: " prefix in the value.'
SCHEMA='{"type":"object","properties":{"positioning":{"type":"string","minLength":1,"pattern":"^(?!\\s*[\\{\\[]).+"},"metrics":{"type":"string","minLength":1,"pattern":"^(?!\\s*[\\{\\[]).+"},"market_gap":{"type":"string","minLength":1,"pattern":"^(?!\\s*[\\{\\[]).+"},"delivered_vs_planned":{"type":"string","minLength":1,"pattern":"^(?!\\s*[\\{\\[]).+"},"hooks":{"type":"string","minLength":1,"pattern":"^(?!\\s*[\\{\\[]).+"},"knowledge_delivery":{"type":"string","minLength":1,"pattern":"^(?!\\s*[\\{\\[]).+"},"self_evolution":{"type":"string","minLength":1,"pattern":"^(?!\\s*[\\{\\[]).+"}},"required":["positioning","metrics","market_gap","delivered_vs_planned","hooks","knowledge_delivery","self_evolution"],"additionalProperties":false}'

CLAUDEFAST_BIN="${CLAUDEFAST_BIN:-claudefast}"
if ! command -v "$CLAUDEFAST_BIN" >/dev/null 2>&1; then
  echo "FATAL: $CLAUDEFAST_BIN not found on PATH; set CLAUDEFAST_BIN=/path/to/claudefast" >&2
  exit 127
fi

source "$ROOT/docs/feature-verify-kit/claudefast-stream-json-flags.sh"
STREAM_JSON_FLAGS=()
FLAGS_TMP="$OUT_DIR/claudefast-stream-json-flags.tmp"
HOOK_DEBUG_FILE="$OUT_DIR/claude-hooks.debug.log"
: > "$OUT_DIR/hook-evidence-coverage.txt"
set +e
CLAUDEFAST_REQUIRE_HOOK_EVIDENCE=1 claudefast_stream_json_flags "$CLAUDEFAST_BIN" "$OUT_DIR/claudefast-help.txt" "$HOOK_DEBUG_FILE" > "$FLAGS_TMP"
status=$?
set -e
if [ "$status" -ne 0 ]; then
  rm -f "$FLAGS_TMP"
  printf '%s\n' "FATAL: hook evidence is required for the feature verification gate. claudefast -h must advertise --debug and --debug-file." \
    | tee -a "$OUT_DIR/hook-evidence-coverage.txt" >&2
  exit "$status"
fi
while IFS= read -r flag; do
  STREAM_JSON_FLAGS+=("$flag")
done < "$FLAGS_TMP"
rm -f "$FLAGS_TMP"
printf '%s\n' "${STREAM_JSON_FLAGS[@]}" > "$OUT_DIR/claudefast-stream-json-flags.txt"
if grep -q '"hookEvidenceMode": "debug-file"' "$OUT_DIR/claudefast-help.txt.capabilities.json" 2>/dev/null; then
  printf '%s\n' "HOOK_EVIDENCE: using --debug hooks --debug-file $HOOK_DEBUG_FILE" \
    | tee -a "$OUT_DIR/hook-evidence-coverage.txt" >&2
elif grep -q '"hookEvidenceMode": "unsupported"' "$OUT_DIR/claudefast-help.txt.capabilities.json" 2>/dev/null; then
  printf '%s\n' "FATAL: hook evidence is unsupported; this feature verification gate cannot pass green." \
    | tee -a "$OUT_DIR/hook-evidence-coverage.txt" >&2
  exit 4
fi

set +e
"$CLAUDEFAST_BIN" -p --model haiku \
  "${STREAM_JSON_FLAGS[@]}" \
  --permission-mode acceptEdits \
  --json-schema "$SCHEMA" \
  "$PROMPT" \
  > "$OUT_DIR/claude-stream.jsonl" \
  2> "$OUT_DIR/claude-stream.stderr.log"
claude_status=$?
set -e
if [ "$claude_status" -ne 0 ]; then
  echo "FATAL: $CLAUDEFAST_BIN -p failed with exit $claude_status" >&2
  echo "The harness passes the prompt as the final argv. If this wrapper expects stdin, pipe the prompt into claudefast -p or fix the wrapper to preserve argv prompts." >&2
  echo "See: $OUT_DIR/claude-stream.stderr.log" >&2
  exit "$claude_status"
fi

if grep -q '"hookEvidenceMode": "debug-file"' "$OUT_DIR/claudefast-help.txt.capabilities.json" 2>/dev/null; then
  if [ ! -s "$HOOK_DEBUG_FILE" ]; then
    echo "FATAL: hook debug evidence file is empty or missing: $HOOK_DEBUG_FILE" >&2
    exit 4
  fi
  if ! grep -qi "hook" "$HOOK_DEBUG_FILE"; then
    echo "FATAL: hook debug evidence file did not contain hook debug lines: $HOOK_DEBUG_FILE" >&2
    exit 4
  fi
fi

node -e '
const fs=require("fs");
const p=process.argv[1];
const out=process.argv[2];
const lines=fs.readFileSync(p,"utf8").split(/\n+/).filter(Boolean);
const expected=[
  "positioning",
  "metrics",
  "market_gap",
  "delivered_vs_planned",
  "hooks",
  "knowledge_delivery",
  "self_evolution",
];
const expectedSet=new Set(expected);
function parsedJsonString(value){
  if(typeof value!=="string") return false;
  const trimmed=value.trim();
  if(!/^[\[{]/.test(trimmed)) return false;
  try{ JSON.parse(trimmed); return true; }catch{ return false; }
}
function validate(obj, source){
  const errors=[];
  if(!obj || typeof obj!=="object" || Array.isArray(obj)){
    return [`${source}: candidate is not a JSON object`];
  }
  const keys=Object.keys(obj);
  for(const key of expected){
    if(!Object.prototype.hasOwnProperty.call(obj,key)) errors.push(`${source}: missing key ${key}`);
  }
  for(const key of keys){
    if(!expectedSet.has(key)) errors.push(`${source}: unexpected key ${key}`);
  }
  for(const key of expected){
    if(Object.prototype.hasOwnProperty.call(obj,key) && typeof obj[key]!=="string"){
      errors.push(`${source}: ${key} is ${Array.isArray(obj[key]) ? "array" : typeof obj[key]}, expected string`);
    } else if(parsedJsonString(obj[key])){
      errors.push(`${source}: ${key} is a nested JSON-looking string`);
    }
  }
  return errors;
}
function maybeParseResultString(value){
  if(typeof value!=="string") return null;
  try{ return JSON.parse(value); }catch{ return null; }
}
// Prefer the final structured JSON emitted by Claude Code: result.structured_output
// in recent versions, or the StructuredOutput tool input in older streams. Plain
// result text is only a compatibility fallback.
const candidates=[];
for(const line of lines){
  try{
    const j=JSON.parse(line);
    if(j && j.type==="assistant" && j.message && Array.isArray(j.message.content)){
      for(const block of j.message.content){
        if(block && block.type==="tool_use" && block.name==="StructuredOutput" && block.input && typeof block.input==="object"){
          candidates.push({source:"assistant.StructuredOutput", obj:block.input});
        }
      }
    }
    if(j && j.type==="result"){
      if(j.structured_output && typeof j.structured_output==="object"){
        candidates.push({source:"result.structured_output", obj:j.structured_output});
      } else if(typeof j.result==="string"){
        const parsed=maybeParseResultString(j.result);
        if(parsed) candidates.push({source:"result.result-json", obj:parsed});
      }
    }
  }catch{}
}
let chosen=null;
const errors=[];
for(let i=candidates.length-1;i>=0;i--){
  const candidate=candidates[i];
  const validationErrors=validate(candidate.obj,candidate.source);
  if(validationErrors.length===0){
    chosen=candidate;
    break;
  }
  errors.push(...validationErrors);
}
if(!chosen){
  const suffix=errors.length ? ` Validation errors: ${errors.join("; ")}` : "";
  throw new Error(`No valid final feature JSON found in stream-json.${suffix}`);
}
const obj={};
for(const key of expected) obj[key]=chosen.obj[key];
fs.writeFileSync(out, JSON.stringify(obj,null,2));
' "$OUT_DIR/claude-stream.jsonl" "$OUT_DIR/claude-features.json"

echo "Wrote: $OUT_DIR/claude-stream.jsonl"
echo "Wrote: $OUT_DIR/claude-features.json"

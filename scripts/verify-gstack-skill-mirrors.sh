#!/usr/bin/env bash
# Deterministic verifier for project-level gstack skill mirrors.
#
# It checks the two project skill trees used by Claude Code and Codex:
#   .claude/skills/*
#   .codex/skills/*
#
# The check is intentionally local and sandbox-safe: it reads committed files
# only and never runs gstack, claudefast, codex, npm, or global installers.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

fail() {
  echo "GSTACK-SKILL-MIRRORS: FAIL"
  echo "$1"
  exit 1
}

expected_gstack_root_block() {
  local platform="$1"

  case "$platform" in
    claude)
      cat <<'EOF'
if [ -x "$_GSTACK_PROJECT_DIR/.claude/skills/gstack/bin/gstack-config" ]; then
  GSTACK_SKILLS_ROOT="$_GSTACK_PROJECT_DIR/.claude/skills/gstack"
elif [ -x "$_GSTACK_PROJECT_DIR/.codex/skills/gstack/bin/gstack-config" ]; then
  GSTACK_SKILLS_ROOT="$_GSTACK_PROJECT_DIR/.codex/skills/gstack"
elif [ -x "$HOME/.claude/skills/gstack/bin/gstack-config" ]; then
  GSTACK_SKILLS_ROOT="$HOME/.claude/skills/gstack"
elif [ -x "$HOME/.codex/skills/gstack/bin/gstack-config" ]; then
  GSTACK_SKILLS_ROOT="$HOME/.codex/skills/gstack"
else
  GSTACK_SKILLS_ROOT="$_GSTACK_PROJECT_DIR/.claude/skills/gstack"
fi
EOF
      ;;
    codex)
      cat <<'EOF'
if [ -x "$_GSTACK_PROJECT_DIR/.codex/skills/gstack/bin/gstack-config" ]; then
  GSTACK_SKILLS_ROOT="$_GSTACK_PROJECT_DIR/.codex/skills/gstack"
elif [ -x "$HOME/.codex/skills/gstack/bin/gstack-config" ]; then
  GSTACK_SKILLS_ROOT="$HOME/.codex/skills/gstack"
else
  GSTACK_SKILLS_ROOT="$_GSTACK_PROJECT_DIR/.codex/skills/gstack"
fi
EOF
      ;;
    *)
      fail "unknown gstack root block platform: $platform"
      ;;
  esac
}

extract_gstack_root_block() {
  local file="$1"

  awk '
    /^if \[ -x "\$_GSTACK_PROJECT_DIR\/\.(claude|codex)\/skills\/gstack\/bin\/gstack-config" \]; then$/ {
      in_block=1
    }
    in_block {
      print
      if ($0 == "fi") {
        exit
      }
    }
  ' "$file"
}

assert_gstack_root_block() {
  local platform="$1"
  local file="$2"
  local skill="$3"

  expected_gstack_root_block "$platform" > "$tmp/$platform-$skill.expected-block"
  extract_gstack_root_block "$file" > "$tmp/$platform-$skill.actual-block"

  diff -u "$tmp/$platform-$skill.expected-block" "$tmp/$platform-$skill.actual-block" \
    > "$tmp/$platform-$skill.block.diff" \
    || fail "$platform gstack root fallback block is wrong for $skill:
$(cat "$tmp/$platform-$skill.block.diff")"
}

assert_codex_resource_reference() {
  local file="$1"
  local resource_path="$2"
  local expected_ref="$3"
  local description="$4"

  if [ -e "$resource_path" ]; then
    rg -q -F "$expected_ref" "$file" \
      || fail "Codex skill does not reference existing repo-local resource for $description:
file=$file
resource=$resource_path
expected=$expected_ref"
  else
    if rg -q -F "$expected_ref" "$file"; then
      fail "Codex skill references missing repo-local resource for $description:
file=$file
missing=$resource_path
reference=$expected_ref"
    fi
  fi
}

assert_codex_resource_absent() {
  local resource_path="$1"
  local bad_ref_regex="$2"
  local description="$3"

  if [ ! -e "$resource_path" ]; then
    local refs
    refs="$(rg -n "$bad_ref_regex" .codex/skills --glob 'SKILL.md' --glob 'SKILL.md.tmpl' || true)"
    if [ -n "$refs" ]; then
      fail "Codex skills generate references to missing resource for $description:
missing=$resource_path
$refs"
    fi
  fi
}

tmp="$(mktemp -d "${TMPDIR:-/tmp}/gstack-skill-mirrors.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

find .claude/skills -mindepth 2 -maxdepth 2 -name SKILL.md \
  | sed 's#^\.claude/skills/##; s#/SKILL.md$##' \
  | sort > "$tmp/claude-skills.txt"
find .codex/skills -mindepth 2 -maxdepth 2 -name SKILL.md \
  | sed 's#^\.codex/skills/##; s#/SKILL.md$##' \
  | sort > "$tmp/codex-skills.txt"

diff -u "$tmp/claude-skills.txt" "$tmp/codex-skills.txt" \
  > "$tmp/skills.diff" || fail "skill set differs between .claude and .codex mirrors:
$(cat "$tmp/skills.diff")"

find .claude/skills/gstack/bin -maxdepth 1 -type f -print \
  | sed 's#^\.claude/skills/gstack/bin/##' \
  | sort > "$tmp/claude-bin.txt"
find .codex/skills/gstack/bin -maxdepth 1 -type f -print \
  | sed 's#^\.codex/skills/gstack/bin/##' \
  | sort > "$tmp/codex-bin.txt"

diff -u "$tmp/claude-bin.txt" "$tmp/codex-bin.txt" \
  > "$tmp/bin.diff" || fail "gstack bin set differs between .claude and .codex mirrors:
$(cat "$tmp/bin.diff")"

while IFS= read -r bin; do
  cmp -s ".claude/skills/gstack/bin/$bin" ".codex/skills/gstack/bin/$bin" \
    || fail "gstack bin content differs: $bin"
done < "$tmp/claude-bin.txt"

for skill in $(cat "$tmp/claude-skills.txt"); do
  assert_gstack_root_block claude ".claude/skills/$skill/SKILL.md" "$skill"
  assert_gstack_root_block codex ".codex/skills/$skill/SKILL.md" "$skill"

  if [ -f ".claude/skills/$skill/SKILL.md.tmpl" ] || [ -f ".codex/skills/$skill/SKILL.md.tmpl" ]; then
    [ -f ".claude/skills/$skill/SKILL.md.tmpl" ] \
      || fail "SKILL.md.tmpl missing from Claude mirror: $skill"
    [ -f ".codex/skills/$skill/SKILL.md.tmpl" ] \
      || fail "SKILL.md.tmpl missing from Codex mirror: $skill"
  fi
done

codex_home_gate_refs="$(
  rg -n 'if \[ -n "\$\{CODEX_HOME:-\}" \] && \[ -x "\$_GSTACK_PROJECT_DIR/\.codex/skills/gstack/bin/gstack-config" \]; then' .codex/skills --glob 'SKILL.md' || true
)"
if [ -n "$codex_home_gate_refs" ]; then
  fail "Codex-visible skills still gate the project-local Codex gstack mirror on CODEX_HOME:
$codex_home_gate_refs"
fi

bad_codex_hardcoded_gstack_refs="$(
  rg -n "\\.claude/skills/gstack|~/.claude/skills/gstack|\\\$HOME/.claude/skills/gstack" .codex/skills -g 'SKILL.md*' || true
)"
if [ -n "$bad_codex_hardcoded_gstack_refs" ]; then
  fail "Codex-visible SKILL.md files still hardcode Claude-side gstack paths:
$bad_codex_hardcoded_gstack_refs"
fi

bad_codex_body_refs="$(
  rg -n '(^|[^[:alnum:]_])(~|\$HOME|\$_GSTACK_PROJECT_DIR|\$_ROOT)?/?.claude/skills/gstack' \
    .codex/skills --glob 'SKILL.md' --glob 'SKILL.md.tmpl' || true
)"
if [ -n "$bad_codex_body_refs" ]; then
  fail "Codex-visible skill bodies still directly reference Claude-side gstack paths:
$bad_codex_body_refs"
fi

bad_codex_exec_refs="$(
  rg -n '(\$\(|<\()((~|\$HOME)/\.claude|\.claude)/skills/gstack/bin/gstack-|^"?((~|\$HOME)/\.claude|\.claude)/skills/gstack/bin/gstack-' .codex/skills --glob 'SKILL.md' --glob 'SKILL.md.tmpl' || true
)"
if [ -n "$bad_codex_exec_refs" ]; then
  fail "Codex-visible skills still execute Claude-side gstack bins:
$bad_codex_exec_refs"
fi

bad_codex_sibling_under_gstack_refs="$(
  rg -n '(\$GSTACK_SKILLS_ROOT|\.codex/skills/gstack)/(office-hours|plan-ceo-review|design-html|design-shotgun|canary)(/|`|"| |$)|\$GSTACK_SKILLS_ROOT/ETHOS\.md|\.codex/skills/gstack/ETHOS\.md' \
    .codex/skills --glob 'SKILL.md' --glob 'SKILL.md.tmpl' || true
)"
if [ -n "$bad_codex_sibling_under_gstack_refs" ]; then
  fail "Codex-visible skills still point same-level skill resources at the gstack root:
$bad_codex_sibling_under_gstack_refs"
fi

bad_codex_skill_file_under_gstack_root_refs="$(
  rg -n '(\$GSTACK_SKILLS_ROOT|\.codex/skills/gstack)/[^[:space:]`"'\''()]+/SKILL\.md' \
    .codex/skills --glob 'SKILL.md' --glob 'SKILL.md.tmpl' || true
)"
if [ -n "$bad_codex_skill_file_under_gstack_root_refs" ]; then
  fail "Codex-visible skills still treat the gstack runtime root as a skill directory:
$bad_codex_skill_file_under_gstack_root_refs"
fi

assert_codex_resource_reference \
  ".codex/skills/plan-ceo-review/SKILL.md" \
  ".codex/skills/office-hours/SKILL.md" \
  '$_GSTACK_PROJECT_DIR/.codex/skills/office-hours/SKILL.md' \
  "plan-ceo-review inline /office-hours handoff"

assert_codex_resource_reference \
  ".codex/skills/design-html/SKILL.md" \
  ".codex/skills/design-html/vendor/pretext.js" \
  '$_ROOT/.codex/skills/design-html/vendor/pretext.js' \
  "design-html vendored Pretext probe"

assert_codex_resource_reference \
  ".codex/skills/design-html/SKILL.md.tmpl" \
  ".codex/skills/design-html/vendor/pretext.js" \
  '$_ROOT/.codex/skills/design-html/vendor/pretext.js' \
  "design-html template vendored Pretext probe"

assert_codex_resource_reference \
  ".codex/skills/plan-ceo-review/SKILL.md" \
  ".codex/skills/plan-ceo-review/ETHOS.md" \
  '$_GSTACK_PROJECT_DIR/.codex/skills/plan-ceo-review/ETHOS.md' \
  "plan-ceo-review ETHOS"

assert_codex_resource_reference \
  ".codex/skills/office-hours/SKILL.md" \
  ".codex/skills/office-hours/ETHOS.md" \
  '$_GSTACK_PROJECT_DIR/.codex/skills/office-hours/ETHOS.md' \
  "office-hours ETHOS"

assert_codex_resource_absent \
  ".codex/skills/plan-ceo-review/ETHOS.md" \
  '(\.codex/skills/plan-ceo-review/ETHOS\.md|\$GSTACK_SKILLS_ROOT/ETHOS\.md)' \
  "plan-ceo-review ETHOS"

assert_codex_resource_absent \
  ".codex/skills/office-hours/ETHOS.md" \
  '(\.codex/skills/office-hours/ETHOS\.md|\$GSTACK_SKILLS_ROOT/ETHOS\.md)' \
  "office-hours ETHOS"

echo "GSTACK-SKILL-MIRRORS: PASS"
echo "skills=$(wc -l < "$tmp/claude-skills.txt" | tr -d ' ') bins=$(wc -l < "$tmp/claude-bin.txt" | tr -d ' ')"

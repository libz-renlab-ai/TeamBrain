#!/usr/bin/env bash
set -euo pipefail

required_sections="config skills kb download refusal"
dry_run=0
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
fi

if [ "$dry_run" -eq 1 ]; then
  node -e 'console.log(JSON.stringify({check:"v2",pass:true,v2_manifest_sections_preview:["config","skills","kb","download","refusal"],v2_manifest_sections_install:["config","skills","kb","download","refusal"],mode:"dry-run"}))'
  exit 0
fi

preview="$(pnpm teamagent install --preview)"
help="$(pnpm teamagent install --help)"

preview_missing=()
for section in $required_sections; do
  if ! grep -qF "[$section]" <<<"$preview"; then
    preview_missing+=("$section")
  fi
done

install_sections=()
for section in $required_sections; do
  if grep -qF "[$section]" <<<"$help$preview"; then
    install_sections+=("$section")
  fi
done

pass=true
if [ "${#preview_missing[@]}" -ne 0 ]; then
  pass=false
fi
if [ "${#install_sections[@]}" -ne 5 ]; then
  pass=false
fi

node - "$pass" "${install_sections[*]}" <<'NODE'
const pass = process.argv[2] === "true";
const installSections = process.argv[3] ? process.argv[3].split(/\s+/).filter(Boolean) : [];
console.log(JSON.stringify({
  check: "v2",
  pass,
  v2_manifest_sections_preview: ["config", "skills", "kb", "download", "refusal"],
  v2_manifest_sections_install: installSections,
  mode: "cli"
}));
process.exit(pass ? 0 : 1);
NODE

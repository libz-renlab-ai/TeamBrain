git clone https://github.com/libz-renlab-ai/TeamBrain
cd TeamBrain
pnpm install
REPO_ROOT="$(git rev-parse --show-toplevel)"
TSX="$REPO_ROOT/node_modules/.bin/tsx"
SANDBOX="$(mktemp -d /tmp/feature1-sandbox.XXXXXX)"
TMPHOME="$(mktemp -d /tmp/feature1-home.XXXXXX)"
( cd "$SANDBOX" && git init -q )
( cd "$SANDBOX" && "$TSX" "$REPO_ROOT/packages/cli/src/bin.ts" init \
    --cwd="$SANDBOX" --home="$TMPHOME" \
    --skip-import --skip-warmup --skip-hook --skip-seed )
# expect: exit 0 + "✅ TeamAgent 安装成功！" banner + .teamagent/knowledge.db file

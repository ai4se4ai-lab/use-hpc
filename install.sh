#!/usr/bin/env bash
# One-command install of the use-hpc skill WITHOUT the plugin system (e.g. editors where /plugin is unavailable):
#   bash <(curl -fsSL https://raw.githubusercontent.com/ai4se4ai-lab/use-hpc-claude-skill/main/install.sh)
#   or, from a clone:  bash install.sh
# Copies the skill to ~/.claude/skills/use-hpc (personal skills are available in every project on this machine).
# Rerun to update. Do not combine with the plugin install, or the skill will be listed twice.
set -euo pipefail
REPO_URL="${USE_HPC_REPO:-https://github.com/ai4se4ai-lab/use-hpc-claude-skill.git}"
DEST="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/use-hpc"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
if [ -n "$here" ] && [ -f "$here/plugins/use-hpc/skills/use-hpc/SKILL.md" ]; then
    src="$here/plugins/use-hpc/skills/use-hpc"
else
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    git clone -q --depth 1 "$REPO_URL" "$tmp/repo" || git clone -q --depth 1 git@github.com:ai4se4ai-lab/use-hpc-claude-skill.git "$tmp/repo"
    src="$tmp/repo/plugins/use-hpc/skills/use-hpc"
fi
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST.new"; cp -r "$src" "$DEST.new"
rm -rf "$DEST"; mv "$DEST.new" "$DEST"
chmod +x "$DEST"/scripts/*.sh "$DEST"/templates/hpc/slurm/*.sh "$DEST"/templates/hpc/slurm/*.py \
         "$DEST"/templates/hpc/scripts/*.py "$DEST"/templates/hpc/scripts/*.sh "$DEST"/templates/hpc/status.sh 2>/dev/null || true
echo "installed use-hpc skill -> $DEST  (restart Claude Code or start a new session to load it)"

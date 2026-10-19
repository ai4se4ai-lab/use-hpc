#!/usr/bin/env bash
# Install the same skill for any supported agent. Requires Node.js/npx.
# From a clone: bash install.sh --agent codex
set -euo pipefail
agent="codex"
scope="--global"
while [ "$#" -gt 0 ]; do
    case "$1" in
        --agent)
            [ "$#" -ge 2 ] || { echo "--agent requires a value" >&2; exit 2; }
            agent="$2"; shift 2 ;;
        --project) scope=""; shift ;;
        --global) scope="--global"; shift ;;
        -h|--help)
            echo "Usage: bash install.sh [--agent codex|claude-code|opencode|cursor|github-copilot] [--project|--global]"
            echo "Default: Codex, global. Project installs use the current working directory."
            exit 0 ;;
        *) echo "Unknown argument: $1 (try --help)" >&2; exit 2 ;;
    esac
done
case "$agent" in
    codex|claude-code|opencode|cursor|github-copilot) ;;
    *) echo "Unsupported agent: $agent (try --help)" >&2; exit 2 ;;
esac
command -v npx >/dev/null 2>&1 || { echo "Install Node.js (with npx) first." >&2; exit 1; }
source="${USE_HPC_REPO:-https://github.com/ai4se4ai-lab/use-hpc}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
if [ -n "$here" ] && [ -f "$here/plugins/use-hpc/skills/use-hpc/SKILL.md" ]; then
    source="$here/plugins/use-hpc/skills/use-hpc"
fi
args=(skills add "$source" --skill use-hpc --agent "$agent" --copy --yes)
if [ -n "$scope" ]; then args+=("$scope"); fi
npx -y "${args[@]}"
echo "Installed use-hpc for $agent. Start a new agent session to load the skill."

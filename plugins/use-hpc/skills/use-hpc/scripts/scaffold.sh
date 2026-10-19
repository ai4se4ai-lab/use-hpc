#!/bin/bash
# scaffold.sh — copy the use-hpc template into a project as <project>/hpc (never overwrites existing files).
#   bash <loaded-skill-directory>/scripts/scaffold.sh /path/to/project [--force]
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${1:?usage: scaffold.sh <project dir> [--force]}"
FORCE="${2:-}"
SRC="$SKILL_DIR/templates/hpc"
DEST="$(cd "$PROJECT" && pwd)/hpc"
mkdir -p "$DEST"
created=0; kept=0
while IFS= read -r -d '' f; do
    rel="${f#"$SRC"/}"
    tgt="$DEST/$rel"
    mkdir -p "$(dirname "$tgt")"
    if [ -e "$tgt" ] && [ "$FORCE" != "--force" ]; then kept=$((kept+1)); continue; fi
    cp "$f" "$tgt"; created=$((created+1))
done < <(find "$SRC" -type f -not -name '*.pyc' -not -path '*/__pycache__/*' -print0)
chmod +x "$DEST"/slurm/*.sh "$DEST"/slurm/*.py "$DEST"/scripts/*.py "$DEST"/scripts/*.sh "$DEST"/status.sh 2>/dev/null || true
mkdir -p "$DEST/logs" "$DEST/docs"
echo "scaffolded $DEST  ($created files written, $kept existing files kept)"
echo "next: edit hpc/config/cluster.env (ACCOUNT, MODULES, SRC_DIRS) and hpc/config/experiments.json, then"
echo "      bash hpc/scripts/selftest.sh && python3 hpc/slurm/submit.py --smoke"

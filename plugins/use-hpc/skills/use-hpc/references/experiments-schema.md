# `hpc/config/experiments.json`: the experiment graph

This one file describes everything the cluster will run. `submit.py` turns it into Slurm jobs, `run_stage.py` executes it, `audit.py` reports on it, and `collect_results.py` turns its outputs into results. Edit this file and `cluster.env`. The scripts should rarely need changes.

## Top level

| Key | Type | Meaning |
|---|---|---|
| `project` | str | Prefix of every job name; shown in the audit. |
| `require_gpu` | bool (default `true`) | Every stage must request a GPU unless it says `"cpu_only": true`. `submit.py` refuses to submit otherwise, and `stage.sh` refuses to compute if no GPU is visible. |
| `vars` | {str: str} | Placeholders available as `{NAME}` in commands (sizes, seeds, model lists, flags). |
| `smoke` | object | Overrides for `submit.py --smoke` (see below). |
| `stages` | list | The graph nodes, **in submission order**. A stage may only depend on earlier stages. |
| `results` | object | What `collect_results.py` builds (see below). |

## Stage

| Key | Meaning |
|---|---|
| `name` | Letters, digits, `_` and `-`. Used for the job name, log folders and dependencies. |
| `description` | Free text. Name the research question or hypothesis it serves. |
| `depends` | `[{"stage": "<earlier stage>", "type": "afterok" \| "afterany" \| "afternotok" \| "aftercorr"}]` |
| `matrix` | `{"param": [values], ...}`: the Cartesian product becomes the cells, one array task each. `{param}` is available in commands. |
| `matrix_from` | Reuse the cells of another stage. This is required for `aftercorr`, because cell *i* must mean the same thing in both stages. |
| `array_throttle` | `%N` on the array: at most N cells run at the same time (fairshare, licences, shared services). |
| `resources` | `gpus` (e.g. `h100:1`, `h100_3g.40gb:1`) **or** `gpus_per_node` (e.g. `h100:4`), plus `nodes`, `ntasks_per_node`, `cpus` (per task), `mem` (per node), `time`, `requeue` (bool), `constraint`, `partition` (avoid unless required). |
| `cpu_only` | `true` only for work that provably needs no GPU, and only when the project allows it. |
| `internet` | Documentation flag: this stage downloads. Put all downloads in one early stage, because many clusters have compute nodes without internet. |
| `sbatch_extra` | List of extra raw sbatch flags. |
| `steps` | Ordered list (below). |

### Dependency types

| Type | Starts when | Use for |
|---|---|---|
| `afterok` | the upstream stage (all its array tasks) succeeded | **gates**: setup → everything. A failure cancels the dependents (`--kill-on-invalid-dep=yes`). |
| `afterany` | the upstream stage ended in any state | analysis and collection, and consumers that can work on partial data. One failed cell must not block the study. |
| `aftercorr` | task *i* of the upstream array succeeded | **cell-wise pipelining**. Post-processing of cell *i* starts while other cells are still running. Needs `matrix_from`. |
| `afternotok` | the upstream stage failed | cleanup or notification stages (rare). |

## Step

| Key | Meaning |
|---|---|
| `name` | Unique within the stage. |
| `cmd` | Bash command (pipes allowed; runs with `-o pipefail` from the repository root). Placeholders are filled first. An unknown placeholder is an error, which `selftest.sh` catches before submission. `${SHELL_VAR}` is left to bash. |
| `builtin` | Instead of `cmd`: `check_gpu` (record the GPUs), `check_nodes` (multi-node: every node has a GPU, sees the shared results directory, and resolves the master node), or `collect` (run `collect_results.py`). |
| `needs` | Globs relative to `$RESULTS` that must exist before the step runs. **This is the data contract with upstream stages.** A missing input fails the step with rc 6 and a clear note instead of producing garbage. |
| `produces` | Globs that must exist after success; otherwise the step fails with rc 7. The next stage's `needs` should match these. |
| `progress` | `{"file": "<path under RESULTS>", "expected": "<arithmetic with placeholders>"}`. The audit counts records (JSONL lines, CSV rows) and shows a progress bar. |
| `retries` | Re-run up to N times on a non-zero exit (transient failures). |
| `critical` | If it fails, stop the rest of the stage. Use for gates such as data verification. |
| `always` | Re-run even if a `.done` marker exists (verification, checks, analysis, collection). |
| `env` | `{VAR: value}` with placeholders, added to the step's environment. |
| `launcher` | `"srun"` runs the command once per task of a multi-node allocation (for `torchrun`, MPI, Ray workers). |

### Built-in placeholders

`RESULTS` (= `$WORK/runs/<RUN_ID>/results`, shared by every node), `RUN_DIR`, `RUN_ID`, `REPO`, `HPC`, `LOGS`, `STAGE`, `CELL` (safe cell key, e.g. `model-a__ds1`), `CELL_ID`, `SMOKE` (`1`/`0`), `NNODES`, `NTASKS`, `JOB_ID`, every variable of `cluster.env`, every key of `vars`, and the cell's matrix parameters.

### Making steps resumable (very important for long jobs)

The runner skips finished **steps**. The command itself should skip finished **records**:

- Append one JSON line per finished unit of work (run, task, sample, epoch) to the output file.
- On start, read the file and skip keys that are already present. Retry only those recorded as `error`.
- Each cell writes its own file. Never let two jobs append to the same file, because concurrent appends from different nodes corrupt lines.
- For training, save a checkpoint at least every hour and resume from the latest one. Jobs longer than 12 h should checkpoint.

## `smoke`

```json
"smoke": {"vars": {"N_ITEMS": "4", "SEEDS": "1"}, "time": "00:45:00", "matrix_limit": 2, "array_throttle": 2}
```

`--smoke` keeps **every stage and every dependency** but shrinks the work:

- `vars` overrides sizes;
- `matrix_limit` keeps the first N cells of every matrix;
- `time` replaces every stage's time limit.

The result is a real end-to-end test on real GPU nodes: modules, wheels, data flow between stages, outputs, collection and the audit. Run IDs start with `am-smoke-`, and the collected summary is labelled "not for reporting".

## `results`

```json
"results": {
  "tables":    [{"name": "runs", "glob": "main/*.jsonl"}],
  "summaries": [{"name": "success_by_model", "table": "runs", "group_by": ["model", "condition"],
                 "metrics": {"success": ["mean", "rate"], "seconds": "median", "task": "count"},
                 "caption": "Success by model and condition"}],
  "plots":     [{"name": "fig_success", "summary": "success_by_model", "kind": "bar",
                 "x": "model", "y": "success_mean", "hue": "condition", "title": "Success"}],
  "copy":      ["analysis/**", "setup/*.json"],
  "archive":   ["runs"]
}
```

- **tables** concatenate every `.csv`, `.tsv`, `.jsonl` and `.json` under the glob. Nested JSON is flattened as `a.b`, and a `_source` column is added. Output: `csv/<name>.csv`.
- **summaries** group by columns and aggregate with `mean`, `median`, `sum`, `count`, `min`, `max`, `std` or `rate` (share of true values). Output: `csv/`, `tables/<name>.md`, and `tables/<name>.tex` (booktabs).
- **plots** draw `bar`, `line`, `scatter` or `box` from a summary or a table. Output: `figures/<name>.png` and `.pdf` (requires matplotlib in `requirements.txt`).
- **copy** copies files as they are to `results/raw/`. **archive** packs directories with many small files into one `.tar.gz`.

The project's own analysis (statistical tests, the paper's exact tables and figures) belongs in a step of the final stage. `collect` then gathers it through `copy`.

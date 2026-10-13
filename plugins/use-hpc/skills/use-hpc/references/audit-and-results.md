# Auditing every phase and collecting results

## Where everything is

```
hpc/logs/<RUN_ID>/                      (repository on /project: persistent, backed up; not in git)
├── config/            frozen cluster.env, experiments.json, experiments.resolved.json (cells expanded), requirements.txt
├── run_manifest.json  git commit/branch/dirty files/diff hash, content hashes of code and config, submissions
├── jobs.tsv           job id, stage, cells, dependency, submission time (one row per submission)
├── jobs_finished.tsv  every job ending: ok | FAILED(rc) | requeued, with node and restart count
├── steps.tsv          LEDGER: every step attempt: job, array task, restart, stage, cell, step, start, end, seconds, rc, note, command
├── steps/<stage>/<cell>/<step>.log     full output of each step (appended across attempts, with headers)
├── steps/<stage>/<cell>/<step>.running live marker while the step runs (job, host, start time)
├── slurm/             Slurm stdout/stderr per job or array task (%x_%A_%a)
├── env/               module list, environment, pip freeze per job; service logs
├── gpu/               nvidia-smi samples every GPU_MONITOR_SECS per job and restart
├── audit.txt|json     last audit snapshot
└── results/           collected results (after the collect step)

$WORK/runs/<RUN_ID>/                    (scratch: fast, NOT backed up, purged)
├── results/           $RESULTS: every stage writes here; shared by all nodes
├── state/<stage>/<cell>/<step>.done    resume markers
└── run_manifest.json
```

## Audit levels

| Level | Question it answers | Evidence |
|---|---|---|
| Intent | What was supposed to run? | frozen `config/`, `experiments.resolved.json` |
| Code identity | Which code produced the results? | `run_manifest.json` (commit, dirty files, content hashes) |
| Environment | With what software and hardware? | `env/*`, `setup/gpu_*.txt`, model and data digests written by setup |
| Gates | Was the input sane before spending GPU-days? | setup steps (`critical`), pre-flight outputs |
| Jobs | Where and how long did each job run, and how did it end? | Slurm accounting, `jobs.tsv`, `jobs_finished.tsv`, `slurm/` |
| Steps | Did every step run, how long did it take, what went wrong? | `steps.tsv`, step logs, `needs` / `produces` checks |
| Data | How far is each cell; are records missing or broken? | `progress` specs, the audit's records column, `pipeline/completeness.csv` |
| Resources | Was the GPU used well? | `gpu/*.csv` → `pipeline/gpu_usage.csv` |
| Results | Is every planned output present? | `collected/summary.md`, the coverage matrix in the guide |

## The live audit

```bash
bash hpc/status.sh                       # newest run
bash hpc/status.sh <RUN_ID> --watch 120  # redraw every 2 min; exits when nothing is queued or running
bash hpc/status.sh <RUN_ID> --only failed
bash hpc/status.sh <RUN_ID> --steps      # one line per step under each row
```

Columns, one row per stage × cell:

- `STAGE[cell]` and `CELL` (matrix parameters)
- `STATE`: OK, RUNNING, PENDING, PARTIAL (some steps failed), FAILED, TIMEOUT, CANCELLED, OUT_OF_MEMORY, REQUEUED or NOT_SUBMITTED
- `GPU` request and `NODE`
- `RUN / LIMIT`
- `WAIT` (queue reason)
- `STEPS` ok/total
- `PROGRESS` (records written / expected)
- `CURRENT / FAILED` step
- `DETAIL` (step timer, or the failure note)

A **Failures** section follows, with the reason, the relevant log lines and the log path of every failed step. The header shows totals for cells, steps, requeues and records. Each snapshot is saved to `audit.txt` and `audit.json`, so the audit itself is part of the record.

When the user asks "how is it going?", run the audit once and summarise it. Do not start a polling loop.

## Collected results (`collect` built-in → `hpc/logs/<RUN_ID>/results/`)

| Path | Content |
|---|---|
| `summary.md` | tables overview, every summary table, figures list, completeness, GPU use |
| `csv/<table>.csv` | all raw records of each `results.tables` entry, concatenated and flattened |
| `csv/<summary>.csv`, `tables/<summary>.md`, `tables/<summary>.tex` | grouped metrics, ready for a paper (booktabs) |
| `figures/<plot>.png`, `.pdf` | plots from `results.plots` |
| `pipeline/steps_latest.csv`, `steps_all_attempts.csv`, `jobs.csv`, `job_endings.csv` | the audit trail as CSV |
| `pipeline/completeness.csv` | every stage × cell: state, steps ok/total, records done/expected, failed steps |
| `pipeline/gpu_usage.csv` | mean and max GPU utilisation and peak memory per job |
| `raw/...` | files matched by `results.copy` (for example the project's own analysis outputs) |
| `<dir>.tar.gz` | directories listed in `results.archive` (many small files → one archive) |
| `run_manifest.json` | code and config identity |

The project's exact paper tables and figures come from its own analysis step (statistics belong to the project). Gather them with `results.copy`, and document the mapping from files to paper labels in the guide's coverage matrix.

## Reproducibility checklist

- [ ] Commit the code before the full run (the manifest records dirty files, but clean is better).
- [ ] Pin versions: modules in `cluster.env`, packages in `requirements.txt`, model tags or digests recorded by setup.
- [ ] Use seeds wherever there is randomness, and pass them through `vars` or the matrix.
- [ ] Freeze the config (automatic). To change a running study, start a new `RUN_ID`, or document the resubmission.
- [ ] Keep smoke results apart (`am-smoke-*`) and never report them.
- [ ] Copy results to `/project` (automatic in collect). Scratch is purged.
- [ ] The guide (`hpc/docs/hpc-guide.md`) states the coverage matrix and the limitations.

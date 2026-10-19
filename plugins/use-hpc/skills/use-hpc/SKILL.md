---
name: use-hpc
description: Turn a project's source code plus a paper or design document that describes its approach and experiments into a complete, GPU-only Slurm pipeline in the project's hpc/ directory. It covers a job graph with arrays and dependencies, a smoke test of every stage, a live tabular audit, and collected CSVs, tables, figures and logs, plus a guide that maps every experiment of the document to the job that runs it. Use this skill whenever the user wants to run, reproduce, scale out or test experiments on an HPC cluster, a supercomputer, Slurm, sbatch, Compute Canada / Digital Research Alliance (Nibi, Fir, Narval, Rorqual...), GPU nodes, job arrays or job dependencies. Also use it when they share a .tex/.pdf/.md paper and ask to "run all the experiments", or ask how to use GPU nodes, monitor jobs, audit runs or collect results on a cluster, even if they never say "skill" or "HPC".
---

# use-hpc: from source code and a paper to audited GPU experiments on Slurm

You are given (a) a project's source code and (b) a document (paper, report, design doc; often LaTeX) that explains the approach and its experiments. Your job is to deliver a `hpc/` directory in the project that:

1. **runs every experiment the document describes** as a graph of Slurm jobs, with all computation on GPU nodes, distributed for throughput, and none on the login node;
2. **connects the stages**: outputs of one stage are the inputs of the next, enforced by Slurm dependencies and checked by file contracts;
3. **can be smoke-tested** end to end in under an hour before the real run;
4. **shows a live tabular audit** (stage × cell: state, node, time, steps, progress, failures);
5. **collects results** as CSVs, Markdown and LaTeX tables, figures, the pipeline ledger and the manifest, copied to persistent storage;
6. **documents itself** in `hpc/docs/hpc-guide.md`, including a coverage matrix from document claims to jobs to outputs.

A tested, generic implementation ships with this skill in `templates/hpc/`. Copy it and configure it. Do not write a new pipeline from scratch: the template already handles requeueing, array tasks, contracts, the ledger, the GPU guard and the audit, and it was tested end to end.

## Ground rules (shared clusters)

- **Login node = light work only**: editing, git, `sbatch`, reading logs, the audit, `selftest.sh`. Installs, downloads, model loading, runs, tests that need data or models, and analysis all happen in jobs. If something heavier is needed interactively, ask the user to open an allocation (`salloc ... --gpus=...`).
- **Follow the site's documentation** before improvising (Alliance: `/cvmfs/soft.computecanada.ca/custom/docs/en/`). Read `references/alliance-cluster.md`. Use modules and the wheelhouse virtualenv; avoid conda, uv or PyPI unless the user asks.
- **Request only what is used.** Never poll Slurm faster than every 60 s. Never put `sleep` in jobs. Ask before submitting anything big. A smoke run is small, but submitting it is still the user's call.
- **Scratch for work, project for results.** Check quota (`diskusage_report`) before large runs.

## Workflow

Track these phases as a todo list. Report to the user at the end of phases 1, 4 and 6.

### Phase 1: understand the document and the code (read-only)
Read `references/paper-to-experiments.md` and do its passes 1–2:
- build the **experiment inventory** (RQs or hypotheses with decision rules, subjects, factors, design size, side studies, auxiliary roles, metrics, statistics, artefacts, fixed parameters, stated gaps);
- map each item to **source entry points**, output paths, resumability, dependencies and services.

Note disagreements between the document and the code, and ask which wins. Summarise the inventory and the estimated scale (runs, GPU-hours) for the user.

### Phase 2: scaffold
```bash
bash <skill base directory>/scripts/scaffold.sh <project_dir>      # never overwrites existing files
```
Use the base directory of the loaded `SKILL.md` as `<skill base directory>`; resolve `scripts/`, `references/`, and `templates/` relative to it. Do not assume a Claude installation or a particular agent's home directory. The same skill works with Codex, Claude Code, OpenCode, Cursor, and GitHub Copilot when the agent can read files and execute shell commands. The generated pipeline uses Bash, Python and Slurm, with no agent SDK or model-provider API dependency. On Windows, run the pipeline in a Linux environment or on the remote cluster. The project now has `hpc/{config,slurm,scripts,docs,logs}`.

### Phase 3: configure
- `hpc/config/cluster.env`: `ACCOUNT` (ask the user; `sshare -U` lists accounts), `MODULES`, `SRC_DIRS`, `CODE_HASH_DIRS`, `WORK`, GPU monitor interval.
- `hpc/config/requirements.txt`: the project's dependencies (check them against the wheelhouse).
- `hpc/config/experiments.json`: the graph. Follow `references/experiments-schema.md` and pass 3 of `paper-to-experiments.md`:
  - **setup** stage (the only one with internet; `critical` gates; pre-flight run; `check_gpu`) → `afterok` for everything else;
  - **main matrix** with one cell per model × dataset (arrays, `progress`, `requeue`);
  - **side studies** in parallel;
  - consumers via **`aftercorr`** (cell-wise, with `matrix_from`) or **`afterany`**;
  - **analysis + `builtin: collect`** last (`afterany`, on a MIG slice);
  - `needs` / `produces` on every step that consumes or creates data, so stages are connected by explicit contracts;
  - a `smoke` block that keeps every stage but shrinks every size.
- Minimal source edits only: make output paths configurable, and make long loops append-and-skip (resumable). Explain every source edit to the user.
- Services (inference servers and similar): a hook in `hpc/slurm/hooks/<stage>.sh` (see `hooks/README.md` and the example).
- Multi-node stages: `nodes`, `ntasks_per_node`, `gpus_per_node`, a `check_nodes` first step, and `"launcher": "srun"` (see `references/slurm-gpu.md` §5).

### Phase 4: verify before spending GPU-hours
```bash
bash hpc/scripts/selftest.sh                       # syntax, graph validity, GPU policy, every placeholder of every cell, dry runs
python3 hpc/slurm/submit.py --dry-run              # show the graph to the user
python3 hpc/slurm/submit.py --smoke                # with the user's OK: every stage, tiny sizes, real GPU nodes
bash hpc/status.sh <smoke RUN_ID>                  # check it by hand, at most every few minutes, or --watch 120
```
The smoke run must reach `collect` with every cell OK, and `logs/<RUN_ID>/results/summary.md` must show non-empty tables. Fix and repeat until it does. Also check the GPU CSVs: low utilisation or "not fully on GPU" warnings mean the sizing must be adjusted (`slurm-gpu.md` §8).

### Phase 5: full run (only when the user says so)
```bash
python3 hpc/slurm/submit.py                        # prints RUN_ID and the job IDs
bash hpc/status.sh <RUN_ID> [--watch 120 | --only failed | --steps]
python3 hpc/slurm/submit.py --run-id <RUN_ID> --only <stages>   # repair: finished work is skipped
python3 hpc/slurm/submit.py --run-id <RUN_ID> --only collect    # intermediate or final collection
```
When asked about progress, run the audit once and summarise it: states, failures with causes, records done/expected. Do not start monitoring loops. Prefer `--mail-type` notifications.

### Phase 6: document
Write `hpc/docs/hpc-guide.md` from `templates/hpc/docs/hpc-guide.template.md`. Required content:
- the job graph and its rationale;
- the source-to-component map;
- design-to-config tables;
- the **coverage matrix** (every document claim, metric, table and figure → stage/step → raw output → collected file → decision rule);
- the Slurm and GPU techniques used;
- the audit levels;
- the results layout;
- operating commands;
- an honest **limitations** section: what is not covered, synthetic or placeholder data in the document, internet and quota needs.

Before finishing, check every file name and count you cite against the code.

## What to tell the user at the end
- Where things are (`hpc/`, the guide, how to submit, the audit, collected results).
- What was verified (selftest, dry run, smoke run and its result) and what was not.
- Scale: jobs, cells, GPU types per stage, estimated GPU-hours and wall time.
- Any source edits made, and any gaps in coverage.

## Reference files (read when needed)
| File | Read it when |
|---|---|
| `references/paper-to-experiments.md` | Phases 1, 3 and 6: inventory, graph design, coverage matrix |
| `references/experiments-schema.md` | writing or editing `experiments.json` (stages, dependencies, steps, smoke, results) |
| `references/slurm-gpu.md` | GPU requests, reaching GPU nodes (`salloc`, `srun --overlap`), arrays, multi-node, requeue, sizing, diagnosing failures |
| `references/audit-and-results.md` | the audit columns, log layout, collected outputs, reproducibility checklist |
| `references/alliance-cluster.md` | Alliance or Compute Canada specifics (modules, wheelhouse, storage, internet, GPU names), adapting to other sites |
| `templates/hpc/` | the implementation that gets copied (read the docstrings of `submit.py`, `run_stage.py`, `audit.py`, `collect_results.py`) |

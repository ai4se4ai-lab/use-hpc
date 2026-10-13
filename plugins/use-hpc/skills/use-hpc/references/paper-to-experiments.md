# From a paper (or design document) to an experiment graph

The goal is that **every experiment the document describes has a stage and step that produces its data, every reported number can be traced to a file, and every decision rule can be checked from the collected results**. Work through the four passes below and write the results down. They become `hpc/docs/hpc-guide.md`.

## Pass 1: experiment inventory (read the document)

Read the evaluation, experimental-design and results sections closely. Also read the approach section, because every component should be exercised by at least one experiment. Fill this table, citing section, table or figure labels from the document:

| Item | What to extract | Example |
|---|---|---|
| Research questions / hypotheses | id, wording, **decision rule or threshold** | RQ2: "detection > best critic, false alarms < best critic" |
| Subjects | datasets / benchmarks, sizes, splits, what is hidden from the system | 100 + 164 tasks; hidden tests used only for scoring |
| Factors | conditions/baselines/ablations, models, hyper-parameters, seeds | 8 conditions × 7 models × 3 seeds |
| Design size | the product of the factors; per cell and total | 44,352 runs |
| Side studies | mutation analysis, fault injection, human/LLM coding, scaling, ablations | 300 seeded defects, 600 injected faults |
| Auxiliary roles | judges, coders, critics, seeders: models and constraints | seeder from a family not used as critic |
| Metrics | definitions; per run vs aggregated | precision of "done" = success among runs declared done |
| Statistics | tests, corrections, CIs, effect sizes, units of analysis | McNemar + Holm; GEE clustered by task; bootstrap CIs |
| Artefacts | every table and figure, with its label or file name | `tab_success`, `fig_attribution` |
| Fixed parameters | temperatures, caps, budgets, sampling counts | T = 0.2 / 0.6; 4,096 tokens; k = 3 |
| Stated gaps | TODOs, "not tested", threats to validity | critics not named; no ablation of X |

If the document and the source code disagree (sizes, names, parameters), note it and ask the user which one wins. Do not silently pick one.

## Pass 2: map the source code

For each inventory row, find the module that implements it.

- **Entry points**: CLI modules (`python -m pkg.study.x`), scripts, notebooks to convert. Prefer existing entry points. Write thin wrappers only where none exist.
- **Output locations**: make every output path configurable by an environment variable or flag, so jobs write only into `$RESULTS`. Changing hard-coded paths to `os.environ.get("X", default)` is usually the only edit the source needs.
- **Resumability**: check whether each long-running module appends per-record results and skips finished ones (see experiments-schema.md). If not, add it. It is the single most valuable change for HPC.
- **Dependencies**: list Python packages (→ `requirements.txt`), system tools (→ `MODULES`), models and data (→ setup stage), and services such as inference servers (→ a hook).
- **What may be shown to the system under test** vs what is only used for scoring. Verify that this holds in the code, and say so in the guide.

## Pass 3: design the graph

1. **setup** (gate, `afterok` for everything): downloads (the only stage with `"internet": true`), install verification, model pulls with digest recording, data sanity checks (counts, reference solutions pass, checksums), a **pre-flight** (one item through the full pipeline of the main stage), and `check_gpu`. Mark gate steps `critical`.
2. **main matrix**: one cell per heavy, independent unit. Usually that is the model × dataset combination, so the model loads once per job. Conditions and seeds are looped inside the cell when they share the loaded model. Add `progress` with the expected number of records.
3. **side studies that do not need the matrix**: depend on setup only, so they run in parallel with the matrix.
4. **consumers of matrix output**: `aftercorr` when they need only their own cell (with `matrix_from`), `afterany` when they need all cells.
5. **analysis + collect** (`afterany` on everything): the project's statistics script, then `builtin: collect`. It can be resubmitted at any time for an intermediate view.
6. Give each stage a `description` that names the RQ or hypothesis it serves.
7. Add `smoke` values that keep every stage but shrink every size, so a smoke run finishes in under an hour.

Rule of thumb: if two pieces of work need different GPUs, models or time scales, make them different stages. If they share a loaded model, make them steps of the same stage.

## Pass 4: coverage matrix (write it into the guide)

One row per claim, metric, table or figure of the document:

| # | Claim / measurement (doc ref) | Stage → step | Raw output (under `$RESULTS`) | Collected as | Document artefact | Decision rule checked in |
|---|---|---|---|---|---|---|

Then one row per **approach component**, naming the experiments that exercise it. Any component or claim without a row is a gap: add a step, or list it under "not tested" in the guide with the reason (for example "the paper itself marks this as future work").

Also list what the HPC run **cannot** establish: human coding, external baselines that need other hardware or APIs, and synthetic or placeholder data still in the document.

## Deliverables of this phase

- `hpc/config/experiments.json` (graph), `cluster.env` (site), `requirements.txt`, hooks if services are needed.
- `hpc/docs/hpc-guide.md` from `templates/hpc/docs/hpc-guide.template.md`, filled with the inventory, the source map, the graph rationale, the coverage matrix, and limitations.
- A table for the user: number of jobs, cells, GPUs per stage, estimated GPU-hours and wall time.

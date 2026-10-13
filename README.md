# use-hpc: a Claude Code skill for running a paper's experiments on Slurm GPU clusters

Give Claude a project's **source code** and a **document that describes the approach and its experiments** (a LaTeX paper, a PDF, a design doc). The `use-hpc` skill then builds an `hpc/` directory in the project that:

- runs **every experiment of the document** as a graph of Slurm jobs, with **all computation on GPU nodes** and **none on the login node**;
- **distributes the work for throughput**: job arrays (one task per model × dataset cell), cell-wise pipelining (`aftercorr`), and multi-node `srun`/`torchrun` when one task needs more than a node;
- **connects the stages**: Slurm dependencies (`afterok` gates, `afterany` analysis, `aftercorr` per cell), plus explicit `needs`/`produces` data contracts checked before and after every step;
- **smoke-tests** every stage end to end with tiny sizes (`submit.py --smoke`) before the full run;
- shows a **live tabular audit**: stage × cell, state, node, run time against the limit, queue reason, steps, a progress bar of records, the current or failed step, and log excerpts for every failure;
- **collects results** as CSVs, Markdown and LaTeX tables, PNG and PDF figures, the step ledger, completeness, GPU usage and the run manifest, copied from scratch to persistent storage;
- **resumes** after time limits (self-requeue at `USR1`; finished steps and records are skipped);
- documents itself in `hpc/docs/hpc-guide.md`, with a **coverage matrix** from each claim in the document to the job and file that produce it.

Defaults follow the practices of the Digital Research Alliance of Canada (modules, wheelhouse virtualenvs in `$SLURM_TMPDIR`, scratch vs project, MIG slices on Nibi). Any standard Slurm site works after adjusting `cluster.env`.

## Install (one command, any machine)

In Claude Code (terminal):

```bash
claude plugin marketplace add ai4se4ai-lab/use-hpc-claude-skill && claude plugin install use-hpc@ai4se4ai-hpc
```

Or inside a Claude Code session:

```
/plugin marketplace add ai4se4ai-lab/use-hpc-claude-skill
/plugin install use-hpc@ai4se4ai-hpc
```

Without the plugin system (copies the skill to `~/.claude/skills/use-hpc`):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ai4se4ai-lab/use-hpc-claude-skill/main/install.sh)
```

If the repository is private, the `curl` form needs a token. Clone it and run `bash install.sh` instead. Use one method per machine, or the skill is listed twice.

To update: `claude plugin marketplace update ai4se4ai-hpc` (plugin), or rerun `install.sh`.

## Use

Ask Claude, for example:

> Here is my repo and `docs/paper.tex`. Set up HPC to run all the experiments of the paper on the cluster's GPU nodes, smoke-test it, and give me a live audit and the results as CSVs, tables and figures.

The skill guides Claude through six phases: read the paper and code → scaffold `hpc/` → configure the experiment graph → self-test, dry run and smoke run → full run → write the guide.

What gets created in a project:

```
hpc/
├── config/experiments.json    the experiment graph (stages, matrices, dependencies, resources, steps, smoke, results)
├── config/cluster.env         account, modules, storage, GPU policy, requeue settings
├── config/requirements.txt    Python packages (installed from the wheelhouse inside each job)
├── slurm/submit.py            validate, freeze config, write the manifest, sbatch per stage (arrays and dependencies)
├── slurm/stage.sh, common.sh  job body: GPU guard, venv, GPU monitor, multi-node variables, hooks, requeue
├── slurm/hooks/               optional per-stage services (for example an LLM inference server)
├── scripts/run_stage.py       steps with contracts, ledger, logs, resume markers, retries
├── scripts/audit.py           live table (status.sh)
├── scripts/collect_results.py CSVs, tables (md/tex), figures, pipeline records
├── scripts/selftest.sh        login-safe static checks
├── docs/hpc-guide.md          design, coverage matrix, techniques, limitations
└── logs/<RUN_ID>/             everything about one run, including the collected results
```

Typical commands in a project:

```bash
bash hpc/scripts/selftest.sh                 # seconds, nothing submitted
python3 hpc/slurm/submit.py --dry-run        # print the job graph
python3 hpc/slurm/submit.py --smoke          # every stage, tiny sizes, real GPU nodes
python3 hpc/slurm/submit.py                  # full study
bash hpc/status.sh --watch 120               # live audit (refresh at most once a minute)
python3 hpc/slurm/submit.py --run-id <RUN_ID> --only collect   # results at any time
```

## Layout of this repository

```
.claude-plugin/marketplace.json            marketplace "ai4se4ai-hpc"
plugins/use-hpc/.claude-plugin/plugin.json plugin "use-hpc"
plugins/use-hpc/skills/use-hpc/            the skill: SKILL.md, references/, scripts/scaffold.sh, templates/hpc/
install.sh                                 plugin-less installer
```

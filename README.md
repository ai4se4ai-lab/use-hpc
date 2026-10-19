# use-hpc: a portable agent skill for experiments on Slurm GPU clusters

[Website](https://ai4se4ai-lab.github.io/use-hpc-claude-skill/) · [Changelog](CHANGELOG.md) · [Releases](https://github.com/ai4se4ai-lab/use-hpc-claude-skill/releases)

Give your coding agent a project's **source code** and a **document that describes the approach and its experiments** (a LaTeX paper, a PDF, a design doc). The same `use-hpc` skill works with **Codex, Claude Code, OpenCode, Cursor, and GitHub Copilot**. It builds an `hpc/` directory in the project that:

- runs **every experiment of the document** as a graph of Slurm jobs, with **all computation on GPU nodes** and **none on the login node**;
- **distributes the work for throughput**: job arrays (one task per model × dataset cell), cell-wise pipelining (`aftercorr`), and multi-node `srun`/`torchrun` when one task needs more than a node;
- **connects the stages**: Slurm dependencies (`afterok` gates, `afterany` analysis, `aftercorr` per cell), plus explicit `needs`/`produces` data contracts checked before and after every step;
- **smoke-tests** every stage end to end with tiny sizes (`submit.py --smoke`) before the full run;
- shows a **live tabular audit**: stage × cell, state, node, run time against the limit, queue reason, steps, a progress bar of records, the current or failed step, and log excerpts for every failure;
- **collects results** as CSVs, Markdown and LaTeX tables, PNG and PDF figures, the step ledger, completeness, GPU usage and the run manifest, copied from scratch to persistent storage;
- **resumes** after time limits (self-requeue at `USR1`; finished steps and records are skipped);
- documents itself in `hpc/docs/hpc-guide.md`, with a **coverage matrix** from each claim in the document to the job and file that produce it.

Defaults follow the practices of the Digital Research Alliance of Canada (modules, wheelhouse virtualenvs in `$SLURM_TMPDIR`, scratch vs project, MIG slices on Nibi). Any standard Slurm site works after adjusting `cluster.env`.

## Install for your agent

Use the [skills CLI](https://github.com/vercel-labs/skills) with Node.js and Git installed. All commands install the same skill, including its references, scripts, and templates:

```bash
# Codex
npx -y skills add ai4se4ai-lab/use-hpc-claude-skill --skill use-hpc --agent codex --global --copy --yes

# Claude Code
npx -y skills add ai4se4ai-lab/use-hpc-claude-skill --skill use-hpc --agent claude-code --global --copy --yes

# OpenCode
npx -y skills add ai4se4ai-lab/use-hpc-claude-skill --skill use-hpc --agent opencode --global --copy --yes

# Cursor
npx -y skills add ai4se4ai-lab/use-hpc-claude-skill --skill use-hpc --agent cursor --global --copy --yes

# GitHub Copilot
npx -y skills add ai4se4ai-lab/use-hpc-claude-skill --skill use-hpc --agent github-copilot --global --copy --yes
```

Omit `--global` to install in the current project. For interactive selection, omit `--agent ...` and `--yes`. Start a new agent session after installation. Use a current agent version with Agent Skills support, file access, and a terminal-enabled mode.

For a private repository, configure Git credentials or use an authenticated clone. From that clone, install the local skill without fetching this repo again:

```bash
npx -y skills add ./plugins/use-hpc/skills/use-hpc --skill use-hpc --agent codex --global --copy --yes
```

The Bash convenience installer uses the same CLI: `bash install.sh --agent codex` (defaults to Codex, global). Add `--project` for a project install. It now requires Node.js/npx; the old no-argument installer targeted Claude. To keep that target, run `bash install.sh --agent claude-code`. `USE_HPC_REPO` overrides the remote source when the script runs outside a clone.

To update a CLI install, rerun its command or use `npx skills update use-hpc`. There is no Claude SDK, Claude account, or model-provider API dependency in the generated pipeline. Your chosen agent may have its own account requirements.

### Existing Claude Code plugin option

In Claude Code (terminal):

```bash
claude plugin marketplace add ai4se4ai-lab/use-hpc-claude-skill && claude plugin install use-hpc@ai4se4ai-hpc
```

Or inside a Claude Code session:

```
/plugin marketplace add ai4se4ai-lab/use-hpc-claude-skill
/plugin install use-hpc@ai4se4ai-hpc
```

Use either the Claude plugin or the portable skill install for Claude Code to avoid duplicate skill listings. To update the plugin: `claude plugin marketplace update ai4se4ai-hpc`.

### Runtime prerequisites

The generated pipeline runs on Linux with Bash, Python 3, Slurm commands, GPU allocations, and your cluster's modules and Python packages. Configure the account, paths, resources and real experiment commands before submitting. On Windows, use a Linux environment or connect your agent to the remote cluster. Installation does not submit jobs; smoke and full runs require your approval.

## Use

Ask your agent, for example:

> Here is my repo and `docs/paper.tex`. Set up HPC to run all the experiments of the paper on the cluster's GPU nodes, smoke-test it, and give me a live audit and the results as CSVs, tables and figures.

The skill guides your agent through six phases: read the paper and code → scaffold `hpc/` → configure the experiment graph → self-test, dry run and smoke run → full run → write the guide.

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
install.sh                               portable skills CLI wrapper
website/                                 static landing page with five-agent quick start
```

## Website

The [website](website/README.md) adapts Archify's visual style to use-hpc: responsive layout, light/dark themes, an interactive pipeline overview, and agent-specific installation commands. No framework or dependency installation is needed:

```bash
cd website
npm run dev      # http://localhost:4321
npm test
npm run build    # static files in website/dist/
```

The website is built and deployed to GitHub Pages automatically when a release is published or its notes change. The workflow synchronizes `CHANGELOG.md` and the website's release history from GitHub Releases; empty release notes are generated by GitHub. PRs and pushes to `main` run tests and a production build. See the [deployment setup](website/README.md#deploy) for the one-time Pages settings and optional automatic repository About link. The website link above becomes live after the first successful deployment. Archify attribution and its MIT notice are retained in `website/THIRD_PARTY_NOTICES.txt`.

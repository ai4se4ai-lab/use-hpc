# Site notes: Digital Research Alliance of Canada clusters (Nibi, Fir, Rorqual, Narval, Trillium...)

The template defaults follow Alliance practice. Before improvising, read the site documentation. On Alliance systems a read-only copy of the wiki is at `/cvmfs/soft.computecanada.ca/custom/docs/en/`. Useful pages there: `Running jobs.md`, `Job arrays.md`, `Monitoring jobs.md`, `Using GPUs with Slurm.md`, `Multi-Instance GPU.md`, `<Cluster>.md` (for example `Nibi.md`), `Python.md`, `Available Python wheels.md`, `Storage and file management.md`. When in doubt, tell the user to contact technical support.

## Accounts and access

- Slurm account: `def-<pi>` (default) or `rrg-<pi>` / `rpp-<pi>` (allocations). List them with `sshare -U -u $USER`.
- Logging in uses SSH keys and multifactor authentication. For automation, see "Automation in the context of multifactor authentication".
- GPU nodes are reached only through the scheduler (`salloc`, `sbatch`, or `srun --jobid ... --overlap --pty` into a running job). See `slurm-gpu.md` §3.

## Software

- Modules: `module load StdEnv/2023 python/3.11` (plus `cuda/...`, `arrow/...`, `scipy-stack/...` as needed). Use `module spider <name>` to find versions. Record them in `MODULES`.
- Python: a virtualenv in `$SLURM_TMPDIR` per job, with `virtualenv --no-download` and `pip install --no-index -r requirements.txt` from the Alliance **wheelhouse**. Do not use conda, `uv`, or PyPI by default. For a package missing from the wheelhouse, download its wheel once in the setup stage into `EXTRA_WHEELS` (`pip download --no-deps --only-binary=:all:`), and suggest a support ticket so it gets added.
- Containers: Apptainer, when a project needs a fixed system stack.

## Storage

| Space | Use | Notes |
|---|---|---|
| `$HOME` | code, config, small files | small quota, backed up |
| `/project/<group>` | results to keep and share; the repository | backed up, group quota |
| `$SCRATCH` | active work: `$WORK/runs/<RUN_ID>/results`, caches, models | large, fast, **not backed up, purged** (Nibi: 1 TB soft limit after 60 days) |
| `$SLURM_TMPDIR` | per-job node-local disk: venvs, temporary I/O-heavy files | gone at job end |

Check `diskusage_report` before large writes. Avoid many small files on shared filesystems: pack them (tar, HDF5), which `results.archive` does for you. Use Globus for large transfers.

## Internet

Many compute nodes have no internet. Keep every download in the setup stage, and make it probe connectivity first (GitHub, Hugging Face, PyPI, model registries) so it fails with a clear message. All later stages must work offline (`HF_HUB_OFFLINE=1`, `HF_DATASETS_OFFLINE=1`). If the GPU nodes have no internet, stage the files into `$WORK` from a node that does (login or a data-transfer node) and tell the user.

## Nibi GPU names (from `Nibi.md`)

- Full H100 80 GB: `--gpus=h100:1`; several per node with `--gpus-per-node=h100:2..4`.
- MIG slices: `--gpus=h100_1g.10gb:1` (1/8), `h100_2g.20gb:1` (2/8), `h100_3g.40gb:1` (3/8). About half the GPU nodes are MIG-configured. Respect the recommended cores and memory per GPU instance.
- Other clusters use other names (`a100`, `l40s`, `mi300a`, ...). Read the cluster page and update `resources.gpus`.

## Etiquette (also enforced or encouraged by the template)

- Run only light work on login nodes, and point out stale processes (for example leftover editor servers).
- Use no tight polling (≥ 60 s between Slurm queries), no `sleep` in jobs, and only one monitor at a time.
- Request only what is used. Bundle work that would run for less than 15 minutes. Checkpoint jobs longer than 12 h.
- Keep test jobs small (smoke runs, `--only`, a single cell).

## Other schedulers and sites

The template uses only standard Slurm: `sbatch`, arrays, dependencies, `--signal`, `scontrol requeue`, `squeue`, `sacct`. On other Slurm sites, change `MODULES`, the venv recipe in `common.sh::setup_python` (conda or modules may be the local norm), the GPU type names, and `partition` / `constraint` if the site requires them. PBS or LSF would need a different submitter and audit backend; the graph, runner and collector carry over.

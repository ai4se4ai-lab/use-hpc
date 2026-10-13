# Slurm on GPU clusters: requesting, reaching and using GPU nodes

Contents: 1 login vs compute nodes · 2 requesting GPUs · 3 reaching GPU nodes interactively · 4 distributing work ·
5 multi-node jobs and inter-node connectivity · 6 dependencies and data hand-off · 7 long jobs (requeue,
checkpoints) · 8 sizing · 9 monitoring etiquette · 10 diagnosing failures

## 1. Login nodes vs compute nodes

The login node is shared by hundreds of users and limited with cgroups. Use it only to edit, use git, run `sbatch`, read logs, and run the audit. Everything else runs on compute nodes through the scheduler: installs, downloads of large data, model pulls, builds, tests that load models, training, inference, and analysis. The template enforces this:

- `run_stage.py` exits with code 10 unless `SLURM_JOB_ID` is set (`--local` exists only for tiny tests of the runner itself).
- `stage.sh` exits with code 5 if `CUDA_VISIBLE_DEVICES` is empty or `nvidia-smi -L` fails. A GPU stage never silently computes on CPU.
- `submit.py` refuses stages without a GPU request while `require_gpu` is on.

## 2. Requesting GPUs

| Need | Flags | Notes |
|---|---|---|
| One full GPU | `--gpus=h100:1` | Type names are site-specific: check `sinfo -o "%G"` or the site docs. |
| A GPU slice (MIG) | `--gpus=h100_1g.10gb:1` (1/8), `h100_2g.20gb`, `h100_3g.40gb` | Light stages (collection, small models, analysis) on a GPU node without holding a full GPU. |
| N GPUs on one node | `--gpus-per-node=h100:4` | Tensor or model parallel, several large models resident at once. |
| N GPUs anywhere | `--gpus=h100:N` | Data parallel across nodes. |
| Several nodes | `--nodes=2 --ntasks-per-node=4 --gpus-per-node=h100:4` | One task per GPU is the usual layout for `torchrun` / NCCL. |
| CPU and memory | `--cpus-per-task`, `--mem` | Stay within the site's per-GPU ratio (Alliance: see "Allocations and compute scheduling", ratios in bundles). Asking for more delays the job and wastes the allocation. |

Request what the job uses. Over-asking delays the job and is charged against fairshare.

## 3. Reaching GPU nodes interactively

```bash
# interactive shell on a GPU node (debugging, small experiments; keep it short)
salloc --account=$ACCOUNT --gpus=h100:1 --cpus-per-task=8 --mem=32G --time=1:00:00
#   -> you are now on the compute node; nvidia-smi works; run `exit` to release it

# a slice is cheaper and starts sooner for quick checks
salloc --account=$ACCOUNT --gpus=h100_1g.10gb:1 --cpus-per-task=2 --mem=8G --time=0:30:00

# attach to the node of a RUNNING batch job (shares its resources; keep it light)
srun --jobid <JOBID> --overlap --pty bash
srun --jobid <JOBID> --overlap --pty watch -n 30 nvidia-smi
#   for an array task use <ARRAYJOBID>_<TASK>

# many sites also allow ssh to a node where you currently have a job
squeue -u $USER -o "%i %N"   # find the node, then: ssh <node>
```

Inside an interactive allocation you can run a single step by hand:

```bash
source hpc/slurm/common.sh            # with HPC_DIR, RUN_ID and STAGE exported
setup_python && require_gpu && run_hooks
python hpc/scripts/run_stage.py --stage main --cell 0
```

## 4. Distributing work for throughput

Most experiment grids are embarrassingly parallel. The fastest layout is many independent GPU jobs, not one huge job.

- **Job arrays** (`--array=0-N%K`): one task per matrix cell. One `sbatch` call puts the whole grid in the queue, which keeps the scheduler load low. `%K` caps concurrency when a shared resource (licences, an API, I/O) would saturate.
- **One cell = one resident model / dataset shard.** Load weights once per job, not once per item.
- **Saturate the GPU inside the job.** Run several requests or batches concurrently (server slots, DataLoader workers, batch size). Check the GPU CSV in `logs/<RUN_ID>/gpu/`: utilisation below about 60% means the job is input-bound or under-parallelised.
- **Long, bundled jobs.** Group work so that each job runs for at least 15–30 minutes. Thousands of tiny jobs overload the scheduler and lose time to queueing and start-up.
- **Pipelining.** `aftercorr` lets post-processing of cell *i* start the moment cell *i* finishes, instead of waiting for the slowest cell.
- **Fairshare.** Wall-clock time is set by how many array tasks run at once, which fairshare decides. Splitting into more cells increases potential parallelism.

## 5. Multi-node jobs and connectivity between nodes

Use multi-node only when one task needs more GPUs than a node has (distributed training, very large models). For grids, arrays are simpler and more robust.

`common.sh::setup_distributed` exports `MASTER_ADDR` (first node), `MASTER_PORT` (derived from the job ID), `WORLD_SIZE` and `NNODES`. A step with `"launcher": "srun"` runs once per task:

```json
{"name": "train", "launcher": "srun",
 "cmd": "torchrun --nnodes={NNODES} --nproc-per-node=4 --rdzv-backend=c10d --rdzv-endpoint=$MASTER_ADDR:$MASTER_PORT -m mypkg.train --out {RESULTS}/train"}
```

With `--ntasks-per-node=1` and torchrun starting 4 processes per node, or with `--ntasks-per-node=4` and plain `python` using `SLURM_PROCID` as the rank.

**Verify connectivity first.** Add `{"name": "nodes", "builtin": "check_nodes", "always": true}` as the first step of a multi-node stage. It runs one probe per node and fails the stage unless every node:

- has a GPU,
- sees the shared results directory (a file written by the first node), and
- resolves the master node.

For collective communication, also run a tiny `torch.distributed` all-reduce before the real work. Set `NCCL_DEBUG=INFO` in `env` while debugging.

**Data flow between stages** never needs the nodes to talk to each other directly. Stages exchange data through the shared parallel filesystem (`$RESULTS` on scratch is mounted on every node), and Slurm dependencies guarantee the order (§6).

## 6. Dependencies and data hand-off

- `submit.py` passes the job IDs of upstream stages as `--dependency=<type>:<id>`, plus `--kill-on-invalid-dep=yes`, so a failed gate cancels its dependents instead of leaving them pending forever.
- The **contract** is explicit: an upstream step lists `produces`, and a downstream step lists the same paths in `needs`. A missing input fails fast with "missing input" in the audit.
- Resubmitting a stage (`--run-id R --only S`) drops dependencies on stages that are not resubmitted. Their outputs must already exist, and the `needs` check enforces that.
- Do not poll for files inside jobs. Let Slurm order the work.

## 7. Long jobs: requeue and checkpoints

- Stages with `"requeue": true` get `--requeue --signal=B:USR1@900`. Slurm signals the batch shell 15 minutes before the limit. `common.sh` stops the work cleanly and calls `scontrol requeue` on the job (or `<array>_<task>`), keeping the same job ID so dependencies still hold. After `MAX_REQUEUES` restarts it gives up with exit code 99.
- On restart, finished steps are skipped (`.done`) and finished records are skipped by the command (append-and-skip). Training resumes from its last checkpoint.
- `SLURM_RESTART_COUNT` is not always updated after `scontrol requeue`, so `common.sh` reads `Restarts=` from `scontrol show job`.
- Prefer time limits that the site schedules well. Shorter jobs (≤ 24 h, or ≤ 3 h for backfill) start sooner. Requeue chains them.

## 8. Sizing (do this before the big submission)

1. Run one cell in an interactive allocation, or in a smoke run. Note GPU memory, utilisation and seconds per item.
2. Choose concurrency inside the job (batch size, server slots, workers) so that the model plus caches stay **100% on the GPU**. Spilling to CPU memory slows a job by 10–100×.
3. Estimate the wall time of a cell as `items × seconds_per_item / concurrency`. Set `time` with a margin, or rely on requeue.
4. When several models share one GPU stage, test that they all fit at once. A dedicated sizing job that loads each stage's model set and reports residency is worth its hour.
5. Record the chosen values in config (for example a `models.tsv`), never only in a job script.

## 9. Monitoring etiquette

- Use one audit at a time. Wait at least 60 s between refreshes. The audit makes one `squeue` and one `sacct` call per snapshot.
- Never write `while true; do squeue; done` loops, and never put `sleep` in jobs to wait for something. Use dependencies, and `curl --retry` for service readiness.
- Use `--mail-type=FAIL` (or `END,FAIL` for gate and final stages) to be notified instead of watching.

## 10. Diagnosing failures

| Symptom in the audit | Look at | Typical fix |
|---|---|---|
| `PENDING`, WAIT `Priority` / `Resources` | `sshare -U`, `squeue --start -j <id>` | Normal under load. Smaller requests, MIG slices or shorter times start sooner. |
| `PENDING`, WAIT `DependencyNeverSatisfied` | upstream state | A gate failed. Fix it and resubmit the stage with `--only`. |
| `FAILED` rc 5 | Slurm `.err` | No GPU visible: missing `gpus` request or wrong type name. |
| `FAILED` rc 4 | Slurm `.out` | `pip install` failed: a package is missing from the wheelhouse (`PIP_FIND_LINKS`, or ask support). |
| step rc 6 "missing input" | `needs` vs upstream `produces` | The upstream stage failed or wrote elsewhere. |
| step rc 7 "declared output missing" | step log | The command exited 0 but did not write its output. |
| `OUT_OF_MEMORY` | `sacct -j <id> --format=MaxRSS,ReqMem`, `seff <id>` | Increase `mem`, or reduce workers. |
| `TIMEOUT` without requeue | stage resources | Add `"requeue": true`, or split the cell. |
| low GPU utilisation | `logs/<RUN_ID>/gpu/*.csv` | More concurrency, larger batches, data on `$SLURM_TMPDIR`. |

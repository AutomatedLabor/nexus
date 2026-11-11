# 00 — Environment Cartography Index

This directory (`docs/environment/`) is the **Phase 0** output of the ATLAS project: a complete cartography of the sandboxed runtime in which the agent operates. Every number, file size, and command output below was captured live in this session by executing shell commands in the workspace and writing the actual stdout to disk — no values are fabricated or estimated.

The sandbox is a **kata-container** running **Debian 13 (trixie)** with kernel `5.10.134-013.15.kangaroo.al8.x86_64` (an Alibaba Cloud production kernel) on a single Intel Xeon socket with **2 vCPUs / 2 threads**, **4.1 GiB RAM and zero swap**. The cgroup `memory` controller is mounted read-only (the host enforces an external memory limit), PID 1 is `tini` running `/start.sh`, `/.dockerenv` is present, and the root filesystem is an overlay on a `kataShared` volume. The writable scratch space includes `/tmp`, `/var/tmp`, `/home/z`, and `/home/z/my-project`; `/home`, `/opt`, and `/srv` are read-only.

The runtime stack is **Python 3.12.16** (in a venv at `/home/z/.venv`), **Node 24.22.2**, **Bun 1.3.14**, **Java 21** (JRE only, no `javac`), and **gcc/g++ 14.2**; the rich CLI toolset includes `git 2.47`, `curl 8.14`, `jq 1.7`, `ripgrep 14.1`, `ffmpeg 7.1`, `pandoc 3.1`, `graphviz 2.42`, `caddy 2.8`, `vim 9.1`, and the `vercel` CLI. Outbound HTTPS is open and fast: the public egress IP is `8.212.10.159`, all five probed endpoints return 2xx/3xx in <300 ms, and **50 concurrent HTTPS requests to example.com all returned 200**. Phase 2 benchmarks show the box is **I/O-bound for filesystem work** (~3.4 M CSV rows/s, ~40 small files/sec per Python process) and **CPython-interpreter-bound for compute** (`fib(30)` = 123 ms, 100×100 matmul = 64 ms) — a profile well suited for build/test/agent work but not for heavy numerical or massively-parallel workloads.

---

## Document Index

| # | File | Topic | Headline finding |
|---|------|-------|------------------|
| 00 | `00-index.md` | this file | 7 substantive env docs + this index |
| 01 | `01-os-hardware.md` | OS, kernel, CPU, memory, cgroups, ulimit | Debian 13 trixie, kernel 5.10.134, 2 vCPU Intel Xeon, 4.1 GiB RAM, no swap, kata-container under KVM |
| 02 | `02-filesystem.md` | root tree, writable dirs, IO speed, symlinks, case | 1000 files in 0.28 s; 100 MB write at 2.7 GB/s; symlinks OK; case-sensitive; `/home`/`/opt`/`/srv` read-only |
| 03 | `03-software.md` | installed CLI/runtimes | Node/Bun/Python/Java/gcc/curl/jq/rg/ffmpeg/pandoc/graphviz/caddy present; no rust/go/ruby/php/clang/cmake/DB clients |
| 04 | `04-runtime-capabilities.md` | Node/Python/Bun hello+file+HTTP | All three runtimes succeed; HTTP 200 from example.com in 31–39 ms |
| 05 | `05-network.md` | egress IP, HTTP probes, DNS, 50 parallel | Public IP 8.212.10.159; eth0 21.0.2.167/32; DNS 100.100.2.136/.138; 50/50 parallel 200s |
| 06 | `06-tool-capabilities.md` | the agent's own built-in tools | Bash/Read/Write/Edit/MultiEdit/Glob/Grep/LS/Skill/TodoWrite — quirks and limits observed in-session |
| 07 | `07-benchmarks.md` | Phase 2 compute stress tests | 10 benchmarks totalling ~1.52 s; fastest = sha256_10k (5.5 ms); slowest = read_sort_1m (298.6 ms) |

## Companion Data

| File | Description |
|------|-------------|
| `seed-data/benchmarks.json` | Machine-readable JSON array of all 10 Phase 2 benchmark results (validated) |

---

## Phase 0 Map

```
docs/environment/
├── 00-index.md                  ← you are here
├── 01-os-hardware.md
├── 02-filesystem.md
├── 03-software.md
├── 04-runtime-capabilities.md
├── 05-network.md
├── 06-tool-capabilities.md
└── 07-benchmarks.md

seed-data/
└── benchmarks.json
```

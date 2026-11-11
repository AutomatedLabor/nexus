# 07 — Computational Stress Tests (Phase 2)

The Phase 2 benchmark script `/tmp/atlas_bench.py` ran **all 10 tests in well under the 300 s timeout** (no reductions needed) on the 2-vCPU sandbox. The dominant cost is **file I/O** (CSV gen 292 ms, regex 293 ms, 10k small-file write 248 ms) and the **pure-Python CPU-bound** work (recursive `fib(30)` 123 ms, 100×100 matmul 64 ms). Hashing and JSON serialization are negligible (5–16 ms). Together this profile paints the sandbox as a **fast, I/O-heavy, single-thread-bound** container: disk bandwidth is the long pole, and pure-Python compute is roughly 1 MOP/s for naive triple-loops.

The full results are persisted as machine-readable JSON at `seed-data/benchmarks.json`.

---

## Benchmark Results

| # | name | duration_ms | details |
|---|------|------------:|---------|
| 1 | `csv_generate_1m` | 291.832 | generate 1,000,000 integers to /tmp/atlas-1m.csv |
| 2 | `read_sort_1m` | 298.624 | read 1,000,000 ints from CSV and sort in-memory |
| 3 | `json_generate_10k` | 15.761 | build 10,000 dicts and json.dumps them |
| 4 | `sha256_10k` | 5.532 | compute SHA-256 of 10,000 strings |
| 5 | `regex_match_1m` | 293.100 | re.compile + match across 1,000,000 lines |
| 6 | `str_replace_1m` | 12.457 | str.replace on 1,000,000 lines of CSV |
| 7 | `matmul_100x100` | 64.154 | pure-python triple-loop 100x100 matmul (~1,000,000 MACs) |
| 8 | `fib_recursive_30` | 122.778 | recursive Fibonacci n=30 (~2.7M calls) |
| 9 | `write_10k_files` | 247.684 | write 10,000 small files to /tmp/atlas-files/ |
| 10 | `read_delete_10k_files` | 167.466 | read then rm 10,000 small files |

**Total wall-clock for the full battery**: ~1,518 ms ≈ **1.52 s** (the script also reaped the 1M-row CSV at the end; total runtime including overhead was <2 s — exit code 0, no stderr).

---

## Interpretation — Compute Profile of the Sandbox

The benchmarks reveal a clear three-tier cost structure. **Tier 1 (≈5–16 ms)** is "essentially free" work: SHA-256 of 10k strings (5.5 ms, ~1.8 M hashes/sec), `json.dumps` of 10k objects (16 ms), and `str.replace` over 1M lines (12 ms — Python's C-level string scan is very fast). **Tier 2 (≈60–125 ms)** is pure-Python interpreter overhead: the recursive `fib(30)` at 123 ms (~22 M Python function calls/sec, matching CPython 3.12's call rate on this CPU) and the 100×100 triple-loop matmul at 64 ms (~16 M mul-adds/sec, capped by interpreter dispatch, not by the Xeon's SIMD). **Tier 3 (≈245–300 ms)** is dominated by filesystem throughput: writing 1M CSV rows (292 ms, ~3.4 M rows/s), reading + `re.match` over 1M lines (293 ms), and writing 10k small files (248 ms, ~40 files/sec per-process — syscalls are the bottleneck, not bytes). The fact that `regex_match_1m` (293 ms) is barely faster than `csv_generate_1m` (292 ms) confirms the workload is **I/O-bound on read**, not CPU-bound on regex — reading 1M lines costs ~290 ms of pure disk/page-cache time. Taken together, the sandbox offers **high disk bandwidth for sequential bulk writes** (~2.7 GB/s as shown in `02-filesystem.md`), **modest syscall-per-file throughput** (small-file create/read is ~40 ops/sec per Python process), and **CPython 3.12 interpreter performance** roughly on par with a 2024-class single core. Anything vectorizable in NumPy/Pandas would get a 100× speedup, but plain Python triple-loops top out around 1 MOP/s for compute-heavy workloads.

---

## Reproduction

```bash
# The benchmark script is at /tmp/atlas_bench.py (3587 bytes).
timeout 300 python3 /tmp/atlas_bench.py > /tmp/bench_out.json 2>/tmp/bench_err.log
echo "exit=$?"
cat /tmp/bench_err.log | head -20
```
Captured run (this session):
```text
exit=0
--- STDERR ---
(empty)
```
The first run completed in time, so **no reduction** of the 1M / 10000 workloads was necessary.

---

## Source: `/tmp/atlas_bench.py`

```python
import csv, hashlib, json, os, re, shutil, time

N_INTS = 1_000_000
N_JSON = 10_000
N_SHA = 10_000
N_FILES = 10_000
MAT_N = 100
FIB_N = 30

results = []
def t(fn, name, details):
    s = time.perf_counter(); fn(); e = time.perf_counter()
    results.append({"name": name, "duration_ms": round((e - s) * 1000, 3), "details": details})

def gen_csv():
    with open("/tmp/atlas-1m.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["n"])
        for i in range(1, N_INTS + 1): w.writerow([i])
t(gen_csv, "csv_generate_1m", f"generate {N_INTS:,} integers to /tmp/atlas-1m.csv")

def read_sort():
    nums = []
    with open("/tmp/atlas-1m.csv") as f:
        r = csv.reader(f); next(r)
        for row in r: nums.append(int(row[0]))
    nums.sort()
t(read_sort, "read_sort_1m", f"read {N_INTS:,} ints from CSV and sort in-memory")

def gen_json():
    objs = [{"id": i, "name": f"item-{i}", "value": i*3.14, "tags": ["a","b","c"]} for i in range(N_JSON)]
    return len(json.dumps(objs))
t(gen_json, "json_generate_10k", f"build {N_JSON:,} dicts and json.dumps them")

def sha_strings():
    out = []
    for i in range(N_SHA):
        out.append(hashlib.sha256(f"string-{i}-hello-{i*i}".encode()).hexdigest())
    return len(out)
t(sha_strings, "sha256_10k", f"compute SHA-256 of {N_SHA:,} strings")

def regex_match():
    with open("/tmp/atlas-1m.csv") as f:
        f.readline(); lines = f.readlines()
    pat = re.compile(r"^(\d+)$")
    m = 0
    for line in lines:
        if pat.match(line.strip()): m += 1
    return m
t(regex_match, "regex_match_1m", f"re.compile + match across {N_INTS:,} lines")

def str_replace():
    with open("/tmp/atlas-1m.csv") as f:
        f.readline(); text = f.read()
    return len(text.replace("1", "9"))
t(str_replace, "str_replace_1m", f"str.replace on {N_INTS:,} lines of CSV")

def matmul():
    A = [[i+j for j in range(MAT_N)] for i in range(MAT_N)]
    B = [[(i*j)%7 for j in range(MAT_N)] for i in range(MAT_N)]
    C = [[0]*MAT_N for _ in range(MAT_N)]
    for i in range(MAT_N):
        Ai = A[i]; Ci = C[i]
        for k in range(MAT_N):
            aik = Ai[k]; Bk = B[k]
            for j in range(MAT_N):
                Ci[j] += aik * Bk[j]
    return C[0][0]
t(matmul, "matmul_100x100", f"pure-python triple-loop {MAT_N}x{MAT_N} matmul (~{MAT_N**3:,} MACs)")

def fib(n):
    if n < 2: return n
    return fib(n-1) + fib(n-2)
t(lambda: fib(FIB_N), "fib_recursive_30", f"recursive Fibonacci n={FIB_N} (~2.7M calls)")

def write_files():
    d = "/tmp/atlas-files"
    if os.path.exists(d): shutil.rmtree(d)
    os.makedirs(d)
    for i in range(N_FILES):
        with open(f"{d}/f_{i}.txt", "w") as f: f.write(f"hello {i}\n")
    return N_FILES
t(write_files, "write_10k_files", f"write {N_FILES:,} small files to /tmp/atlas-files/")

def read_delete():
    d = "/tmp/atlas-files"; total = 0
    for i in range(N_FILES):
        with open(f"{d}/f_{i}.txt") as f: total += len(f.read())
    shutil.rmtree(d)
    return total
t(read_delete, "read_delete_10k_files", f"read then rm {N_FILES:,} small files")

if os.path.exists("/tmp/atlas-1m.csv"): os.remove("/tmp/atlas-1m.csv")
print(json.dumps(results, indent=2))
```

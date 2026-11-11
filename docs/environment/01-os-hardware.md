# 01 — OS & Hardware

The sandbox runs **Debian 13 (trixie)** with kernel `5.10.134-013.15.kangaroo.al8.x86_64` on an Intel Xeon (2 vCPU, 1 socket × 2 cores × 1 thread). Total memory is ~4.1 GiB with **no swap**, cgroup memory limits apply, and the host is fully virtualized under KVM via a kata-container runtime (PID 1 is `tini`, `/.dockerenv` exists, rootfs is an overlay on a kataShared volume).

---

## `uname -a`
```text
Linux c-6af44108-140d72b5-6bf513003f7a 5.10.134-013.15.kangaroo.al8.x86_64 #1 SMP Thu Jul 30 12:54:59 UTC 2026 x86_64 GNU/Linux
```

## `/etc/os-release | head -10`
```text
PRETTY_NAME="Debian GNU/Linux 13 (trixie)"
NAME="Debian GNU/Linux"
VERSION_ID="13"
VERSION="13 (trixie)"
VERSION_CODENAME=trixie
DEBIAN_VERSION_FULL=13.4
ID=debian
HOME_URL="https://www.debian.org/"
SUPPORT_URL="https://www.debian.org/support"
BUG_REPORT_URL="https://bugs.debian.org/"
```

## `lscpu | head -25`
```text
Architecture:                       x86_64
CPU op-mode(s):                     32-bit, 64-bit
Address sizes:                      52 bits physical, 57 bits virtual
Byte Order:                         Little Endian
CPU(s):                             2
On-line CPU(s) list:                0,1
Vendor ID:                          GenuineIntel
Model name:                         Intel(R) Xeon(R) Processor
CPU family:                         6
Model:                              173
Thread(s) per core:                 1
Core(s) per socket:                 2
Socket(s):                          1
Stepping:                           1
BogoMIPS:                           6400.00
Flags:                              fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ss ht syscall nx pdpe1gb rdtscp lm constant_tsc rep_good nopl xtopology nonstop_tsc cpuid tsc_known_freq pni pclmulqdq ssse3 fma cx16 pdcm pcid sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand hypervisor lahf_lm abm 3dnowprefetch cpuid_fault invpcid_single ssbd ibrs ibpb stibp ibrs_enhanced fsgsbase tsc_adjust bmi1 avx2 smep bmi2 erms invpcid avx512f avx512dq rdseed adx smap avx512ifma clflushopt clwb avx512cd sha_ni avx512bw avx512vl xsaveopt xsavec xgetbv1 xsaves avx_vnni avx512_bf16 wbnoinvd avx512vbmi umip waitpkg avx512_vbmi2 gfni vaes vpclmulqdq avx512_vnni avx512_bitalg avx512_vpopcntdq la57 rdpid cldemote movdiri movdir64b fsrm md_clear serialize tsxldtrk amx_bf16 avx512_fp16 amx_tile amx_int8 arch_capabilities
Hypervisor vendor:                  KVM
Virtualization type:                full
L1d cache:                          48 KiB (1 instance)
L1i cache:                          64 KiB (1 instance)
L2 cache:                           2 MiB (1 instance)
L3 cache:                           504 MiB (1 instance)
NUMA node(s):                       1
NUMA node0 CPU(s):                  0,1
Vulnerability Itlb multihit:        Not affected
```

## `free -h`
```text
               total        used        free      shared  buff/cache   available
Mem:           4.1Gi       1.1Gi       483Mi        48Ki       2.7Gi       3.0Gi
Swap:             0B          0B          0B
```

## `/proc/meminfo | head -10`
```text
MemTotal:        4259396 kB
MemFree:          495160 kB
MemAvailable:    3126212 kB
Buffers:           85608 kB
Cached:          2434976 kB
SwapCached:            0 kB
Active:           435028 kB
Inactive:        2966980 kB
Active(anon):        144 kB
Inactive(anon):   881320 kB
```

## `df -h | head -12`
```text
Filesystem                                       Size  Used Avail Use% Mounted on
c-6af44108-140d72b5-6bf513003f7a-rootfs          9.9G  3.4G  6.0G  36% /
tmpfs                                             64M     0   64M   0% /dev
tmpfs                                            2.0G     0  2.0G   0% /sys/fs/cgroup
shm                                               64M     0   64M   0% /dev/shm
kataShared                                       756G  663M  755G   1% /.dockerenv
tmpfs                                            2.1G   40K  2.1G   1% /etc/hosts
ossfs                                             16E     0   16E   0% /home/official_skills
PolarFS:pcs-ue6ju0nuiu0hz7tjc-0e3odv6t4dackr8s3   64P   36P   29P  56% /tmp/my-project
PolarFS:pcs-ue6ju0nuiu0hz7tjc-0e3odv6t4dackr8s3   64P   36P   29P  56% /home/user_skills
ossfs                                             16E     0   16E   0% /home/sync
ossfs                                             16E     0   16E   0% /home/z/my-project/upload
```

## `mount | head -15`
```text
c-6af44108-140d72b5-6bf513003f7a-rootfs on / type overlay (rw,relatime,lowerdir=/run/kata-containers/shared/containers/passthrough/c-6af44108-140d72b5-6bf513003f7a/rootfs_lower,upperdir=/run/builtin_wlayer/c-6af44108-140d72b5-6bf513003f7a/upper,workdir=/run/builtin_wlayer/c-6af44108-140d72b5-6bf513003f7a/work,index=off,volatile,userxattr)
proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)
tmpfs on /dev type tmpfs (rw,nosuid,size=65536k,nr_inodes=517320,mode=755)
devpts on /dev/pts type devpts (rw,nosuid,noexec,relatime,gid=5,mode=620,ptmxmode=666)
mqueue on /dev/mqueue type mqueue (rw,nosuid,nodev,noexec,relatime)
sysfs on /sys type sysfs (ro,nosuid,nodev,noexec,relatime)
tmpfs on /sys/fs/cgroup type tmpfs (ro,nosuid,nodev,noexec,relatime,size=2069280k,nr_inodes=517320)
cgroup on /sys/fs/cgroup/cpu,cpuacct type cgroup (ro,nosuid,nodev,noexec,relatime,cpu,cpuacct)
cgroup on /sys/fs/cgroup/devices type cgroup (ro,nosuid,nodev,noexec,relatime,devices)
cgroup on /sys/fs/cgroup/pids type cgroup (ro,nosuid,nodev,noexec,relatime,pids)
cgroup on /sys/fs/cgroup/net_cls,net_prio type cgroup (ro,nosuid,nodev,noexec,relatime,net_cls,net_prio)
cgroup on /sys/fs/cgroup/systemd type cgroup (ro,nosuid,nodev,noexec,relatime,xattr,name=systemd)
cgroup on /sys/fs/cgroup/hugetlb type cgroup (ro,nosuid,nodev,noexec,relatime,hugetlb)
cgroup on /sys/fs/cgroup/freezer type cgroup (ro,nosuid,nodev,noexec,relatime,freezer)
cgroup on /sys/fs/cgroup/memory type cgroup (ro,nosuid,nodev,noexec,relatime,memory)
```

## `uptime`
```text
 10:54:16 up 35 min,  0 users,  load average: 0.00, 0.02, 0.01
```

## `cat /proc/loadavg`
```text
0.00 0.02 0.01 1/248 2640
```

## `cat /proc/1/comm`
```text
tini
```

## `cat /proc/1/cmdline | tr '\0' ' '`
```text
/usr/bin/tini -- /start.sh 
```

## `ls -la /.dockerenv`
```text
-rw-r--r-- 1 root root 0 Nov 11 10:18 /.dockerenv
```

## `cat /proc/1/cgroup | head -5`
```text
11:name=systemd:/k8s.io/c-6af44108-140d72b5-6bf513003f7a
10:devices:/k8s.io/c-6af44108-140d72b5-6bf513003f7a
9:blkio:/k8s.io/c-6af44108-140d72b5-6bf513003f7a
8:net_cls,net_prio:/k8s.io/c-6af44108-140d72b5-6bf513003f7a
7:perf_event:/k8s.io/c-6af44108-140d72b5-6bf513003f7a
```

## `ulimit -a`
```text
real-time non-blocking time  (microseconds, -R) unlimited
core file size              (blocks, -c) 0
data seg size               (kbytes, -d) unlimited
scheduling priority                 (-e) 0
file size                   (blocks, -f) unlimited
pending signals                     (-i) 462
max locked memory           (kbytes, -l) 64
max memory size             (kbytes, -m) unlimited
open files                          (-n) 1024
pipe size                (512 bytes, -p) 8
POSIX message queues         (bytes, -q) 819200
real-time priority                  (-r) 0
stack size                  (kbytes, -s) 8192
cpu time                   (seconds, -t) unlimited
max user processes                  (-u) 100000
virtual memory              (kbytes, -v) unlimited
file locks                          (-x) unlimited
```

---

## Interpretation

This is a **kata-container** sandbox on Debian 13 trixie running kernel `5.10.134` (an Alibaba Cloud `kangaroo.al8` build). The CPU is a single Intel Xeon socket with **2 cores / 2 threads** (no SMT). Memory is **4.1 GiB with zero swap** — a single OOM-prone constraint — and the cgroup `memory` controller is mounted read-only at `/sys/fs/cgroup/memory`, meaning the host enforces an external limit (the `df` and `mount` output show a `kataShared` rootfs overlay plus PolarFS-backed writable volumes at `/tmp/my-project`, `/home/user_skills`). PID 1 is `tini` running `/start.sh`, `/.dockerenv` is present, and cgroup membership is under `/k8s.io/...`. Resource limits: 1024 open files, 8 MB stack, 100000 max user processes, 64 KB locked memory. The container has been up ~35 min at time of capture, with load average 0.00 — essentially idle. The kernel is significantly newer in userland (Debian 13) but the running kernel is 5.10, an Alibaba Cloud production kernel.

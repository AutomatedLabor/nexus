# 03 — Software Inventory

This is a curated DevOps/runtime sandbox: **Node 24**, **Bun 1.3**, **Python 3.12** (in a venv), **Java 21**, **gcc/g++ 14.2**, plus a rich text/media toolset (`ffmpeg 7.1`, `pandoc 3.1`, `graphviz 2.42`, `caddy 2.8`, `vim 9.1`, `nano 8.4`). Notably absent: rust, go, ruby, php, clang, cmake, sqlite3, postgres/mysql/redis/mongo clients, nginx, gh, nmap, hugo, netlify, wrangler, and the JS framework CLIs (next/nuxt/astro are only in the local `node_modules/.bin`).

---

For each command, `command -v <cmd>` was used to locate the binary, then `<cmd> --version` was captured (or `-V` / `-v` / `-version` where `--version` is not supported). Tooling that failed silently under `--version` was given a stdin of `/dev/null` and a hard `timeout -k 2 5` so the loop could complete in a finite time.

## Languages & Runtimes
- **python3**: `Python 3.12.16` @ `/home/z/.venv/bin/python3`
- **python**: `Python 3.12.16` @ `/home/z/.venv/bin/python`
- **node**: `v24.22.2` @ `/usr/bin/node`
- **npm**: `11.19.1` @ `/usr/bin/npm`
- **npx**: `11.19.1` @ `/usr/bin/npx`
- **bun**: `1.3.14` @ `/usr/local/bin/bun`
- **deno**: NOT INSTALLED
- **rustc**: NOT INSTALLED
- **cargo**: NOT INSTALLED
- **go**: NOT INSTALLED
- **java**: `openjdk 21.0.13 2026-10-20` @ `/usr/bin/java`
- **javac**: NOT INSTALLED (only JRE, no JDK compiler)
- **ruby**: NOT INSTALLED
- **gem**: NOT INSTALLED
- **php**: NOT INSTALLED
- **perl**: `v5.40.1` @ `/usr/bin/perl` (perl does not emit version on `--version`; `perl --version | head -2 | tail -1` used)

## Build Tools
- **gcc**: `gcc (Debian 14.2.0-19) 14.2.0` @ `/usr/bin/gcc`
- **g++**: `g++ (Debian 14.2.0-19) 14.2.0` @ `/usr/bin/g++`
- **clang**: NOT INSTALLED
- **make**: `GNU Make 4.4.1` @ `/usr/bin/make`
- **cmake**: NOT INSTALLED

## VCS / DevOps
- **git**: `git version 2.47.3` @ `/usr/bin/git`
- **gh**: NOT INSTALLED
- **vercel**: `Vercel CLI 65.14.0 (native)` @ `/home/z/.npm-global/bin/vercel`
- **netlify**: NOT INSTALLED
- **wrangler**: NOT INSTALLED
- **hugo**: NOT INSTALLED

## HTTP / Network
- **curl**: `curl 8.14.1 (x86_64-pc-linux-gnu) libcurl/8.14.1 OpenSSL/3.5.7` @ `/usr/bin/curl`
- **wget**: `GNU Wget 1.25.0 built on linux-gnu.` @ `/usr/bin/wget`
- **nginx**: NOT INSTALLED
- **apache2**: NOT INSTALLED
- **caddy**: `v2.8.4 h1:q3pe0wpBj1OcHFZ3n/1nl4V4bxBrYoSoab7rL9BMYNk=` @ `/usr/bin/caddy`
- **certbot**: NOT INSTALLED
- **dig**: `DiG 9.20.30-1~deb13u1-Debian` @ `/usr/bin/dig` (via `dig -v`)
- **nslookup**: `nslookup 9.20.30-1~deb13u1-Debian` @ `/usr/bin/nslookup` (via `nslookup -version`)
- **ping**: `ping from iputils 20240905` @ `/usr/bin/ping` (via `ping -V`)
- **traceroute**: `Modern traceroute for Linux, version 2.1.6` @ `/usr/sbin/traceroute`
- **nmap**: NOT INSTALLED
- **netstat**: `net-tools 2.10` @ `/usr/bin/netstat`
- **ss**: `ss utility, iproute2-6.15.0` @ `/usr/bin/ss`

## Data / DB Clients
- **sqlite3**: NOT INSTALLED
- **psql**: NOT INSTALLED
- **mysql**: NOT INSTALLED
- **mongosh**: NOT INSTALLED
- **redis-cli**: NOT INSTALLED
- **clickhouse-client**: NOT INSTALLED

## Text / Media
- **jq**: `jq-1.7` @ `/usr/bin/jq`
- **yq**: NOT INSTALLED
- **sed**: `sed (GNU sed) 4.9` @ `/usr/bin/sed`
- **awk**: `mawk 1.3.4 20250131` @ `/usr/bin/awk`
- **rg**: `ripgrep 14.1.1` @ `/usr/bin/rg`
- **fd**: NOT INSTALLED
- **fzf**: NOT INSTALLED
- **ffmpeg**: `ffmpeg version 7.1.5-0+deb13u1` @ `/usr/bin/ffmpeg`
- **convert**: NOT INSTALLED (ImageMagick 7 config dir exists at `/etc/ImageMagick-7/`, but neither `convert` nor `magick` is on PATH)
- **pandoc**: `pandoc 3.1.11.1` @ `/usr/bin/pandoc`
- **dot**: `dot - graphviz version 2.42.4 (0)` @ `/usr/bin/dot` (via `dot -V`)

## Editors / Multiplexer
- **tmux**: NOT INSTALLED
- **vim**: `VIM - Vi IMproved 9.1 (2024 Jan 02)` @ `/usr/bin/vim`
- **nano**: `GNU nano, version 8.4` @ `/usr/bin/nano`
- **emacs**: NOT INSTALLED

## JS Frameworks (this Next.js project)
- **next**: NOT INSTALLED on global PATH. However `Next.js v16.1.3` is available locally via `/home/z/my-project/node_modules/.bin/next`.
- **nuxt**: NOT INSTALLED
- **astro**: NOT INSTALLED

---

## Notes
- `/home/z/.venv` is the active Python venv; `python3`/`python`/`pip` resolve there rather than to a system Python.
- Java has runtime (`java`) but no `javac` — the package is `default-jre` (or equivalent), not the full JDK.
- ImageMagick config dir is present but the binaries aren't installed; treat image conversion as unavailable.
- `bc` is not installed (not in the requested list) — use `python3`, `awk`, or `jq` for arithmetic.

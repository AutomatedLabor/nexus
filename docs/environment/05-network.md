# 05 — Network

The sandbox has unrestricted outbound IPv4: the public egress IP is **8.212.10.159**, the container's primary interface is `eth0` with a `/32` address `21.0.2.167` (typical Alibaba Cloud ENI layout), and DNS is served by the internal `100.100.2.136` / `100.100.2.138` resolvers. All five probed endpoints returned a 2xx/3xx in <300 ms, and **50 concurrent HTTPS requests to example.com all returned 200** (no rate-limit, no failed connection).

---

## Outbound IP
```bash
curl -s --max-time 5 https://api.ipify.org
```
```text
8.212.10.159
```

## HTTP probes
```bash
for url in https://example.com https://github.com https://registry.npmjs.org https://api.vercel.com https://pypi.org; do
  curl -s -o /dev/null -w "URL: $url -> HTTP %{http_code} time=%{time_total}s\n" --max-time 5 "$url"
done
```
```text
URL: https://example.com -> HTTP 200 time=0.029617s
URL: https://github.com -> HTTP 200 time=0.278572s
URL: https://registry.npmjs.org -> HTTP 200 time=0.027407s
URL: https://api.vercel.com -> HTTP 308 time=0.033390s
URL: https://pypi.org -> HTTP 200 time=0.023768s
```
(`api.vercel.com` returns 308 — a permanent redirect to the canonical host, still a successful reach.)

## Interfaces — `ip addr | grep -E "^[0-9]+|inet " | head -20`
```text
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet 127.0.0.1/8 scope host lo
2: dummy0: <BROADCAST,NOARP> mtu 1500 qdisc noop state DOWN group default qlen 1000
3: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc pfifo state UP group default qlen 1000
    inet 21.0.2.167/32 scope global eth0
```

## DNS — `cat /etc/resolv.conf | head -10`
```text
nameserver 100.100.2.136
nameserver 100.100.2.138
```
(plus three blank lines from the file's tail.)

## 50 parallel HTTPS requests
```bash
seq 1 50 | xargs -P 50 -I{} curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 https://example.com | sort | uniq -c
```
```text
     50 200
```
→ **50/50 succeeded** (all HTTP 200), demonstrating that the sandbox permits high-fanout outbound TLS without per-connection throttling.

---

## Notes
- Egress is via the public IP `8.212.10.159` (Alibaba Cloud range), but the container's local `eth0` is a `/32` private address — traffic is SNAT'd by the host.
- The two `nameserver` entries `100.100.2.x` are Alibaba Cloud's internal DNS resolvers, providing low-latency name resolution for both public and internal endpoints.
- All probes completed well under the 5-second timeout, indicating the sandbox has no measurable egress proxy bottleneck for short HTTPS requests.

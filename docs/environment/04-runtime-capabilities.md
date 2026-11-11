# 04 — Runtime Capabilities

All three primary runtimes — **Node 24**, **Bun 1.3**, and **Python 3.12** — can: (a) execute a hello-world program, (b) synchronously write then read a small file in `/tmp`, and (c) perform an outbound HTTPS GET to `https://example.com` returning HTTP 200 with a ~577-byte body in 30–40 ms. Timings below are wall-clock from inside the script (`process.hrtime.bigint()` / `performance.now()` / `time.perf_counter()`).

---

## Node 24.22.2

### `node_test.js`
```js
const fs = require('fs');
const https = require('https');
function time(fn){const t0=process.hrtime.bigint();const r=fn();const t1=process.hrtime.bigint();return {ns: Number(t1-t0), r};}
function httpGet(url){return new Promise((resolve)=>{
  const t0=process.hrtime.bigint();
  https.get(url,(res)=>{
    let d='';
    res.on('data',c=>d+=c);
    res.on('end',()=>{
      const t1=process.hrtime.bigint();
      resolve({ns:Number(t1-t0),status:res.statusCode,len:d.length});
    });
  }).on('error',e=>resolve({err:String(e)}));
});}
(async()=>{
  const h=time(()=>{console.log('hello from node');});
  const f1=time(()=>fs.writeFileSync('/tmp/atlas-runtime/node_hello.txt','hello-node'));
  const f2=time(()=>fs.readFileSync('/tmp/atlas-runtime/node_hello.txt','utf8'));
  const http=await httpGet('https://example.com');
  console.log(JSON.stringify({hello_ns:h.ns, write_ns:f1.ns, read_ns:f2.ns, read_val:f2.r, http}));
})();
```

### Output
```text
hello from node
{"hello_ns":1273992,"write_ns":100308,"read_ns":26938,"read_val":"hello-node","http":{"ns":35772392,"status":200,"len":577}}
```
- hello: **1.27 ms**, file write: **0.10 ms**, file read: **0.027 ms**
- HTTPS GET: **35.77 ms**, status **200**, body **577 bytes** ✅

---

## Python 3.12.16

### `py_test.py`
```python
import time, urllib.request, os
def t(fn):
    s = time.perf_counter(); r = fn(); e = time.perf_counter()
    return (e-s), r
hs, _ = t(lambda: print('hello from python'))
ws, _ = t(lambda: open('/tmp/atlas-runtime/py_hello.txt','w').write('hello-python'))
rs, v = t(lambda: open('/tmp/atlas-runtime/py_hello.txt').read())
def http_get():
    req = urllib.request.Request('https://example.com', headers={'User-Agent':'curl/8'})
    with urllib.request.urlopen(req, timeout=10) as r: return r.status, len(r.read())
try:
    hs2, hr = t(http_get)
    print(f'{{"hello_s":{hs:.6f}, "write_s":{ws:.6f}, "read_s":{rs:.6f}, "read_val":"{v}", "http_s":{hs2:.6f}, "http_status":{hr[0]}, "http_bytes":{hr[1]}}}')
except Exception as e:
    print(f'{{"http_err":"{e}"}}')
```

### Output
```text
hello from python
{"hello_s":0.000142, "write_s":0.000253, "read_s":0.000029, "read_val":"hello-python", "http_s":0.039126, "http_status":200, "http_bytes":577}
```
- hello: **0.142 ms**, file write: **0.253 ms**, file read: **0.029 ms**
- HTTPS GET: **39.1 ms**, status **200**, body **577 bytes** ✅

---

## Bun 1.3.14

### `bun_test.js`
```js
const fs = require('fs');
function time(fn){const t0=performance.now();const r=fn();const t1=performance.now();return {ms:t1-t0,r};}
async function httpGet(url){const t0=performance.now();try{const r=await fetch(url);const t=await r.text();const t1=performance.now();return {ms:t1-t0,status:r.status,len:t.length};}catch(e){return {err:String(e)};}}
(async()=>{
  const h=time(()=>console.log('hello from bun'));
  const f1=time(()=>fs.writeFileSync('/tmp/atlas-runtime/bun_hello.txt','hello-bun'));
  const f2=time(()=>fs.readFileSync('/tmp/atlas-runtime/bun_hello.txt','utf8'));
  const http=await httpGet('https://example.com');
  console.log(JSON.stringify({hello_ms:h.ms, write_ms:f1.ms, read_ms:f2.ms, read_val:f2.r, http}));
})();
```

### Output
```text
hello from bun
{"hello_ms":0.042572999999999084,"write_ms":0.10300499999999957,"read_ms":0.05056399999999961,"read_val":"hello-bun","http":{"ms":31.351255000000002,"status":200,"len":577}}
```
- hello: **0.043 ms**, file write: **0.103 ms**, file read: **0.051 ms**
- HTTPS GET: **31.35 ms**, status **200**, body **577 bytes** ✅

---

## Summary Table

| Runtime | hello (ms) | file write (ms) | file read (ms) | HTTPS GET (ms) | status | bytes |
|---------|-----------:|----------------:|---------------:|---------------:|:------:|------:|
| Node 24.22.2 | 1.274 | 0.100 | 0.027 | 35.77 | 200 | 577 |
| Python 3.12.16 | 0.142 | 0.253 | 0.029 | 39.13 | 200 | 577 |
| Bun 1.3.14 | 0.043 | 0.103 | 0.051 | 31.35 | 200 | 577 |

## Notes
- All three runtimes are fully functional for sync I/O on `/tmp` and outbound HTTPS to public internet.
- Bun's `fetch`-based HTTP is fastest (~31 ms) due to native TLS; Python's `urllib` is slowest (~39 ms).
- The "hello" timing differences are dominated by I/O flush cost (`console.log`); Bun is fastest because `performance.now()` has lower overhead and Bun's stdout is unbuffered.
- The Python test used a venv interpreter at `/home/z/.venv/bin/python3`.

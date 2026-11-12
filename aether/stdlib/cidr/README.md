# Aether stdlib — `cidr`

CIDR / IPv4 utility functions. A "CIDR" is represented as a plain
object `{ ip: <u32>, prefix: <0..32> }` where `ip` is the network
address (host bits zeroed) and `prefix` is the bit length of the
network portion.  All arithmetic is done on 32-bit unsigned
integers via `>>>0`, so JavaScript's signed-int overflow doesn't
bite.

## Why a CIDR module?

Networking code is full of CIDR arithmetic: "does this address
fall inside this network?", "split this /16 into /24s", "are
these two networks adjacent so we can merge them?".  Doing it
by hand with string parsing is error-prone and slow; this module
gives a single source of truth.

## Data model

```ts
interface Cidr {
  ip: number;       // 32-bit unsigned integer (big-endian packing)
  prefix: number;   // 0..32
}
```

The IP is packed big-endian: `192.168.0.1` becomes
`(192 << 24) | (168 << 16) | (0 << 8) | 1 >>> 0`.  All operations
on `ip` use `>>> 0` to keep it unsigned.

The `ip` field is always the *network address* — host bits are
masked off at parse time.  `cidrNetwork` returns the same value
as a 4-tuple; `cidrBroadcast` returns the broadcast (host bits
all ones).

## Functions

| Function | Signature | Notes |
|---|---|---|
| `cidrParse` | `(s) -> Cidr` | Parse `"a.b.c.d/p"`; host bits zeroed. |
| `cidrContains` | `(outer, inner) -> bool` | True if `inner` is fully inside `outer`. |
| `cidrNetwork` | `(c) -> [a, b, c, d]` | Network address as 4-tuple. |
| `cidrBroadcast` | `(c) -> [a, b, c, d]` | Broadcast address as 4-tuple. |
| `cidrMask` | `(c) -> string` | Dotted-decimal netmask, e.g. `"255.255.255.0"`. |
| `cidrHosts` | `(c) -> int` | Usable host count (RFC 3021 for /31). |
| `cidrSubnets` | `(c, n) -> Cidr[]` | Split into `2^n` sub-prefixes. |
| `cidrOverlap` | `(a, b) -> bool` | True if the two CIDRs share any address. |
| `cidrMerge` | `(a, b) -> Cidr` | Merge two adjacent equal-size CIDRs into a `/(p-1)`. |
| `cidrToString` | `(c) -> string` | Format as `"a.b.c.d/p"`. |

## Examples

### Parse & inspect

```aether
let c = cidrParse("192.168.1.42/24");
print(cidrToString(c));       // 192.168.1.0/24
print(cidrMask(c));           // 255.255.255.0
print(cidrNetwork(c));        // [192, 168, 1, 0]
print(cidrBroadcast(c));     // [192, 168, 1, 255]
print(cidrHosts(c));          // 254
```

### Containment & overlap

```aether
let outer = cidrParse("10.0.0.0/16");
let inner = cidrParse("10.0.5.0/24");
let other = cidrParse("10.1.0.0/24");
print(cidrContains(outer, inner));  // true
print(cidrContains(outer, other));  // false
print(cidrOverlap(outer, other));   // false
```

### Subdivision

```aether
let net = cidrParse("192.168.0.0/24");
let subs = cidrSubnets(net, 2);   // 2² = 4 sub-networks
for s in subs {
    print(cidrToString(s));
}
// 192.168.0.0/26
// 192.168.0.64/26
// 192.168.0.128/26
// 192.168.0.192/26
```

### Merging

```aether
let a = cidrParse("192.168.0.0/25");
let b = cidrParse("192.168.0.128/25");
print(cidrToString(cidrMerge(a, b)));  // 192.168.0.0/24
```

## Special cases

* **`/0`** is the "default route" — covers all addresses.
* **`/31`** is a point-to-point link per RFC 3021; `cidrHosts`
  returns 2 (both addresses are usable).
* **`/32`** is a single host; `cidrHosts` returns 1.
* **`cidrMerge` rejects `/0`** — you can't merge two halves of
  "everything" because the parent would be `/−1`, which doesn't
  exist.

## Errors

* `cidrParse` throws on missing `/`, non-numeric octets,
  out-of-range octets (> 255), or out-of-range prefix (> 32).
* All other functions throw if their Cidr arguments are
  malformed (bad `ip` or `prefix` types).
* `cidrSubnets` throws on negative `n` or if `prefix + n > 32`.
* `cidrMerge` throws on mismatched prefixes, on `a` or `b` being
  `/0`, on misaligned (non-adjacent or out-of-boundary) inputs.

## Performance

All functions are O(1) except:

* `cidrSubnets(c, n)` — O(2^n) (one entry per subnet).
* `cidrMerge` — O(1) (a couple of arithmetic ops).

## Tests

25 tests in `index.test.ts` cover parsing (including all the
error cases), `cidrNetwork`, `cidrBroadcast`, `cidrMask`,
`cidrHosts` (including the /30, /31, /32 special cases),
containment, overlap, subdivision, merging, and validator
errors.  Run them with:

```
bunx vitest run aether/stdlib/cidr
```

## Future work

* IPv6 support — same shape but with a pair of u32 (or a
  BigInt) for `ip` and `prefix` up to 128.
* `cidrAggregate(cidrs[])` — IP prefix aggregation (supernetting),
  useful for routing-table compression.
* `cidrRange(c)` — return the start/end IP range as a pair of
  4-tuples, useful for firewall rules.

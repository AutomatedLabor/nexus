# hash_table_demo2 — Open-Addressing Hash Table

A hash table with **open addressing** (linear probing), in
contrast to the chaining-based `hash_table_demo.ae`. Same demo
shape: insert 10 entries, look up several keys, print stats.

## What it does

Creates a hash table with capacity 11 (a prime), inserts 10
`(key, value)` pairs (fruit names mapped to integers), then
looks up 10 keys — 5 hits and 5 misses — and prints the table's
non-empty slots.

## Open addressing vs chaining

The chaining variant (`hash_table_demo.ae`) stores each slot as
a linked list of `(key, value)` pairs; on collision, the new
pair is appended to the slot's list. The open-addressing variant
stores all entries in a single flat array; on collision, the
probe walks forward one slot at a time (linear probing) until
it finds an empty slot (for insert) or the matching key (for
lookup).

Open addressing has better cache locality (the table is a
single contiguous array) but degrades badly at high load
factor — the probe sequences get long. Chaining tolerates load
factors > 1 (the chains just grow), at the cost of an extra
indirection per slot.

## Hash function

A simple sum-of-char-codes modulo the capacity. Not
cryptographic — just for demonstration. With capacity 11 and
10 entries, the load factor is ~91%, high enough to force
several probe walks (visible in the printed slot layout —
"honeydew" lands at slot 9, not at the slot its hash would
suggest, because earlier entries occupy its home slot).

## Deletion

Not implemented. Deletion in an open-addressing table requires
"tombstone" markers (a sentinel value that the probe can skip
over but that insert can reuse); otherwise the probe chains
break. The chaining variant doesn't have this problem — you
just unlink the node from the list.

## Output

```
== Hash table (open addressing, linear probing) ==

capacity: 11
inserted 10 entries (capacity 11, load factor ~90%)

non-empty slots:
  slot 0: "kiwi" -> 90
  slot 1: "lemon" -> 100
  slot 2: "apple" -> 10
  ...

lookups:
  hit   "apple" -> 10
  hit   "cherry" -> 30
  miss  "mango" -> -9999
  ...
```

The slot layout shows the probing: for example, "kiwi" hashes
to slot 0 (5 chars summing to ~535 mod 11 = 7, but the layout
puts it at 0 — the trace shows the probe sequence). The hits
return the right value; misses return -9999 (the sentinel
"not found" value).

## Sanity assertions

The example ends with `assert_eq` checks verifying the
hit/miss values and the final table size (10 entries in 11
slots).

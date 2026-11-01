---
title: Hash and ordered maps
day: 93
part: DSA
partName: Data structures & algorithms
partDay: 3
partDays: 10
time: "2 hours"
description: Count with a HashMap, range-query with a BTreeMap, and choose between them for tags and due dates.
bullets:
  - insert and update with the `entry` API;
  - choose a `BTreeMap` when order matters;
  - reason about hashing, collisions, and borrowed keys.
---

A `Vec` answers “what is at position i?” in constant time. A task list also
needs “which tasks carry this tag?” and “which tasks are due before Friday?”.
Those are lookup questions, and the map is the tool.

Rust has two standard maps: `HashMap` for unordered lookup, and `BTreeMap` for
ordered lookup and ranges. The right choice depends on the query.

## Count words

<!-- verify: dsa/src/maps.rs at=day-93 -->
```rust title="dsa/src/maps.rs"
use std::collections::{BTreeMap, HashMap};

/// Count words in a sentence.
pub fn word_counts(text: &str) -> HashMap<&str, usize> {
    let mut counts = HashMap::new();
    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}
```

`entry(word)` looks up the key once and returns an `Entry`. `or_insert(0)`
inserts `0` if the key is missing and returns a mutable reference to the value.
The `*` dereferences that reference so `+= 1` updates the stored count.

Doing this with `get` and `insert` would hash the key twice and still need a
branch. The entry API is the idiomatic way to say “insert or update”.

The keys are `&str` borrowed from the input. The map does not copy the words;
it points into the sentence. The lifetime of the map is tied to the lifetime of
`text`; the compiler enforces that.

## Count due dates

A `BTreeMap` keeps its keys sorted. That makes it the right structure for a
range query:

<!-- verify: dsa/src/maps.rs at=day-93 -->
```rust title="dsa/src/maps.rs"
/// Count how many due dates fall on each day.
pub fn due_buckets(days: &[i64]) -> BTreeMap<i64, usize> {
    let mut buckets = BTreeMap::new();
    for day in days {
        *buckets.entry(*day).or_insert(0) += 1;
    }
    buckets
}
```

`days` is a slice of day numbers, not dates; the point is the ordered map. After
the counts, `buckets.range(1..=3)` returns only the days in that range, in
order, without scanning the whole map. A `HashMap` cannot do that without
sorting its keys first.

The cost:

| Operation | `HashMap` | `BTreeMap` |
| --- | --- | --- |
| insert | O(1) average | O(log n) |
| lookup | O(1) average | O(log n) |
| iterate in order | sort first | O(n) |
| range query | not supported | O(log n + k) |

`k` is the number of results. A `HashMap` can be faster for a single lookup; a
`BTreeMap` wins when order or ranges are part of the query.

## The test

<!-- verify: dsa/src/maps.rs at=day-93 -->
```rust title="dsa/src/maps.rs"
    #[test]
    fn counts_words_and_days() {
        let counts = word_counts("buy milk buy");
        assert_eq!(counts.get("buy"), Some(&2));
        assert_eq!(counts.get("milk"), Some(&1));

        let buckets = due_buckets(&[3, 1, 3, 2]);
        assert_eq!(buckets.keys().copied().collect::<Vec<_>>(), vec![1, 2, 3]);
        assert_eq!(buckets.get(&3), Some(&2));
    }
```

The first assertion checks the counts. The second proves the ordered map's
iteration order: `keys()` yields 1, 2, 3 even though the input arrived 3, 1, 3,
2.

`counts.get("buy")` returns `Option<&usize>`; the comparison is `Some(&2)`, not
`Some(2)`. The reference is to the value inside the map.

## Hashing, collisions, and the default hasher

A `HashMap` hashes the key, uses the hash to choose a bucket, and compares the
key inside the bucket. Two different keys can hash to the same bucket — a
**collision** — and the map resolves it by probing or chaining. The average
`O(1)` assumes a good hash and a reasonable load factor.

Rust's default hasher, `RandomState`, is randomly seeded per process. That makes
hash-flooding attacks harder: an attacker cannot predict which buckets will
collide. The cost is that iteration order changes between runs; never depend on
it.

If you need a stable hash for a file format, choose an explicit hasher. If you
need deterministic output, sort the keys before printing.

## Borrowed keys and the app

The word counter uses `&str` keys borrowed from the input. The app's tag
counter does the same: the keys point at the strings inside the tasks, and the
map lives only as long as the list is unchanged.

That is efficient, but it ties the map to the list's lifetime. If the counts
must survive a mutation, use owned keys (`HashMap<String, usize>`) and clone
the tag. The clone costs one allocation per distinct tag; the borrowed map
costs none.

The reference `Task` has no due date yet; adding one is the app extension this
index serves. A `BTreeMap<i64, Vec<u32>>` maps a day to the task ids due that
day. A range query returns the tasks in a window. The vector inside the
value keeps the insertion order for ties; the map keeps the days sorted.

A small example shows the shape:

```rust
let mut by_day: BTreeMap<i64, Vec<u32>> = BTreeMap::new();
by_day.entry(3).or_default().push(1);
by_day.entry(3).or_default().push(2);
by_day.entry(5).or_default().push(3);

let this_week: Vec<u32> = by_day
    .range(1..=4)
    .flat_map(|(_, ids)| ids.iter().copied())
    .collect();
```

`range` walks only the days in the window; `flat_map` flattens each day's ids
into one list. The result is `[1, 2]`, in day order and insertion order within a
day. A `HashMap` would need a full scan and a sort to answer the same question.

## When a map is the wrong choice

- **A few keys** — a linear scan over a small `Vec` can be faster than hashing.
- **Keys with a known dense range** — a `Vec` indexed by the key is an array,
  and arrays are hard to beat.
- **Ordered data that never changes** — a sorted `Vec` plus binary search uses
  less memory than a tree.
- **Concurrent writes** — the standard maps need a lock or a sharded structure.

Measure before replacing a `Vec` with a map. The constant on a small list is
often smaller than the hash.

## If something went wrong

**The count is wrong for repeated keys.** The entry API is missing, or the
update uses `insert` and overwrites. Use `entry(...).or_insert(0)`.

**`the trait Hash is not implemented`.** The key type must implement `Hash` and
`Eq` for `HashMap`, or `Ord` for `BTreeMap`. A float key is a common culprit;
floats are not `Ord`.

**The iteration order changes between runs.** That is the randomized hasher.
Sort the keys, or use a `BTreeMap`.

**A borrowed key does not live long enough.** The map outlives the string it
borrows. Store owned keys, or keep the input alive.

**The map is slower than a Vec for ten items.** Hashing has a constant cost.
Use the simpler structure until the size justifies the map.

**A range query returns nothing.** The bounds are exclusive on the top end if
you use `..`, or the keys are a different type. Check the range syntax and the
key type.

## Going deeper: load factor and resizing

A `HashMap` resizes when the load factor crosses a threshold. The resize
allocates a larger table and rehashes every key; that is the expensive step,
just like a vector's growth. `with_capacity` avoids it when the size is known.

A `BTreeMap` is a B-tree: nodes hold several keys, and the tree stays shallow.
The `O(log n)` hides a larger constant than a hash lookup, but the ordered
iteration and range queries are the payoff.

The next day uses stacks and queues: the structures behind undo, parsing, and
the next-up list.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 93: count with maps"
$ git tag dsa-03
```

---
title: Sorting and searching
day: 99
part: DSA
partName: Data structures & algorithms
partDay: 9
partDays: 10
time: "2 hours"
description: Write insertion sort and binary search by hand, then use the standard library's sort and binary_search with the right bounds.
bullets:
  - see why insertion sort is `O(n²)`;
  - write binary search without an off-by-one;
  - choose stable sorting and the correct search key.
---

Sorting and searching are the oldest algorithms in the toolbox. Writing them
once teaches the invariants; using the standard library afterwards is the
correct default.

Today we write both, then compare with what `std` provides.

## Insertion sort

Insertion sort builds a sorted prefix. For each new value, it shifts the larger
values right until the new value fits:

<!-- verify: dsa/src/sorting.rs at=day-99 -->
```rust title="dsa/src/sorting.rs"
/// Insertion sort, in place.
pub fn insertion_sort(values: &mut [i32]) {
    for i in 1..values.len() {
        let key = values[i];
        let mut j = i;
        while j > 0 && values[j - 1] > key {
            values[j] = values[j - 1];
            j -= 1;
        }
        values[j] = key;
    }
}
```

The loop invariant: `values[0..i]` is sorted before iteration `i` starts. The
inner loop moves the gap left until the value before it is not larger, then
places the key in the gap.

The worst case is a reversed list: every element shifts across the prefix,
which is `1 + 2 + ... + (n - 1) = O(n²)`. The best case is already sorted: the
inner loop never runs, and the cost is `O(n)`. The average is `O(n²)`.

Insertion sort is stable: equal values keep their relative order. It is also
fast for small arrays and nearly sorted data, which is why real sort
implementations use it for small partitions.

## Binary search

Binary search needs a sorted slice. It halves the range until the target is
found or the range is empty:

<!-- verify: dsa/src/sorting.rs at=day-99 -->
```rust title="dsa/src/sorting.rs"
/// Binary search on a sorted slice.
pub fn binary_search(values: &[i32], target: i32) -> Option<usize> {
    let mut low = 0;
    let mut high = values.len();
    while low < high {
        let mid = low + (high - low) / 2;
        if values[mid] == target {
            return Some(mid);
        }
        if values[mid] < target {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    None
}
```

`high` starts at `len`, exclusive. The range `low..high` is always the candidate
window. When `values[mid] < target`, the target can only be to the right, so
`low = mid + 1`. Otherwise it is at `mid` or to the left, so `high = mid`.

`mid = low + (high - low) / 2` avoids overflow when `low + high` would exceed
the integer range. Rust panics on overflow in debug builds; release builds
depend on the `overflow-checks` setting, so the safer form is a good habit.

The loop ends when `low == high`; an empty range means the target is absent.

## The test

<!-- verify: dsa/src/sorting.rs at=day-99 -->
```rust title="dsa/src/sorting.rs"
    #[test]
    fn sorts_and_searches() {
        let mut values = vec![5, 2, 9, 1, 5, 6];
        insertion_sort(&mut values);
        assert_eq!(values, vec![1, 2, 5, 5, 6, 9]);
        assert_eq!(binary_search(&values, 6), Some(4));
        assert_eq!(binary_search(&values, 7), None);
    }
```

The sorted vector has a duplicate 5. Binary search returns the index of the 6,
which is 4 in the sorted order. A missing value returns `None`, not a panic and
not `usize::MAX`.

The returned index is **a** matching position, not necessarily the first. If
there are duplicates, a plain binary search can land on any of them. For the
first occurrence, continue searching left after a match; for the last, continue
right.

## The standard library

In real code, use `sort` and `binary_search`:

```rust
let mut values = vec![5, 2, 9, 1, 5, 6];
values.sort();                 // stable, O(n log n) worst case
values.sort_unstable();        // faster, may reorder equal values
values.sort_by_key(|value| *value);

match values.binary_search(&6) {
    Ok(index) => println!("found at {index}"),
    Err(index) => println!("insert at {index}"),
}
```

`sort` is stable and allocates for large inputs; `sort_unstable` is in-place and
usually faster, at the cost of equal-element order. `sort_by_key` computes a key
per comparison unless you use `sort_by_cached_key` for expensive keys.

`binary_search` returns `Result<usize, usize>`: `Ok(index)` when found, and
`Err(insertion_point)` when not. That is more useful than `Option`, because the
insertion point is the position that keeps the slice sorted.

For a custom key, use `binary_search_by_key`:

```rust
let tasks = vec![(1, "buy milk"), (2, "write the report")];
let index = tasks.binary_search_by_key(&2, |(id, _)| *id);
```

## Searching a page

An API that returns a sorted page can binary-search the page for a cursor. The
page is sorted by id; the next page starts after the last id:

```rust
let position = page.binary_search_by_key(&last_id, |task| task.id);
let next = match position {
    Ok(index) => index + 1,
    Err(index) => index,
};
let rest = &page[next..];
```

`Ok` means the cursor was found; `Err` gives the insertion point where it would
belong. Both cases produce the first task strictly after the cursor. This is the
in-memory version of `WHERE id > $1 ORDER BY id LIMIT $2`; the database index
does the same search without loading the page.

The search is `O(log n)`; slicing is `O(1)`. The page must be sorted by the same
key, and the cursor must be comparable to it. A page sorted by title cannot be
searched by id.

## Stability and the app

The reference app prints tasks in insertion order; sorting them for display is
an extension. A stable sort keeps the original order for equal keys:

- tasks with the same due date keep their id order;
- a secondary key (title) makes the order deterministic;
- an unstable sort may swap equal elements between runs, which makes snapshots
  and tests flaky.

For the app's small lists, either sort is fast. Choose stability when the order
is part of the output; choose speed when it is not.

## Binary search in the app

A sorted `Vec<Task>` by id supports `binary_search_by_key`. But the store also
changes: a push can break the order, and a removal shifts indices. The database
index is the persistent version of the same idea.

Use binary search when:

- the data is already sorted and does not change often;
- you need many lookups and few inserts;
- the comparison is cheap or cached.

Use a map when inserts and lookups are interleaved. Sorting once and binary
searching is the simpler structure for a static list.

## If something went wrong

**Binary search misses a value that is present.** The bound update is wrong, or
the slice is not sorted. Check `low = mid + 1` and `high = mid`.

**The loop never ends.** `low` and `high` are not narrowing, or `mid` is
recomputed outside the loop. Trace the window.

**`sort_by` panics.** The comparator is inconsistent: it says `a < b` and
`b < a` at the same time. A comparator must be a total order.

**The sort is not stable when it should be.** `sort_unstable` does not preserve
equal order. Use `sort` or add a tie-breaker key.

**`binary_search` returns an unexpected duplicate.** It returns any match, not
the first. Search left or right after the match, or use `partition_point`.

**The insertion point is the length.** That is correct for a value larger than
every element. The caller can insert at that index.

## Going deeper: comparison sorts and linear sorts

Comparison sorts have a lower bound of `O(n log n)` in the worst case. Merge
sort and heapsort reach it; quicksort reaches it on average and degrades to
`O(n²)` on adversarial input. Rust's `sort_unstable` is a hybrid: insertion
sort for small runs, then a pattern-defeating quicksort.

Counting sort and radix sort are `O(n + k)` for integer keys in a known range.
They are not comparison sorts, so the lower bound does not apply. They trade
memory and key assumptions for speed.

The next day is the practice set: ten small problems, each with a test.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 99: sort and search"
$ git tag dsa-09
```

---
title: Vectors and slices underneath
day: 92
part: DSA
partName: Data structures & algorithms
partDay: 2
partDays: 10
time: "2 hours"
description: Look inside a `Vec` — a pointer, a length, and a capacity — and see when growth copies and when a slice avoids it.
bullets:
  - tell length from capacity;
  - record the reallocations while a vector grows;
  - pass a slice when the caller does not need ownership.
---

A `Vec` feels like a list that can grow. Underneath it is three words: a
pointer to a heap buffer, a length, and a capacity. The length is how many
values are live; the capacity is how many fit before the buffer must grow.

Today we watch the buffer grow, and we use slices to read it without copying.

## The shape of a vector

<!-- transcripts: authored -->
```text
Vec<T> {
    ptr: *mut T,   the heap buffer
    len: usize,    values initialized
    cap: usize,    slots allocated
}
```

`len` is what `values.len()` returns. `cap` is what `values.capacity()`
returns. The gap between them is unused memory that the next pushes can fill
without asking the allocator.

When `len == cap` and you push, the vector allocates a larger buffer, copies
the live values, and frees the old one. The values are **moved**; any reference
into the old buffer would be dangling, which is why the borrow checker does not
let a reference outlive a push that can reallocate.

## Watch it grow

<!-- verify: dsa/src/vecs.rs at=day-92 -->
```rust title="dsa/src/vecs.rs"
/// Record the capacity after each growth while pushing `n` values.
pub fn growth_capacities(n: usize) -> Vec<usize> {
    let mut values = Vec::new();
    let mut capacities = Vec::new();
    for value in 0..n {
        values.push(value);
        if capacities.last() != Some(&values.capacity()) {
            capacities.push(values.capacity());
        }
    }
    capacities
}
```

`Vec::new()` allocates nothing. The first push allocates a small buffer; when it
fills, the allocator gives a larger one, usually doubling. The function records
each capacity right after it changes, so the result shows the growth sequence.

The test does not hard-code the sequence, because the exact numbers are an
implementation detail:

<!-- verify: dsa/src/vecs.rs at=day-92 -->
```rust title="dsa/src/vecs.rs"
    #[test]
    fn growth_is_geometric() {
        let capacities = growth_capacities(100_000);
        assert!(capacities.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(*capacities.last().unwrap() >= 100_000);
        assert!(capacities.len() < 40);
    }
```

Three properties:

- every recorded capacity is larger than the previous one;
- the last capacity holds all 100,000 values;
- there are fewer than 40 growth steps.

If growth were linear — add one slot at a time — 100,000 pushes would copy
about five billion values in total. Doubling makes the total copies about
200,000. That is why push is `O(1)` amortized: the expensive step is rare, and
its cost is spread over the pushes that filled the buffer.

The benchmark from yesterday measured `vec_growth/100_000` at 113 microseconds.
Most of that is the pushes and the growth copies, not the recording.

## A slice is a window

A slice, `&[T]`, is a pointer and a length into someone else's buffer. It does
not own, allocate, or copy. A `&Vec<T>` coerces to `&[T]` at a call site, so a
function that only reads should take the slice:

<!-- verify: dsa/src/vecs.rs at=day-92 -->
```rust title="dsa/src/vecs.rs"
/// Sum a slice of integers.
pub fn sum(values: &[i64]) -> i64 {
    values.iter().sum()
}
```

`sum(&[1, 2, 3])` works on an array; `sum(&my_vec)` works on a vector;
`sum(&my_vec[1..])` works on a sub-slice. The function cannot push, pop, or
resize, because it does not own the vector. That is the right signature for a
reader.

## Deduplicate in place

`Vec::dedup` removes **adjacent** duplicates. It does not sort, so `[1, 2, 1]`
keeps both ones:

<!-- verify: dsa/src/vecs.rs at=day-92 -->
```rust title="dsa/src/vecs.rs"
/// Remove adjacent duplicates in place.
pub fn dedup_adjacent(values: &mut Vec<i32>) {
    values.dedup();
}
```

<!-- verify: dsa/src/vecs.rs at=day-92 -->
```rust title="dsa/src/vecs.rs"
    #[test]
    fn sum_and_dedup() {
        assert_eq!(sum(&[1, 2, 3]), 6);
        let mut values = vec![1, 1, 2, 3, 3];
        dedup_adjacent(&mut values);
        assert_eq!(values, vec![1, 2, 3]);
    }
```

For a list of tags, adjacent duplicates are common after sorting; `dedup` is
the cheap cleanup. For all duplicates, sort first (`O(n log n)`) and then
`dedup` (`O(n)`). A `HashSet` is the other option, at the cost of hashing and
losing order.

## Reserve when you know the size

If you know the final size, `Vec::with_capacity(n)` allocates once. It is a
promise to the allocator, not a limit: the vector can still grow past it.

```rust
let mut values = Vec::with_capacity(tasks.len());
for task in tasks {
    values.push(task.id);
}
```

This is a real optimization when `n` is large and known. It is not free: if you
over-reserve, the memory sits unused. For a small list, `Vec::new()` is simpler
and the growth is negligible.

## Slices and the app

The app already uses slices:

- `TodoList::list(&self) -> &[Task]` borrows the vector's contents;
- `find_first<T>(items: &[T], ...)` searches any slice;
- the JSON encoder walks a slice of tasks;
- the TUI renders a slice of rows.

The pattern is deliberate: **own at the boundary, borrow in the middle**. The
store owns the tasks; the renderer, the encoder, and the query helpers only
need to read them.

## When a Vec is the wrong choice

- **Frequent removal from the front** — every removal shifts the rest. Use a
  `VecDeque` (Day 94) or a linked structure.
- **Huge, stable data** — a boxed slice (`Box<[T]>`) drops the capacity word and
  the growth machinery.
- **Stable addresses** — a `Vec` can move its values on growth. A `Vec<Box<T>>`
  keeps the boxes stable; the pointer to each value is separate.
- **Concurrent reads and writes** — a `Vec` behind a lock is fine; a lock-free
  structure is a different project.

## If something went wrong

**`capacity` is zero for an empty vector.** `Vec::new()` does not allocate.
Check capacity after the first push.

**The capacities are not powers of two.** The growth factor is an implementation
detail and may differ by allocator or platform. Test the properties, not the
exact sequence.

**`dedup` leaves duplicates.** It only removes adjacent ones. Sort first, or use
a set.

**A reference breaks after a push.** The push may reallocate and move the
values. Take fresh references after the mutation, or reserve enough capacity
first.

**`expected &[T], found &Vec<T>`.** A `&Vec<T>` coerces to `&[T]` in most
positions, but a generic parameter or a struct field may need the explicit
slice. Change the signature to `&[T]`.

**The vector is slower than expected.** Growth is not the only cost: a push may
clone, drop, or allocate the value itself. Profile before changing the
container.

## Going deeper: capacity and memory

The capacity is not part of the length, but it is part of the memory. A vector
of 1,000 values may hold a buffer for 1,024 or 2,048. `shrink_to_fit` asks the
allocator to release the extra slots; it may copy. `shrink_to(n)` is the same
with a floor.

The allocator rounds requests to a size class, so `capacity()` can be larger
than the number you requested. That is why the test checks a bound, not an
equality.

A slice has no capacity and no ownership. It is the cheapest way to pass a
contiguous view. The next day moves from sequence to lookup: maps.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 92: look inside a vector"
$ git tag dsa-02
```

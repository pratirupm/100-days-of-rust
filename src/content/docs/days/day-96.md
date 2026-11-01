---
title: "Day 96 — Trees and heaps"
description: "Keep the k largest values with a binary heap, order tasks by due day, and see when a tree beats a sorted vector. — Day 96 of 100 Days of Rust."
sidebar:
  order: 6
day: 96
---

**About 2 hours** · Data structures & algorithms, day 6 of 10.

**You'll be able to:**

- use `BinaryHeap` as a max-heap and `Reverse` as a min-heap;
- solve top-k in `O(n log k)`;
- schedule tasks by priority with a heap.

---

A heap is a tree with one rule: every parent is at least as large as its
children (a max-heap), or at most as large (a min-heap). The largest or smallest
value is always at the root, and push/pop are `O(log n)`.

The standard library's `BinaryHeap` is a max-heap stored in a `Vec`. Today we use
it for two app-shaped problems: the top k values and the next task by due date.

## Top k

Finding the ten largest values in 10,000 does not require sorting all 10,000.
Keep a heap of at most k values:

<!-- verify: dsa/src/trees.rs at=day-96 -->
```rust title="dsa/src/trees.rs"
/// Return the k largest values, largest first.
pub fn top_k(values: &[i32], k: usize) -> Vec<i32> {
    let mut heap: BinaryHeap<Reverse<i32>> = BinaryHeap::new();
    for value in values {
        heap.push(Reverse(*value));
        if heap.len() > k {
            heap.pop();
        }
    }
    let mut values: Vec<i32> = heap.into_iter().map(|Reverse(value)| value).collect();
    values.sort_unstable_by(|a, b| b.cmp(a));
    values
}
```

`BinaryHeap<Reverse<i32>>` is a min-heap of the values: the smallest value sits
at the root, so `heap.pop()` removes the smallest. When the heap exceeds k, the
smallest is exactly the one that cannot be in the top k. The heap never holds
more than k + 1 values.

The final sort is `O(k log k)`; the main loop is `O(n log k)`. Sorting all n
values would be `O(n log n)` and allocate a full copy. For `k = 10` and
`n = 10,000`, the heap does a fraction of the work.

The tests:

<!-- verify: dsa/src/trees.rs at=day-96 -->
```rust title="dsa/src/trees.rs"
    #[test]
    fn keeps_the_largest_values() {
        assert_eq!(top_k(&[3, 1, 4, 1, 5, 9], 3), vec![9, 5, 4]);
    }

    #[test]
    fn asks_for_more_values_than_exist() {
        assert_eq!(top_k(&[2, 7], 5), vec![7, 2]);
    }
```

If k is larger than the input, the heap holds every value and the result is the
whole list, sorted descending. That is a reasonable answer; the alternative is
an error, which pushes the decision to every caller.

## Scheduling by due day

A heap also models a priority queue. The app's tasks have a due day; the next
task is the one with the smallest due day, and ties break by title:

<!-- verify: dsa/src/trees.rs at=day-96 -->
```rust title="dsa/src/trees.rs"
/// A task with a due day. The derived order is due first, then title.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ScheduledTask {
    /// The day the task is due; smaller is earlier.
    pub due: i64,
    /// The task's title.
    pub title: String,
}

/// Sort tasks by due day, earliest first.
pub fn schedule(tasks: Vec<ScheduledTask>) -> Vec<String> {
    let mut heap: BinaryHeap<Reverse<ScheduledTask>> = tasks.into_iter().map(Reverse).collect();
    let mut order = Vec::new();
    while let Some(Reverse(task)) = heap.pop() {
        order.push(task.title);
    }
    order
}
```

`#[derive(Ord)]` compares fields in declaration order: `due` first, then
`title`. `Reverse` flips the heap so the earliest due day is on top. `collect`
builds a heap from an iterator in `O(n)`, which is faster than n pushes.

The test:

<!-- verify: dsa/src/trees.rs at=day-96 -->
```rust title="dsa/src/trees.rs"
    #[test]
    fn schedules_by_due_day_then_title() {
        let tasks = vec![
            ScheduledTask {
                due: 3,
                title: "report".into(),
            },
            ScheduledTask {
                due: 1,
                title: "milk".into(),
            },
            ScheduledTask {
                due: 1,
                title: "bread".into(),
            },
        ];
        assert_eq!(schedule(tasks), vec!["bread", "milk", "report"]);
    }
```

The two tasks due on day 1 come out in title order. A `BinaryHeap` is not
stable for equal keys; the derived `Ord` makes the tie deterministic.

## Heap vs sorted vector

If the data does not change, sort once and read in order. A sorted `Vec` is
smaller and faster for iteration. A heap wins when values arrive over time and
you need the extreme value repeatedly.

| Operation | Sorted `Vec` | `BinaryHeap` |
| --- | --- | --- |
| build | O(n log n) | O(n) |
| peek extreme | O(1) | O(1) |
| push | O(n) | O(log n) |
| pop extreme | O(n) | O(log n) |
| iterate in order | O(n) | not supported |

The standard `BinaryHeap` does not support ordered iteration. `into_sorted_vec`
sorts the internal array, which is `O(n log n)`.

## What a heap is not

A heap is not a binary search tree. A BST keeps every left child smaller and
every right child larger, which supports ordered search, predecessor, and range
queries. A heap only promises the parent/child order.

For “the next task by due date”, a heap is enough. For “all tasks due next
week”, a `BTreeMap` (Day 93) or an ordered index is the right tool.

## The array behind the tree

A binary heap does not allocate nodes. It stores the values in a `Vec` and
treats the indices as a tree: the children of index `i` are `2i + 1` and
`2i + 2`, and the parent is `(i - 1) / 2`. The root is index 0, the largest
value in a max-heap.

Push appends the value, then sifts it up while it is larger than its parent. Pop
moves the last value to the root, shrinks the vector, and sifts the value down
while a child is larger. Both operations touch one path from root to leaf, which
is why they are `O(log n)`. The array is contiguous, so the pointer chasing that
hurts a linked tree does not apply.

A heap is not sorted. The array `[9, 5, 4, 1, 3]` is a valid max-heap, and so is
`[9, 4, 5, 1, 3]`; only the parent/child rule is fixed. Iterating the array
gives an arbitrary order, not a sorted one.

## In the app

The reference app has no priority queue yet; this is the shape it would use
for:

- the next-up task in the TUI;
- a background job scheduler with priorities;
- rate limiting with a token bucket (the next refill time);
- merging sorted result pages.

The database can also do it: `ORDER BY due LIMIT 1` with an index on `due`. The
heap is the in-memory version, useful when the data is already loaded or the
query is per request.

## If something went wrong

**The heap returns the largest, not the smallest.** `BinaryHeap` is a max-heap.
Wrap the value in `Reverse` for a min-heap.

**`Reverse<T>` needs `Ord`.** The inner type must implement `Ord`; floats do
not. Use a wrapper with a total order, or an integer representation.

**`top_k` returns duplicates.** Duplicates in the input are distinct values.
Deduplicate before the heap if the answer is a set.

**The result order is wrong.** A heap does not iterate in order. Sort the output,
or pop until empty.

**The scheduler panics on equal due days.** Derived `Ord` compares the title
too, so equal days are ordered. If the type has no tie-breaker, add one.

**The heap is slower than sorting a small list.** For small n, sort is simpler
and may be faster. The heap's advantage starts when n is large or items arrive
over time.

## Going deeper: the heap array

A binary heap is stored in an array: the children of index `i` are `2i + 1` and
`2i + 2`, and the parent is `(i - 1) / 2`. Push appends and **sifts up**,
swapping with the parent while the order is wrong. Pop moves the last value to
the root and **sifts down**. Both are `O(log n)` and both are cache-friendly:
the array is contiguous.

The next day moves from one tree to a graph: the dependency structure behind
scheduling.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 96: use a heap"
$ git tag dsa-06
```

<div class="day-tracker" data-day="96"></div>

---
title: "Day 91 — Complexity and measurement"
description: "Count the steps an algorithm takes, name the growth curve, and measure it with criterion — including the case where the compiler erases the loop. — Day 91 of 100 Days of Rust."
sidebar:
  order: 1
day: 91
---

**About 2 hours** · Data structures & algorithms, day 1 of 10.

**You'll be able to:**

- read O(1), O(log n), O(n), and O(n²) from the code;
- benchmark a function with `criterion`;
- spot an optimization that changed the measurement.

---

The todo app works. The last ten days ask a different question: **how does it
scale?** A list of ten tasks and a list of ten million behave differently, and
the difference is often the data structure, not the hardware.

Today we build a small crate for these experiments, count the steps in a few
functions, and measure them. The first measurement contains a surprise.

## A crate for the experiments

The DSA work lives in its own workspace member beside the app:

<!-- transcripts: authored -->
```text
rust-todo-app/
├── Cargo.toml
├── dsa/
│   ├── Cargo.toml
│   ├── benches/algorithms.rs
│   └── src/
│       ├── lib.rs
│       ├── complexity.rs
│       ├── vecs.rs
│       └── ...
```

The app and the crate share one lockfile and one toolchain. They are separate
packages because a benchmark should not be compiled into the server.

The reference `dsa` crate already contains all ten modules; the tags mark
reading milestones, not ten separate commits. Each day takes one module, reads
its tests, and asks you to copy the idea into your own crate.

<!-- verify: dsa/src/lib.rs at=day-91 -->
```rust title="dsa/src/lib.rs"
//! Data structures and algorithms for the last ten days of the book.

/// Complexity and measured growth.
pub mod complexity;
/// Graphs and traversal.
pub mod graphs;
/// Linked structures.
pub mod linked;
/// Hash and ordered maps.
pub mod maps;
/// Shortest paths and topological order.
pub mod paths;
/// Interview-shaped practice.
pub mod practice;
/// Sorting and searching.
pub mod sorting;
/// Stacks, queues, and deques.
pub mod stacks;
/// Trees and heaps.
pub mod trees;
/// Vectors and slices.
pub mod vecs;
```

All ten modules exist, but the next days take them one at a time. The tests are
the specification for each.

## Count the steps

Big-O is a way to describe how the work grows as the input grows. Start with a
function that halves a number until it reaches zero:

<!-- verify: dsa/src/complexity.rs at=day-91 -->
```rust title="dsa/src/complexity.rs"
/// Count how many times `n` can be halved before it reaches zero.
pub fn halving_steps(mut n: u64) -> u32 {
    let mut steps = 0;
    while n > 0 {
        n /= 2;
        steps += 1;
    }
    steps
}
```

For `n = 1024`, the loop runs eleven times: 1024, 512, 256, 128, 64, 32, 16, 8,
4, 2, 1. Doubling `n` adds one step. That is **logarithmic** growth, written
`O(log n)`. The base of the logarithm does not matter for Big-O: changing from
base 2 to base 10 changes the count by a constant factor.

The test pins the small cases:

<!-- verify: dsa/src/complexity.rs at=day-91 -->
```rust title="dsa/src/complexity.rs"
    #[test]
    fn halving_is_logarithmic() {
        assert_eq!(halving_steps(0), 0);
        assert_eq!(halving_steps(1), 1);
        assert_eq!(halving_steps(8), 4);
        assert_eq!(halving_steps(1024), 11);
    }
```

`halving_steps(0)` is zero because the loop never runs. The other values match
the count you can do on paper. A test is a cheap way to keep the definition
honest.

## Linear and quadratic

The next two functions are deliberately simple:

<!-- verify: dsa/src/complexity.rs at=day-91 -->
```rust title="dsa/src/complexity.rs"
/// Add every number from 1 to `n`; one step per number.
pub fn linear_sum(n: u64) -> u64 {
    let mut total = 0;
    for value in 1..=n {
        total += value;
    }
    total
}

/// The same sum, with `black_box` stopping the compiler from folding the loop.
pub fn linear_sum_opaque(n: u64) -> u64 {
    let mut total: u64 = 0;
    for value in 1..=n {
        total = total.wrapping_add(std::hint::black_box(value));
    }
    total
}

/// Count pairs with different parity; one step per pair.
pub fn quadratic_pairs(n: u64) -> u64 {
    let mut count = 0;
    for i in 0..n {
        for j in 0..n {
            if (i ^ j) & 1 == 1 {
                count += 1;
            }
        }
    }
    count
}
```

`linear_sum` runs once per number: `O(n)`. `quadratic_pairs` runs once per pair:
`O(n²)`. At `n = 10`, the second function does 100 comparisons; at `n = 10,000`,
it does 100 million. That is the difference a growth curve describes.

Both functions are correct at small sizes:

<!-- verify: dsa/src/complexity.rs at=day-91 -->
```rust title="dsa/src/complexity.rs"
    #[test]
    fn linear_and_quadratic_examples_agree() {
        assert_eq!(linear_sum(100), 5050);
        assert_eq!(linear_sum_opaque(100), 5050);
        assert_eq!(quadratic_pairs(10), 50);
    }
```

The `linear_sum_opaque` line refers to a second version we meet in a moment.
The extra name is there to keep the loop from being optimized away.

## Measure with criterion

Big-O describes the shape, not the constant. A `O(n)` function with a small
constant can beat a `O(log n)` function for the sizes you actually have. To see
the constants, measure.

`criterion` is the benchmark harness. Add it as a dev-dependency and declare the
benchmark:

<!-- verify: dsa/Cargo.toml at=day-91 -->
```toml title="dsa/Cargo.toml"
[dev-dependencies]
criterion = "0.5"

[[bench]]
name = "algorithms"
harness = false
```

The benchmark file:

<!-- verify: dsa/benches/algorithms.rs at=day-91 -->
```rust title="dsa/benches/algorithms.rs"
//! Criterion benchmarks for the DSA lessons.
//!
//! Run: cargo bench -p dsa --bench algorithms

use criterion::{Criterion, black_box, criterion_group, criterion_main};
use dsa::complexity::{halving_steps, linear_sum, linear_sum_opaque};
use dsa::linked::List;
use dsa::trees::top_k;
use dsa::vecs::growth_capacities;

fn bench_halving(c: &mut Criterion) {
    c.bench_function("halving_steps/1_000_000", |b| {
        b.iter(|| halving_steps(black_box(1_000_000)))
    });
}
```

Each `bench_function` gets a name and a closure. `b.iter` runs the closure many
times and measures the elapsed time. `black_box` hides the input from the
optimizer, so it cannot precompute the answer at compile time.

The rest of the file adds the other cases:

<!-- verify: dsa/benches/algorithms.rs at=day-91 -->
```rust title="dsa/benches/algorithms.rs"
fn bench_linear(c: &mut Criterion) {
    c.bench_function("linear_sum/1_000_000", |b| {
        b.iter(|| linear_sum(black_box(1_000_000)))
    });
}

fn bench_linear_opaque(c: &mut Criterion) {
    c.bench_function("linear_sum_opaque/1_000_000", |b| {
        b.iter(|| linear_sum_opaque(black_box(1_000_000)))
    });
}

fn bench_vec_growth(c: &mut Criterion) {
    c.bench_function("vec_growth/100_000", |b| {
        b.iter(|| growth_capacities(black_box(100_000)))
    });
}

fn bench_linked_push(c: &mut Criterion) {
    c.bench_function("linked_push/10_000", |b| {
        b.iter(|| {
            let mut list = List::default();
            for value in 0..10_000 {
                list.push(value);
            }
            list
        })
    });
}
```

Run the tests first, then the benchmarks:

```text
$ cargo test -p dsa
running 19 tests
test complexity::tests::halving_is_logarithmic ... ok
test complexity::tests::linear_and_quadratic_examples_agree ... ok
...
test vecs::tests::growth_is_geometric ... ok

test result: ok. 19 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

The benchmark:

```text
$ cargo bench -p dsa --bench algorithms
Benchmarking halving_steps/1_000_000
halving_steps/1_000_000 time:   [613.05 ps 623.95 ps 634.45 ps]
Benchmarking linear_sum/1_000_000
linear_sum/1_000_000    time:   [755.57 ps 793.84 ps 852.67 ps]
Benchmarking linear_sum_opaque/1_000_000
linear_sum_opaque/1_000_000
                        time:   [305.79 µs 313.17 µs 320.13 µs]
Benchmarking vec_growth/100_000
vec_growth/100_000      time:   [109.79 µs 113.13 µs 116.75 µs]
Benchmarking linked_push/10_000
linked_push/10_000      time:   [365.67 µs 379.06 µs 393.98 µs]
Benchmarking top_k/10_000/10
top_k/10_000/10         time:   [86.152 µs 86.823 µs 87.473 µs]
```

The number in brackets is the confidence interval: the middle value is the
estimate, the outer values bound the noise. Criterion also reports a change
against the previous run.

## The compiler erased the loop

Read the first two numbers again. A million additions in under a nanosecond is
impossible. The compiler recognized `linear_sum` as an arithmetic series and
replaced the loop with the closed form `n * (n + 1) / 2`. The benchmark measured
the formula.

That is not a bug in the benchmark; it is a fact about optimized code. The
`linear_sum_opaque` function adds `std::hint::black_box` inside the loop:

<!-- verify: dsa/src/complexity.rs at=day-91 -->
```rust title="dsa/src/complexity.rs"
/// The same sum, with `black_box` stopping the compiler from folding the loop.
pub fn linear_sum_opaque(n: u64) -> u64 {
    let mut total: u64 = 0;
    for value in 1..=n {
        total = total.wrapping_add(std::hint::black_box(value));
    }
    total
}
```

Its measured time is 313 microseconds — about 400,000 times slower than the
folded formula, and this is the number that reflects the loop. `halving_steps` is also
optimized into a bit-count operation, so its `623 ps` is the cost of the
formula, not the loop.

The lesson is not “optimizers lie.” The lesson is: **a benchmark measures the
code that actually runs**. If the number is suspicious, suspect that the
compiler removed the work. Inspect the generated assembly with
`cargo asm` or `objdump` when it matters.

## What the numbers mean

A few conclusions from the table:

- `vec_growth/100_000` takes 113 microseconds to push 100,000 values; the
  capacity doubles a handful of times, as the next day explains.
- `linked_push/10_000` takes 379 microseconds for 10,000 pushes. The linked list
  allocates one box per value and follows a pointer each time; the `Vec` is
  faster and smaller.
- `top_k/10_000/10` takes 87 microseconds to find the ten largest values in
  10,000. That is the heap lesson on Day 96.

These are measurements on one machine in one container. They are useful as
ratios and useless as absolute promises. Report the hardware, the toolchain,
and the input size with any number you publish.

## In the app

The same growth shapes appear in the todo app:

- Looking up a task by id in a `Vec` is `O(n)`; a `HashMap` index would be
  `O(1)`, at the cost of memory.
- A `BTreeMap` range query over due dates is `O(log n + k)` for `k` results.
- A SQL query with an index is roughly `O(log n)`; without one it is `O(n)`.
- The API's JSON encoding is `O(n)` in the number of tasks, so pagination
  changes the constant and the shape.

Big-O is the first question. The benchmark is the second. Neither replaces
reading the code.

## If something went wrong

**The benchmark is impossibly fast.** The compiler folded the work. Add
`black_box` around a value inside the loop, or inspect the assembly.

**The numbers jump between runs.** The machine is busy, the sample is short, or
the benchmark allocates. Use a quiet machine, a longer measurement, and the
confidence interval.

**`cargo bench` fails with a missing harness.** The `[[bench]]` section needs
`harness = false` for criterion.

**The workspace does not see `dsa`.** Add `members = ["dsa"]` to the root
`Cargo.toml` and `resolver = "3"`.

**The benchmark does not compile with `black_box`.** Criterion's re-export
changed between versions. Import `std::hint::black_box` if the criterion one is
missing.

**A test in another module fails while benchmarking.** Benchmarks build the
whole crate in release mode; a test-only failure is unrelated. Run
`cargo test -p dsa` to see it.

## Going deeper: amortized cost

A `Vec` push is `O(1)` **amortized**: most pushes are cheap, and the occasional
reallocation is expensive. Spread over many pushes, the average is constant.
The next day looks at the growth directly.

`O(log n)` is fast enough that the base rarely matters. `O(n²)` is the one to
watch: doubling the input quadruples the work. When a query feels slow, the
first question is “what is its shape?”, and the second is “what is the constant
on this data?”.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 91: measure complexity"
$ git tag dsa-01
```

The tag names the first milestone of the DSA track. The next day goes
underneath `Vec`: the buffer, the length, and the capacity.

<div class="day-tracker" data-day="91"></div>

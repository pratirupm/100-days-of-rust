---
title: Data structures & algorithms
description: "Ten days of data structures and algorithms in Rust — complexity, vectors, maps, stacks, trees, graphs, shortest paths, sorting, and interview-shaped practice, measured with criterion."
sidebar:
  label: Overview
  order: 0
---

Ten days on data structures and algorithms — in Rust, and in the book's own
style: write the test, measure the claim, and keep what the numbers support.

The first sixty days already laid the groundwork: `Vec`, `HashMap`,
`BTreeMap`, iterators, ownership, and benchmarks. These ten go underneath
them and tie the structures back to the app wherever they fit.

## The working shape

- **Cost, measured** — Big-O in one hand and `criterion` in the other:
  growth curves, allocations, and why the constant matters.
- **Vectors and slices, underneath** — how they grow, when they copy, and
  what a reallocation costs.
- **Maps** — `HashMap` hashing and collisions; `BTreeMap` ordering and range
  queries; the due-date index the app can actually use.
- **Stacks, queues, and deques** — undo history and the next-up queue.
- **Linked structures in Rust** — `Box`, `Rc`, and `RefCell`, and why the
  obvious linked list is not the obvious choice here.
- **Trees and heaps** — a task priority queue and the shapes behind it.
- **Graphs** — BFS, DFS, and the task dependency graph.
- **Shortest paths and topological sort** — scheduling tasks in a valid order.
- **Sorting and searching** — the classics, measured against Rust's own
  `sort` and `binary_search`.
- **Practice, the interview-shaped kind** — ten problems solved and tested in
  Rust, not in pseudocode.

## The days

- [91 — Complexity and measurement](/100-days-of-rust/days/day-91/)
- [92 — Vectors and slices underneath](/100-days-of-rust/days/day-92/)
- [93 — Hash and ordered maps](/100-days-of-rust/days/day-93/)
- [94 — Stacks, queues, and deques](/100-days-of-rust/days/day-94/)
- [95 — Linked structures in Rust](/100-days-of-rust/days/day-95/)
- [96 — Trees and heaps](/100-days-of-rust/days/day-96/)
- [97 — Graphs: BFS and DFS](/100-days-of-rust/days/day-97/)
- [98 — Shortest paths and topological sort](/100-days-of-rust/days/day-98/)
- [99 — Sorting and searching](/100-days-of-rust/days/day-99/)
- [100 — Interview-shaped practice](/100-days-of-rust/days/day-100/)

All ten days are written, with tests and benchmarks in the `dsa` crate. The
reference crate is complete from the start; the days are reading milestones,
and the tags are milestones for your own copy, not ten separate commits.

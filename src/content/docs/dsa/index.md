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

This is a working list; it firms up as the days are written.

---
title: "Day 97 — Graphs: BFS and DFS"
description: "Model tasks that depend on other tasks, traverse the graph breadth-first and depth-first, and keep the visited set honest. — Day 97 of 100 Days of Rust."
sidebar:
  hidden: true
day: 97
---

**About 2 hours** · Data structures & algorithms, day 7 of 10.

**You'll be able to:**

- represent a graph as an adjacency list;
- traverse with a queue and with recursion;
- avoid cycles with a visited set.

---

A tree has one path between any two nodes. A graph can have many, and it can
have cycles. Tasks that depend on other tasks form a graph: “write the report”
needs “collect the numbers”, which needs “export the data”.

Today we build the adjacency list and traverse it two ways.

## The representation

<!-- verify: dsa/src/graphs.rs at=day-97 -->
```rust title="dsa/src/graphs.rs"
use std::collections::{HashMap, HashSet, VecDeque};

/// An adjacency list keyed by node id.
pub type Graph = HashMap<u32, Vec<u32>>;
```

Each key is a node; its value is the list of neighbors. The graph is directed
if you add an edge in one direction only. An undirected graph adds both
directions, or a separate `add_edge` helper does it.

An adjacency list uses `O(V + E)` space: one entry per vertex plus one entry per
edge. An adjacency matrix uses `O(V²)` and is better for dense graphs or
constant-time edge checks. The todo dependency graph is sparse; the list wins.

## Breadth-first

Breadth-first search visits every neighbor before moving deeper. A queue makes
that order natural:

<!-- verify: dsa/src/graphs.rs at=day-97 -->
```rust title="dsa/src/graphs.rs"
/// Breadth-first traversal from `start`.
pub fn bfs(graph: &Graph, start: u32) -> Vec<u32> {
    let mut seen = HashSet::new();
    let mut queue = VecDeque::new();
    let mut order = Vec::new();
    seen.insert(start);
    queue.push_back(start);

    while let Some(node) = queue.pop_front() {
        order.push(node);
        if let Some(neighbors) = graph.get(&node) {
            for next in neighbors {
                if seen.insert(*next) {
                    queue.push_back(*next);
                }
            }
        }
    }
    order
}
```

The visited set is updated **when a node is enqueued**, not when it is dequeued.
That is what prevents the same node from being queued twice by two neighbors. If
you mark on dequeue, a node can be in the queue several times and the traversal
still terminates, but the work is larger.

BFS is `O(V + E)` with a good hash. It finds the shortest path in an unweighted
graph: the first time it reaches a node is the fewest edges away.

## Depth-first

Depth-first search follows one neighbor as far as it can, then backtracks:

<!-- verify: dsa/src/graphs.rs at=day-97 -->
```rust title="dsa/src/graphs.rs"
/// Depth-first traversal from `start`.
pub fn dfs(graph: &Graph, start: u32) -> Vec<u32> {
    fn visit(graph: &Graph, node: u32, seen: &mut HashSet<u32>, order: &mut Vec<u32>) {
        if !seen.insert(node) {
            return;
        }
        order.push(node);
        if let Some(neighbors) = graph.get(&node) {
            for next in neighbors {
                visit(graph, *next, seen, order);
            }
        }
    }
    let mut seen = HashSet::new();
    let mut order = Vec::new();
    visit(graph, start, &mut seen, &mut order);
    order
}
```

The recursive helper carries the visited set and the output. `seen.insert(node)`
returns `false` when the node was already there, so the `if !` is the base case
that stops a cycle.

A recursive DFS uses the call stack; a graph with a long chain can overflow it.
An explicit `Vec` stack is the iterative version. The standard library does not
guarantee tail-call optimization, so do not rely on it.

## The test

<!-- verify: dsa/src/graphs.rs at=day-97 -->
```rust title="dsa/src/graphs.rs"
    fn graph() -> Graph {
        Graph::from([(1, vec![2, 3]), (2, vec![4]), (3, vec![4]), (4, vec![])])
    }

    #[test]
    fn traversals_visit_each_node_once() {
        let graph = graph();
        assert_eq!(bfs(&graph, 1), vec![1, 2, 3, 4]);
        assert_eq!(dfs(&graph, 1), vec![1, 2, 4, 3]);
    }
```

BFS visits 1, then its neighbors 2 and 3, then 4. DFS visits 1, 2, 4, then
backtracks to 3. Both orders are valid traversals; the test pins the one the
implementation produces.

The hash map's iteration order does not affect these results because every
neighbor list is a vector with a fixed order.

## Cycles

A cycle is a path that returns to its start. The visited set handles it: the
second visit returns immediately. The traversal still visits each node once.

A graph with a cycle is not a tree, and a topological sort (Day 98) cannot order
it. Detecting the cycle is a separate question: a DFS with three colors (white,
gray, black) finds a back edge, and an indegree count that never reaches zero
does the same for Kahn's algorithm.

## Connected components

A traversal from one node reaches one connected component. To cover every node,
run the traversal again from each unvisited key:

```rust
fn components(graph: &Graph) -> Vec<Vec<u32>> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for node in graph.keys() {
        if seen.contains(node) {
            continue;
        }
        let component = bfs(graph, *node)
            .into_iter()
            .filter(|id| seen.insert(*id))
            .collect();
        result.push(component);
    }
    result
}
```

The `bfs` call also inserts into a local visited set, so the filter against the
outer set is what prevents a node from appearing in two components. Each node
and edge is visited once, so the whole pass is `O(V + E)`.

The same shape answers “are these two tasks in the same project?”: traverse from
one and check whether the other appears. For repeated queries, precompute the
component id per node once and compare ids in `O(1)`.

## In the app

The dependency graph is directed: an edge from `a` to `b` means “a needs b”.
The app can use it to:

- show a task's blocked-by list;
- compute which tasks are ready to start;
- detect a cycle before saving a dependency;
- order a project plan.

The graph is small enough for an adjacency list in memory. A database schema
for it is two columns (`task_id`, `depends_on`) with an index on each direction;
the traversal happens in the application or in a recursive SQL query.

## If something went wrong

**The traversal never ends.** The visited set is missing or not updated before
enqueueing. Check `seen.insert` in both functions.

**A node is visited twice.** The graph has the same neighbor listed twice, or
the visited check is on the wrong side of the push. Deduplicate edges or mark on
enqueue.

**DFS overflows the stack.** The graph is a long chain. Use an explicit stack,
or increase the thread's stack size for a controlled job.

**The order is different from the test.** Neighbor order comes from the vector.
A different insertion order changes the traversal; that is expected. The test
pins this graph's order.

**`Graph` does not include a node with no neighbors.** A key with an empty
vector represents it. If the node is missing entirely, the traversal starts
elsewhere and never sees it.

**BFS is not the shortest path.** BFS is shortest in edges, not in weight. For
weights, use Dijkstra (Day 98).

## Going deeper: implicit graphs

A graph does not need an explicit adjacency list. A maze is a grid where each
cell's neighbors are up, down, left, and right. A word ladder is a graph where
two words are adjacent if they differ by one letter. BFS over the implicit graph
is the same algorithm with a neighbor function instead of a `Vec`.

The next day adds weights and order: shortest paths and topological sort.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 97: traverse a graph"
$ git tag dsa-07
```

<div class="day-tracker" data-day="97"></div>

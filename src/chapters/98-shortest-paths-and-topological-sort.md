---
title: Shortest paths and topological sort
day: 98
part: DSA
partName: Data structures & algorithms
partDay: 8
partDays: 10
time: "2.5 hours"
description: Order a dependency graph with Kahn's algorithm, reject cycles, and find weighted shortest paths with Dijkstra.
bullets:
  - track indegrees and peel ready nodes;
  - detect a cycle when the order is short;
  - run Dijkstra with a min-heap.
---

The dependency graph from yesterday has a direction: “write the report” needs
“collect the numbers”. A valid schedule is an order where every task comes after
the tasks it depends on. That is a **topological sort**.

A different question is “what is the cheapest way from here to there?” when the
edges have weights. That is a **shortest path**.

## Kahn's algorithm

<!-- verify: dsa/src/paths.rs at=day-98 -->
```rust title="dsa/src/paths.rs"
/// Kahn's topological sort; `None` when the graph has a cycle.
pub fn topological_sort(graph: &Graph) -> Option<Vec<u32>> {
    let mut indegree: HashMap<u32, usize> = HashMap::new();
    for node in graph.keys() {
        indegree.entry(*node).or_insert(0);
    }
    for neighbors in graph.values() {
        for next in neighbors {
            *indegree.entry(*next).or_insert(0) += 1;
        }
    }

    let mut ready: Vec<u32> = indegree
        .iter()
        .filter(|(_, degree)| **degree == 0)
        .map(|(node, _)| *node)
        .collect();
    ready.sort();
    let mut order = Vec::new();

    while let Some(node) = ready.pop() {
        order.push(node);
        if let Some(neighbors) = graph.get(&node) {
            for next in neighbors {
                let degree = indegree.get_mut(next)?;
                *degree -= 1;
                if *degree == 0 {
                    ready.push(*next);
                }
            }
        }
    }

    if order.len() == indegree.len() {
        Some(order)
    } else {
        None
    }
}
```

The indegree of a node is the number of edges pointing at it, which is the
number of unfinished dependencies. A node with indegree zero is ready. Remove
it, decrement its neighbors, and add any neighbor that reaches zero.

If the graph has a cycle, the nodes in the cycle never reach zero, and the order
is shorter than the node count. The `None` is the cycle report.

The `ready` vector is used as a stack (`pop`), so among ready nodes the last one
added goes first. The initial `sort` makes the starting order deterministic,
but the full order is not sorted. If the output must be lexicographically
smallest, use a `BinaryHeap<Reverse<u32>>` as the ready set.

The `?` on `indegree.get_mut(next)` returns `None` if a neighbor was not a key.
That is a malformed graph: every node should be a key, even with an empty
neighbor list. Building the indegree map from keys first makes it so.

## The tests

<!-- verify: dsa/src/paths.rs at=day-98 -->
```rust title="dsa/src/paths.rs"
    #[test]
    fn orders_a_dag() {
        let graph = Graph::from([(1, vec![2]), (2, vec![3]), (3, vec![])]);
        assert_eq!(topological_sort(&graph), Some(vec![1, 2, 3]));
    }

    #[test]
    fn rejects_a_cycle() {
        let graph = Graph::from([(1, vec![2]), (2, vec![1])]);
        assert_eq!(topological_sort(&graph), None);
    }
```

A directed acyclic graph (DAG) has at least one valid order. A two-node cycle
has none. The test names both outcomes; a caller cannot forget the `None`.

## Dijkstra

When edges have weights, the shortest path is not the fewest edges. Dijkstra
keeps the best known distance to each node and always expands the closest one:

<!-- verify: dsa/src/paths.rs at=day-98 -->
```rust title="dsa/src/paths.rs"
/// Dijkstra's shortest paths from `start`; edges are `(to, weight)`.
pub fn dijkstra(graph: &HashMap<u32, Vec<(u32, u32)>>, start: u32) -> HashMap<u32, u32> {
    let mut distances = HashMap::new();
    let mut heap = BinaryHeap::new();
    distances.insert(start, 0);
    heap.push(Reverse((0, start)));

    while let Some(Reverse((distance, node))) = heap.pop() {
        if distance > *distances.get(&node).unwrap_or(&u32::MAX) {
            continue;
        }
        if let Some(neighbors) = graph.get(&node) {
            for (next, weight) in neighbors {
                let candidate = distance + weight;
                if candidate < *distances.get(next).unwrap_or(&u32::MAX) {
                    distances.insert(*next, candidate);
                    heap.push(Reverse((candidate, *next)));
                }
            }
        }
    }
    distances
}
```

The heap holds `(distance, node)` pairs, ordered by distance because `Reverse`
makes the smallest distance the greatest priority. When a pair is popped, it may
be stale — a shorter path was found after it was pushed. The `distance >` check
skips stale entries instead of reprocessing them.

Dijkstra requires non-negative weights. A negative edge can make a “final”
distance wrong; use Bellman-Ford for that case. The app's edges are durations or
priorities, both non-negative.

## The critical path

A project plan asks for the earliest finish time, not just a valid order. Give
each task a duration and compute the longest path through the DAG: a task can
start only after every dependency finishes, so its finish time is its duration
plus the maximum finish time of its dependencies.

Process the tasks in topological order and keep `finish[task]`. For each task,
look at its incoming edges, take the maximum finish of the sources, add the
duration, and store it. The answer is the maximum value in `finish`. The pass is
`O(V + E)`, because the topological order gives each edge exactly one direction
to relax.

A negative duration would make the problem ill-posed; a cycle would make it
infinite. The topological sort rejects the cycle first, which is why the two
algorithms belong in the same lesson.

## The test

<!-- verify: dsa/src/paths.rs at=day-98 -->
```rust title="dsa/src/paths.rs"
    #[test]
    fn finds_shortest_paths() {
        let graph = HashMap::from([(1, vec![(2, 1), (3, 4)]), (2, vec![(3, 2)]), (3, vec![])]);
        let distances = dijkstra(&graph, 1);
        assert_eq!(distances.get(&3), Some(&3));
    }
```

The direct edge 1→3 costs 4; the path 1→2→3 costs 1 + 2 = 3. The test checks
the cheaper path, not the direct edge.

## In the app

A task dependency graph answers two questions:

- **What order can I do this in?** Topological sort.
- **What is the critical path?** The longest path through the weighted DAG, or
  the shortest if the weights are durations and you want the earliest finish.

The app can store dependencies in a `task_dependencies` table and build the
graph on demand. The graph is small; an in-memory pass is cheaper than a
recursive SQL query for a single project.

A cycle in the dependency table must be rejected at write time, not discovered
during a schedule. The topological sort is the check.

## If something went wrong

**The sort returns fewer nodes than the graph has.** There is a cycle, or a node
is missing as a key. The `None` is correct for a cycle; add the missing keys for
the second case.

**The order is not what you expected.** `ready.pop()` is LIFO. The order is
valid, not sorted. Use a min-heap for the lexicographically smallest order.

**Dijkstra returns a distance that is too high.** A negative edge, or the stale
check is missing. Without the check, the algorithm still terminates but does
more work; with negative edges, it can be wrong.

**The heap is huge.** Dijkstra pushes a pair per improvement, not per node. On a
dense graph that is many entries. A decrease-key heap is the alternative; the
standard `BinaryHeap` has no decrease-key.

**The graph has a node with no outgoing edges.** It is a key with an empty
vector. Without the key, the indegree map may not contain it.

**The weighted graph is undirected.** Add both directions with the same weight.
Otherwise the path back does not exist.

## Going deeper: A* and longest paths

A* is Dijkstra with a heuristic: it prefers nodes that look closer to the goal.
With an admissible heuristic, it finds the same shortest path and expands fewer
nodes. A map with coordinates is the classic case.

The longest path in a DAG is the shortest path with negated weights, or a
topological dynamic program. It is the critical path in a project plan; cycles
make it infinite.

The next day compares sorting algorithms and binary search, the last of the
classic toolbox before the practice set.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 98: order and shorten paths"
$ git tag dsa-08
```

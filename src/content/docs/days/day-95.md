---
title: "Day 95 — Linked structures in Rust"
description: "Build a singly linked list with `Box` and `Option`, then measure why the obvious structure is rarely the right default in Rust. — Day 95 of 100 Days of Rust."
sidebar:
  order: 5
day: 95
---

**About 2 hours** · Data structures & algorithms, day 5 of 10.

**You'll be able to:**

- give a recursive node a fixed size with `Box`;
- move values in and out with `Option::take`;
- weigh pointer chasing against a contiguous vector.

---

A linked list is the first data structure many courses teach: each node holds a
value and a pointer to the next. In Rust, the pointer has an owner, and that
changes the shape of the code.

Today we build one, then measure it against a `Vec`.

## A node needs a size

A struct cannot contain itself directly:

```rust
struct Node<T> {
    value: T,
    next: Node<T>, // error: recursive type has infinite size
}
```

The size of `Node` would depend on the size of `Node`, forever. `Box<Node<T>>`
breaks the cycle: a box is one pointer-sized word, and the node lives on the
heap. The size is known at compile time.

`Option<Box<Node<T>>>` adds the empty case without a null pointer. `None` is the
end of the list; `Some(box)` points at the next node.

## The list

<!-- verify: dsa/src/linked.rs at=day-95 -->
```rust title="dsa/src/linked.rs"
/// A singly linked list. The `Box` gives the recursive node a fixed size.
#[derive(Debug, Default)]
pub struct List<T> {
    head: Option<Box<Node<T>>>,
    len: usize,
}

#[derive(Debug)]
struct Node<T> {
    value: T,
    next: Option<Box<Node<T>>>,
}
```

The list owns the head; the head owns the next node; and so on. Dropping the
list drops the head, which drops the next, recursively — an iterative drop is a
later optimization for very long lists.

`len` is tracked separately. Walking the list to count is `O(n)`; the field makes
it `O(1)` at the cost of keeping it correct.

## Push and pop

<!-- verify: dsa/src/linked.rs at=day-95 -->
```rust title="dsa/src/linked.rs"
impl<T> List<T> {
    /// Push a value on the front.
    pub fn push(&mut self, value: T) {
        let node = Box::new(Node {
            value,
            next: self.head.take(),
        });
        self.head = Some(node);
        self.len += 1;
    }

    /// Pop the front value.
    pub fn pop(&mut self) -> Option<T> {
        let node = self.head.take()?;
        self.head = node.next;
        self.len -= 1;
        Some(node.value)
    }

    /// Number of values.
    pub fn len(&self) -> usize {
        self.len
    }

    /// Whether the list is empty.
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
}
```

`self.head.take()` moves the old head out and leaves `None` in its place. That
is the ownership-friendly swap: the new node takes the old head as its `next`,
and the field is free to receive the new node.

`pop` takes the head, moves its `next` back into `self.head`, and returns the
value. The `?` returns `None` when the list is empty. No clone, no copy of the
value.

The test:

<!-- verify: dsa/src/linked.rs at=day-95 -->
```rust title="dsa/src/linked.rs"
    #[test]
    fn push_and_pop() {
        let mut list = List::default();
        list.push(1);
        list.push(2);
        assert_eq!(list.len(), 2);
        assert_eq!(list.pop(), Some(2));
        assert_eq!(list.pop(), Some(1));
        assert_eq!(list.pop(), None);
        assert!(list.is_empty());
    }
```

Push puts 2 in front of 1, so pop returns 2 first. That is a stack, built from
nodes instead of a vector.

## The cost

The benchmark from Day 91 compared 10,000 pushes:

<!-- transcripts: authored -->
```text
linked_push/10_000      time:   [365.67 µs 379.06 µs 393.98 µs]
vec_growth/100_000      time:   [109.79 µs 113.13 µs 116.75 µs]
```

The `Vec` pushed 100,000 values in a third of the time the list took for 10,000.
Three reasons:

- **Allocation per node.** Every push calls the allocator; the vector allocates
  a handful of buffers.
- **Pointer chasing.** Reading the next node is a dependent memory load; the
  CPU cannot prefetch the chain like it prefetches an array.
- **Cache locality.** A vector's values sit next to each other; a list's nodes
  are scattered across the heap.

A linked list is `O(1)` per push at the head, and so is a vector. The constant is
the difference, and the benchmark makes it visible.

## When a linked structure wins

- **Splicing** — moving a whole sublist between lists is pointer work, not a
  copy. A vector would shift or copy.
- **Stable addresses** — a node does not move when the list grows. A `Vec` may
  reallocate and move every value.
- **Intrusive data** — a node embedded in a larger object can be on several
  lists at once without a separate allocation for the value.
- **Concurrent lock-free structures** — a linked queue can swap pointers
  atomically; a vector's reallocation cannot.

For a todo app, none of these is the default case. The `Vec` is simpler, faster,
and easier to serialize.

## `Rc` and `RefCell`

A singly linked list has one owner per node. A doubly linked list or a graph
needs shared ownership:

```rust
type Link<T> = Option<Rc<RefCell<Node<T>>>>;
```

`Rc` shares ownership on one thread; `RefCell` allows mutation through a shared
reference and checks borrows at runtime. The combination is a common first
attempt at a doubly linked list — and a common source of reference cycles.

A cycle keeps the count above zero and leaks the nodes. The fixes are `Weak`
for the back pointer, an arena with indices, or a different structure. Each is
a deliberate trade, not a default.

`Rc` is not `Send`. A shared list across threads needs `Arc` and a lock (Day 27),
or a channel that moves ownership.

## In the app

The app uses vectors and maps, not linked lists. That is not an accident:

- the task list is read and serialized as a whole;
- the order is insertion order;
- the size is small;
- the API returns JSON arrays.

A linked list would add pointers to a structure that wants contiguity. The
production track occasionally needs a queue; `VecDeque` covers it without a
node per value.

## If something went wrong

**`recursive type has infinite size`.** Wrap the recursive field in `Box`,
`Rc`, or a reference. A reference needs a lifetime and an owner elsewhere.

**`cannot move out of borrowed content`.** You are trying to take a node out of
a `&` reference. Use `Option::take` on an owned `Option`, or clone if the value
is cloneable.

**`borrow of moved value`.** The node's value moved when the box was dropped.
Destructure the box and take the fields in the right order.

**The list leaks.** A cycle of `Rc` nodes. Use `Weak` for one direction, or an
arena.

**`Rc` cannot be sent between threads.** Use `Arc`; `Rc`'s count is not atomic.

**The list is slower than a vector.** It usually is. Measure before choosing it;
the pointer structure must earn its cost.

## Going deeper: an arena

An arena stores nodes in a `Vec` and links them by index:

```rust
struct Arena<T> {
    nodes: Vec<Node<T>>,
    free: Vec<usize>,
}

struct Node<T> {
    value: T,
    next: Option<usize>,
}
```

The nodes are contiguous, the indices are `Copy`, and a removed node can go on a
free list. It is a linked structure with a vector's locality — and the usual
choice when a graph or a tree needs stable ids without `Rc`.

The next day uses a heap: the structure that keeps the largest or smallest item
on top.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 95: build a linked list"
$ git tag dsa-05
```

<div class="day-tracker" data-day="95"></div>

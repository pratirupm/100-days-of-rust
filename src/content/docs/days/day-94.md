---
title: "Day 94 — Stacks, queues, and deques"
description: "Use a stack for the most recent change, a queue for the next thing to do, and a deque when both ends are busy. — Day 94 of 100 Days of Rust."
sidebar:
  order: 4
day: 94
---

**About 2 hours** · Data structures & algorithms, day 4 of 10.

**You'll be able to:**

- push and pop a stack in O(1);
- build a queue with `VecDeque`;
- recognise where LIFO and FIFO belong in the app.

---

Two of the most useful structures are also the simplest. A **stack** adds and
removes at one end: last in, first out. A **queue** adds at one end and removes
at the other: first in, first out.

The app has a use for both: undo history is a stack; the next-up list is a
queue.

## A stack is a `Vec`

`Vec::push` and `Vec::pop` both work at the end, so a `Vec<T>` **is** a stack.
The fix is the whole trick: append and remove from the same end.

A classic stack problem is bracket matching:

<!-- verify: dsa/src/stacks.rs at=day-94 -->
```rust title="dsa/src/stacks.rs"
/// Check that brackets are balanced.
pub fn is_balanced(text: &str) -> bool {
    let mut stack = Vec::new();
    for ch in text.chars() {
        match ch {
            '(' | '[' | '{' => stack.push(ch),
            ')' | ']' | '}' => {
                let expected = match ch {
                    ')' => '(',
                    ']' => '[',
                    _ => '{',
                };
                if stack.pop() != Some(expected) {
                    return false;
                }
            }
            _ => {}
        }
    }
    stack.is_empty()
}
```

Each opening bracket is pushed. A closing bracket must match the most recent
opening bracket, so it pops and compares. If the stack is empty on a close, the
input has too many closers; if it is non-empty at the end, it has too few.

The algorithm is `O(n)` in the length of the text, and the stack holds at most
one entry per opening bracket. It is the same shape as parsing nested JSON,
nested HTML, or nested function calls.

The test covers both directions:

<!-- verify: dsa/src/stacks.rs at=day-94 -->
```rust title="dsa/src/stacks.rs"
    #[test]
    fn brackets_and_queue() {
        assert!(is_balanced("([{}])"));
        assert!(!is_balanced("([)]"));
        assert!(!is_balanced("("));
```

`([)]` fails because the closing `)` sees `[` on top. `(` fails because the
stack is not empty at the end.

## A stack in the app

Undo is a stack of changes:

<!-- transcripts: authored -->
```text
done(1)      undo stack: [task 1 was pending]
done(2)      undo stack: [task 1 was pending, task 2 was pending]
undo         pops task 2's change and restores it
```

A stack is the right shape because the most recent change is the first thing
undone. A queue would undo the oldest change first, which is not what a person
expects.

The stack can be bounded: keep the last 100 changes, drop the oldest. A bounded
undo history protects memory at the cost of losing very old steps; that is a
product decision.

## A queue with `VecDeque`

A `Vec` is a poor queue: removing from the front shifts every other value, which
is `O(n)`. `VecDeque` is a **double-ended queue** backed by a ring buffer; push
and pop at either end are `O(1)` amortized.

<!-- verify: dsa/src/stacks.rs at=day-94 -->
```rust title="dsa/src/stacks.rs"
/// A queue built on a deque.
#[derive(Debug, Default)]
pub struct Queue<T> {
    items: VecDeque<T>,
}

impl<T> Queue<T> {
    pub fn push(&mut self, value: T) {
        self.items.push_back(value);
    }

    pub fn pop(&mut self) -> Option<T> {
        self.items.pop_front()
    }
}
```

`push_back` adds to the tail; `pop_front` removes from the head. `VecDeque`
keeps a head and tail index into the buffer and wraps around when it reaches the
end. When the buffer fills, it grows like a `Vec`.

The test:

<!-- verify: dsa/src/stacks.rs at=day-94 -->
```rust title="dsa/src/stacks.rs"
        let mut queue = Queue::default();
        queue.push(1);
        queue.push(2);
        assert_eq!(queue.pop(), Some(1));
        assert_eq!(queue.pop(), Some(2));
        assert_eq!(queue.pop(), None);
```

The first value pushed is the first popped. That is FIFO.

## Deques and both ends

`VecDeque` is also a stack: `push_back`/`pop_back` work at the tail. A deque is
useful for a sliding window, a work-stealing scheduler, or a browser history
where forward and back both move.

A priority queue is a different structure: the next item is the smallest or
largest, not the oldest. Day 96 covers the heap.

## A sliding window

A deque is also the tool for “the maximum of the last k values” in a stream. Keep
the candidates in a deque, largest at the front; when a new value arrives, pop
the smaller values from the back, because they can never be the maximum while
the new value is in the window. Then push the new value and drop the front if it
has left the window.

```rust
fn window_max(values: &[i32], k: usize) -> Vec<i32> {
    let mut window = std::collections::VecDeque::new();
    let mut result = Vec::new();
    for (index, value) in values.iter().enumerate() {
        while window.back().is_some_and(|(_, v)| v <= value) {
            window.pop_back();
        }
        window.push_back((index, *value));
        if window.front().is_some_and(|(i, _)| *i + k <= index) {
            window.pop_front();
        }
        if index + 1 >= k {
            result.push(window.front().unwrap().1);
        }
    }
    result
}
```

Every index enters and leaves the deque once, so the whole pass is `O(n)` — much
better than recomputing the maximum of each window in `O(nk)`. This is the same
“keep only what can still matter” idea as the monotonic stack.

## Choosing the structure

| Need | Structure | Cost |
| --- | --- | --- |
| Last in, first out | `Vec` | push/pop O(1) |
| First in, first out | `VecDeque` | push/pop O(1) |
| Both ends | `VecDeque` | O(1) at each end |
| Random access by index | `Vec` | O(1) |
| Next by priority | `BinaryHeap` | push/pop O(log n) |

The wrong choice is usually a front removal on a `Vec`: it works, it compiles,
and it quietly turns an `O(1)` loop into `O(n²)`.

## Queues in the app

The next-up list is a queue: new tasks are appended, and the oldest unfinished
task is shown first. The TUI could keep the queue in memory; the API can return
a page ordered by id.

A job queue is the same shape at a larger scale. The server accepts a job,
appends it to a queue, and a worker pops from the front. The queue decouples the
request latency from the job duration.

## If something went wrong

**Removing from the front of a `Vec` is slow.** That is the shift. Use
`VecDeque`.

**`VecDeque` indexing is slower than `Vec`.** The ring buffer wraps; indexing
does a modulo. Use it for ends, not for random access.

**The stack is unbounded.** A malicious input with a million opening brackets
grows the stack. Bound the input or the stack.

**`is_balanced` accepts an empty string.** It does, and that is correct: no
brackets are unbalanced.

**The queue pops in the wrong order.** `push_back` with `pop_back` is LIFO.
Use `pop_front` for FIFO.

**A `VecDeque` capacity is not the length.** Same as `Vec`: capacity is
allocated slots. Use `len()` for the number of values.

## Going deeper: ring buffers

A ring buffer stores the head index and the length. A push writes at
`(head + len) % cap`; a pop reads at `head` and advances it. No value moves. The
modulo is why indexing is slightly more expensive than a `Vec`, and why the
structure is ideal for a stream with a fixed window.

The next day looks at linked structures, the other way to avoid moving values.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 94: use stacks and queues"
$ git tag dsa-04
```

<div class="day-tracker" data-day="94"></div>

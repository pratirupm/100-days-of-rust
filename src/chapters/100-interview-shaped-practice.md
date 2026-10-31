---
title: Interview-shaped practice
day: 100
part: DSA
partName: Data structures & algorithms
partDay: 10
partDays: 10
time: "3 hours"
description: Ten small problems in Rust — pairs, subarrays, strings, intervals, groups, prefixes, zeros, and a majority — each with a test and a complexity note.
bullets:
  - solve ten classic problems in real Rust;
  - state the time and space cost of each;
  - finish the book with a tested crate.
---

The last day is a set of small problems in the shape of an interview: a
description, an example, a solution, a test, and a cost. They use the tools from
the last nine days — maps, two pointers, sorting, heaps, and dynamic
programming.

Ten problems, one file.

## 1. Two sum

Return the indices of two values that add to a target:

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Return the indices of two values that sum to `target`.
pub fn two_sum(values: &[i32], target: i32) -> Option<(usize, usize)> {
    let mut seen = HashMap::new();
    for (index, value) in values.iter().enumerate() {
        let need = target - value;
        if let Some(other) = seen.get(&need) {
            return Some((*other, index));
        }
        seen.insert(*value, index);
    }
    None
}
```

One pass, a map from value to index. For each value, check whether its
complement was seen earlier. `O(n)` time, `O(n)` space. The pair is returned in
input order: the earlier index first.

The brute-force version is two nested loops, `O(n²)`. The map trades memory for
speed — the central trade of the book.

## 2. Maximum subarray

The largest sum of a contiguous slice, by Kadane's algorithm:

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Maximum sum of a contiguous subarray (Kadane).
pub fn max_subarray(values: &[i32]) -> i32 {
    let mut best = values[0];
    let mut current = values[0];
    for value in &values[1..] {
        current = (*value).max(current + value);
        best = best.max(current);
    }
    best
}
```

At each position, the best subarray ending here is either the value alone or the
previous best plus the value. `best` remembers the maximum seen. `O(n)` time,
`O(1)` space. The function assumes a non-empty slice; an empty input would
panic on `values[0]`.

## 3. Palindrome

Ignore case and punctuation, then compare from both ends:

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// True when the letters read the same in both directions.
pub fn is_palindrome(text: &str) -> bool {
    let chars: Vec<char> = text
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect();
    let mut left = 0;
    let mut right = chars.len().saturating_sub(1);
    while left < right {
        if chars[left] != chars[right] {
            return false;
        }
        left += 1;
        right -= 1;
    }
    true
}
```

`flat_map` handles characters whose lowercase is more than one `char`. The two
pointers close in from both ends. `O(n)` time, `O(n)` space for the cleaned
characters. An in-place version over the original string avoids the allocation
but is more code.

## 4. Reverse the words

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Reverse the order of words in a sentence.
pub fn reverse_words(text: &str) -> String {
    text.split_whitespace().rev().collect::<Vec<_>>().join(" ")
}
```

`split_whitespace` collapses runs of spaces; `rev` reverses the iterator;
`join` rebuilds the sentence. `O(n)` time and space. The output has single
spaces, which is usually what a display wants and never what a byte-for-byte
copy wants.

## 5. Climbing stairs

How many ways to reach step `n` with one- or two-step moves:

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Number of ways to climb `n` stairs, one or two steps at a time.
pub fn climbing_stairs(n: u32) -> u64 {
    let (mut a, mut b) = (1u64, 1u64);
    for _ in 0..n {
        let next = a + b;
        a = b;
        b = next;
    }
    a
}
```

This is Fibonacci with a different starting point. Two variables hold the last
two values; the loop is `O(n)` time and `O(1)` space. `u64` overflows around
`n = 93`; the return type makes the limit explicit.

The naive recursive version is `O(2^n)` because it recomputes the same
subproblems. Memoization or the two-variable loop is the fix.

## 6. Merge intervals

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Merge overlapping intervals, sorted by start.
pub fn merge_intervals(mut intervals: Vec<(i32, i32)>) -> Vec<(i32, i32)> {
    intervals.sort_unstable();
    let mut merged: Vec<(i32, i32)> = Vec::new();
    for (start, end) in intervals {
        match merged.last_mut() {
            Some((_, last_end)) if start <= *last_end => {
                *last_end = (*last_end).max(end);
            }
            _ => merged.push((start, end)),
        }
    }
    merged
}
```

Sort by start, then extend the last interval or push a new one. `O(n log n)` for
the sort, `O(n)` for the scan, `O(n)` for the output. The sort is the dominant
cost; the merge is linear.

The overlap test is `start <= last_end`, so touching intervals merge. Change it
to `<` if a shared endpoint should stay separate.

## 7. Group anagrams

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Group words that are anagrams of one another.
pub fn group_anagrams(words: &[&str]) -> Vec<Vec<String>> {
    let mut groups: HashMap<String, Vec<String>> = HashMap::new();
    for word in words {
        let mut key: Vec<char> = word.chars().collect();
        key.sort_unstable();
        groups
            .entry(key.into_iter().collect())
            .or_default()
            .push((*word).to_string());
    }
    let mut result: Vec<Vec<String>> = groups.into_values().collect();
    for group in &mut result {
        group.sort();
    }
    result.sort();
    result
}
```

The key is the sorted characters of the word: anagrams share it. `O(n * k log
k)` time for `n` words of length `k`, plus the sorting for deterministic output.
Without the final sorts, the group order would depend on the hash map's
iteration order.

## 8. Longest common prefix

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Longest common prefix of a list of strings.
pub fn longest_common_prefix(words: &[&str]) -> String {
    let Some(first) = words.first() else {
        return String::new();
    };
    let mut end = first.len();
    for word in &words[1..] {
        end = end.min(word.len());
        while end > 0 && first.as_bytes()[..end] != word.as_bytes()[..end] {
            end -= 1;
        }
    }
    first[..end].to_string()
}
```

Start with the first word's full length, then shrink it against every other
word. `O(n * k)` worst case, `O(1)` extra space. Slicing bytes is safe here
because the comparisons only shrink at byte boundaries; a multi-byte character
that shares a prefix with another is still a valid boundary.

## 9. Move zeroes

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Move every zero to the end, keeping the order of the rest.
pub fn move_zeroes(values: &mut [i32]) {
    let mut write = 0;
    for read in 0..values.len() {
        if values[read] != 0 {
            values.swap(write, read);
            write += 1;
        }
    }
}
```

Two pointers: `read` scans, `write` marks the next non-zero slot. Swapping keeps
the non-zero order and pushes zeros right. `O(n)` time, `O(1)` space.

## 10. Majority element

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
/// Majority element, or `None` when no value appears more than half the time.
pub fn majority_element(values: &[i32]) -> Option<i32> {
    let mut candidate = 0;
    let mut count = 0;
    for value in values {
        if count == 0 {
            candidate = *value;
        }
        count += if *value == candidate { 1 } else { -1 };
    }
    let occurrences = values.iter().filter(|value| **value == candidate).count();
    (occurrences * 2 > values.len()).then_some(candidate)
}
```

Boyer-Moore voting finds a candidate in `O(n)` time and `O(1)` space. The second
pass confirms it; without the confirmation, a list with no majority could still
return a candidate. The final `then_some` turns the boolean into `Option`.

## The tests

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
    #[test]
    fn finds_pairs_and_subarrays() {
        assert_eq!(two_sum(&[2, 7, 11, 15], 9), Some((0, 1)));
        assert_eq!(two_sum(&[1, 2, 3], 7), None);
        assert_eq!(max_subarray(&[-2, 1, -3, 4, -1, 2, 1, -5, 4]), 6);
    }

    #[test]
    fn strings_and_simple_sequences() {
        assert!(is_palindrome("A man, a plan, a canal: Panama"));
        assert!(!is_palindrome("rust"));
        assert_eq!(reverse_words("buy milk now"), "now milk buy");
        assert_eq!(climbing_stairs(2), 2);
        assert_eq!(climbing_stairs(5), 8);
    }
```

The second test block covers intervals, groups, prefixes, zeros, and the
majority:

<!-- verify: dsa/src/practice.rs at=day-100 -->
```rust title="dsa/src/practice.rs"
    #[test]
    fn intervals_and_groups() {
        assert_eq!(
            merge_intervals(vec![(1, 3), (2, 6), (8, 10), (15, 18)]),
            vec![(1, 6), (8, 10), (15, 18)]
        );
        assert_eq!(
            group_anagrams(&["eat", "tea", "tan", "ate", "nat", "bat"]),
            vec![
                vec!["ate".to_string(), "eat".to_string(), "tea".to_string()],
                vec!["bat".to_string()],
                vec!["nat".to_string(), "tan".to_string()],
            ]
        );
    }

    #[test]
    fn prefixes_zeros_and_majority() {
        assert_eq!(longest_common_prefix(&["flower", "flow", "flight"]), "fl");
        let mut values = vec![0, 1, 0, 3, 12];
        move_zeroes(&mut values);
        assert_eq!(values, vec![1, 3, 12, 0, 0]);
        assert_eq!(majority_element(&[2, 2, 1, 1, 1, 2, 2]), Some(2));
        assert_eq!(majority_element(&[1, 2, 3]), None);
    }
```

## The whole suite

```text
$ cargo test -p dsa
running 19 tests
test complexity::tests::halving_is_logarithmic ... ok
test linked::tests::push_and_pop ... ok
...
test practice::tests::finds_pairs_and_subarrays ... ok
test practice::tests::intervals_and_groups ... ok
test practice::tests::prefixes_zeros_and_majority ... ok
test practice::tests::strings_and_simple_sequences ... ok
...
test result: ok. 19 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## What you practised

- **Two pointers:** palindrome, move zeroes, merge intervals.
- **Hashing:** two sum, anagrams, the tag index from Day 93.
- **Dynamic programming:** climbing stairs, Kadane's algorithm.
- **Greedy with a proof:** Boyer-Moore majority.
- **Sorting and searching:** the interval sort, the prefix shrink, binary search.
- **Cost analysis:** every solution states time and space.

The pattern behind the problems is the pattern behind the book: choose a
structure, state the cost, write a test, and measure when the choice is close.

## Save your work

<!-- transcripts: authored -->
```text
$ git add -A
$ git commit -m "day 100: finish the practice set"
$ git tag dsa-10
```

The last tag closes the DSA track. Every day in the book now has a commit and a
milestone; the history is the record of how the app was built.

## If something went wrong

**A test fails on the empty input.** Several functions assume a non-empty slice
(`max_subarray`, `climbing_stairs` is fine, `majority_element` returns `None`).
Decide the contract and test it; do not guess.

**`two_sum` returns the same index twice.** The map is updated before the
complement lookup, or the loop uses the value as both key and index. Look up
first, insert second.

**`merge_intervals` misses a contained interval.** The `max(end)` update is
missing; a later interval can be shorter than the current end.

**`group_anagrams` order changes between runs.** The hash map's order is
random. Sort the groups and the members, as the code does.

**`is_palindrome` panics on an empty string.** `saturating_sub(1)` gives 0, and
the `left < right` loop does not run. An empty string is a palindrome; the code
returns `true`.

**`majority_element` returns a value with no majority.** The confirmation pass
is missing. The voting pass alone only finds a candidate.

## Going deeper: after the hundred days

The crate is a starting point, not a finish line. Add a benchmark for each
problem, compare the two-sum map with the sorted two-pointer version, and write
a property test that checks `sort` against `insertion_sort` on random input.

The app is yours as well: the CLI, API, web UI, TUI, database, and deployment
are all in the project. Add recurring tasks, sharing, reminders, or a mobile
client. Keep the tests green; that is how the next change stays safe.

You have written a real Rust application, taken it to production, and gone
underneath it with data structures. That is the hundred days.

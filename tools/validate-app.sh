#!/usr/bin/env bash
# Validate one tagged state of the reference app in Podman.
#
#   tools/validate-app.sh            # HEAD
#   tools/validate-app.sh day-02     # a tag or commit
#
# The app is exported with `git archive`, so untracked files (a local database,
# a target directory) never leak into the check. The source tree is mounted at
# /src; cargo writes to the rust-todo-cargo and rust-todo-target volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${APP:-$ROOT/../rust-todo-app}"
REF="${1:-HEAD}"
IMAGE="${IMAGE:-rust-todo-validator:1.99}"

if [[ ! -d "$APP/.git" ]]; then
	echo "validate-app: no git repository at $APP" >&2
	exit 1
fi

if ! podman image exists "$IMAGE"; then
	echo "validate-app: building $IMAGE"
	podman build -t "$IMAGE" -f "$ROOT/containers/validator/Containerfile" "$ROOT/containers/validator"
fi

for volume in rust-todo-cargo rust-todo-target; do
	if ! podman volume exists "$volume"; then
		podman volume create "$volume" >/dev/null
	fi
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git -C "$APP" archive "$REF" | tar -x -C "$tmp"
# `git archive` stamps files with the commit time. Cargo compares mtimes, so
# an older checkout would otherwise reuse a newer binary from the target
# volume. Touch the exported tree to force a correct incremental build.
find "$tmp" -type f -exec touch {} +

mkdir -p "$ROOT/tools/transcripts"
out="$ROOT/tools/transcripts/validate-${REF//\//_}.txt"

echo "validate-app: $REF from $APP"
podman run --rm \
	--userns=keep-id --user "$(id -u):$(id -g)" \
	-v "$tmp:/src:Z" \
	-v rust-todo-cargo:/cargo \
	-v rust-todo-target:/target \
	-e HOME=/tmp \
	-e TMPDIR=/tmp \
	-e TODO_DB=/tmp/todo.db \
	-e TZ=UTC \
	-e LANG=C.UTF-8 \
	--tmpfs /tmp:rw,size=1g \
	-w /src \
	"$IMAGE" \
	bash -c '
		set -euo pipefail
		# The target volume is shared between refs. Clean just this package so
		# a newer binary from another tag can never be reused.
		cargo clean -p todo
		cargo fmt --all --check
		cargo clippy --locked --workspace --all-targets -- -D warnings
		cargo test --locked --workspace
		cargo build --locked --workspace --bins
		RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps
	' 2>&1 | tee "$out"

echo "validate-app: transcript at ${out#"$ROOT/"}"

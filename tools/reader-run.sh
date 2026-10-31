#!/usr/bin/env bash
# Open a clean-room reader workspace in Podman.
#
# The reader app lives outside this repository, in ../rust-todo-reader by
# default. The book is mounted read-only at /book. The container has git and
# the pinned Rust toolchain; the host has neither.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
READER="${READER_APP:-$ROOT/../rust-todo-reader}"
IMAGE="${IMAGE:-rust-todo-validator:1.99}"

mkdir -p "$READER"

if ! podman image exists "$IMAGE"; then
	echo "reader-run: building $IMAGE"
	podman build -t "$IMAGE" -f "$ROOT/containers/validator/Containerfile" "$ROOT/containers/validator"
fi

for volume in rust-todo-cargo rust-todo-target rust-todo-reader-home; do
	if ! podman volume exists "$volume"; then
		podman volume create "$volume" >/dev/null
	fi
done

exec podman run --rm -it \
	--userns=keep-id --user "$(id -u):$(id -g)" \
	-v "$READER:/work:Z" \
	-v "$ROOT:/book:ro,Z" \
	-v rust-todo-cargo:/cargo \
	-v rust-todo-target:/target \
	-v rust-todo-reader-home:/home/reader \
	-e HOME=/home/reader \
	-e CARGO_HOME=/cargo \
	-e CARGO_TARGET_DIR=/target \
	-e TZ=UTC \
	-e LANG=C.UTF-8 \
	-w /work \
	"$IMAGE" \
	bash

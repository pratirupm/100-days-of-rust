# Backlog

Ideas agreed on but not scheduled. The 100-day curriculum itself is fixed;
these are site, quality, and maintenance tasks.

## Content

- **Write Part I** — days 1–7, then validate the reader path before Part II.
- **A human read-through** — pick three or four days across the book, read
  them as a beginner would, and note anything that reads oddly.
- **Rust version refresh** — when a new stable toolchain lands, rebuild the
  validator image, regenerate the compile-fail snapshots, and re-run every
  transcript.
- **Production-lab fallbacks** — document the rootless Kubernetes fallback
  (Kind vs k3d vs minikube) and the LocalStack alternatives.

## Site and readers

- **PDF / EPUB export** — a "download the whole book" build. PDF via
  Playwright's print-to-PDF; EPUB via pandoc.
- **Comments or feedback beyond the report link** — only if the issue-based
  loop proves too quiet or too noisy.
- **A "what changed" page** — track toolchain and crate upgrades between
  editions.

## Engineering

- **Dependabot** — keep actions and npm dependencies current automatically.
- **Bump the GitHub Actions to their Node-24 versions** — clears the
  deprecation annotations.
- **Register the `day` parameter as a custom dimension in GA** — the
  `day_complete` event fires; the dimension makes it reportable.
- **Cache the validator image in CI** — if the reference app is ever made
  public, run the same Podman gate there.

## Publishing and discovery

- **Google Search Console** — submit
  `https://pratirupm.github.io/100-days-of-rust/sitemap.xml` under the
  URL-prefix property.
- **Repo social preview** — upload `public/og.png` in Settings → Social
  preview.
- **Share it** — r/rust, Hacker News, and anywhere a beginner-friendly Rust
  course fits.

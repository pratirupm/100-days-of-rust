#!/usr/bin/env bun
/**
 * Prose lint — keeps the beginner-first house style honest.
 *
 * FAILs on bookkeeping vocabulary that must never reach reader pages.
 * WARNs on style smells that deserve a human look.
 *
 * Run: bun run lint
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS = join(ROOT, 'src/content/docs');

// Generated code pages are not prose; the lint does not apply to them.
const SKIP = new Set(['appendices/the-finished-app.md']);
const SKIP_PREFIXES = ['appendices/the-finished-app/'];

const FAIL: Array<{ re: RegExp; why: string }> = [
	{ re: /\bchapter\s+\d/i, why: 'no chapter-number cross references' },
	{ re: /\banswer key\b/i, why: 'no answer-key meta blocks' },
	{ re: /\byou build\b/i, why: 'no "you build" meta blocks' },
	{ re: /\bmaster branch\b/i, why: 'the branch is main' },
	{ re: /\b[0-9a-f]{40}\b/i, why: 'do not show full commit hashes' },
	{ re: /\bcheckpoints?\b/i, why: 'use "save point" or "tag"' },
	{ re: /\bTODO\b/, why: 'no placeholders in the reader path' },
	{ re: /\bwhat'?s coming\b/i, why: 'all 100 days are written; no roadmap placeholders' },
	{ re: /\bthe borrow checker fights you\b/i, why: 'the compiler is a collaborator' },
	{ re: /\bjust clone it\b/i, why: 'explain why a copy is needed' },
	{ re: /\bRust is hard\b/i, why: 'do not frame Rust as a fight' },
];

const WARN: Array<{ re: RegExp; why: string }> = [
	{ re: /\bgates?\b/i, why: 'prefer "run the tests"' },
	{ re: /\brepositor(y|ies)\b/i, why: 'prefer "project" in the reader path' },
	{ re: /\bpart\s+(?:i{1,3}|iv|v|vi{1,3}|ix|x)\b/i, why: 'part cross-reference (fine in navigation)' },
];

async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) yield path;
	}
}

let failures = 0;
let warnings = 0;

for await (const file of walk(DOCS)) {
	const rel = relative(DOCS, file);
	if (SKIP.has(rel) || SKIP_PREFIXES.some((p) => rel.startsWith(p))) continue;

	const lines = (await readFile(file, 'utf8')).split('\n');
	let inFence = false;
	let inFrontmatter = lines[0]?.trim() === '---';
	let paraStart = 0;
	let paraLines = 0;

	const flushPara = () => {
		if (paraLines > 7) {
			console.log(`${rel}:${paraStart}  [warn] paragraph runs ${paraLines} lines — consider splitting`);
			warnings++;
		}
		paraLines = 0;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const n = i + 1;

		if (inFrontmatter) {
			if (i > 0 && line.trim() === '---') inFrontmatter = false;
			continue;
		}
		if (line.trimStart().startsWith('```')) {
			inFence = !inFence;
			flushPara();
			continue;
		}
		if (inFence) continue;

		// Inline code spans are not prose: a line may talk about a `tag` in
		// code while its prose says "label". Scrub them before matching.
		const scrubbed = line.replace(/`[^`]*`/g, '`x`');

		for (const { re, why } of FAIL) {
			if (re.test(scrubbed)) {
				console.log(`${rel}:${n}  [fail] ${why} — ${line.trim().slice(0, 90)}`);
				failures++;
			}
		}
		for (const { re, why } of WARN) {
			// Day pages are navigation: referencing a part is their job.
			if (rel.startsWith('days/') && why.includes('part cross-reference')) continue;
			if (re.test(scrubbed)) {
				console.log(`${rel}:${n}  [warn] ${why} — ${line.trim().slice(0, 90)}`);
				warnings++;
			}
		}

		const isProse = line.trim() !== '' && !/^[#>\-*|]|^\d+\.|^<!--|^\s{2,}/.test(line);
		if (isProse) {
			if (paraLines === 0) paraStart = n;
			paraLines++;
		} else {
			flushPara();
		}
	}
	flushPara();
}

console.log(`\n${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures > 0 ? 1 : 0);

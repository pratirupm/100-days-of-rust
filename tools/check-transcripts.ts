#!/usr/bin/env bun
/**
 * Transcript check — every line of a terminal block in a day page must appear
 * in the captured run for that day.
 *
 * The captures live in `tools/transcripts/day-NN.txt` and are written by the
 * Podman validation harness. They are the record of what actually happened;
 * the prose never invents output.
 *
 * Run: bun run transcripts
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS = join(ROOT, 'src/content/docs');
const TRANSCRIPTS = join(ROOT, 'tools/transcripts');

// `<!-- transcripts: authored -->` above a fence exempts it: the block was
// hand-edited for reader safety (a neutral path, a placeholder username) and
// its lines are deliberately not verbatim from the capture.
const AUTHORED = /^<!--\s*transcripts:\s*authored\s*-->\s*$/;

async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) yield path;
	}
}

function isTerminalFence(info: string): boolean {
	const lang = info.split(/\s+/)[0] ?? '';
	if (info.includes('title=')) return false; // file quote — checked by verify-quotes
	return ['bash', 'sh', 'shell', 'console', 'text'].includes(lang);
}

function dayNumber(rel: string, text: string): number | null {
	const front = text.match(/^---\n([\s\S]*?)\n---/);
	const m = front ? front[1]!.match(/^day:\s*(\d+)\s*$/m) : null;
	if (m) return Number(m[1]);
	const file = rel.split('/').pop() ?? '';
	const f = file.match(/^day-(\d+)\.md$/);
	return f ? Number(f[1]) : null;
}

let checked = 0;
let missing = 0;
let pages = 0;

for await (const file of walk(DOCS)) {
	const rel = relative(DOCS, file);
	if (!rel.startsWith('days/')) continue;

	const text = await readFile(file, 'utf8');
	const day = dayNumber(rel, text);
	if (day === null) continue;

	const lines = text.split('\n');
	let inFence = false;
	let terminal = false;
	let authored = false;
	let body: string[] = [];
	let transcript: string | null = null;
	let transcriptLoaded = false;

	const load = async (): Promise<string | null> => {
		if (transcriptLoaded) return transcript;
		transcriptLoaded = true;
		try {
			transcript = await readFile(join(TRANSCRIPTS, `day-${String(day).padStart(2, '0')}.txt`), 'utf8');
		} catch {
			transcript = null;
		}
		return transcript;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (AUTHORED.test(line)) {
			authored = true;
			continue;
		}
		if (line.startsWith('```')) {
			if (!inFence) {
				inFence = true;
				terminal = isTerminalFence(line.slice(3).trim()) && !authored;
				authored = false;
				body = [];
			} else {
				if (terminal && body.some((l) => l.trim() !== '')) {
					pages++;
					const captured = await load();
					if (captured === null) {
						console.log(`${rel}  [fail] no capture at tools/transcripts/day-${String(day).padStart(2, '0')}.txt`);
						missing++;
					} else {
						for (let k = 0; k < body.length; k++) {
							let needle = body[k]!.trim();
							if (needle === '' || needle === '...' || needle === '…') continue;
							if (needle.startsWith('$ ')) needle = needle.slice(2);
							const cut = needle.indexOf('...');
							if (cut >= 0) needle = needle.slice(0, cut).trim();
							if (needle === '') continue;
							checked++;
							if (!captured.includes(needle)) {
								console.log(`${rel}:${i - body.length + k}  [fail] not in the capture — ${needle.slice(0, 90)}`);
								missing++;
							}
						}
					}
				}
				inFence = false;
				terminal = false;
				body = [];
			}
			continue;
		}
		if (inFence && terminal) body.push(line);
	}
}

console.log(`\n${checked} line(s) checked across ${pages} block(s), ${missing} missing`);
process.exit(missing > 0 ? 1 : 0);

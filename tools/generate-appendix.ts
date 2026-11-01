#!/usr/bin/env bun
/**
 * Generate the finished-app appendix from the reference application at the
 * end of the 60-day app track (`day-60` by default; override with APP_REF).
 *
 * One page per directory group (plus an index) so no single page carries the
 * whole tree. Every tracked, hand-written file is included; build artifacts,
 * the lockfile, and local database/session files are excluded — the intro
 * says so.
 *
 * Run: bun run appendix
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APP = join(ROOT, '..', 'rust-todo-app');
const REF = process.env.APP_REF ?? 'day-60';
const OUT_DIR = join(ROOT, 'src/content/docs/appendices/the-finished-app');
const INDEX = join(ROOT, 'src/content/docs/appendices/the-finished-app.md');

const config = await readFile(join(ROOT, 'astro.config.mjs'), 'utf8');
const BASE = config.match(/const base = '([^']+)'/)?.[1] ?? '';

const EXCLUDE_EXACT = new Set([
	'Cargo.lock',
	'todo.db',
	'todo.db-shm',
	'todo.db-wal',
	'todo.db.session',
]);
const EXCLUDE_PREFIXES = ['target/', 'dist/', 'node_modules/', '.git/', '.astro/'];

function excluded(path: string): boolean {
	if (EXCLUDE_EXACT.has(path)) return true;
	if (EXCLUDE_PREFIXES.some((p) => path.startsWith(p))) return true;
	if (path.endsWith('.snap.new')) return true;
	return false;
}

function langFor(path: string): string {
	const base = basename(path);
	if (base === 'Dockerfile' || base === 'Containerfile') return 'dockerfile';
	if (base === 'Cargo.toml' || base.endsWith('.toml')) return 'toml';
	if (base === 'Makefile') return 'makefile';
	const byExt: Record<string, string> = {
		'.rs': 'rust',
		'.sql': 'sql',
		'.yml': 'yaml',
		'.yaml': 'yaml',
		'.md': 'markdown',
		'.html': 'html',
		'.css': 'css',
		'.js': 'js',
		'.json': 'json',
		'.sh': 'bash',
		'.service': 'ini',
		'.timer': 'ini',
		'.snap': 'text',
		'.txt': 'text',
	};
	return byExt[extname(path)] ?? 'text';
}

// Files group by their first path segment; src/, tests/, and the app's
// support directories split one level deeper so no page grows too large.
function groupFor(path: string): { slug: string; label: string } {
	const parts = path.split('/');
	if (parts.length === 1) return { slug: 'root-files', label: 'The project root' };
	if (parts[0] === 'src' && parts.length > 2) {
		return { slug: `src-${parts[1]}`, label: `src/${parts[1]}` };
	}
	const dir = parts[0]!;
	return { slug: dir.replace(/^\./, ''), label: dir };
}

const INTRO = `> **Spoilers.** The finished 60-day application, file by file — the state the
> first track builds toward. Use it to compare and to unstick; don't copy
> files wholesale. \`Cargo.lock\` is what \`cargo build\` generates, and
> \`target/\`, local databases, and session files are not reproduced here.
> Each section is the file's source at the \`day-60\` tag.
`;

const tracked = execFileSync('git', ['-C', APP, 'ls-tree', '-r', '--name-only', REF], {
	encoding: 'utf8',
})
	.trim()
	.split('\n');
let files = tracked.filter((f) => f && !excluded(f)).sort();
files = ['Cargo.toml', ...files.filter((f) => f !== 'Cargo.toml')];

const groups = new Map<string, { label: string; files: string[] }>();
for (const file of files) {
	const { slug, label } = groupFor(file);
	const group = groups.get(slug) ?? { label, files: [] };
	group.files.push(file);
	groups.set(slug, group);
}
const order = [...groups.keys()].sort((a, b) => {
	if (a === 'root-files') return -1;
	if (b === 'root-files') return 1;
	return a.localeCompare(b);
});

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const indexParts: string[] = [
	`---\ntitle: The finished app (spoilers)\ndescription: The finished 60-day application, file by file, with spoilers.\nsidebar:\n  order: 1\ntableOfContents: false\npagefind: false\n---\n\n`,
	INTRO,
	`\n## The files, by directory\n\n`,
];
for (const slug of order) {
	const group = groups.get(slug)!;
	indexParts.push(`- [${group.label}](${BASE}/appendices/the-finished-app/${slug}/) — ${group.files.length} files\n`);
}

for (const slug of order) {
	const group = groups.get(slug)!;
	const parts: string[] = [
		`---\ntitle: "${group.label} — the finished app"\ndescription: "The finished app, file by file: ${group.label} (spoilers)."\nsidebar:\n  hidden: true\ntableOfContents: false\npagefind: false\n---\n\n`,
		`Part of [The finished app (spoilers)](${BASE}/appendices/the-finished-app/).\n`,
	];
	for (const file of group.files) {
		const content = execFileSync('git', ['-C', APP, 'show', `${REF}:${file}`], {
			encoding: 'utf8',
			maxBuffer: 10 * 1024 * 1024,
		}).replace(/\n+$/, '');
		parts.push(`\n## \`${file}\`\n\n\`\`\`\`${langFor(file)}\n${content}\n\`\`\`\`\n`);
	}
	await writeFile(join(OUT_DIR, `${slug}.md`), parts.join('\n'));
}

await writeFile(INDEX, indexParts.join(''));
console.log(`wrote ${INDEX} (${groups.size} groups) and ${OUT_DIR} (${files.length} files)`);

#!/usr/bin/env bun
/**
 * Generate the day pages from the chapter sources.
 *
 * The chapter is the source of truth: front matter carries the day number,
 * part, time, description, and the "You'll be able to" bullets. The body is
 * copied verbatim, then wrapped in the day page shell.
 *
 * Run: bun run days
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/content/docs/days');
const CHAPTERS = join(ROOT, 'src/chapters');

type Front = {
	title?: string;
	day?: string;
	part?: string;
	partName?: string;
	partDay?: string;
	partDays?: string;
	time?: string;
	description?: string;
	bullets: string[];
};

function parseFrontmatter(text: string): { front: Front; body: string } {
	const match = text.match(/^---\n([\s\S]*?)\n---\n+/);
	const raw = match ? match[1]! : '';
	const body = (match ? text.slice(match[0].length) : text).trimEnd();
	const front: Front = { bullets: [] };
	let listKey: string | null = null;

	for (const line of raw.split('\n')) {
		const item = line.match(/^\s*-\s+(.*)$/);
		if (item && listKey === 'bullets') {
			front.bullets.push(item[1]!.trim());
			continue;
		}
		const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		if (!kv) continue;
		const key = kv[1]!;
		const value = kv[2]!.trim().replace(/^["']|["']$/g, '');
		if (key === 'bullets') {
			listKey = 'bullets';
			continue;
		}
		listKey = null;
		front[key as keyof Front] = value as never;
	}
	return { front, body };
}

const files = (await readdir(CHAPTERS))
	.filter((f) => f.endsWith('.md'))
	.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
const pages: { day: number; text: string }[] = [];

for (const file of files) {
	const text = await readFile(join(CHAPTERS, file), 'utf8');
	const { front, body } = parseFrontmatter(text);
	const day = Number(front.day);
	if (!Number.isInteger(day) || day < 1 || day > 100) {
		throw new Error(`${file}: front matter needs day: 1..100`);
	}
	if (!front.title) throw new Error(`${file}: front matter needs title`);

	const hidden = day > 60;
	const sidebar = hidden ? 'sidebar:\n  hidden: true' : `sidebar:\n  order: ${day}`;
	const about = front.part
		? `**About ${front.time ?? '2 hours'}** · Part ${front.part}${front.partDay ? `, day ${front.partDay} of ${front.partDays}` : ''}.`
		: `**About ${front.time ?? '2 hours'}**.`;
	const bullets = front.bullets.length
		? `**You'll be able to:**\n\n${front.bullets.map((b) => `- ${b}`).join('\n')}\n\n---\n\n`
		: '';
	const description = front.description
		? `${front.description} — Day ${day} of 100 Days of Rust.`
		: `Day ${day} of 100 Days of Rust: ${front.title}.`;

	pages.push({
		day,
		text: `---
title: "Day ${day} — ${front.title}"
description: ${JSON.stringify(description)}
${sidebar}
day: ${day}
---

${about}

${bullets}${body}

<div class="day-tracker" data-day="${day}"></div>
`,
	});
}

await mkdir(OUT, { recursive: true });
for (const entry of await readdir(OUT)) {
	if (/^day-\d+\.md$/.test(entry)) await rm(join(OUT, entry));
}
for (const page of pages) {
	await writeFile(join(OUT, `day-${String(page.day).padStart(2, '0')}.md`), page.text);
}
console.log(`wrote ${pages.length} day page(s) to ${OUT}`);

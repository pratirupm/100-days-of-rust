#!/usr/bin/env bun
/**
 * Generate the app icons from one SVG mark: an amber gear on the book's
 * espresso ground. Rendered with sharp, which Astro already depends on.
 *
 * Run: bun run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'public/icons');

const BG = '#1e1915'; // espresso, the book's dark ground
const FG = '#e8a33e'; // amber accent

// A line-art gear: outer ring, eight teeth, inner ring. `pad` shrinks the
// mark for the maskable variant's safe zone.
const gear = (s: number, pad: number) => {
	const inset = s * pad;
	const box = s - inset * 2;
	const cx = s / 2;
	const cy = s / 2;
	const outer = box * 0.34;
	const inner = box * 0.15;
	const toothW = box * 0.12;
	const toothH = box * 0.14;
	const teeth = Array.from({ length: 8 }, (_, i) => {
		const angle = i * 45;
		return `<rect x="${cx - toothW / 2}" y="${inset + box * 0.02}" width="${toothW}" height="${toothH}" rx="${toothW * 0.3}" fill="${FG}" transform="rotate(${angle} ${cx} ${cy})"/>`;
	}).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
	<rect width="${s}" height="${s}" rx="${s * 0.18}" fill="${BG}"/>
	${teeth}
	<circle cx="${cx}" cy="${cy}" r="${outer}" fill="none" stroke="${FG}" stroke-width="${box * 0.075}"/>
	<circle cx="${cx}" cy="${cy}" r="${inner}" fill="none" stroke="${FG}" stroke-width="${box * 0.075}"/>
</svg>`;
};

await mkdir(OUT, { recursive: true });

const icon = gear(512, 0.16);
const maskable = gear(512, 0.24);

await sharp(Buffer.from(icon)).resize(192, 192).png().toFile(join(OUT, 'icon-192.png'));
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile(join(OUT, 'icon-512.png'));
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(join(OUT, 'maskable-512.png'));
await sharp(Buffer.from(icon)).resize(180, 180).png().toFile(join(OUT, 'apple-touch-icon.png'));
await writeFile(join(ROOT, 'public/favicon.svg'), icon + '\n');

// The Open Graph card: 1200×630, espresso ground, amber gear, the name.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
	<rect width="1200" height="630" fill="${BG}"/>
	<g transform="translate(600 210)">
		${Array.from({ length: 8 }, (_, i) => `<rect x="-18" y="-150" width="36" height="42" rx="10" fill="${FG}" transform="rotate(${i * 45})"/>`).join('')}
		<circle cx="0" cy="0" r="112" fill="none" stroke="${FG}" stroke-width="24"/>
		<circle cx="0" cy="0" r="48" fill="none" stroke="${FG}" stroke-width="24"/>
	</g>
	<text x="600" y="430" text-anchor="middle" font-family="DejaVu Sans, Verdana, sans-serif" font-size="76" font-weight="bold" fill="${FG}">100 Days of Rust</text>
	<text x="600" y="500" text-anchor="middle" font-family="DejaVu Sans, Verdana, sans-serif" font-size="34" fill="#e8e2d8">A 100-day Rust course for beginners</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile(join(ROOT, 'public/og.png'));

console.log('wrote icons to public/icons (192, 512, maskable-512, apple-touch-icon), public/favicon.svg, and public/og.png');

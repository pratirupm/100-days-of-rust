// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// 100 Days of Rust — the book site.
// Astro + Starlight, run with Bun. `bun run build` emits a static site to dist/.
import stripVerifyMarkers from './src/integrations/strip-verify-markers.mjs';
import baseLinks from './src/integrations/base-links.mjs';
import pwa from './src/integrations/pwa.mjs';

// Register the service worker only in production builds; the dev server
// must never cache itself.
const isBuild = process.env.NODE_ENV === 'production';

// The book deploys as a GitHub Pages project site:
// https://pratirupm.github.io/100-days-of-rust/
const site = 'https://pratirupm.github.io';
const base = '/100-days-of-rust';

// Sidebar labels come from the chapter sources, so the navigation never drifts
// from the day titles. The chapter files are part of the repository and exist
// at build time.
const chapterTitles = new Map();
const chaptersDir = new URL('./src/chapters/', import.meta.url);
for (const file of readdirSync(chaptersDir)) {
	const match = file.match(/^(\d+)-.+\.md$/);
	if (!match) continue;
	const text = readFileSync(new URL(file, chaptersDir), 'utf8');
	const title = text.match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
	if (title) chapterTitles.set(Number(match[1]), title);
}

const dayItem = (day) => ({
	label: `Day ${day} — ${chapterTitles.get(day) ?? 'Lesson'}`,
	slug: `days/day-${String(day).padStart(2, '0')}`,
});

const dayItems = (from, to) =>
	Array.from({ length: to - from + 1 }, (_, index) => dayItem(from + index));

export default defineConfig({
	site,
	base,
	integrations: [
		// Markdown links get the base path before the link validator runs.
		baseLinks({ base }),
		// Verification markers stay in the source for `bun run verify`,
		// but are stripped from the pages readers see.
		stripVerifyMarkers(),
		starlight({
			title: '100 Days of Rust',
			description:
				'A 100-day Rust course: 60 days build a real todo app, 30 take it to production, and 10 cover data structures and algorithms.',
			customCss: ['./src/styles/custom.css'],
			components: {
				// Dark is the default theme for a reader with no stored choice.
				ThemeProvider: './src/components/ThemeProvider.astro',
				// The footer gains a "Report a problem on this page" link.
				Footer: './src/components/Footer.astro',
			},
			// Long code lines wrap instead of clipping — a beginner must
			// never wonder whether a line continues past the edge. The warm
			// gruvbox pair matches the paper-and-amber palette.
			expressiveCode: {
				defaultProps: { wrap: true },
				themes: ['gruvbox-light-soft', 'gruvbox-dark-soft'],
			},
			// Arrow-key navigation between chapters, and the client-side
			// progress tracker (localStorage only). The first script gives a
			// first-time visitor a stored `dark` choice — Starlight's theme
			// select otherwise re-applies `auto` (the system setting) on
			// load, undoing the dark-first default. An explicit `auto` (an
			// empty stored value) is respected.
			head: [
				{
					tag: 'script',
					content:
						"(() => { try { if (localStorage.getItem('starlight-theme') === null) localStorage.setItem('starlight-theme', 'dark'); } catch {} })();",
				},
				// The tracker's scripts build links from this base.
				{ tag: 'script', content: `document.documentElement.dataset.base = '${base}';` },
				{ tag: 'script', attrs: { src: `${base}/keys.js`, defer: true } },
				{ tag: 'script', attrs: { src: `${base}/tracker.js`, defer: true } },
				// Installable, offline-first: manifest, theme chrome, and the
				// service-worker registration (production builds only).
				{ tag: 'link', attrs: { rel: 'manifest', href: `${base}/manifest.webmanifest` } },
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#1e1915' } },
				{ tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' } },
				{ tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: '100 Days' } },
				{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}/icons/apple-touch-icon.png` } },
				// Social cards and structured data. Starlight emits the core OG
				// tags itself; these add the image and the site schema.
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: `${site}${base}/og.png` },
				},
				{
					tag: 'meta',
					attrs: {
						property: 'og:image:alt',
						content: '100 Days of Rust — an amber gear on espresso',
					},
				},
				{ tag: 'meta', attrs: { name: 'twitter:image', content: `${site}${base}/og.png` } },
				{
					tag: 'script',
					attrs: { type: 'application/ld+json' },
					content: JSON.stringify({
						'@context': 'https://schema.org',
						'@type': 'WebSite',
						name: '100 Days of Rust',
						url: `${site}${base}/`,
						description:
							'A 100-day Rust course: 60 days build a real todo app, 30 take it to production, and 10 cover data structures and algorithms.',
					}),
				},
				...(isBuild
					? [
							{
								tag: 'script',
								content: `if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('${base}/sw.js'));`,
							},
						]
					: []),
			],
			plugins: [starlightLinksValidator()],
			sidebar: [
				{ label: 'Start here', slug: 'start-here' },
				{
					label: 'The 60 days',
					collapsed: true,
					items: [{ label: 'Overview', slug: 'days' }, ...dayItems(1, 60)],
				},
				{
					label: 'Production ground',
					collapsed: true,
					items: [{ label: 'Overview', slug: 'production' }, ...dayItems(61, 90)],
				},
				{
					label: 'Data structures & algorithms',
					collapsed: true,
					items: [{ label: 'Overview', slug: 'dsa' }, ...dayItems(91, 100)],
				},
				{
					label: 'Appendices',
					collapsed: true,
					items: [{ autogenerate: { directory: 'appendices' } }],
				},
				{ label: 'Credits', slug: 'credits' },
				{ label: 'Disclaimer', slug: 'disclaimer' },
			],
		}),
		// The offline-first service worker + precache manifest, written into
		// dist at the end of every build. Last, so Starlight's Pagefind
		// index exists by the time the manifest is collected. The base keeps
		// every precached URL inside the Pages subpath.
		pwa({ base }),
	],
});

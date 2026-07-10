/**
 * Cross-post a blog post to dev.to and Hashnode with a canonical URL
 * pointing back to the blog.
 *
 * Usage:
 *   DEVTO_API_KEY=... HASHNODE_PAT=... HASHNODE_PUBLICATION_ID=... \
 *     node scripts/crosspost.mjs <post-slug> [--platforms devto,hashnode]
 *
 * <post-slug> is the filename in src/content/blog without extension,
 * e.g. `first-post` for src/content/blog/first-post.md.
 *
 * Idempotent: if an article with the same canonical URL (dev.to) or slug
 * (Hashnode) already exists, it is updated instead of duplicated.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://micmayerm.github.io';
const BLOG_DIR = 'src/content/blog';

// --- tiny front matter parser (title/description/tags/dates only) ---------

function parseFrontMatter(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) throw new Error('No front matter found');
	const [, fm, body] = match;
	const data = {};
	for (const line of fm.split(/\r?\n/)) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (!kv) continue;
		let [, key, value] = kv;
		value = value.trim().replace(/^['"]|['"]$/g, '');
		if (value.startsWith('[')) {
			data[key] = value
				.slice(1, -1)
				.split(',')
				.map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
				.filter(Boolean);
		} else {
			data[key] = value;
		}
	}
	return { data, body: body.trim() };
}

async function loadPost(slug) {
	const files = await readdir(BLOG_DIR);
	const file = files.find((f) => f.replace(/\.(md|mdx)$/, '') === slug);
	if (!file) throw new Error(`No post found for slug "${slug}" in ${BLOG_DIR}`);
	if (file.endsWith('.mdx')) {
		console.warn('⚠ MDX post: JSX components will not render on other platforms. Review the result.');
	}
	const raw = await readFile(path.join(BLOG_DIR, file), 'utf8');
	const { data, body } = parseFrontMatter(raw);
	if (!data.title) throw new Error('Post has no title');
	return {
		slug,
		title: data.title,
		description: data.description ?? '',
		tags: Array.isArray(data.tags) ? data.tags : [],
		body,
		canonicalUrl: `${SITE}/blog/${slug}/`,
	};
}

// --- dev.to ----------------------------------------------------------------

async function devto(post, apiKey) {
	const headers = { 'api-key': apiKey, 'content-type': 'application/json' };
	const existing = await fetch('https://dev.to/api/articles/me/all?per_page=1000', { headers }).then((r) => r.json());
	if (!Array.isArray(existing)) throw new Error(`dev.to: ${JSON.stringify(existing)}`);
	const found = existing.find((a) => a.canonical_url === post.canonicalUrl);

	const article = {
		title: post.title,
		body_markdown: post.body,
		published: true,
		canonical_url: post.canonicalUrl,
		description: post.description,
		tags: post.tags.slice(0, 4).map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '')),
	};

	const res = found
		? await fetch(`https://dev.to/api/articles/${found.id}`, { method: 'PUT', headers, body: JSON.stringify({ article }) })
		: await fetch('https://dev.to/api/articles', { method: 'POST', headers, body: JSON.stringify({ article }) });
	const json = await res.json();
	if (!res.ok) throw new Error(`dev.to: ${JSON.stringify(json)}`);
	console.log(`✔ dev.to ${found ? 'updated' : 'published'}: ${json.url}`);
}

// --- Hashnode ---------------------------------------------------------------

async function hashnodeGql(pat, query, variables) {
	const res = await fetch('https://gql.hashnode.com', {
		method: 'POST',
		headers: { Authorization: pat, 'content-type': 'application/json' },
		body: JSON.stringify({ query, variables }),
	});
	const json = await res.json();
	if (json.errors) throw new Error(`Hashnode: ${JSON.stringify(json.errors)}`);
	return json.data;
}

async function hashnode(post, pat, publicationId) {
	const search = await hashnodeGql(
		pat,
		`query ($id: ObjectId!, $slug: String!) {
			publication(id: $id) { post(slug: $slug) { id } }
		}`,
		{ id: publicationId, slug: post.slug },
	);
	const existingId = search.publication?.post?.id;

	const common = {
		title: post.title,
		contentMarkdown: post.body,
		tags: post.tags.map((t) => ({ slug: t.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: t })),
		originalArticleURL: post.canonicalUrl,
	};

	if (existingId) {
		const data = await hashnodeGql(
			pat,
			`mutation ($input: UpdatePostInput!) { updatePost(input: $input) { post { url } } }`,
			{ input: { id: existingId, ...common } },
		);
		console.log(`✔ Hashnode updated: ${data.updatePost.post.url}`);
	} else {
		const data = await hashnodeGql(
			pat,
			`mutation ($input: PublishPostInput!) { publishPost(input: $input) { post { url } } }`,
			{ input: { publicationId, slug: post.slug, ...common } },
		);
		console.log(`✔ Hashnode published: ${data.publishPost.post.url}`);
	}
}

// --- main -------------------------------------------------------------------

const [slug, ...rest] = process.argv.slice(2);
if (!slug) {
	console.error('Usage: node scripts/crosspost.mjs <post-slug> [--platforms devto,hashnode]');
	process.exit(1);
}
const platformsArg = rest.find((a, i) => rest[i - 1] === '--platforms') ?? 'devto,hashnode';
const platforms = platformsArg.split(',');

const post = await loadPost(slug);
console.log(`Cross-posting "${post.title}" (canonical: ${post.canonicalUrl})`);

let failed = false;
if (platforms.includes('devto')) {
	if (!process.env.DEVTO_API_KEY) {
		console.error('✖ DEVTO_API_KEY not set, skipping dev.to');
		failed = true;
	} else {
		await devto(post, process.env.DEVTO_API_KEY).catch((e) => ((failed = true), console.error(`✖ ${e.message}`)));
	}
}
if (platforms.includes('hashnode')) {
	if (!process.env.HASHNODE_PAT || !process.env.HASHNODE_PUBLICATION_ID) {
		console.error('✖ HASHNODE_PAT / HASHNODE_PUBLICATION_ID not set, skipping Hashnode');
		failed = true;
	} else {
		await hashnode(post, process.env.HASHNODE_PAT, process.env.HASHNODE_PUBLICATION_ID).catch(
			(e) => ((failed = true), console.error(`✖ ${e.message}`)),
		);
	}
}
process.exit(failed ? 1 : 0);

# micmayerm.github.io

My tech blog — built with [Astro](https://astro.build), deployed to GitHub Pages at <https://micmayerm.github.io>.

## Writing workflow

1. Draft articles and develop example code in the **private [`articles`](https://github.com/micmayerm/articles) repo**.
2. When ready, move the polished example code into the **public [`examples`](https://github.com/micmayerm/examples) repo** (one folder per article) and the finished Markdown into `src/content/blog/` here.
3. Push to `main` → the site deploys automatically via GitHub Actions.
4. Cross-post (see below).

## Posts

Posts live in `src/content/blog/*.md` with this front matter:

```yaml
---
title: 'My article'
description: 'One-sentence summary'
pubDate: 2026-07-10
tags: [python, testing]
crosspost: true # marker that this post should be cross-posted
heroImage: ../../assets/some-image.jpg # optional
---
```

Local preview: `npm run dev` — build check: `npm run build`.

## Cross-posting

The blog is the canonical home; copies on other platforms point back here via canonical URL (important for SEO — the copies won't compete with the original).

### dev.to + Hashnode (automated)

Run the **"Cross-post article"** workflow in the Actions tab (or locally, see `scripts/crosspost.mjs`). It publishes to dev.to and Hashnode with the canonical URL set, and updates the existing article on re-runs instead of duplicating.

Required repo secrets (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `DEVTO_API_KEY` | dev.to → Settings → Extensions → Generate API key |
| `HASHNODE_PAT` | Hashnode → Account settings → Developer → Personal access token |
| `HASHNODE_PUBLICATION_ID` | In the URL of your Hashnode dashboard: `hashnode.com/<id>/dashboard` |

Local usage:

```sh
DEVTO_API_KEY=... HASHNODE_PAT=... HASHNODE_PUBLICATION_ID=... \
  node scripts/crosspost.mjs my-post-slug
```

### Medium (manual)

Medium has no usable write API anymore. Use the importer:

1. <https://medium.com/p/import> → paste the published blog URL.
2. The importer sets the canonical URL automatically.
3. Review formatting (code blocks often need fixing) and publish.

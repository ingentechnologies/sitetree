# AGENTS.md

## What this is

Single-file Node.js CLI (`index.js`) that reads a sitemap XML, fetches page titles, and generates a self-contained interactive HTML tree diagram using D3.js. No build step, no tests, no CI.

## Commands

```bash
npm install                                          # install deps (cheerio, sitemapper)
node index.js <sitemap-url> [output-file] [--slugs-only]  # generate HTML
```

Default output file is `sitemap.html`. The `--slugs-only` flag skips HTTP title fetching (much faster).

## Key constraints

- **ESM only** -- `"type": "module"` in `package.json`. Use `import`, not `require`.
- **Node 18+** required (uses global `fetch`).
- **No build/transpile step** -- edit `index.js` directly.
- **Generated HTML files are build artifacts** -- `.gitignore` excludes `*.html`. Never commit `.html` files.
- The HTML output loads D3.js from CDN (`d3.v7`); it is not bundled.

## Architecture (single file)

`index.js` has four phases executed sequentially in `main()`:
1. **Fetch sitemap** -- uses `sitemapper` library
2. **Fetch titles** -- batched HTTP with `cheerio` for parsing (skipped with `--slugs-only`)
3. **Build tree** -- converts flat URL list into nested object keyed by path segments
4. **Generate HTML** -- template literal producing a complete HTML document with inline D3.js

Tunable constants at top of file: `CONCURRENCY` (default 5), `FETCH_TIMEOUT` (default 10s).

## Gotcha

The usage error message in `index.js:18-19` references `index2.js` -- this is a stale string from a rename. Fix it if you touch that area.

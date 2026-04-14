# sitetree

Reads a sitemap XML, visits each page to extract its title, and generates a self-contained interactive HTML diagram using D3.js.

## Prerequisites

- Node.js 18+

## Install

```bash
npm install
```

## Usage

```bash
node index.js <sitemap-url> [output-file] [--slugs-only]
```

- `<sitemap-url>` -- Full URL to a sitemap XML file (required)
- `[output-file]` -- Path for the generated HTML file (default: `sitemap.html`)
- `--slugs-only` -- Skip fetching page titles; output defaults to slug view

### Examples

```bash
# Basic usage (fetches titles from every page)
node index.js https://example.com/sitemap.xml

# Custom output file
node index.js https://example.com/sitemap.xml my-site-map.html

# Fast mode -- skip title fetching, show URL slugs only
node index.js https://example.com/sitemap.xml --slugs-only
```

## Output

The generated HTML file is fully self-contained (D3.js is loaded via CDN) and can be opened directly in any browser. It includes:

- **Collapsible tree** -- Click the circle node icon to expand or collapse its children
- **Click to visit** -- Click a node's text label to open its page in a new tab
  - **White labels** -- Pages found in the sitemap (direct URL)
  - **Orange labels** -- Container nodes inferred from the URL path structure
- **Titles / Slugs toggle** -- Switch between showing page titles and URL path slugs
- **Font size control** -- `A-` / `A+` buttons to adjust label size (10px--28px, default 16px)
- **Pan and zoom** -- Scroll to zoom, drag to pan
- **Tooltips** -- Hover over a node to see its full URL and child count
- **Expand All** -- Expands the tree, skipping nodes with more than 15 children to keep things manageable
- **Collapse All / Reset Zoom** -- Toolbar controls to reset the view

## Configuration

These constants at the top of `index.js` can be adjusted:

| Constant | Default | Description |
|---|---|---|
| `CONCURRENCY` | `5` | Number of pages fetched in parallel |
| `FETCH_TIMEOUT` | `10000` | Timeout in ms for each page request |

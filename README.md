# Sitemap Visualizer

Reads a sitemap XML, visits each page to extract its title, and generates a self-contained interactive HTML diagram using D3.js.

## Prerequisites

- Node.js 18+

## Install

```bash
npm install
```

## Usage

```bash
node index.js <sitemap-url> [output-file]
```

- `<sitemap-url>` -- Full URL to a sitemap XML file (required)
- `[output-file]` -- Path for the generated HTML file (default: `sitemap.html`)

### Examples

```bash
# Basic usage
node index.js https://example.com/sitemap.xml

# Custom output file
node index.js https://example.com/sitemap.xml my-site-map.html
```

## Output

The generated HTML file is fully self-contained (D3.js is loaded via CDN) and can be opened directly in any browser. It includes:

- **Collapsible tree** -- Click any node to expand or collapse its children
- **Pan and zoom** -- Scroll to zoom, drag to pan
- **Tooltips** -- Hover over a node to see its full URL
- **Navigate** -- Double-click a node to open its page in a new tab
- **Toolbar** -- Expand All, Collapse All, and Reset Zoom buttons

## Configuration

These constants at the top of `index.js` can be adjusted:

| Constant | Default | Description |
|---|---|---|
| `CONCURRENCY` | `5` | Number of pages fetched in parallel |
| `FETCH_TIMEOUT` | `10000` | Timeout in ms for each page request |

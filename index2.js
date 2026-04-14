import Sitemapper from "sitemapper";
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const SLUGS_ONLY = args.includes("--slugs-only");
const positional = args.filter((a) => !a.startsWith("--"));
const SITEMAP_URL = positional[0];
const OUTPUT_FILE = positional[1] || "sitemap.html";
const CONCURRENCY = 5; // how many pages to fetch in parallel
const FETCH_TIMEOUT = 10_000; // ms per page request

if (!SITEMAP_URL) {
  console.error("Usage: node index2.js <sitemap-url> [output-file] [--slugs-only]");
  console.error("  Example: node index2.js https://example.com/sitemap.xml sitemap.html");
  console.error("  --slugs-only  Skip fetching page titles; default view shows slugs");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Fetch & parse the sitemap
// ---------------------------------------------------------------------------
async function fetchSitemap(url) {
  console.log(`Fetching sitemap: ${url}`);
  const mapper = new Sitemapper({ url, timeout: 15_000 });
  const { sites } = await mapper.fetch();
  console.log(`Found ${sites.length} URLs in sitemap`);
  return sites;
}

// ---------------------------------------------------------------------------
// 2. Visit each page and grab its <title>
// ---------------------------------------------------------------------------
async function fetchTitle(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SitemapVisualizer/1.0" },
    });
    clearTimeout(timer);
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $("title").first().text().trim();
    return title || null;
  } catch (err) {
    console.warn(`  Warning: could not fetch ${url} - ${err.message}`);
    return null;
  }
}

async function fetchAllTitles(urls) {
  const results = new Map(); // url -> title
  // Process in batches for controlled concurrency
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const titles = await Promise.all(batch.map((u) => fetchTitle(u)));
    batch.forEach((url, idx) => {
      results.set(url, titles[idx]);
    });
    const done = Math.min(i + CONCURRENCY, urls.length);
    process.stdout.write(`\r  Fetched titles: ${done}/${urls.length}`);
  }
  console.log(); // newline
  return results;
}

// ---------------------------------------------------------------------------
// 3. Build a tree structure from URLs
//    Each node carries both `title` and `segment` so the UI can toggle.
// ---------------------------------------------------------------------------
function buildTree(urls, titleMap) {
  const root = { name: "Site", title: "Site", segment: "/", children: [], url: null, fullPath: "/" };

  for (const rawUrl of urls) {
    const parsed = new URL(rawUrl);
    // Use hostname as root label on first URL
    if (root.name === "Site") {
      root.name = parsed.hostname;
      root.title = parsed.hostname;
      root.segment = parsed.hostname;
    }
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean); // remove empty strings

    let current = root;
    let builtPath = "";
    for (const seg of segments) {
      builtPath += "/" + seg;
      let child = current.children.find((c) => c.segment === seg);
      if (!child) {
        child = { segment: seg, title: seg, name: seg, children: [], url: null, fullPath: builtPath };
        current.children.push(child);
      }
      current = child;
    }
    // Attach the actual URL + title to the deepest matching node
    current.url = rawUrl;
    const title = titleMap.get(rawUrl);
    if (title) {
      current.name = title;
      current.title = title;
    }
  }

  return root;
}

// ---------------------------------------------------------------------------
// 4. Generate the HTML with an interactive D3.js collapsible tree
//    Includes a toggle button to switch between Title and Slug labels.
// ---------------------------------------------------------------------------
function generateHTML(tree, slugsOnly) {
  const treeJSON = JSON.stringify(tree, null, 2);
  const defaultMode = slugsOnly ? "slug" : "title";
  const titlesActive = slugsOnly ? "" : "active";
  const slugsActive = slugsOnly ? "active" : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Sitemap - ${tree.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    overflow: hidden;
  }
  #toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    background: #161b22; border-bottom: 1px solid #30363d;
    padding: 10px 20px; display: flex; align-items: center; gap: 16px;
  }
  #toolbar h1 { font-size: 16px; font-weight: 600; color: #58a6ff; }
  #toolbar .stats { font-size: 13px; color: #8b949e; }
  #toolbar button {
    background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
    padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  #toolbar button:hover { background: #30363d; }
  #toolbar button.active {
    background: #1f6feb; border-color: #58a6ff; color: #fff;
  }
  #toolbar .separator {
    width: 1px; height: 20px; background: #30363d;
  }
  #toolbar .label-toggle {
    display: flex; align-items: center; gap: 0;
  }
  #toolbar .label-toggle button {
    border-radius: 0;
  }
  #toolbar .label-toggle button:first-child {
    border-radius: 6px 0 0 6px;
  }
  #toolbar .label-toggle button:last-child {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }
  #toolbar .font-size-control {
    display: flex; align-items: center; gap: 0;
  }
  #toolbar .font-size-control button {
    border-radius: 0; min-width: 32px; text-align: center;
  }
  #toolbar .font-size-control button:first-child {
    border-radius: 6px 0 0 6px;
  }
  #toolbar .font-size-control button:last-child {
    border-radius: 0 6px 6px 0;
  }
  #toolbar .font-size-control .font-size-label {
    background: #0d1117; border: 1px solid #30363d; border-left: none; border-right: none;
    color: #c9d1d9; padding: 5px 10px; font-size: 13px; min-width: 48px; text-align: center;
  }
  svg { display: block; }
  .node circle {
    stroke-width: 2px; cursor: pointer;
    transition: r 0.15s ease;
  }
  .node circle:hover { r: 7; }
  .node text {
    fill: #c9d1d9;
    cursor: pointer;
  }
  .node text.has-url {
    fill: #ffffff;
  }
  .node text.has-url:hover {
    text-decoration: underline;
    fill: #e6e6e6;
  }
  .node text.inferred-url {
    fill: #d29922;
  }
  .node text.inferred-url:hover {
    text-decoration: underline;
    fill: #e8b73a;
  }
  .link {
    fill: none; stroke: #30363d; stroke-width: 1.5px;
  }
  .tooltip {
    position: fixed; padding: 8px 12px; background: #1c2128; border: 1px solid #30363d;
    border-radius: 6px; font-size: 12px; color: #58a6ff; pointer-events: none;
    max-width: 400px; word-break: break-all; z-index: 100; display: none;
  }
</style>
</head>
<body>
<div id="toolbar">
  <h1>Sitemap: ${tree.name}</h1>
  <span class="stats" id="stats"></span>
  <div class="separator"></div>
  <div class="label-toggle">
    <button id="showTitles" class="${titlesActive}">Titles</button>
    <button id="showSlugs" class="${slugsActive}">Slugs</button>
  </div>
  <div class="separator"></div>
  <div class="font-size-control">
    <button id="fontDown">A-</button>
    <span class="font-size-label" id="fontSizeLabel">16px</span>
    <button id="fontUp">A+</button>
  </div>
  <div class="separator"></div>
  <button id="expandAll">Expand All</button>
  <button id="collapseAll">Collapse All</button>
  <button id="resetZoom">Reset Zoom</button>
</div>
<div class="tooltip" id="tooltip"></div>
<svg id="canvas"></svg>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
// ---- Data ----
const treeData = ${treeJSON};

// ---- Label mode: "title" or "slug" ----
let labelMode = "${defaultMode}";

// ---- Font size ----
const FONT_MIN = 10;
const FONT_MAX = 28;
const FONT_STEP = 2;
let fontSize = 16;

// ---- Dimensions ----
const margin = { top: 60, right: 200, bottom: 20, left: 120 };
const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#canvas")
  .attr("width", width)
  .attr("height", height);

const g = svg.append("g").attr("transform", \`translate(\${margin.left},\${margin.top})\`);

// ---- Zoom ----
const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on("zoom", (event) => g.attr("transform", event.transform));
svg.call(zoom);
svg.call(zoom.transform, d3.zoomIdentity.translate(margin.left, height / 2).scale(0.9));

document.getElementById("resetZoom").addEventListener("click", () => {
  svg.transition().duration(500)
    .call(zoom.transform, d3.zoomIdentity.translate(margin.left, height / 2).scale(0.9));
});

// ---- Tree layout ----
const root = d3.hierarchy(treeData);
root.x0 = height / 2;
root.y0 = 0;

function countNodes(d) { return d.children ? d.children.reduce((s, c) => s + countNodes(c), 1) : 1; }
document.getElementById("stats").textContent = countNodes(root) + " pages";

// Start with top 2 levels expanded
root.descendants().forEach((d) => {
  if (d.depth >= 2 && d.children) {
    d._children = d.children;
    d.children = null;
  }
});

const treemap = d3.tree().nodeSize([22, 320]);

// ---- Tooltip ----
const tooltip = document.getElementById("tooltip");
function showTooltip(event, d) {
  const url = getNodeUrl(d) || d.data.fullPath || "";
  if (!url) return;
  const childCount = (d.children || d._children || []).length;
  const childInfo = childCount > 0 ? " (" + childCount + " children)" : "";
  tooltip.style.display = "block";
  tooltip.textContent = url + childInfo;
  tooltip.style.left = (event.clientX + 12) + "px";
  tooltip.style.top = (event.clientY - 10) + "px";
}
function hideTooltip() { tooltip.style.display = "none"; }

// ---- Colors ----
const depthColors = ["#58a6ff", "#3fb950", "#d29922", "#f78166", "#bc8cff", "#f778ba"];
function nodeColor(d) { return depthColors[d.depth % depthColors.length]; }

// ---- Helper: get display label based on current mode ----
function getLabel(d) {
  if (labelMode === "slug") {
    return d.data.segment || d.data.name;
  }
  return d.data.title || d.data.name;
}

// ---- Helper: classify node link type ----
function linkClass(d) {
  if (d.data.url) return "has-url";
  return "inferred-url";
}

// ---- Helper: get the best URL for a node ----
// Nodes with an explicit URL use that. Container-only nodes get a
// URL constructed from their fullPath relative to the site origin.
function getNodeUrl(d) {
  if (d.data.url) return d.data.url;
  // Walk up to root to find the origin from any descendant with a real URL
  let origin = "";
  root.descendants().some((n) => {
    if (n.data.url) {
      try { origin = new URL(n.data.url).origin; } catch {}
      return true;
    }
  });
  if (origin && d.data.fullPath) return origin + d.data.fullPath;
  return null;
}

// ---- Update ----
let i = 0;
function update(source) {
  const tree = treemap(root);
  const nodes = tree.descendants();
  const links = tree.links();

  // ---- Links ----
  const link = g.selectAll("path.link").data(links, (d) => d.target.id || (d.target.id = ++i));

  const linkEnter = link.enter().insert("path", "g")
    .attr("class", "link")
    .attr("d", () => {
      const o = { x: source.x0, y: source.y0 };
      return diagonal(o, o);
    });

  const linkUpdate = linkEnter.merge(link);
  linkUpdate.transition().duration(400)
    .attr("d", (d) => diagonal(d.source, d.target));

  link.exit().transition().duration(400)
    .attr("d", () => {
      const o = { x: source.x, y: source.y };
      return diagonal(o, o);
    }).remove();

  // ---- Nodes ----
  const node = g.selectAll("g.node").data(nodes, (d) => d.id || (d.id = ++i));

  const nodeEnter = node.enter().append("g")
    .attr("class", "node")
    .attr("transform", () => \`translate(\${source.y0},\${source.x0})\`)
    .on("mouseover", showTooltip)
    .on("mousemove", showTooltip)
    .on("mouseout", hideTooltip);

  // Circle: expand / collapse only
  nodeEnter.append("circle")
    .attr("r", 5)
    .style("fill", (d) => d._children ? nodeColor(d) : "#0d1117")
    .style("stroke", (d) => nodeColor(d))
    .on("click", (event, d) => { event.stopPropagation(); toggle(d); update(d); });

  // Text: click opens the page URL in a new tab
  nodeEnter.append("text")
    .attr("dy", "0.35em")
    .attr("x", (d) => (d.children || d._children) ? -10 : 10)
    .attr("text-anchor", (d) => (d.children || d._children) ? "end" : "start")
    .attr("class", (d) => linkClass(d))
    .style("font-size", fontSize + "px")
    .text((d) => truncate(getLabel(d), 40))
    .on("click", (event, d) => {
      event.stopPropagation();
      const url = getNodeUrl(d);
      if (url) window.open(url, "_blank");
    });

  const nodeUpdate = nodeEnter.merge(node);
  nodeUpdate.transition().duration(400)
    .attr("transform", (d) => \`translate(\${d.y},\${d.x})\`);

  nodeUpdate.select("circle")
    .style("fill", (d) => d._children ? nodeColor(d) : "#0d1117")
    .style("stroke", (d) => nodeColor(d));

  nodeUpdate.select("text")
    .attr("x", (d) => (d.children || d._children) ? -10 : 10)
    .attr("text-anchor", (d) => (d.children || d._children) ? "end" : "start")
    .attr("class", (d) => linkClass(d))
    .style("font-size", fontSize + "px")
    .text((d) => truncate(getLabel(d), 40));

  node.exit().transition().duration(400)
    .attr("transform", () => \`translate(\${source.y},\${source.x})\`)
    .remove();

  nodes.forEach((d) => { d.x0 = d.x; d.y0 = d.y; });
}

function diagonal(s, d) {
  return \`M \${s.y} \${s.x}
          C \${(s.y + d.y) / 2} \${s.x},
            \${(s.y + d.y) / 2} \${d.x},
            \${d.y} \${d.x}\`;
}

function toggle(d) {
  if (d.children) { d._children = d.children; d.children = null; }
  else { d.children = d._children; d._children = null; }
}

function truncate(str, len) { return str.length > len ? str.slice(0, len) + "..." : str; }

// ---- Expand / Collapse ----
const EXPAND_LIMIT = 15;
function expandAll(d) {
  if (d._children) {
    // Skip expanding nodes with too many children
    if (d._children.length <= EXPAND_LIMIT) {
      d.children = d._children;
      d._children = null;
    }
  }
  if (d.children) d.children.forEach(expandAll);
}
function collapseAll(d) {
  if (d.children) { d.children.forEach(collapseAll); d._children = d.children; d.children = null; }
}
document.getElementById("expandAll").addEventListener("click", () => { expandAll(root); update(root); });
document.getElementById("collapseAll").addEventListener("click", () => {
  root.children.forEach(collapseAll);
  update(root);
});

// ---- Label toggle: Titles / Slugs ----
const btnTitles = document.getElementById("showTitles");
const btnSlugs = document.getElementById("showSlugs");

btnTitles.addEventListener("click", () => {
  if (labelMode === "title") return;
  labelMode = "title";
  btnTitles.classList.add("active");
  btnSlugs.classList.remove("active");
  update(root);
});

btnSlugs.addEventListener("click", () => {
  if (labelMode === "slug") return;
  labelMode = "slug";
  btnSlugs.classList.add("active");
  btnTitles.classList.remove("active");
  update(root);
});

// ---- Font size controls ----
const fontSizeLabel = document.getElementById("fontSizeLabel");
function applyFontSize() {
  fontSizeLabel.textContent = fontSize + "px";
  // Update the row spacing to match font size so lines don't overlap vertically
  treemap.nodeSize([Math.max(22, fontSize * 1.6), 320]);
  update(root);
}
document.getElementById("fontDown").addEventListener("click", () => {
  if (fontSize <= FONT_MIN) return;
  fontSize -= FONT_STEP;
  applyFontSize();
});
document.getElementById("fontUp").addEventListener("click", () => {
  if (fontSize >= FONT_MAX) return;
  fontSize += FONT_STEP;
  applyFontSize();
});

// ---- Initial render ----
update(root);

// ---- Resize ----
window.addEventListener("resize", () => {
  svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
});
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // 1. Fetch sitemap
  const urls = await fetchSitemap(SITEMAP_URL);
  if (urls.length === 0) {
    console.error("No URLs found in the sitemap.");
    process.exit(1);
  }

  // 2. Fetch titles (skip if --slugs-only)
  let titleMap;
  if (SLUGS_ONLY) {
    console.log("Slugs-only mode: skipping title fetching");
    titleMap = new Map();
  } else {
    console.log("Fetching page titles...");
    titleMap = await fetchAllTitles(urls);
    const found = [...titleMap.values()].filter(Boolean).length;
    console.log(`Fetched ${found} titles out of ${urls.length} pages`);
  }

  // 3. Build tree
  const tree = buildTree(urls, titleMap);

  // 4. Generate HTML
  const html = generateHTML(tree, SLUGS_ONLY);
  const outPath = path.resolve(OUTPUT_FILE);
  fs.writeFileSync(outPath, html, "utf-8");
  console.log(`\nDone! Interactive sitemap written to: ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, collectUrls } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const noTitles = new Map();

function makeUrls(...urls) {
  return urls;
}

// ---------------------------------------------------------------------------
// buildTree tests
// ---------------------------------------------------------------------------

test("buildTree: root is named after the hostname", () => {
  const tree = buildTree(["https://example.com/a/b"], noTitles);
  assert.equal(tree.name, "example.com");
});

test("buildTree: flat list produces correct depth", () => {
  const tree = buildTree(["https://example.com/a/b/c"], noTitles);
  // root -> a -> b -> c
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].segment, "a");
  assert.equal(tree.children[0].children[0].segment, "b");
  assert.equal(tree.children[0].children[0].children[0].segment, "c");
});

test("buildTree: sibling URLs produce sibling nodes", () => {
  const tree = buildTree([
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
  ], noTitles);
  assert.equal(tree.children.length, 3);
  const segments = tree.children.map((c) => c.segment).sort();
  assert.deepEqual(segments, ["a", "b", "c"]);
});

test("buildTree: shared prefix is deduplicated into one node", () => {
  const tree = buildTree([
    "https://example.com/products/widget",
    "https://example.com/products/gadget",
  ], noTitles);
  // root -> products (1 node) -> widget, gadget
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].segment, "products");
  assert.equal(tree.children[0].children.length, 2);
});

test("buildTree: URL is attached to the correct leaf node", () => {
  const urls = ["https://example.com/about/team"];
  const tree = buildTree(urls, noTitles);
  const leaf = tree.children[0].children[0];
  assert.equal(leaf.url, "https://example.com/about/team");
});

test("buildTree: title from titleMap is applied to leaf node", () => {
  const urls = ["https://example.com/about"];
  const titles = new Map([["https://example.com/about", "About Us"]]);
  const tree = buildTree(urls, titles);
  assert.equal(tree.children[0].name, "About Us");
  assert.equal(tree.children[0].title, "About Us");
});

test("buildTree: container node has no URL when only children have URLs", () => {
  const tree = buildTree([
    "https://example.com/products/widget",
    "https://example.com/products/gadget",
  ], noTitles);
  const productsNode = tree.children[0];
  assert.equal(productsNode.url, null);
});

// ---------------------------------------------------------------------------
// collectUrls tests
// ---------------------------------------------------------------------------

test("collectUrls: returns all URLs from a flat tree", () => {
  const urls = [
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
  ];
  const tree = buildTree(urls, noTitles);
  const collected = collectUrls(tree);
  const collectedUrls = collected.map((r) => r.url).sort();
  assert.deepEqual(collectedUrls, [...urls].sort());
});

test("collectUrls: returns all URLs from a deep nested tree", () => {
  const urls = [
    "https://example.com/us/en/products/widget",
    "https://example.com/us/en/products/gadget",
    "https://example.com/us/en/about",
    "https://example.com/us/en",
  ];
  const tree = buildTree(urls, noTitles);
  const collected = collectUrls(tree);
  assert.equal(collected.length, urls.length);
  const collectedUrls = new Set(collected.map((r) => r.url));
  for (const url of urls) {
    assert.ok(collectedUrls.has(url), `Missing URL in export: ${url}`);
  }
});

test("collectUrls: count matches sitemap URL count (no URLs lost)", () => {
  const urls = makeUrls(
    "https://site.com/a",
    "https://site.com/a/b",
    "https://site.com/a/b/c",
    "https://site.com/a/b/d",
    "https://site.com/x",
    "https://site.com/x/y",
  );
  const tree = buildTree(urls, noTitles);
  const collected = collectUrls(tree);
  assert.equal(collected.length, urls.length,
    `Expected ${urls.length} URLs in export, got ${collected.length}`);
});

test("collectUrls: slug field matches path segment", () => {
  const tree = buildTree(["https://example.com/about-us"], noTitles);
  const collected = collectUrls(tree);
  assert.equal(collected[0].slug, "about-us");
});

test("collectUrls: title field falls back to segment name when no title fetched", () => {
  const tree = buildTree(["https://example.com/page"], noTitles);
  const collected = collectUrls(tree);
  // No title fetched — title falls back to the segment name
  assert.equal(collected[0].title, "page");
});

test("collectUrls: title field reflects fetched title", () => {
  const url = "https://example.com/page";
  const titles = new Map([[url, "My Page Title"]]);
  const tree = buildTree([url], titles);
  const collected = collectUrls(tree);
  assert.equal(collected[0].title, "My Page Title");
});

// ---------------------------------------------------------------------------
// CSV integrity: collectUrls vs raw URL list
// ---------------------------------------------------------------------------

test("CSV export: no URLs are lost for a realistic mixed-depth sitemap", () => {
  const urls = [
    "https://www.example.com/us/en",
    "https://www.example.com/us/en/home",
    "https://www.example.com/us/en/products",
    "https://www.example.com/us/en/products/category-a",
    "https://www.example.com/us/en/products/category-a/item-1",
    "https://www.example.com/us/en/products/category-a/item-2",
    "https://www.example.com/us/en/products/category-b",
    "https://www.example.com/us/en/about",
    "https://www.example.com/us/en/about/team",
    "https://www.example.com/us/en/about/careers",
    "https://www.example.com/us/en/legal/privacy",
    "https://www.example.com/us/en/legal/terms",
  ];
  const tree = buildTree(urls, noTitles);
  const collected = collectUrls(tree);
  assert.equal(collected.length, urls.length,
    `URL count mismatch: sitemap has ${urls.length}, export has ${collected.length}`);
  const exportedSet = new Set(collected.map((r) => r.url));
  for (const url of urls) {
    assert.ok(exportedSet.has(url), `URL missing from export: ${url}`);
  }
});

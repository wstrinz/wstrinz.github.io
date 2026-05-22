import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const snapshots = JSON.parse(fs.readFileSync(path.join(root, "snapshots.json"), "utf8"));
const latest = (Array.isArray(snapshots) ? snapshots : [snapshots])
  .filter(snapshot => snapshot.rows?.length)
  .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at))
  .at(-1);

if (!latest) {
  throw new Error("No snapshot rows available.");
}

const slugify = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

const candidatesRoot = path.join(root, "candidates");
fs.mkdirSync(candidatesRoot, { recursive: true });

const rows = latest.rows.map(row => Array.isArray(row) ? { entity: row[1] } : row);
const slugs = new Set();

for (const row of rows) {
  const slug = slugify(row.entity);
  if (!slug || slugs.has(slug)) continue;
  slugs.add(slug);
  const dir = path.join(candidatesRoot, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(row.entity)} candidate detail page with market, polling, Vibes Check, catalysts, and mention-test notes.">
  <title>${escapeHtml(row.entity)} | Candidate Market/Polling Watch</title>
  <link rel="stylesheet" href="../../candidate-detail.css">
</head>
<body data-candidate-slug="${escapeHtml(slug)}">
  <div id="app"></div>
  <script src="../../candidate-detail.js"></script>
</body>
</html>
`);
}

const manifest = [...slugs].sort().map(slug => `candidates/${slug}/`).join("\n");
fs.writeFileSync(path.join(candidatesRoot, "manifest.txt"), `${manifest}\n`);
console.log(`Generated ${slugs.size} candidate pages.`);

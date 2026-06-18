#!/usr/bin/env node
// Generates themed light + dark SVG cards for the GitHub profile README.
// Data comes live from the GitHub REST API; everything else is profile.config.json.
// Run: node scripts/generate-cards.mjs   (GITHUB_TOKEN optional but avoids rate limits)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets", "cards");
const config = JSON.parse(await readFile(join(root, "profile.config.json"), "utf8"));

const MODES = {
  light: { cardBg: "#ffffff", surface: "#f6f8fa", border: "#d0d7de", text: "#1f2328", sub: "#656d76", faint: "#8b949e" },
  dark: { cardBg: "#0d1117", surface: "#161b22", border: "#30363d", text: "#e6edf3", sub: "#9198a1", faint: "#6e7681" },
};

const THEMES = {
  pink: { base: "#D4537E", textLight: "#72243E", textDark: "#ED93B1" },
  green: { base: "#639922", textLight: "#27500A", textDark: "#97C459" },
  blue: { base: "#378ADD", textLight: "#0C447C", textDark: "#85B7EB" },
  purple: { base: "#7F77DD", textLight: "#26215C", textDark: "#AFA9EC" },
  amber: { base: "#BA7517", textLight: "#633806", textDark: "#EF9F27" },
  gray: { base: "#888780", textLight: "#444441", textDark: "#B4B2A9" },
};

const LANG_COLORS = {
  TypeScript: "#3178c6", Kotlin: "#a97bff", Java: "#b07219", JavaScript: "#f1e05a",
  Python: "#3572A5", Swift: "#F05138", Shell: "#89e051", CSS: "#563d7c", HTML: "#e34c26",
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const approxWidth = (text, size) => [...String(text)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2000 ? size : size * 0.56), 0);

// ---- Fetch live GitHub data ----------------------------------------------
async function fetchRepos(user) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { "User-Agent": "profile-card-generator", Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/users/${user}/repos?per_page=100&type=owner&sort=updated`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const map = new Map();
  for (const r of await res.json()) {
    map.set(r.name, { stars: r.stargazers_count, lang: r.language, url: r.html_url, fork: r.fork });
  }
  return map;
}

let repos;
try {
  repos = await fetchRepos(config.githubUser);
  console.log(`Fetched ${repos.size} repos for ${config.githubUser}`);
} catch (e) {
  console.warn(`Could not fetch repos (${e.message}); rendering without live stars.`);
  repos = new Map();
}

const stats = (() => {
  let totalStars = 0;
  const langCount = {};
  for (const r of repos.values()) {
    if (r.fork) continue;
    totalStars += r.stars;
    if (r.lang) langCount[r.lang] = (langCount[r.lang] || 0) + 1;
  }
  const langs = Object.entries(langCount).sort((a, b) => b[1] - a[1]);
  const totalLang = langs.reduce((s, [, n]) => s + n, 0) || 1;
  return { repoCount: [...repos.values()].filter((r) => !r.fork).length, totalStars, langs, totalLang };
})();

// ---- SVG building blocks --------------------------------------------------
function frame(m, w, h, opts = {}) {
  const fill = opts.surface ? m.surface : m.cardBg;
  return `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${fill}" stroke="${m.border}"/>`;
}

function wrap(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars) { lines.push(line.trim()); line = word; }
    else line += " " + word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function chips(items, x, y, maxW, m, theme) {
  const t = THEMES[theme];
  let cx = x, cy = y, out = "";
  const padX = 9, h = 20, gap = 6, size = 11.5;
  for (const it of items) {
    const w = approxWidth(it, size) + padX * 2;
    if (cx + w > x + maxW) { cx = x; cy += h + gap; }
    out += `<rect x="${cx.toFixed(1)}" y="${cy}" width="${w.toFixed(1)}" height="${h}" rx="6" fill="${t.base}" fill-opacity="${m === MODES.light ? 0.12 : 0.2}"/>`;
    out += `<text x="${(cx + w / 2).toFixed(1)}" y="${cy + 14}" font-size="${size}" text-anchor="middle" fill="${m === MODES.light ? t.textLight : t.textDark}" font-family="ui-monospace, monospace">${esc(it)}</text>`;
    cx += w + gap;
  }
  return { svg: out, bottom: cy + h };
}

function star(cx, cy, r, fill) {
  let pts = "";
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts += `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)} `;
  }
  return `<polygon points="${pts.trim()}" fill="${fill}"/>`;
}

function titleRow(card, m, x = 18, y = 30) {
  const t = THEMES[card.accent];
  let icon;
  if (card.kanji) icon = `<text x="${x}" y="${y + 6}" font-size="22" fill="${t.base}" font-family="'Hiragino Sans','Noto Sans JP',sans-serif">${esc(card.kanji)}</text>`;
  else icon = `<rect x="${x}" y="${y - 11}" width="14" height="14" rx="4" fill="${t.base}"/>`;
  const tx = card.kanji ? x + 32 : x + 24;
  let flag = "";
  if (card.flagship) {
    const fw = approxWidth("flagship", 11) + 18;
    flag = `<rect x="${450 - 18 - fw}" y="${y - 13}" width="${fw}" height="18" rx="6" fill="${t.base}" fill-opacity="${m === MODES.light ? 0.14 : 0.22}"/><text x="${450 - 18 - fw / 2}" y="${y}" font-size="11" text-anchor="middle" fill="${m === MODES.light ? t.textLight : t.textDark}" font-family="ui-monospace, monospace">flagship</text>`;
  }
  return `${icon}<text x="${tx}" y="${y + 1}" font-size="15.5" font-weight="600" fill="${m.text}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(card.title)}</text>${flag}`;
}

// ---- Card renderers -------------------------------------------------------
const W = 450, H = 200;

function renderRepoCard(card, m) {
  const blurb = wrap(card.blurb, 52).map((ln, i) => `<text x="18" y="${62 + i * 18}" font-size="12.5" fill="${m.sub}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(ln)}</text>`).join("");
  let spark = "";
  let chipY = 112;
  if (card.sparkline) {
    spark = `<polyline points="18,118 66,108 114,113 162,96 210,103 258,88 306,98 354,90 402,104 432,96" fill="none" stroke="${THEMES[card.accent].base}" stroke-width="1.6"/>`
      + `<polyline points="18,132 66,128 114,135 162,124 210,131 258,120 306,126 354,118 402,128 432,122" fill="none" stroke="#5DCAA5" stroke-width="1.6"/>`;
    chipY = 150;
  }
  const labels = card.repos.map((name) => {
    const r = repos.get(name);
    return r && r.stars > 0 ? `${name} ★${r.stars}` : name;
  });
  const c = chips(labels, 18, chipY, W - 36, m, card.accent);
  return svgDoc(W, H, m, `${frame(m, W, H)}${titleRow(card, m)}${blurb}${spark}${c.svg}`);
}

function renderAocCard(card, m) {
  const blurb = wrap(card.blurb, 52).map((ln, i) => `<text x="18" y="${150 + i * 18}" font-size="12.5" fill="${m.sub}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(ln)}</text>`).join("");
  const n = card.years.length;
  const slot = (W - 36) / n;
  let wall = "";
  card.years.forEach((y, i) => {
    const cx = 18 + slot * i + slot / 2;
    wall += star(cx, 78, 13, "#e3b341");
    wall += star(cx, 78, 13, "none");
    wall += `<text x="${cx}" y="108" font-size="11" text-anchor="middle" fill="${m.faint}" font-family="ui-monospace, monospace">'${String(y.year).slice(2)}</text>`;
    wall += `<text x="${cx}" y="122" font-size="9.5" text-anchor="middle" fill="${m.faint}" font-family="ui-monospace, monospace">${y.lang}</text>`;
  });
  const total = `<text x="${W - 18}" y="30" font-size="12" text-anchor="end" fill="${THEMES[card.accent].base}" font-family="ui-monospace, monospace">${n} years</text>`;
  return svgDoc(W, H, m, `${frame(m, W, H)}${titleRow(card, m)}${total}${wall}${blurb}`);
}

function renderHobbiesCard(card, m) {
  const w = 912, h = 104;
  const t = THEMES[card.accent];
  const blurb = `<text x="${28 + approxWidth(card.title, 15.5) + 30}" y="42" font-size="12.5" fill="${m.sub}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(card.blurb)}</text>`;
  let cx = 28;
  let row = "";
  for (const it of card.items) {
    const cw = approxWidth(it.label, 13) + 40;
    row += `<rect x="${cx.toFixed(1)}" y="58" width="${cw.toFixed(1)}" height="34" rx="8" fill="${t.base}" fill-opacity="${m === MODES.light ? 0.1 : 0.18}"/>`;
    row += `<text x="${cx + 14}" y="80" font-size="15">${it.emoji || "•"}</text>`;
    row += `<text x="${cx + 36}" y="79" font-size="12.5" fill="${m === MODES.light ? t.textLight : t.textDark}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(it.label)}</text>`;
    cx += cw + 10;
  }
  return svgDoc(w, h, m, `${frame(m, w, h)}<rect x="28" y="22" width="14" height="14" rx="4" fill="${t.base}"/><text x="52" y="34" font-size="15.5" font-weight="600" fill="${m.text}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(card.title)}</text>${blurb}${row}`);
}

function renderHero(m) {
  const w = 912, h = 150;
  const name = `<text x="28" y="50" font-size="26" font-weight="600" fill="${m.text}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(config.name)}</text>`;
  const tag = `<text x="28" y="78" font-size="13.5" fill="${m.sub}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(config.tagline)}</text>`;
  const reading = config.nowReading
    ? `<text x="28" y="120" font-size="12" fill="${m.faint}" font-family="ui-monospace, monospace">📗 now reading · ${esc(config.nowReading.title)} — ${esc(config.nowReading.author)}</text>`
    : "";
  // git-graph motif on the right
  const cols = ["#378ADD", "#1D9E75", "#D85A30", "#7F77DD"];
  const baseX = 612;
  let graph = "";
  const nodes = [
    { x: 0, lane: 0 }, { x: 1, lane: 0 }, { x: 2, lane: 1 }, { x: 3, lane: 0 },
    { x: 4, lane: 2 }, { x: 5, lane: 1 }, { x: 6, lane: 0 }, { x: 7, lane: 3 }, { x: 8, lane: 0 },
  ];
  const px = (n) => baseX + n.x * 32;
  const py = (n) => 40 + n.lane * 24;
  // edges along main lane + branch merges
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    graph += `<path d="M${px(a)},${py(a)} C${px(a) + 16},${py(a)} ${px(b) - 16},${py(b)} ${px(b)},${py(b)}" fill="none" stroke="${cols[b.lane]}" stroke-width="2" opacity="0.85"/>`;
  }
  for (const n of nodes) graph += `<circle cx="${px(n)}" cy="${py(n)}" r="5" fill="${cols[n.lane]}" stroke="${m.cardBg}" stroke-width="2"/>`;
  graph += `<text x="${baseX}" y="140" font-size="10.5" fill="${m.faint}" font-family="ui-monospace, monospace">rendered with react-git-log</text>`;
  // stats strip
  const topLangs = stats.langs.slice(0, 4);
  let lx = 28;
  let langBar = "";
  if (topLangs.length) {
    langBar += `<text x="28" y="120" font-size="12" fill="${m.faint}" font-family="ui-monospace, monospace"></text>`;
  }
  return svgDoc(w, h, m, `${frame(m, w, h, { surface: true })}${name}${tag}${reading}${graph}`);
}

function renderStatsStrip(m) {
  const w = 912, h = 92;
  const t = THEMES.gray;
  const stat = (x, value, label) =>
    `<text x="${x}" y="42" font-size="24" font-weight="600" fill="${m.text}" font-family="-apple-system,'Segoe UI',sans-serif">${value}</text>`
    + `<text x="${x}" y="62" font-size="11.5" fill="${m.sub}" font-family="-apple-system,'Segoe UI',sans-serif">${label}</text>`;
  let bars = "";
  const barX = 360, barW = w - barX - 28, total = stats.totalLang;
  let bx = barX;
  for (const [lang, n] of stats.langs.slice(0, 6)) {
    const seg = (n / total) * barW;
    bars += `<rect x="${bx.toFixed(1)}" y="34" width="${Math.max(seg - 2, 2).toFixed(1)}" height="10" rx="3" fill="${LANG_COLORS[lang] || t.base}"/>`;
    bx += seg;
  }
  let legend = "";
  let lx = barX;
  for (const [lang, n] of stats.langs.slice(0, 4)) {
    legend += `<circle cx="${lx + 4}" cy="60" r="4" fill="${LANG_COLORS[lang] || t.base}"/>`;
    legend += `<text x="${lx + 13}" y="64" font-size="11" fill="${m.sub}" font-family="-apple-system,'Segoe UI',sans-serif">${esc(lang)}</text>`;
    lx += approxWidth(lang, 11) + 34;
  }
  return svgDoc(w, h, m, `${frame(m, w, h)}${stat(28, stats.repoCount, "public repos")}${stat(150, stats.totalStars, "total stars")}${bars}${legend}`);
}

function svgDoc(w, h, m, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${body}</svg>`;
}

// ---- Drive ----------------------------------------------------------------
// attach emoji to hobby items
for (const card of config.cards) {
  if (card.kind === "hobbies") {
    const map = { music: "🎸", barbell: "🏋️", book: "📖", ramen: "🍜" };
    for (const it of card.items) it.emoji = map[it.icon] || "•";
  }
}

const renderers = { repos: renderRepoCard, aoc: renderAocCard, hobbies: renderHobbiesCard };

await mkdir(outDir, { recursive: true });
const written = [];
for (const mode of ["light", "dark"]) {
  const m = MODES[mode];
  await writeFile(join(outDir, `hero-${mode}.svg`), renderHero(m));
  await writeFile(join(outDir, `stats-${mode}.svg`), renderStatsStrip(m));
  written.push(`hero-${mode}`, `stats-${mode}`);
  for (const card of config.cards) {
    const fn = renderers[card.kind];
    if (!fn) continue;
    await writeFile(join(outDir, `${card.id}-${mode}.svg`), fn(card, m));
    written.push(`${card.id}-${mode}`);
  }
}
console.log(`Wrote ${written.length} cards to assets/cards/`);

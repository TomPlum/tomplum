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

let mascotUri = "";
try {
  const buf = await readFile(join(root, "assets", "mascot.png"));
  mascotUri = `data:image/png;base64,${buf.toString("base64")}`;
} catch { /* mascot optional */ }

const MODES = {
  light: { cardBg: "#ffffff", surface: "#f6f8fa", border: "#d0d7de", text: "#1f2328", sub: "#656d76", faint: "#8b949e", link: "#0969da" },
  dark: { cardBg: "#0d1117", surface: "#161b22", border: "#30363d", text: "#e6edf3", sub: "#9198a1", faint: "#6e7681", link: "#2f81f7" },
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
const CLAUDE = "#D97757";
const SANS = "-apple-system,'Segoe UI',sans-serif";
const MONO = "ui-monospace, monospace";

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
  for (const r of await res.json()) map.set(r.name, { stars: r.stargazers_count, lang: r.language, url: r.html_url, fork: r.fork });
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
const svgDoc = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${defs || ""}${body}</svg>`;

const frame = (m, w, h, surface) =>
  `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${surface ? m.surface : m.cardBg}" stroke="${m.border}"/>`;

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

// Stylish pill chips: leading dot + border (secondary) or solid accent (primary).
function chips(items, x, y, maxW, m, theme) {
  const t = THEMES[theme];
  const light = m === MODES.light;
  let cx = x, cy = y, out = "";
  const h = 22, gap = 7, size = 11.5, rowGap = 8;
  for (const it of items) {
    const label = typeof it === "string" ? it : it.label;
    const primary = typeof it === "object" && it.primary;
    const w = 22 + approxWidth(label, size) + 12;
    if (cx + w > x + maxW) { cx = x; cy += h + rowGap; }
    if (primary) {
      out += `<rect x="${cx.toFixed(1)}" y="${cy}" width="${w.toFixed(1)}" height="${h}" rx="11" fill="${t.base}"/>`;
      out += `<circle cx="${cx + 13}" cy="${cy + h / 2}" r="3" fill="#ffffff" fill-opacity="0.9"/>`;
      out += `<text x="${cx + 22}" y="${cy + 15}" font-size="${size}" fill="#ffffff" font-family="${MONO}">${esc(label)}</text>`;
    } else {
      out += `<rect x="${cx.toFixed(1)}" y="${cy}" width="${w.toFixed(1)}" height="${h}" rx="11" fill="${t.base}" fill-opacity="${light ? 0.1 : 0.18}" stroke="${t.base}" stroke-opacity="${light ? 0.35 : 0.45}"/>`;
      out += `<circle cx="${cx + 13}" cy="${cy + h / 2}" r="3" fill="${t.base}"/>`;
      out += `<text x="${cx + 22}" y="${cy + 15}" font-size="${size}" fill="${light ? t.textLight : t.textDark}" font-family="${MONO}">${esc(label)}</text>`;
    }
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

function claudeBurst(cx, cy, r) {
  const n = 12;
  let lines = "";
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i - Math.PI / 2;
    const ro = i % 2 === 0 ? r : r * 0.78;
    const ri = r * 0.2;
    lines += `<line x1="${(cx + ri * Math.cos(a)).toFixed(1)}" y1="${(cy + ri * Math.sin(a)).toFixed(1)}" x2="${(cx + ro * Math.cos(a)).toFixed(1)}" y2="${(cy + ro * Math.sin(a)).toFixed(1)}"/>`;
  }
  return `<g stroke="${CLAUDE}" stroke-width="${(r * 0.19).toFixed(2)}" stroke-linecap="round">${lines}</g><circle cx="${cx}" cy="${cy}" r="${(r * 0.15).toFixed(2)}" fill="${CLAUDE}"/>`;
}

function smoothPath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function titleRow(card, m, x = 18, y = 30) {
  let icon, tx;
  if (card.kanji) { icon = `<text x="${x}" y="${y + 6}" font-size="22" fill="${THEMES[card.accent].base}" font-family="'Hiragino Sans','Noto Sans JP',sans-serif">${esc(card.kanji)}</text>`; tx = x + 34; }
  else if (card.icon) { icon = `<text x="${x}" y="${y + 7}" font-size="20">${card.icon}</text>`; tx = x + 32; }
  else { icon = `<rect x="${x}" y="${y - 11}" width="14" height="14" rx="4" fill="${THEMES[card.accent].base}"/>`; tx = x + 24; }
  let flag = "";
  if (card.flagship) {
    const t = THEMES[card.accent], fw = approxWidth("flagship", 11) + 18, light = m === MODES.light;
    flag = `<rect x="${450 - 18 - fw}" y="${y - 13}" width="${fw}" height="18" rx="9" fill="${t.base}" fill-opacity="${light ? 0.14 : 0.22}"/><text x="${450 - 18 - fw / 2}" y="${y}" font-size="11" text-anchor="middle" fill="${light ? t.textLight : t.textDark}" font-family="${MONO}">flagship</text>`;
  }
  return `${icon}<text x="${tx}" y="${y + 1}" font-size="15.5" font-weight="600" fill="${m.text}" font-family="${SANS}">${esc(card.title)}</text>${flag}`;
}

// ---- Cards ----------------------------------------------------------------
const W = 450, H = 200;

function renderRepoCard(card, m) {
  const blurb = wrap(card.blurb, 52).map((ln, i) => `<text x="18" y="${62 + i * 18}" font-size="12.5" fill="${m.sub}" font-family="${SANS}">${esc(ln)}</text>`).join("");
  let defs = "", art = "", chipY = 112;
  if (card.sparkline) {
    const gid = `area-${card.id}-${m === MODES.light ? "l" : "d"}`;
    const t = THEMES[card.accent].base;
    const pts = [[18, 124], [78, 112], [138, 120], [198, 98], [258, 108], [318, 90], [378, 104], [432, 95]];
    const line = smoothPath(pts);
    defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t}" stop-opacity="${m === MODES.light ? 0.32 : 0.4}"/><stop offset="1" stop-color="${t}" stop-opacity="0"/></linearGradient></defs>`;
    art = `<path d="${line}L432,140L18,140Z" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${t}" stroke-width="2" stroke-linecap="round"/>`;
    chipY = 152;
  }
  if (card.mascot && mascotUri) {
    art += `<g transform="translate(440,12) scale(-1,1)"><image href="${mascotUri}" width="74" height="74"/></g>`;
  }
  const items = card.repos.map((name) => {
    const r = repos.get(name);
    const label = r && r.stars > 0 ? `${name} ★${r.stars}` : name;
    return { label, primary: name === card.primary };
  });
  const c = chips(items, 18, chipY, W - 36, m, card.accent);
  return svgDoc(W, H, defs, `${frame(m, W, H)}${art}${titleRow(card, m)}${blurb}${c.svg}`);
}

function renderAocCard(card, m) {
  const blurb = wrap(card.blurb, 52).map((ln, i) => `<text x="18" y="${150 + i * 18}" font-size="12.5" fill="${m.sub}" font-family="${SANS}">${esc(ln)}</text>`).join("");
  const n = card.years.length, slot = (W - 36) / n;
  let wall = "";
  card.years.forEach((y, i) => {
    const cx = 18 + slot * i + slot / 2;
    wall += star(cx, 78, 13, "#e3b341");
    wall += `<text x="${cx.toFixed(1)}" y="108" font-size="11" text-anchor="middle" fill="${m.text}" font-family="${MONO}">${y.year}</text>`;
    wall += `<text x="${cx.toFixed(1)}" y="121" font-size="9.5" text-anchor="middle" fill="${m.faint}" font-family="${MONO}">${esc(y.lang)}</text>`;
  });
  const total = `<text x="${W - 18}" y="30" font-size="12" text-anchor="end" fill="${THEMES[card.accent].base}" font-family="${MONO}">${n} years</text>`;
  return svgDoc(W, H, "", `${frame(m, W, H)}${titleRow(card, m)}${total}${wall}${blurb}`);
}

function renderHobbiesCard(card, m) {
  const w = 912, h = 104, t = THEMES[card.accent], light = m === MODES.light;
  const blurb = `<text x="${28 + approxWidth(card.title, 15.5) + 30}" y="42" font-size="12.5" fill="${m.sub}" font-family="${SANS}">${esc(card.blurb)}</text>`;
  let cx = 28, row = "";
  for (const it of card.items) {
    const cw = approxWidth(it.label, 13) + 42;
    row += `<rect x="${cx.toFixed(1)}" y="58" width="${cw.toFixed(1)}" height="34" rx="8" fill="${t.base}" fill-opacity="${light ? 0.1 : 0.18}" stroke="${t.base}" stroke-opacity="${light ? 0.25 : 0.35}"/>`;
    row += `<text x="${cx + 14}" y="80" font-size="15">${it.emoji || "•"}</text>`;
    row += `<text x="${cx + 36}" y="79" font-size="12.5" fill="${light ? t.textLight : t.textDark}" font-family="${SANS}">${esc(it.label)}</text>`;
    cx += cw + 10;
  }
  return svgDoc(w, h, "", `${frame(m, w, h)}<rect x="28" y="22" width="14" height="14" rx="4" fill="${t.base}"/><text x="52" y="34" font-size="15.5" font-weight="600" fill="${m.text}" font-family="${SANS}">${esc(card.title)}</text>${blurb}${row}`);
}

// Branched git-log motif, like a real `git log --graph`.
function gitGraph(m, x0, y0, span) {
  const lanes = [y0, y0 + 28, y0 + 56];
  const cols = ["#378ADD", "#1D9E75", "#D85A30"];
  const step = span / 8;
  const X = (i) => x0 + i * step;
  // [slot, lane]
  const nodes = [[0, 0], [1, 0], [2, 1], [3, 1], [4, 0], [5, 2], [6, 2], [7, 0], [8, 0]];
  // [from, to, color-lane] — straight where same lane, curved where it switches
  const edges = [
    [[0, 0], [1, 0], 0], [[1, 0], [4, 0], 0], [[4, 0], [7, 0], 0], [[7, 0], [8, 0], 0],
    [[1, 0], [2, 1], 1], [[2, 1], [3, 1], 1], [[3, 1], [4, 0], 1],
    [[4, 0], [5, 2], 2], [[5, 2], [6, 2], 2], [[6, 2], [7, 0], 2],
  ];
  let g = "";
  for (const [[fi, fl], [ti, tl], cl] of edges) {
    const x1 = X(fi), y1 = lanes[fl], x2 = X(ti), y2 = lanes[tl], dx = (x2 - x1) / 2;
    g += `<path d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}" fill="none" stroke="${cols[cl]}" stroke-width="2" opacity="0.9"/>`;
  }
  for (const [i, l] of nodes) g += `<circle cx="${X(i)}" cy="${lanes[l]}" r="5" fill="${cols[l]}" stroke="${m.surface}" stroke-width="2"/>`;
  return g;
}

function renderHero(m) {
  const w = 912, h = 150;
  const name = `<text x="28" y="48" font-size="26" font-weight="600" fill="${m.text}" font-family="${SANS}">${esc(config.name)}</text>`;
  const tagline = `<text x="28" y="78" font-size="13.5" font-family="${SANS}"><tspan fill="${m.sub}">${esc(config.taglinePrefix)}</tspan><tspan fill="${m.link}">${esc(config.taglineLink)}</tspan><tspan fill="${m.sub}">${esc(config.taglineSuffix)}</tspan></text>`;
  const burst = claudeBurst(35, 108, 8);
  const claude = `<text x="50" y="112" font-size="12" font-family="${SANS}"><tspan fill="${m.sub}">All-in on </tspan><tspan fill="${m.link}">Claude</tspan><tspan fill="${m.sub}"> for agentic dev — living the current best practices.</tspan></text>`;
  const graph = gitGraph(m, 612, 44, 268);
  return svgDoc(w, h, "", `${frame(m, w, h, true)}${name}${tagline}${burst}${claude}${graph}`);
}

function renderStatsStrip(m) {
  const w = 912, h = 92, t = THEMES.gray;
  const stat = (x, value, label) =>
    `<text x="${x}" y="42" font-size="24" font-weight="600" fill="${m.text}" font-family="${SANS}">${value}</text>` +
    `<text x="${x}" y="62" font-size="11.5" fill="${m.sub}" font-family="${SANS}">${label}</text>`;
  let bars = "", bx = 360;
  const barW = w - 360 - 28;
  for (const [lang, n] of stats.langs.slice(0, 6)) {
    const seg = (n / stats.totalLang) * barW;
    bars += `<rect x="${bx.toFixed(1)}" y="34" width="${Math.max(seg - 2, 2).toFixed(1)}" height="10" rx="3" fill="${LANG_COLORS[lang] || t.base}"/>`;
    bx += seg;
  }
  let legend = "", lx = 360;
  for (const [lang] of stats.langs.slice(0, 4)) {
    legend += `<circle cx="${lx + 4}" cy="60" r="4" fill="${LANG_COLORS[lang] || t.base}"/>`;
    legend += `<text x="${lx + 13}" y="64" font-size="11" fill="${m.sub}" font-family="${SANS}">${esc(lang)}</text>`;
    lx += approxWidth(lang, 11) + 34;
  }
  return svgDoc(w, h, "", `${frame(m, w, h)}${stat(28, stats.repoCount, "public repos")}${stat(150, stats.totalStars, "total stars")}${bars}${legend}`);
}

// ---- Drive ----------------------------------------------------------------
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

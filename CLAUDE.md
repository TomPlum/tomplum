# CLAUDE.md

This is the GitHub **profile README** repo for user `TomPlum` (a repo named `tomplum` whose
README renders on the profile page). The page is a card-based showcase built from
**dynamically generated SVGs**, not hand-written markdown.

## How it works

```
profile.config.json   ← content (edit this for normal changes)
scripts/generate-cards.mjs ← design/layout (edit this to change how cards look)
        │  node scripts/generate-cards.mjs
        ▼
assets/cards/*.svg     ← generated output (light + dark per card); do not hand-edit
README.md              ← static shell that embeds the SVGs via <picture>/<img>
.github/workflows/profile-cards.yml ← regenerates cards on a schedule + on push
```

- **To change content** (repos shown, hobbies, taglines, AoC years): edit `profile.config.json`.
- **To change design** (geometry, colours, new card type): edit `scripts/generate-cards.mjs`.
- **Footer links** (Portfolio, Goodreads, Maia, etc.) live directly in `README.md`.
- After either edit, run `node scripts/generate-cards.mjs` to regenerate `assets/cards/`.
  Requires Node 24+ (ESM). It fetches live data from the GitHub REST API
  (`/users/TomPlum/repos`) to compute stars/language stats, so output varies run-to-run.
- The Action regenerates cards daily (cron) and on pushes that touch the config/script/workflow,
  committing as `github-actions[bot]`. **Because the bot pushes between your local pushes, always
  `git pull --rebase` before pushing** (or just push — a fast-forward usually works; if rejected,
  rebase). The "cannot pull with rebase: unstaged changes" warning is harmless when you commit
  first and there are no new remote commits.

## GitHub README rendering constraints (learned the hard way — respect these)

GitHub sanitises and re-styles README HTML aggressively. The card system is shaped entirely
around these limits:

1. **No CSS.** `<style>` blocks and inline `style=` are stripped. All styling must be
   attributes baked into the SVG, or markdown-native.
2. **Tables always get borders/zebra striping**, regardless of `border="0"`. Do **not** lay cards
   out in a `<table>` — it looks boxed-in. Use inline `<picture>`/`<img>` inside
   `<div align="center">` instead.
3. **Multiline `<picture>` blocks get parsed as separate paragraphs**, forcing a single column.
   To get a 2-up grid, each `<picture>` must be on **one line**, and two cards that share a row
   must be on the **same line** separated by a space. See `README.md` — this is load-bearing,
   don't reflow it.
4. **Hyperlinks inside an `<img>`-embedded SVG do NOT work.** Clicks on `<a>` elements within the
   SVG are dead. Workarounds:
   - Wrap the whole `<img>` in a markdown `<a href>` to make the entire card clickable (used for
     the hero → react-git-log).
   - Put real navigable links in `README.md` markdown (the footer), not in SVG.
   - Don't add an external "caption" row of SVG links — we tried, they don't work, removed them.
5. **Light/dark mode** is done with `<picture><source media="(prefers-color-scheme: dark)">`.
   Every card is generated in both `-light.svg` and `-dark.svg` variants; the generator's `MODES`
   object holds both palettes.

## SVG layout notes (generate-cards.mjs)

- **Emoji glyphs are bottom-heavy.** When aligning an emoji next to text, its baseline must sit
  *higher* than the text baseline so their visual centres match (emoji icon is at `y + 3`, not
  `y + 7`; kanji and rect icons were already centred). If you add emoji-beside-text, account for this.
- **Emoji widths vary wildly** across glyphs (flags and ZWJ sequences like 🏋️ are much wider than
  🎸). `approxWidth()` can't measure them. For consistent icon→label gaps, render the emoji in a
  **fixed-width slot with `text-anchor="middle"`** rather than left-anchored — see `chips()` and
  `renderHobbiesCard()`. Both also use symmetric horizontal padding (`padX` left and right).
- The mascot (natomski eagle) is base64-inlined from `assets/mascot.png` at build time and
  horizontally flipped via `transform="translate(x,y) scale(-1,1)"`.
- Card width contract: hero/beyond/stats render at 912px (shown at `width="858"`); the paired
  cards render at 450px (shown at `width="420"`, two per row).

## Conventions

- The user normally edits `profile.config.json` only. Keep the config the single source of truth
  for content; push design logic into the script.
- Generated SVGs are committed (so the profile renders without a build step), but treat them as
  build artefacts — never hand-edit `assets/cards/*.svg`.
- Follow-up ideas / history are captured in GitHub issue #1.

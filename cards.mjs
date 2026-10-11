// Draws the preview pictures that appear when a link to the site is shared (1200 x 630 PNG).
// Usage: node cards.mjs [output folder]        (default: public)
// Writes <output>/cards/*.png. Run it after matchups.mjs and before build.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { here, readJson, fmt, loadMatchups, cardPath } from './lib.mjs';

const outDir = process.argv[2] || 'public';
const data = readJson(path.join(here, 'data.json'));
const mu = loadMatchups(data, path.join(outDir, 'matchups'));
const host = new URL(data.meta.siteUrl).host;

const W = 1200, H = 630, PAD = 70;
const C = { ground: '#0E2A23', raised: '#16392F', ink: '#F4EEDC', muted: '#A8BAAE', accent: '#E8A838', plate: '#06140F', ball: '#DE4B38', hit: '#3DAA6D', dark: '#10261F', line: 'rgba(244,238,220,0.16)' };
const F = {
  display: { family: 'Antonio', weight: 700, wide: 0.41 },
  title: { family: 'Antonio', weight: 500, wide: 0.35 },
  body: { family: 'Hanken Grotesk', weight: 400, wide: 0.47 },
  semi: { family: 'Hanken Grotesk', weight: 600, wide: 0.49 },
  bold: { family: 'Hanken Grotesk', weight: 700, wide: 0.51 },
};
const fontFiles = fs.readdirSync(path.join(here, 'fonts')).filter(f => f.endsWith('.ttf')).map(f => path.join(here, 'fonts', f));

const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Rough width of a string. Good enough to wrap lines and shrink long names to fit.
const widthOf = (s, font, size) => String(s).length * size * font.wide;
const text = (px, py, s, font, size, fill, anchor = 'start') =>
  `<text x="${px}" y="${py}" font-family="${font.family}" font-weight="${font.weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${x(s)}</text>`;
// A line of mixed styles: the renderer places each part after the last, so no width guessing is needed.
const span = (s, font, size, fill, dx = 0) =>
  `<tspan font-family="${font.family}" font-weight="${font.weight}" font-size="${size}" fill="${fill}"${dx ? ` dx="${dx}"` : ''}>${x(s)}</tspan>`;
const line = (px, py, parts) => `<text x="${px}" y="${py}" xml:space="preserve">${parts.join('')}</text>`;
function wrap(s, font, size, max, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(s).split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && widthOf(next, font, size) > max) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,.;:]*\S*$/, '') + '…'; }
  return lines;
}
const frame = body =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  `<rect width="${W}" height="${H}" fill="${C.ground}"/>` +
  text(PAD, 84, 'CricketNation in numbers', F.bold, 30, C.muted) +
  text(W - PAD, 84, host, F.semi, 28, C.accent, 'end') +
  body + '</svg>';

function numberCard(n) {
  const size = 230, plateH = 270, top = 126, gap = 16;
  let px = PAD, plates = '';
  for (const ch of String(n.value)) {
    const digit = /[0-9]/.test(ch), w = Math.round(size * (digit ? 0.66 : 0.4));
    plates += `<rect x="${px}" y="${top}" width="${w}" height="${plateH}" rx="10" fill="${C.plate}" stroke="${C.line}" stroke-width="2"/>` +
      `<circle cx="${px + w / 2}" cy="${top + 18}" r="6" fill="${C.ground}"/>` +
      text(px + w / 2, top + plateH - 34, ch, F.display, size, C.ink, 'middle');
    px += w + gap;
  }
  const lines = wrap(n.what, F.title, 62, W - PAD * 2, 2);
  return frame(plates + lines.map((l, i) => text(PAD, 490 + i * 74, l, F.title, 62, C.ink)).join(''));
}

function chaseCard(c) {
  const gap = Math.max(0, c.target - c.now), pct = Math.max(0, Math.min(1, c.now / c.target));
  const big = fmt(gap), size = 220, tw = W - PAD * 2, ty = 468;
  return frame(
    line(PAD, 176, [span(c.player, F.bold, 46, C.ink), span(c.what, F.body, 46, C.muted, 20)]) +
    line(PAD, 410, [span(big, F.display, size, C.ink), span('to go', F.body, 50, C.muted, 26)]) +
    `<rect x="${PAD}" y="${ty}" width="${tw}" height="26" rx="13" fill="${C.raised}" stroke="${C.line}" stroke-width="2"/>` +
    `<rect x="${PAD}" y="${ty}" width="${Math.round(tw * pct)}" height="26" rx="13" fill="${C.accent}"/>` +
    `<circle cx="${PAD + Math.round(tw * pct)}" cy="${ty + 13}" r="23" fill="${C.ball}" stroke="${C.ground}" stroke-width="6"/>` +
    text(PAD, 566, `${fmt(c.now)} now`, F.semi, 32, C.ink) +
    text(W - PAD, 566, `${c.holder} ${fmt(c.target)}`, F.semi, 32, C.ink, 'end'));
}

// The clue row is the same example the page shows before the first guess.
function playCard() {
  const cols = [['Nat', 'AUS', 'miss', 0.9], ['Role', 'Bat', 'miss', 0.9], ['Bats', 'Right', 'hit', 0.9], ['Debut', '1995', 'hit', 1],
    ['Tests', '168', 'close', 1, 'down'], ['Runs', '13,378', 'close', 1.3, 'down'], ['Wkts', '5', 'miss', 1, 'up']];
  const gap = 12, total = cols.reduce((s, c) => s + c[3], 0), unit = (W - PAD * 2 - gap * (cols.length - 1)) / total;
  const top = 392, h = 150;
  let px = PAD, row = '';
  for (const [label, value, state, wide, arrow] of cols) {
    const w = unit * wide, cx = px + w / 2;
    const fill = state === 'hit' ? C.hit : state === 'close' ? C.accent : C.raised;
    const ink = state === 'miss' ? C.ink : C.dark;
    row += text(cx, top - 16, label, F.body, 26, C.muted, 'middle') +
      `<rect x="${px}" y="${top}" width="${w}" height="${h}" rx="10" fill="${fill}"${state === 'miss' ? ` stroke="${C.line}" stroke-width="2"` : ''}/>` +
      text(cx, top + (arrow ? 82 : 96), value, F.title, 60, ink, 'middle');
    if (arrow) {
      const y = top + 108, d = arrow === 'up' ? `M${cx - 13},${y + 22} L${cx + 13},${y + 22} L${cx},${y}` : `M${cx - 13},${y} L${cx + 13},${y} L${cx},${y + 22}`;
      row += `<path d="${d} Z" fill="${ink}"/>`;
    }
    px += w + gap;
  }
  return frame(
    text(PAD, 222, 'Guess the mystery player', F.title, 104, C.ink) +
    text(PAD, 290, `One Test great a day. ${data.mystery.guesses} guesses.`, F.body, 40, C.muted) + row);
}

function matchupCard(v) {
  const p = v.p, title = `${v.bat.name} v ${v.bowl.name}`;
  const size = Math.min(112, Math.floor((W - PAD * 2) / (title.length * F.display.wide)));
  const years = p[7] === p[8] ? String(p[7]) : `${p[7]} to ${p[8]}`;
  const stats = [['Balls', fmt(p[0])], ['Runs', fmt(p[1])], ['Dismissals', fmt(p[2])], ['Average', p[2] ? fmt(p[1] / p[2], 1) : '–']];
  const col = (W - PAD * 2) / stats.length;
  return frame(
    line(PAD, 226, [span(v.bat.name, F.display, size, C.ink), span(' v ', F.title, size, C.accent), span(v.bowl.name, F.display, size, C.ink)]) +
    text(PAD, 290, `${v.label}, ${years}, ${fmt(p[6])} innings`, F.body, 38, C.muted) +
    `<rect x="${PAD}" y="336" width="${W - PAD * 2}" height="2" fill="${C.line}"/>` +
    stats.map(([label, value], i) =>
      text(PAD + col * i, 398, label, F.semi, 30, C.muted) + text(PAD + col * i, 548, value, F.display, 140, C.ink)).join(''));
}

function matchupsCard() {
  const names = mu.featured.slice(0, 3).map(v => `${v.bat.name} v ${v.bowl.name}`);
  const since = mu.formats.map(f => f.from.slice(0, 4)).sort()[0];
  const lines = wrap(`Every ball of men’s international cricket on record since ${since}, sorted by who was bowling to whom.`, F.body, 40, W - PAD * 2, 2);
  return frame(
    text(PAD, 236, 'Batter against bowler', F.title, 118, C.ink) +
    lines.map((l, i) => text(PAD, 312 + i * 54, l, F.body, 40, C.muted)).join('') +
    names.map((n, i) => `<rect x="${PAD}" y="${436 + i * 50}" width="10" height="10" fill="${C.accent}"/>` + text(PAD + 30, 450 + i * 50, n, F.semi, 34, C.ink)).join(''));
}

function save(rel, svg) {
  const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Hanken Grotesk' }, fitTo: { mode: 'width', value: W } }).render().asPng();
  const file = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  return png.length;
}

let n = 0, bytes = 0;
const add = (rel, svg) => { bytes += save(rel, svg); n++; };
for (const num of data.numbers) if (num.slug) add(cardPath.number(num), numberCard(num));
for (const c of data.chases) if (c.slug) add(cardPath.chase(c), chaseCard(c));
add(cardPath.play(), playCard());
if (mu.formats.length) {
  add(cardPath.matchups(), matchupsCard());
  for (const v of mu.featured) add(cardPath.matchup(v), matchupCard(v));
}
console.log(`Drew ${n} preview pictures into ${path.join(outDir, 'cards')} (${(bytes / 1024).toFixed(0)} kB).`);

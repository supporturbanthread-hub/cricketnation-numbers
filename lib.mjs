// Helpers shared by the build scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
export const fmt = (n, dp = 0) => Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const surname = name => name.split(' ').filter(w => !/^[A-Z]{1,4}$/.test(w)).join(' ') || name;

export function* jsonFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonFiles(p);
    else if (e.name.endsWith('.json')) yield p;
  }
}

// Reads the matchup files the nightly job wrote and resolves the featured pairs in data.json.
// Returns { formats: [...], featured: [...] }. Both are empty when no matchup data exists yet.
export function loadMatchups(data, dir) {
  const out = { formats: [], featured: [] };
  const cfg = data.matchups;
  if (!cfg || !fs.existsSync(path.join(dir, 'index.json'))) return out;
  out.formats = readJson(path.join(dir, 'index.json'));
  const files = {};
  for (const f of out.formats) files[f.key] = readJson(path.join(dir, f.key + '.json'));

  for (const want of cfg.featured || []) {
    const file = files[want.format];
    if (!file) continue;
    // Two players can share a name, so take the busiest one.
    const pick = (name, col) => {
      let best = -1;
      file.players.forEach((p, i) => { if (p[0] === name && (best < 0 || p[col] > file.players[best][col])) best = i; });
      return best;
    };
    const b = pick(want.batter, 2), w = pick(want.bowler, 5);
    const pair = b >= 0 && w >= 0 ? file.pairs.find(p => p[0] === b && p[1] === w) : null;
    if (!pair) { console.log(`::warning::Featured matchup not found in the data: ${want.batter} v ${want.bowler} (${want.format})`); continue; }
    const fm = out.formats.find(f => f.key === want.format);
    out.featured.push({
      slug: slugify(`${surname(want.batter)} v ${surname(want.bowler)} ${fm.label}`),
      format: want.format, label: fm.label,
      bat: { name: want.batter, team: file.teams[file.players[b][1]] || '', tot: file.players[b].slice(2, 5) },
      bowl: { name: want.bowler, team: file.teams[file.players[w][1]] || '', tot: file.players[w].slice(5, 8) },
      p: pair.slice(2),
    });
  }
  return out;
}

// Where each share picture lives, relative to the site root. cards.mjs writes them, build.mjs links to them.
export const cardPath = {
  number: n => `cards/number-${n.slug}.png`,
  chase: c => `cards/chase-${c.slug}.png`,
  matchup: v => `cards/matchup-${v.slug}.png`,
  play: () => 'cards/play.png',
  matchups: () => 'cards/matchups.png',
};

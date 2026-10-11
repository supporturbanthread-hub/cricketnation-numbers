// Builds the batter v bowler matchup files from Cricsheet ball-by-ball data.
// Usage: node matchups.mjs <folder of unzipped Cricsheet JSON> <output folder>
//
// For each format in data.json it writes <output>/<key>.json holding every batter and bowler
// pair that has met for at least minBalls deliveries, plus each player's totals.
import fs from 'node:fs';
import path from 'node:path';
import { here, readJson, jsonFiles } from './lib.mjs';

const [, , dir, outDir = 'public/matchups'] = process.argv;
if (!dir || !fs.existsSync(dir)) { console.error('Give the folder of unzipped Cricsheet JSON files.'); process.exit(1); }
const cfg = readJson(path.join(here, 'data.json')).matchups;
if (!cfg) { console.log('data.json has no "matchups" section. Nothing to do.'); process.exit(0); }

// Dismissals that are not credited to the bowler.
const NOT_BOWLERS = new Set(['run out', 'retired hurt', 'retired out', 'retired not out', 'obstructing the field', 'timed out', 'handled the ball']);

const byType = new Map();
for (const f of cfg.formats) {
  byType.set(f.type, { cfg: f, players: new Map(), pairs: new Map(), matches: 0, from: null, through: null });
}

function player(store, id, name, date) {
  let p = store.players.get(id);
  if (!p) { p = { name, seen: date, teams: {}, bat: [0, 0, 0], bowl: [0, 0, 0] }; store.players.set(id, p); }
  if (date >= p.seen) { p.name = name; p.seen = date; }
  return p;
}

let files = 0;
for (const file of jsonFiles(dir)) {
  files++;
  let match;
  try { match = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  const info = match.info;
  if (!info || !Array.isArray(info.dates) || !info.dates.length) continue;
  const store = byType.get(info.match_type);
  if (!store) continue;
  if ((info.gender || 'male') !== 'male') continue;
  if (info.team_type && info.team_type !== 'international') continue;

  const date = info.dates[0], year = Number(date.slice(0, 4));
  const registry = (info.registry && info.registry.people) || {};
  const idOf = name => registry[name] || 'name:' + name;
  store.matches++;
  if (!store.from || date < store.from) store.from = date;
  const end = info.dates[info.dates.length - 1];
  if (!store.through || end > store.through) store.through = end;

  for (const [team, xi] of Object.entries(info.players || {})) {
    for (const name of xi) {
      const p = player(store, idOf(name), name, date);
      p.teams[team] = (p.teams[team] || 0) + 1;
    }
  }

  for (const inn of match.innings || []) {
    if (inn.super_over) continue;
    const met = new Set();
    for (const over of inn.overs || []) {
      for (const d of over.deliveries || []) {
        if (!d.batter || !d.bowler) continue;
        const bat = idOf(d.batter), bowl = idOf(d.bowler);
        const B = player(store, bat, d.batter, date), W = player(store, bowl, d.bowler, date);
        const key = bat + '|' + bowl;
        let P = store.pairs.get(key);
        // balls, runs, outs, fours, sixes, dots, innings, first year, last year
        if (!P) { P = { bat, bowl, s: [0, 0, 0, 0, 0, 0, 0, year, year] }; store.pairs.set(key, P); }
        const s = P.s, ex = d.extras || {}, runs = d.runs || {};
        const off = runs.batter || 0, wide = (ex.wides || 0) > 0;

        if (!wide) { s[0]++; B.bat[0]++; W.bowl[0]++; if (off === 0) s[5]++; }
        s[1] += off; B.bat[1] += off;
        W.bowl[1] += (runs.total || 0) - (ex.byes || 0) - (ex.legbyes || 0) - (ex.penalty || 0);
        if (!runs.non_boundary) { if (off === 4) s[3]++; else if (off === 6) s[4]++; }
        for (const w of d.wickets || []) {
          if (NOT_BOWLERS.has(w.kind)) continue;
          W.bowl[2]++;
          if (w.player_out === d.batter) { s[2]++; B.bat[2]++; }
          else if (w.player_out) player(store, idOf(w.player_out), w.player_out, date).bat[2]++;
        }
        if (year < s[7]) s[7] = year;
        if (year > s[8]) s[8] = year;
        met.add(P);
      }
    }
    for (const P of met) P.s[6]++;
  }
}
if (!files) { console.error(`No JSON files found in ${dir}.`); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
const index = [];
const maxPairs = cfg.maxPairs || 25000;
for (const store of byType.values()) {
  const f = store.cfg;
  if (!store.pairs.size) { console.log(`${f.label}: no matches found, skipped.`); continue; }

  // Keep the file a sensible size: raise the minimum balls until the pair count fits.
  let minBalls = f.minBalls, kept;
  for (;;) {
    kept = [...store.pairs.values()].filter(P => P.s[0] >= minBalls || P.s[2] >= 3);
    if (kept.length <= maxPairs) break;
    minBalls += Math.max(6, Math.round(minBalls * 0.25));
  }
  kept.sort((a, b) => b.s[0] - a.s[0]);

  const teams = [], teamIx = new Map(), players = [], playerIx = new Map();
  const ix = id => {
    if (playerIx.has(id)) return playerIx.get(id);
    const p = store.players.get(id);
    const team = Object.entries(p.teams).sort((a, b) => b[1] - a[1])[0];
    let t = -1;
    if (team) { if (!teamIx.has(team[0])) { teamIx.set(team[0], teams.length); teams.push(team[0]); } t = teamIx.get(team[0]); }
    playerIx.set(id, players.length);
    players.push([p.name, t, ...p.bat, ...p.bowl]);
    return players.length - 1;
  };
  const pairs = kept.map(P => [ix(P.bat), ix(P.bowl), ...P.s]);

  const meta = { key: f.key, label: f.label, minBalls, from: store.from, through: store.through, matches: store.matches };
  const body = JSON.stringify({ ...meta, teams, players, pairs });
  fs.writeFileSync(path.join(outDir, f.key + '.json'), body);
  index.push({ ...meta, pairs: pairs.length, players: players.length });
  console.log(`${f.label}: ${store.matches} matches, ${store.pairs.size} pairs seen, ${pairs.length} kept (min ${minBalls} balls), ${players.length} players, ${(body.length / 1024).toFixed(0)} kB`);
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
console.log(`${files} files read. Matchup data written to ${outDir}.`);

// Updates the record-chase figures in data.json from Cricsheet match files.
// Usage: node refresh.mjs <folder of unzipped Cricsheet JSON> [path to data.json]
//
// Each chase in data.json has a "feed": the player's Cricsheet name, the format,
// the stat, and a verified baseline (value, matches, date). This script adds
// everything the player has done in matches that started after the baseline date.
// It always recomputes from the baseline, so running it twice changes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
const dataPath = process.argv[3] || path.join(here, 'data.json');
if (!dir || !fs.existsSync(dir)) {
  console.error('Give the folder of unzipped Cricsheet JSON files: node refresh.mjs cricsheet');
  process.exit(1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pretty = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const shift = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * 864e5).toISOString().slice(0, 10);
// Dismissals that are not credited to the bowler.
const NOT_BOWLERS = new Set(['run out', 'retired hurt', 'retired out', 'retired not out', 'obstructing the field', 'timed out', 'handled the ball']);

function* jsonFiles(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* jsonFiles(p);
    else if (e.name.endsWith('.json')) yield p;
  }
}

// The match dates sit near the top of every Cricsheet file, so old matches are skipped without parsing them.
function startDate(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8192);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const m = /"dates"\s*:\s*\[\s*"(\d{4}-\d{2}-\d{2})"/.exec(buf.toString('utf8', 0, n));
  return m ? m[1] : null;
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const chases = (data.chases || []).filter(c => c.feed);
if (!chases.length) { console.log('No chases have a feed. Nothing to refresh.'); process.exit(0); }

const tally = new Map(chases.map(c => [c, { value: 0, matches: 0, last: null, seen: false }]));
const earliest = chases.map(c => c.feed.base.date).sort()[0];
// Matches from the year before the baseline are read only to confirm each player's name is spelt the Cricsheet way.
const nameCheckFrom = shift(earliest, -400);

let files = 0, read = 0;
for (const file of jsonFiles(dir)) {
  files++;
  const peek = startDate(file);
  if (peek && peek < nameCheckFrom) continue;

  let match;
  try { match = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.warn('Skipped unreadable file', file); continue; }
  const info = match.info;
  if (!info || !Array.isArray(info.dates) || !info.dates.length) continue;
  read++;
  const start = info.dates[0], end = info.dates[info.dates.length - 1];

  for (const c of chases) {
    const f = c.feed, t = tally.get(c);
    if (info.match_type !== f.format || (info.gender || 'male') !== (f.gender || 'male')) continue;
    if (!Object.values(info.players || {}).some(xi => xi.includes(f.name))) continue;
    t.seen = true;
    if (start <= f.base.date) continue;

    t.matches++;
    if (!t.last || end > t.last) t.last = end;
    for (const inn of match.innings || []) {
      if (inn.super_over) continue;
      let runs = 0, wickets = 0;
      for (const over of inn.overs || []) {
        for (const ball of over.deliveries || []) {
          if (ball.batter === f.name) runs += (ball.runs && ball.runs.batter) || 0;
          if (ball.bowler === f.name) {
            for (const w of ball.wickets || []) if (!NOT_BOWLERS.has(w.kind)) wickets++;
          }
        }
      }
      if (f.stat === 'runs') t.value += runs;
      else if (f.stat === 'hundreds') t.value += runs >= 100 ? 1 : 0;
      else if (f.stat === 'wickets') t.value += wickets;
      else throw new Error(`Unknown stat "${f.stat}" for ${c.player}`);
    }
  }
}

if (!files) { console.error(`No JSON files found in ${dir}. The Cricsheet download probably failed.`); process.exit(1); }

let changed = false;
for (const c of chases) {
  const f = c.feed, t = tally.get(c);
  const now = f.base.value + t.value, matches = f.base.matches + t.matches;
  const asOf = pretty(t.last && t.last > f.base.date ? t.last : f.base.date);
  if (!t.seen) {
    // GitHub Actions shows lines starting with ::warning:: on the run summary.
    console.log(`::warning::"${f.name}" was not found in any recent ${f.format}. Check the name matches Cricsheet's spelling.`);
  }
  if (c.now !== now || c.matches !== matches || c.asOf !== asOf) changed = true;
  console.log(`${c.player}, ${c.what}: ${c.now} -> ${now} (${t.matches} new ${f.format}${t.matches === 1 ? '' : 's'}, correct to ${asOf})`);
  c.now = now; c.matches = matches; c.asOf = asOf;
}

if (changed) fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
console.log(`${files} files found, ${read} read. ${changed ? 'data.json updated.' : 'No change.'}`);

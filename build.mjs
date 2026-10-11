// Bakes data.json into a single static index.html.
// Usage: node build.mjs [output path]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const data = JSON.parse(read('data.json'));
const renderSrc = read('render.js');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(renderSrc, ctx);
const R = ctx.CNRender;

const firstGroup = Object.keys(data.groups)[0];
const g = data.groups[firstGroup];
const [a, b] = g.defaults;
const idx = R.dayIndex(data.numbers.length);

const M = data.mystery;
const who = id => M.players.find(p => p.id === id);
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const fill = {
  HERO_IDX: String(idx),
  HERO: R.hero(data.numbers[idx]),
  CHASES: R.chases(data.chases),
  SEG: R.seg(data.groups, firstGroup),
  OPT_A: R.options(g.players, a, b),
  OPT_B: R.options(g.players, b, a),
  DUEL: R.duel(g, a, b),
  MP_GUESSES: String(M.guesses),
  MP_HINTS: M.hintsAfter.map(n => words[n] || n).join(' and '),
  MP_COLS: R.mysteryCols(),
  // A fixed illustration of the clues. It never uses the day's real answer.
  MP_EXAMPLE: R.guessRow(who('ricky-ponting'), who('jacques-kallis'), M, 'Example', false),
  MP_KEY: R.mysteryKey(M),
  DATA: JSON.stringify(data).replace(/</g, '\\u003c'),
  RENDER_JS: renderSrc.trim(),
  GAME_JS: read('game.js').trim(),
};

let html = read('template.html');
// Function replacers so "$" sequences in the scripts are inserted literally.
for (const [k, v] of Object.entries(fill)) html = html.split('{{' + k + '}}').join(v);
if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Unfilled placeholder left in template');

const out = process.argv[2] || path.join(dir, 'index.html');
fs.writeFileSync(out, html);
console.log('Built', out, (html.length / 1024).toFixed(1) + ' kB', 'number of the day:', data.numbers[idx].value);

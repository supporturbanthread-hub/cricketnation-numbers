// Builds the whole site into a folder: the main page, one small page per shareable stat
// (so each has its own link and preview picture), a sitemap and robots.txt.
// Usage: node build.mjs [output folder]        (default: public)
//
// Run matchups.mjs and cards.mjs first if you want the matchup tool and the preview pictures.
// The build still works without them: it simply leaves those parts out.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { here, readJson, loadMatchups, cardPath } from './lib.mjs';

const read = f => fs.readFileSync(path.join(here, f), 'utf8');
let outDir = process.argv[2] || 'public';
if (outDir.endsWith('.html')) outDir = path.dirname(outDir);   // older workflow passed a file name

const data = readJson(path.join(here, 'data.json'));
const renderSrc = read('render.js');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(renderSrc, ctx);
const R = ctx.CNRender;
const esc = R.esc;

const site = data.meta.siteUrl.replace(/\/?$/, '/');
const mu = loadMatchups(data, path.join(outDir, 'matchups'));
const hasMu = mu.formats.length > 0;
const template = read('template.html');
const scripts = { RENDER_JS: renderSrc.trim(), GAME_JS: read('game.js').trim(), MATCHUPS_JS: read('matchups.js').trim() };

const firstGroup = Object.keys(data.groups)[0];
const g = data.groups[firstGroup];
const [a, b] = g.defaults;
const M = data.mystery;
const who = id => M.players.find(p => p.id === id);
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const today = R.dayIndex(data.numbers.length);
const SITE_NAME = 'CricketNation in numbers';

// A preview picture is only linked if cards.mjs actually made it.
const image = (rel, version) => fs.existsSync(path.join(outDir, rel)) ? `${site}${rel}?v=${encodeURIComponent(version)}` : '';

function head(p) {
  const url = site + p.path;
  const lines = [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.desc)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${esc(p.ogTitle || p.title)}">`,
    `<meta property="og:description" content="${esc(p.desc)}">`,
    `<meta property="og:url" content="${url}">`,
  ];
  if (p.image) {
    lines.push(`<meta property="og:image" content="${p.image}">`, `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`, `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${p.image}">`);
  } else {
    lines.push(`<meta name="twitter:card" content="summary">`);
  }
  return lines.join('\n');
}

function page(p) {
  const depth = p.path.split('/').filter(Boolean).length;
  const heroIdx = p.number == null ? today : p.number;
  const view = hasMu ? (p.matchup || mu.featured[0] || null) : null;
  const format = hasMu ? mu.formats.find(f => f.key === (view ? view.format : mu.formats[0].key)) : null;
  const since = hasMu ? mu.formats.map(f => f.from.slice(0, 4)).sort()[0] : '';

  const fill = {
    HEAD: head(p),
    HTML_ATTRS: ` data-base="${'../'.repeat(depth)}"` + (p.focus ? ` data-focus="${p.focus}"` : ''),
    HERO_IDX: String(heroIdx),
    HERO_PIN: p.number == null ? '' : ' data-pinned',
    HERO: R.hero(data.numbers[heroIdx]),
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
    MU_LEAD: `Every ball of men’s international cricket that Cricsheet has on record since ${since}, sorted by who was bowling to whom. Pick a batter, a bowler, or both.`,
    MU_SEG: hasMu ? R.muSeg(mu.formats, format.key) : '',
    MU_BAT: view ? esc(view.bat.name) : '',
    MU_BOWL: view ? esc(view.bowl.name) : '',
    MU_BAT_CLEAR: view ? '' : ' hidden',
    MU_BOWL_CLEAR: view ? '' : ' hidden',
    MU_POPULAR: hasMu ? R.muPopular(mu.featured, view ? view.slug : '') : '',
    MU_OUT: view ? R.matchup(view) : '<p class="mu-msg">Pick a batter or a bowler to see who they have faced.</p>',
    MU_ACTIONS: view ? '' : ' hidden',
    MU_NOTE: hasMu ? esc(R.muNote(format)) : '',
    DATA: JSON.stringify({ ...data, matchups: undefined, mu: hasMu ? { ...mu, initial: view ? view.slug : '' } : undefined }).replace(/</g, '\\u003c'),
    ...scripts,
  };

  let html = template;
  if (!hasMu) html = html.replace(/[ \t]*<!--MU-->[\s\S]*?<!--\/MU-->\n?/g, '');
  // split/join inserts each value literally, so "$" in the scripts is safe
  for (const [k, v] of Object.entries(fill)) html = html.split('{{' + k + '}}').join(v);
  const left = html.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error('Unfilled placeholder left in template: ' + left[0]);

  const file = path.join(outDir, p.path, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return html.length;
}

const pages = [];
const baseDesc = 'One cricket number a day, batter against bowler matchups, a daily guess-the-player game and the records still being chased. From CricketNation.';

pages.push({
  path: '', title: `${SITE_NAME}: records, chases and head-to-heads`, ogTitle: SITE_NAME, desc: baseDesc,
  image: image(cardPath.number(data.numbers[today]), data.numbers[today].slug),
});

data.numbers.forEach((n, i) => {
  if (!n.slug) return;
  pages.push({
    path: `number/${n.slug}/`, number: i,
    title: `${n.value}: ${n.what} | ${SITE_NAME}`, ogTitle: `${n.value}: ${n.what}`, desc: n.story,
    image: image(cardPath.number(n), n.slug),
  });
});

for (const c of data.chases) {
  if (!c.slug) continue;
  const text = R.chaseText(c);
  pages.push({
    path: `chase/${c.slug}/`, focus: `chase-${c.slug}`,
    title: `${text.replace(/\.$/, '')} | ${SITE_NAME}`, ogTitle: text.replace(/\.$/, ''),
    desc: `Correct to ${c.asOf}. See how many more ${c.unit}s it would take at career pace, and who else is chasing ${c.holder}.`,
    image: image(cardPath.chase(c), c.now),
  });
}

pages.push({
  path: 'play/', focus: 'mystery',
  title: `Guess the mystery player | ${SITE_NAME}`, ogTitle: 'Guess the mystery player',
  desc: `One Test great is hidden each day. You get ${words[M.guesses] || M.guesses} guesses, with clues for country, role, debut, Tests, runs and wickets.`,
  image: image(cardPath.play(), '1'),
});

if (hasMu) {
  pages.push({
    path: 'matchup/', focus: 'matchups',
    title: `Batter against bowler | ${SITE_NAME}`, ogTitle: 'Batter against bowler',
    desc: 'Pick any batter and bowler in men’s international cricket and see the balls, runs and dismissals between them.',
    image: image(cardPath.matchups(), mu.formats[0].through),
  });
  for (const v of mu.featured) {
    pages.push({
      path: `matchup/${v.slug}/`, focus: 'matchups', matchup: v,
      title: `${R.muTitle(v)} in ${v.label} | ${SITE_NAME}`, ogTitle: `${R.muTitle(v)} in ${v.label}`,
      desc: R.muShareText(v),
      image: image(cardPath.matchup(v), v.p[0]),
    });
  }
}

let bytes = 0;
for (const p of pages) bytes += page(p);

fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages.map(p => `  <url><loc>${site}${p.path}</loc></url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`);

const withImage = pages.filter(p => p.image).length;
console.log(`Built ${pages.length} pages into ${outDir} (${(bytes / 1024).toFixed(0)} kB of HTML). ` +
  `${withImage} have a preview picture. Matchups: ${hasMu ? mu.formats.map(f => `${f.label} ${f.pairs}`).join(', ') + `, ${mu.featured.length} featured` : 'none'}. ` +
  `Number of the day: ${data.numbers[today].value}.`);

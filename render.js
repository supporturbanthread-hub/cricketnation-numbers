var CNRender = (function () {
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ENT[c]; }); }
  function fmt(n, dp) {
    dp = dp || 0;
    return Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function dayIndex(len, now) { return Math.floor((now || Date.now()) / 864e5) % len; }
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  /* Today's number: each character hangs on its own scoreboard plate. */
  function hero(s) {
    var plates = String(s.value).split('').map(function (c, i) {
      var cls = /[0-9]/.test(c) ? 'plate' : 'plate plate--mark';
      return '<span class="' + cls + '" style="--i:' + i + '" aria-hidden="true">' + esc(c) + '</span>';
    }).join('');
    return '<div class="plates" role="img" aria-label="' + esc(s.spoken || s.value) + '">' + plates + '</div>' +
      '<h2 class="hero-what">' + esc(s.what) + '</h2>' +
      '<p class="hero-story">' + esc(s.story) + '</p>' +
      '<p class="hero-when">' + esc(s.when) + '</p>';
  }

  /* Record chases: gap, progress, and how long it takes at career pace. */
  function chase(c) {
    var gap = Math.max(0, c.target - c.now);
    var note = c.note && (c.noteFor == null || c.noteFor === c.now) ? c.note : '';
    var pct = Math.max(0, Math.min(100, (c.now / c.target) * 100));
    var units = c.unit + 's';
    var pace, n;
    if (c.kind === 'count') {
      var per = c.matches / c.now;
      n = Math.ceil(gap * per);
      pace = 'One every ' + fmt(per, 1) + ' ' + units + ' on average, so about ' + fmt(n) + ' more ' + units + '.';
    } else {
      var rate = c.now / c.matches;
      n = Math.ceil(gap / rate);
      pace = 'At a career rate of ' + fmt(rate, 1) + ' per ' + c.unit + ', that is about ' + fmt(n) + ' more ' + units + '.';
    }
    if (gap === 0) { pace = 'The record has been reached.'; note = ''; }
    return '<li class="chase"' + (c.slug ? ' id="chase-' + esc(c.slug) + '"' : '') + '>' +
      '<div class="chase-who">' +
        '<h3>' + esc(c.player) + ' <span>' + esc(c.what) + '</span></h3>' +
        '<p class="chase-gap"><strong>' + fmt(gap) + '</strong> to go</p>' +
      '</div>' +
      '<div class="chase-how">' +
        '<div class="track" role="img" aria-label="' + fmt(c.now) + ' of ' + fmt(c.target) + '">' +
          '<div class="track-fill" style="width:' + pct.toFixed(2) + '%"></div>' +
          '<div class="track-ball" style="left:' + pct.toFixed(2) + '%"></div>' +
        '</div>' +
        '<div class="track-ends"><span>' + fmt(c.now) + ' now</span><span>' + esc(c.holder) + ' ' + fmt(c.target) + '</span></div>' +
        '<p class="chase-pace">' + esc(pace) + (note ? ' ' + esc(note) : '') + '</p>' +
        '<p class="chase-date">Correct to ' + esc(c.asOf) + '</p>' +
        (c.slug ? '<p class="chase-share"><button class="linkbtn" type="button" data-share-chase="' + esc(c.slug) + '">Share this chase</button><span role="status"></span></p>' : '') +
      '</div>' +
    '</li>';
  }
  function chases(list) { return list.map(chase).join(''); }
  /* One-line version of a chase, for sharing and link previews. */
  function chaseText(c) {
    var gap = c.target - c.now;
    if (gap <= 0) return c.player + ' has reached ' + c.holder + '\u2019s record of ' + fmt(c.target) + ' ' + c.what + '.';
    return c.player + ' is ' + fmt(gap) + ' ' + c.what + ' short of ' + c.holder + '\u2019s record ' + fmt(c.target) + '.';
  }

  /* Head-to-head */
  function val(p, m) { return m.num ? p[m.num] / p[m.den] : p[m.key]; }

  function duel(group, aId, bId) {
    var a = find(group.players, aId), b = find(group.players, bId);
    var aLead = 0, bLead = 0, widest = null;
    var rows = group.metrics.map(function (m) {
      var dp = m.dp || 0;
      var va = val(a, m), vb = val(b, m);
      var ra = +va.toFixed(dp), rb = +vb.toFixed(dp);
      var aw = m.lower ? ra < rb : ra > rb;
      var bw = m.lower ? rb < ra : rb > ra;
      if (aw) aLead++;
      if (bw) bLead++;
      var best = m.lower ? Math.min(va, vb) : Math.max(va, vb);
      var wa = (m.lower ? best / va : va / best) * 100;
      var wb = (m.lower ? best / vb : vb / best) * 100;
      var rel = Math.abs(va - vb) / Math.max(va, vb);
      if (!widest || rel > widest.rel) widest = { rel: rel, m: m, fa: fmt(va, dp), fb: fmt(vb, dp) };
      return '<div class="duel-row">' +
        '<div class="duel-label">' + esc(m.label) + '</div>' +
        '<div class="duel-line">' +
          '<span class="duel-val' + (aw ? ' is-lead' : '') + '">' + fmt(va, dp) + '</span>' +
          '<span class="bars" aria-hidden="true">' +
            '<span class="bar bar--l"><i' + (aw ? ' class="is-lead"' : '') + ' style="width:' + wa.toFixed(1) + '%"></i></span>' +
            '<span class="bar bar--r"><i' + (bw ? ' class="is-lead"' : '') + ' style="width:' + wb.toFixed(1) + '%"></i></span>' +
          '</span>' +
          '<span class="duel-val' + (bw ? ' is-lead' : '') + '">' + fmt(vb, dp) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    var total = group.metrics.length, verdict;
    if (aLead === bLead) verdict = 'Level at ' + aLead + ' measures each.';
    else verdict = (aLead > bLead ? a.short : b.short) + ' leads on ' + Math.max(aLead, bLead) + ' of the ' + total + ' measures.';
    if (widest && widest.rel > 0) {
      verdict += ' The widest gap is ' + widest.m.phrase + ': ' + a.short + ' ' + widest.fa + ', ' + b.short + ' ' + widest.fb + '.';
    }
    return rows + '<p class="verdict">' + esc(verdict) + '</p>';
  }

  function options(players, selected, blocked) {
    return players.map(function (p) {
      return '<option value="' + esc(p.id) + '"' +
        (p.id === selected ? ' selected' : '') +
        (p.id === blocked ? ' disabled' : '') + '>' + esc(p.short) + '</option>';
    }).join('');
  }

  function seg(groups, active) {
    return Object.keys(groups).map(function (k) {
      return '<button type="button" data-group="' + esc(k) + '" aria-pressed="' + (k === active) + '">' + esc(groups[k].label) + '</button>';
    }).join('');
  }

  /* Batter against bowler.
     A view is { label, bat: {name, tot}, bowl: {name}, p }, where
     p = [balls, runs, dismissals, fours, sixes, dot balls, innings, first year, last year]
     and bat.tot = the batter's [balls, runs, dismissals] against every bowler. */
  function per(n, d, dp) { return d ? fmt(n / d, dp == null ? 1 : dp) : '–'; }
  function years(p) { return p[7] === p[8] ? String(p[7]) : p[7] + ' to ' + p[8]; }
  function times(n) { return n === 1 ? 'once' : n === 2 ? 'twice' : fmt(n) + ' times'; }

  function muVerdict(v) {
    var p = v.p, bat = v.bat.name, bowl = v.bowl.name, s;
    if (p[2] > 0) s = bowl + ' has dismissed ' + bat + ' ' + times(p[2]) + ', once every ' + fmt(p[0] / p[2]) + ' balls.';
    else s = bowl + ' has never dismissed ' + bat + ' in ' + fmt(p[0]) + ' balls.';
    var t = v.bat.tot;
    if (t) {
      var runs = t[1] - p[1], outs = t[2] - p[2];
      if (outs > 0 && p[2] > 0) s += ' ' + bat + ' averages ' + fmt(p[1] / p[2], 1) + ' in this matchup and ' + fmt(runs / outs, 1) + ' against all other bowlers.';
      else if (outs > 0) s += ' ' + bat + ' averages ' + fmt(runs / outs, 1) + ' against all other bowlers.';
    }
    return s;
  }

  function muTitle(v) { return v.bat.name + ' v ' + v.bowl.name; }
  function muShareText(v) {
    var p = v.p;
    return muTitle(v) + ' in ' + v.label + ': ' + fmt(p[0]) + ' balls, ' + fmt(p[1]) + ' runs, ' +
      fmt(p[2]) + (p[2] === 1 ? ' dismissal' : ' dismissals') + (p[2] ? ', average ' + fmt(p[1] / p[2], 1) : '') + '.';
  }

  function matchup(v) {
    var p = v.p, balls = p[0] || 1;
    var bnd = p[3] + p[4], dots = Math.min(p[5], p[0]), mid = Math.max(0, p[0] - dots - bnd);
    var pc = function (n) { return Math.round(n / balls * 100); };
    var stats = [
      ['Balls', fmt(p[0])], ['Runs', fmt(p[1])], ['Dismissals', fmt(p[2])], ['Average', per(p[1], p[2])],
      ['Strike rate', per(p[1] * 100, p[0])], ['Balls per dismissal', per(p[0], p[2], 0)], ['Fours', fmt(p[3])], ['Sixes', fmt(p[4])]
    ];
    var legend = pc(dots) + '% dot balls, ' + pc(mid) + '% ones, twos and threes, ' + pc(bnd) + '% boundaries';
    return '<div class="mu-pair">' +
      '<h3 class="mu-vs"><span>' + esc(v.bat.name) + '</span> <i>v</i> <span>' + esc(v.bowl.name) + '</span></h3>' +
      '<p class="mu-sub">' + esc(v.label) + ', ' + years(p) + ', ' + fmt(p[6]) + ' innings</p>' +
      '<dl class="mu-stats">' + stats.map(function (s) { return '<div><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>'; }).join('') + '</dl>' +
      '<div class="mu-bar" role="img" aria-label="' + esc(legend) + '">' +
        '<i class="is-dot" style="flex-grow:' + dots + '"></i><i class="is-run" style="flex-grow:' + mid + '"></i><i class="is-bnd" style="flex-grow:' + bnd + '"></i>' +
      '</div>' +
      '<p class="mu-legend"><span class="k-dot">' + pc(dots) + '% dot balls</span><span class="k-run">' + pc(mid) + '% ones, twos and threes</span><span class="k-bnd">' + pc(bnd) + '% boundaries</span></p>' +
      '<p class="verdict">' + esc(muVerdict(v)) + '</p>' +
    '</div>';
  }

  /* The opponents list shown when only one player is picked. rows = [{ name, p }], side = 'bowl' or 'bat'. */
  function muList(title, sub, rows, side) {
    var body = rows.map(function (row) {
      var p = row.p;
      return '<tr><td><button class="linkbtn" type="button" data-pick-' + side + '="' + esc(row.name) + '">' + esc(row.name) + '</button></td>' +
        '<td>' + fmt(p[2]) + '</td><td>' + fmt(p[0]) + '</td><td>' + fmt(p[1]) + '</td><td>' + per(p[1], p[2]) + '</td></tr>';
    }).join('');
    return '<h3 class="mu-list-title">' + esc(title) + '</h3><p class="mu-sub">' + esc(sub) + '</p>' +
      '<div class="mu-table-wrap"><table class="mu-table"><thead><tr><th scope="col">' + (side === 'bowl' ? 'Bowler' : 'Batter') +
      '</th><th scope="col">Outs</th><th scope="col">Balls</th><th scope="col">Runs</th><th scope="col">Average</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function muSeg(formats, active) {
    return formats.map(function (f) {
      return '<button type="button" data-format="' + esc(f.key) + '" aria-pressed="' + (f.key === active) + '">' + esc(f.label) + '</button>';
    }).join('');
  }
  function muPopular(featured, activeSlug) {
    if (!featured.length) return '';
    return '<span>Popular</span>' + featured.map(function (v) {
      return '<button class="chip" type="button" data-feature="' + esc(v.slug) + '" aria-pressed="' + (v.slug === activeSlug) + '">' +
        esc(shortName(v.bat.name)) + ' v ' + esc(shortName(v.bowl.name)) + (v.format === 'test' ? '' : ', ' + esc(v.label)) + '</button>';
    }).join('');
  }
  /* "DA Warner" -> "Warner". Names without leading initials are left whole. */
  function shortName(name) {
    var w = name.split(' ');
    return w.length > 1 && /^[A-Z]{1,4}$/.test(w[0]) ? w.slice(1).join(' ') : name;
  }
  function prettyDate(iso) {
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], d = iso.split('-');
    return Number(d[2]) + ' ' + m[Number(d[1]) - 1] + ' ' + d[0];
  }
  function muNote(f) {
    return 'Ball-by-ball records from Cricsheet: ' + fmt(f.matches) + ' men’s ' + f.label + ' from ' + f.from.slice(0, 4) + ' to ' + prettyDate(f.through) +
      '. Wides are not counted as balls faced. Averages here count only dismissals credited to a bowler, so run outs are left out. ' +
      'Pairs who have met for fewer than ' + f.minBalls + ' balls are not listed.';
  }

  /* Mystery player */
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* Which player is the answer on day n. The order is reshuffled every time the pool has been used up. */
  function mysteryIndex(len, n) {
    n = Math.max(0, n);
    var r = rng(9173 + Math.floor(n / len) * 7919), order = [], i, j, t;
    for (i = 0; i < len; i++) order.push(i);
    for (i = len - 1; i > 0; i--) {
      j = Math.floor(r() * (i + 1));
      t = order[i]; order[i] = order[j]; order[j] = t;
    }
    return order[n % len];
  }

  var MP_COLS = [
    { key: 'country', label: 'Nat', full: 'Country' },
    { key: 'role', label: 'Role', full: 'Role' },
    { key: 'bats', label: 'Bats', full: 'Batting hand' },
    { key: 'debut', label: 'Debut', full: 'Test debut', num: true, plain: true },
    { key: 'tests', label: 'Tests', full: 'Tests', num: true },
    { key: 'runs', label: 'Runs', full: 'Runs', num: true },
    { key: 'wickets', label: 'Wkts', full: 'Wickets', num: true }
  ];

  function clues(guess, answer, cfg) {
    return MP_COLS.map(function (c) {
      var g = guess[c.key], a = answer[c.key];
      var state = 'miss', dir = '';
      if (g === a) state = 'hit';
      else if (c.num) {
        dir = a > g ? 'up' : 'down';
        if (Math.abs(a - g) <= cfg.close[c.key]) state = 'close';
      }
      var text = c.num ? (c.plain ? String(g) : fmt(g)) : (c.key === 'bats' ? (g === 'L' ? 'Left' : 'Right') : g);
      var spoken = c.key === 'country' ? cfg.countries[g] : c.key === 'role' ? cfg.roles[g] : text;
      var aria = c.full + ': ' + spoken + '. ' +
        (state === 'hit' ? 'Match.' : (state === 'close' ? 'Close. ' : 'No match. ') +
          (dir ? 'The answer is ' + (dir === 'up' ? 'higher.' : 'lower.') : ''));
      return { key: c.key, state: state, dir: dir, text: text, aria: aria.trim() };
    });
  }

  function mysteryCols() {
    return MP_COLS.map(function (c) { return '<span>' + esc(c.label) + '</span>'; }).join('');
  }

  function guessRow(guess, answer, cfg, tag, fresh) {
    var cells = clues(guess, answer, cfg).map(function (c, i) {
      return '<span class="mp-cell is-' + c.state + '" style="--i:' + i + '" role="img" aria-label="' + esc(c.aria) + '">' +
        '<b>' + esc(c.text) + '</b>' +
        (c.dir ? '<i>' + (c.dir === 'up' ? '↑' : '↓') + '</i>' : '') +
      '</span>';
    }).join('');
    return '<li class="mp-row' + (fresh ? ' is-new' : '') + '">' +
      '<div class="mp-name"><strong>' + esc(guess.name) + '</strong><span>' + esc(tag) + '</span></div>' +
      '<div class="mp-cells">' + cells + '</div>' +
    '</li>';
  }

  function mysteryKey(cfg) {
    var c = cfg.close;
    return 'Close means within ' + c.debut + ' years, ' + c.tests + ' Tests, ' + fmt(c.runs) + ' runs or ' + c.wickets +
      ' wickets. AR is an all-rounder and WK is a wicketkeeper.';
  }

  function hintText(answer, n) {
    var words = answer.name.split(' ');
    var first = words[0].charAt(0).toUpperCase();
    if (n === 1) return 'Hint 1: their name starts with ' + first + '.';
    if (words.length > 1) return 'Hint 2: their initials are ' + first + ' and ' + words[words.length - 1].charAt(0).toUpperCase() + '.';
    return 'Hint 2: their name is ' + answer.name.replace(/[^A-Za-z]/g, '').length + ' letters long.';
  }

  /* Spoiler-free result: one row of squares per guess, oldest first. */
  function shareGrid(guesses, answer, cfg) {
    var sq = { hit: '🟩', close: '🟨', miss: '⬛' };
    return guesses.map(function (g) {
      return clues(g, answer, cfg).map(function (c) { return sq[c.state]; }).join('');
    }).join('\n');
  }

  /* Share sheet where the browser offers one, clipboard otherwise. say(message) reports the outcome. */
  function share(text, url, say) {
    var blocked = 'Sharing is blocked here. Press and hold the text above to copy it.';
    var copy = function () {
      try {
        navigator.clipboard.writeText(text + (url ? '\n' + url : '')).then(
          function () { say('Copied to your clipboard.', true); },
          function () { say(blocked, false); }
        );
      } catch (e) { say(blocked, false); }
    };
    try {
      if (navigator.share) {
        navigator.share({ text: text, url: url }).catch(function (e) {
          if (!e || e.name !== 'AbortError') copy();
        });
        return;
      }
    } catch (e) { /* fall through to copy */ }
    copy();
  }

  return {
    hero: hero, chases: chases, duel: duel, options: options, seg: seg, dayIndex: dayIndex,
    mysteryIndex: mysteryIndex, mysteryCols: mysteryCols, guessRow: guessRow, mysteryKey: mysteryKey,
    hintText: hintText, shareGrid: shareGrid, share: share, esc: esc, fmt: fmt, chaseText: chaseText,
    matchup: matchup, muList: muList, muSeg: muSeg, muPopular: muPopular, muNote: muNote, muTitle: muTitle, muShareText: muShareText, shortName: shortName
  };
})();

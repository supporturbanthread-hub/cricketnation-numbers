(function () {
  var data = JSON.parse(document.getElementById('cn-data').textContent);
  var MU = data.mu, R = CNRender;
  var root = document.getElementById('matchups');
  if (!MU || !MU.formats || !MU.formats.length || !root) return;

  var $ = function (id) { return document.getElementById(id); };
  var base = document.documentElement.getAttribute('data-base') || '';
  var site = (data.meta && data.meta.siteUrl) || '';
  var segEl = $('mu-seg'), out = $('mu-out'), popular = $('mu-popular');
  var actions = $('mu-actions'), shareMsg = $('mu-share-msg'), note = $('mu-note');

  var files = {};     // format key -> loaded matchup file with lookups
  var loading = {};   // format key -> promise
  var state = { format: MU.formats[0].key, bat: '', bowl: '' };
  var view = null;    // the matchup on screen, when both players are picked

  function meta(key) { return MU.formats.filter(function (f) { return f.key === key; })[0]; }
  function featured(format, bat, bowl) {
    return MU.featured.filter(function (v) { return v.format === format && v.bat.name === bat && v.bowl.name === bowl; })[0];
  }

  /* Loading */
  function index(file) {
    file.byName = {};
    file.batPairs = {};
    file.bowlPairs = {};
    file.players.forEach(function (p, i) {
      var seen = file.byName[p[0]];
      // Two players can share a name. Keep the one with more balls on record.
      if (seen == null || p[2] + p[5] > file.players[seen][2] + file.players[seen][5]) file.byName[p[0]] = i;
    });
    file.pairs.forEach(function (p) {
      (file.batPairs[p[0]] = file.batPairs[p[0]] || []).push(p);
      (file.bowlPairs[p[1]] = file.bowlPairs[p[1]] || []).push(p);
    });
    return file;
  }
  function load(key) {
    if (files[key]) return Promise.resolve(files[key]);
    if (!loading[key]) {
      loading[key] = fetch(base + 'matchups/' + key + '.json')
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(function (file) { files[key] = index(file); return files[key]; })
        .catch(function (err) { loading[key] = null; throw err; });
    }
    return loading[key];
  }

  /* Drawing */
  function message(html) { out.innerHTML = '<p class="mu-msg">' + html + '</p>'; }
  function failed() {
    message('The matchup records did not load. Check your connection, then <button class="linkbtn" type="button" data-retry>try again</button>.');
  }

  function draw() {
    var f = meta(state.format), file = files[state.format];
    view = null;
    shareMsg.textContent = '';
    segEl.innerHTML = R.muSeg(MU.formats, state.format);
    note.textContent = R.muNote(f);
    bat.show(state.bat);
    bowl.show(state.bowl);

    var ready = state.bat && state.bowl ? featured(state.format, state.bat, state.bowl) : null;
    popular.innerHTML = R.muPopular(MU.featured, ready ? ready.slug : '');

    if (ready) {
      view = ready;
      out.innerHTML = R.matchup(view);
    } else if (!state.bat && !state.bowl) {
      message('Pick a batter or a bowler to see who they have faced.');
    } else if (!file) {
      message('Loading the records…');
      load(state.format).then(draw, failed);
    } else if (state.bat && state.bowl) {
      drawPair(file, f);
    } else {
      drawList(file, f);
    }
    actions.hidden = !view;
  }

  function drawPair(file, f) {
    var b = file.byName[state.bat], w = file.byName[state.bowl];
    var pair = b != null && w != null ? (file.batPairs[b] || []).filter(function (p) { return p[1] === w; })[0] : null;
    if (!pair) {
      message(R.esc(state.bowl) + ' has not bowled ' + f.minBalls + ' balls to ' + R.esc(state.bat) + ' in ' + R.esc(f.label) +
        ' on record. Clear one of the names to see who each of them has faced.');
      return;
    }
    view = {
      format: f.key, label: f.label, p: pair.slice(2),
      bat: { name: state.bat, tot: file.players[b].slice(2, 5) },
      bowl: { name: state.bowl, tot: file.players[w].slice(5, 8) }
    };
    out.innerHTML = R.matchup(view);
  }

  function drawList(file, f) {
    var isBat = !!state.bat, name = state.bat || state.bowl, i = file.byName[name];
    var pairs = i == null ? [] : (isBat ? file.batPairs[i] : file.bowlPairs[i]) || [];
    if (!pairs.length) {
      message('There is no ' + R.esc(f.label) + ' record for ' + R.esc(name) + ' as a ' + (isBat ? 'batter' : 'bowler') + '. Try another format or another player.');
      return;
    }
    // Most dismissals first; among equals, the cheapest dismissals first.
    var rows = pairs.slice().sort(function (a, b) { return b[4] - a[4] || a[3] - b[3]; }).slice(0, 10).map(function (p) {
      return { name: file.players[isBat ? p[1] : p[0]][0], p: p.slice(2) };
    });
    var title = isBat ? 'Who gets ' + name + ' out most' : 'Who ' + name + ' gets out most';
    var sub = f.label + '. Choose a ' + (isBat ? 'bowler' : 'batter') + ' for the full matchup.';
    out.innerHTML = R.muList(title, sub, rows, isBat ? 'bowl' : 'bat');
  }

  /* Name search. Cricsheet lists players as initials and surname ("V Kohli"), so "virat kohli",
     "v kohli" and "kohli" should all find him. */
  function matches(query, name) {
    var q = query.toLowerCase().replace(/[^a-z\s'-]/g, '').trim();
    if (!q) return true;
    var lower = name.toLowerCase();
    if (lower.indexOf(q) >= 0) return true;
    var words = name.split(' ');
    var initials = /^[A-Z]{1,4}$/.test(words[0]) ? words[0].toLowerCase() : '';
    var rest = (initials ? words.slice(1) : words).map(function (w) { return w.toLowerCase(); });
    var strong = false;
    var ok = q.split(/\s+/).every(function (t) {
      if (rest.some(function (w) { return w.indexOf(t) === 0; })) { strong = true; return true; }
      return initials && initials.indexOf(t.charAt(0)) >= 0;
    });
    return ok && strong;
  }

  /* Candidates for one side: everyone the other pick has faced, or everyone in the format. */
  function candidates(side) {
    var file = files[state.format];
    if (!file) return null;
    var other = side === 'bat' ? state.bowl : state.bat;
    var o = other ? file.byName[other] : null;
    var list;
    if (o != null) {
      list = ((side === 'bat' ? file.bowlPairs[o] : file.batPairs[o]) || []).map(function (p) {
        return { name: file.players[side === 'bat' ? p[0] : p[1]][0], weight: p[2], meta: R.fmt(p[2]) + ' balls' };
      });
    } else {
      var col = side === 'bat' ? 2 : 5, has = side === 'bat' ? file.batPairs : file.bowlPairs;
      list = [];
      file.players.forEach(function (p, i) {
        if (has[i] && file.byName[p[0]] === i) list.push({ name: p[0], weight: p[col], meta: file.teams[p[1]] || '' });
      });
    }
    return list.sort(function (a, b) { return b.weight - a.weight; });
  }

  function combo(side) {
    var input = $('mu-' + side), list = $('mu-' + side + '-list'), clear = $('mu-' + side + '-clear');
    var found = [], active = -1;

    function close() { list.hidden = true; list.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    function paint() {
      list.innerHTML = found.map(function (c, i) {
        return '<li role="option" id="mu-' + side + '-opt-' + i + '" data-name="' + R.esc(c.name) + '" aria-selected="' + (i === active) + '">' +
          R.esc(c.name) + '<span>' + R.esc(c.meta) + '</span></li>';
      }).join('');
      if (active >= 0) input.setAttribute('aria-activedescendant', 'mu-' + side + '-opt-' + active);
    }
    function open() {
      var all = candidates(side);
      list.hidden = false;
      if (!all) {
        list.innerHTML = '<li class="mp-none" role="presentation">Loading players…</li>';
        load(state.format).then(function () { if (document.activeElement === input) open(); }, function () {
          list.innerHTML = '<li class="mp-none" role="presentation">The records did not load. Check your connection and try again.</li>';
        });
        return;
      }
      // Typing over a chosen name starts a fresh search.
      var q = input.value === state[side] ? '' : input.value;
      found = all.filter(function (c) { return matches(q, c.name); }).slice(0, 7);
      active = found.length ? 0 : -1;
      if (!found.length) {
        list.innerHTML = '<li class="mp-none" role="presentation">No match. Players are listed by initials and surname, so try the surname alone.</li>';
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      input.setAttribute('aria-expanded', 'true');
      paint();
    }
    function pick(name) {
      state[side] = name;
      close();
      draw();
    }

    input.addEventListener('focus', function () { input.select(); open(); });
    input.addEventListener('input', open);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!found.length || list.hidden) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length;
        paint();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!list.hidden && active >= 0) { pick(found[active].name); input.blur(); }
      } else if (e.key === 'Escape') {
        close();
        input.value = state[side];
      }
    });
    input.addEventListener('blur', function () {
      // Leave time for a tap on the list to land before it closes.
      setTimeout(function () { if (document.activeElement !== input) { close(); input.value = state[side]; } }, 150);
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest ? e.target.closest('li[data-name]') : null;
      if (li) { pick(li.getAttribute('data-name')); input.blur(); }
    });
    clear.addEventListener('click', function () { state[side] = ''; draw(); input.focus(); });

    return {
      show: function (name) {
        if (document.activeElement !== input) input.value = name;
        clear.hidden = !name;
      }
    };
  }
  var bat = combo('bat'), bowl = combo('bowl');

  /* Format, popular matchups, list rows, retry */
  root.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    if (t.hasAttribute('data-format')) {
      var key = t.getAttribute('data-format');
      if (key === state.format) return;
      state.format = key;
      draw();
      var now = segEl.querySelector('[aria-pressed="true"]');
      if (now) now.focus();
    } else if (t.hasAttribute('data-feature')) {
      var v = MU.featured.filter(function (x) { return x.slug === t.getAttribute('data-feature'); })[0];
      if (v) { state.format = v.format; state.bat = v.bat.name; state.bowl = v.bowl.name; draw(); }
    } else if (t.hasAttribute('data-pick-bowl')) {
      state.bowl = t.getAttribute('data-pick-bowl');
      draw();
    } else if (t.hasAttribute('data-pick-bat')) {
      state.bat = t.getAttribute('data-pick-bat');
      draw();
    } else if (t.hasAttribute('data-retry')) {
      draw();
    }
  });

  $('mu-share').addEventListener('click', function () {
    if (!view) return;
    var known = featured(view.format, view.bat.name, view.bowl.name);
    var url = !site ? '' : known ? site + 'matchup/' + known.slug + '/'
      : site + 'matchup/?f=' + view.format + '&b=' + encodeURIComponent(view.bat.name) + '&w=' + encodeURIComponent(view.bowl.name);
    R.share(R.muShareText(view), url, function (text, ok) {
      shareMsg.textContent = ok ? text : 'Sharing is blocked here. Copy the address of this page instead.';
    });
  });

  /* Starting point: a matchup named in the link, else the one the page was built with. */
  var start = MU.featured.filter(function (v) { return v.slug === MU.initial; })[0] || MU.featured[0];
  if (start) { state.format = start.format; state.bat = start.bat.name; state.bowl = start.bowl.name; }
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('b') || q.get('w')) {
      if (meta(q.get('f'))) state.format = q.get('f');
      state.bat = q.get('b') || '';
      state.bowl = q.get('w') || '';
    }
  } catch (e) { /* keep the built-in starting point */ }
  draw();
})();

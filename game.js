(function () {
  var data = JSON.parse(document.getElementById('cn-data').textContent);
  var M = data.mystery, R = CNRender;
  var root = document.getElementById('mystery');
  if (!M || !root) return;

  var $ = function (id) { return document.getElementById(id); };
  var form = $('mp-form'), input = $('mp-input'), list = $('mp-list'), label = $('mp-status');
  var hints = $('mp-hints'), result = $('mp-result'), cols = $('mp-cols'), rows = $('mp-rows');
  var egNote = $('mp-eg'), live = $('mp-live');
  var exampleHtml = rows.innerHTML;

  var players = M.players, max = M.guesses, byId = {};
  players.forEach(function (p) { byId[p.id] = p; });

  var DAY = 864e5;
  var epochDay = Math.floor(Date.parse(M.epoch + 'T00:00:00Z') / DAY);
  var today = Math.max(0, Math.floor(Date.now() / DAY) - epochDay);
  var KEY = 'cn-mystery', STATS = 'cn-mystery-stats';

  /* Saved progress is a convenience: the game plays the same without it. */
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

  function settle(g) {
    g.won = g.guesses.indexOf(g.answer.id) >= 0;
    g.done = g.won || g.guesses.length >= max;
    return g;
  }

  var daily = { mode: 'daily', answer: players[R.mysteryIndex(players.length, today)], guesses: [], hints: 0 };
  var saved = load(KEY);
  if (saved && saved.day === today && Array.isArray(saved.guesses)) {
    daily.guesses = saved.guesses.filter(function (id) { return byId[id]; }).slice(0, max);
    daily.hints = Math.max(0, Math.min(2, saved.hints | 0));
  }
  settle(daily);
  var game = daily;

  function persist() { save(KEY, { day: today, guesses: daily.guesses, hints: daily.hints }); }

  function record() {
    var s = load(STATS) || { played: 0, wins: 0, streak: 0, best: 0, lastDay: null, lastWin: null };
    if (s.lastDay === today) return;
    s.played += 1;
    if (daily.won) {
      s.streak = s.lastWin === today - 1 ? s.streak + 1 : 1;
      s.best = Math.max(s.best, s.streak);
      s.wins += 1;
      s.lastWin = today;
    } else {
      s.streak = 0;
    }
    s.lastDay = today;
    save(STATS, s);
  }

  function untilNext() {
    var ms = (Math.floor(Date.now() / DAY) + 1) * DAY - Date.now();
    var h = Math.floor(ms / 36e5), m = Math.max(1, Math.floor((ms % 36e5) / 6e4));
    return h ? h + 'h ' + m + 'm' : m + (m === 1 ? ' minute' : ' minutes');
  }
  function days(n) { return n + (n === 1 ? ' day' : ' days'); }

  function resultHtml() {
    var n = game.guesses.length, isDaily = game.mode === 'daily';
    var h = '<p class="mp-verdict">' +
      (game.won ? 'Got it in ' + n + (n === 1 ? ' guess. ' : ' guesses. ') : 'Out of guesses. ') +
      (isDaily ? 'Today’s mystery player was ' : 'The player was ') + R.esc(game.answer.name) + '.</p>';
    if (isDaily) {
      var s = load(STATS);
      if (s && s.played) h += '<p class="mp-streak">Current streak: ' + days(s.streak) + '. Best: ' + days(s.best) + '.</p>';
      h += '<p class="mp-next">The next player arrives in ' + untilNext() + '.</p>' +
        '<div class="mp-actions">' +
          '<button class="btn btn--solid" type="button" data-act="share">Share result</button>' +
          '<button class="btn" type="button" data-act="practice">Play a practice round</button>' +
        '</div>';
    } else {
      h += '<div class="mp-actions">' +
          '<button class="btn btn--solid" type="button" data-act="practice">Play another practice round</button>' +
          '<button class="btn" type="button" data-act="daily">Back to today’s result</button>' +
        '</div>';
    }
    return h + '<p class="share-msg" id="mp-share-msg" role="status"></p>' +
      '<textarea class="mp-share-text" id="mp-share-text" readonly hidden aria-label="Your result"></textarea>';
  }

  function render(fresh) {
    var n = game.guesses.length, i, h = '';
    form.hidden = game.done;
    label.textContent = (game.mode === 'practice' ? 'Practice round, guess ' : 'Guess ') + Math.min(n + 1, max) + ' of ' + max;

    if (!game.done) {
      for (i = 1; i <= 2; i++) {
        if (game.hints >= i) h += '<p>' + R.esc(R.hintText(game.answer, i)) + '</p>';
        else if (game.hints === i - 1 && n >= M.hintsAfter[i - 1]) {
          h += '<button class="btn" type="button" data-act="hint">Show hint ' + i + '</button>';
        }
      }
    }
    hints.innerHTML = h;

    var html = '';
    if (game.done && !game.won) html += R.guessRow(game.answer, game.answer, M, 'The answer', false);
    for (i = n - 1; i >= 0; i--) {
      html += R.guessRow(byId[game.guesses[i]], game.answer, M, 'Guess ' + (i + 1), game.guesses[i] === fresh);
    }
    var showExample = !html;
    rows.innerHTML = showExample ? exampleHtml : html;
    egNote.hidden = !showExample;
    cols.hidden = false;

    result.hidden = !game.done;
    result.innerHTML = game.done ? resultHtml() : '';
  }

  function guess(id) {
    if (game.done || !byId[id] || game.guesses.indexOf(id) >= 0) return;
    game.guesses.push(id);
    settle(game);
    if (game.mode === 'daily') {
      persist();
      if (game.done) record();
    }
    render(id);
    var left = max - game.guesses.length;
    live.textContent = game.won ? 'Correct. It was ' + game.answer.name + '.'
      : game.done ? 'Out of guesses. It was ' + game.answer.name + '.'
      : byId[id].name + ' is not the player. ' + left + (left === 1 ? ' guess left.' : ' guesses left.');
  }

  function practice() {
    var pick;
    do { pick = players[Math.floor(Math.random() * players.length)]; }
    while (pick.id === daily.answer.id || pick.id === game.answer.id);
    game = settle({ mode: 'practice', answer: pick, guesses: [], hints: 0 });
    render();
    input.focus();
  }

  function shareResult() {
    var n = daily.guesses.length;
    var text = 'CricketNation mystery player #' + (today + 1) + ': ' + (daily.won ? n : 'X') + '/' + max +
      (daily.hints ? ' with ' + daily.hints + (daily.hints === 1 ? ' hint' : ' hints') : '') + '\n' +
      R.shareGrid(daily.guesses.map(function (id) { return byId[id]; }), daily.answer, M);
    var url = (data.meta && data.meta.shareUrl) || '';
    R.share(text, url, function (message, ok) {
      var msg = $('mp-share-msg'), box = $('mp-share-text');
      if (!msg || !box) return;
      if (ok) { msg.textContent = message; box.hidden = true; return; }
      msg.textContent = 'Sharing is blocked here. Copy your result from the box below.';
      box.value = text + (url ? '\n' + url : '');
      box.hidden = false;
      box.focus();
      box.select();
    });
  }

  root.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (act === 'hint') {
      game.hints += 1;
      if (game.mode === 'daily') persist();
      render();
      input.focus();
    } else if (act === 'share') shareResult();
    else if (act === 'practice') practice();
    else if (act === 'daily') { game = daily; render(); }
  });

  /* Name search */
  var matches = [], active = -1;
  function norm(s) { return s.toLowerCase().replace(/[^a-z]/g, ''); }

  function refresh() {
    var q = norm(input.value);
    var guessed = false;
    matches = [];
    if (q) {
      players.forEach(function (p) {
        var name = norm(p.name);
        if (name.indexOf(q) < 0) return;
        if (game.guesses.indexOf(p.id) >= 0) { guessed = true; return; }
        var starts = p.name.split(' ').some(function (w) { return norm(w).indexOf(q) === 0; }) || name.indexOf(q) === 0;
        matches.push({ p: p, rank: starts ? 0 : 1 });
      });
      matches.sort(function (a, b) { return a.rank - b.rank; });
      matches = matches.slice(0, 6).map(function (m) { return m.p; });
    }
    active = matches.length ? 0 : -1;
    if (!q) {
      list.hidden = true;
      list.innerHTML = '';
    } else if (!matches.length) {
      list.innerHTML = '<li class="mp-none" role="presentation">' +
        (guessed ? 'You have already guessed that player.' : 'No player with that name is in this game.') + '</li>';
      list.hidden = false;
    } else {
      list.hidden = false;
      drawList();
    }
    input.setAttribute('aria-expanded', String(!list.hidden && matches.length > 0));
  }

  function drawList() {
    list.innerHTML = matches.map(function (p, i) {
      return '<li role="option" id="mp-opt-' + i + '" data-id="' + R.esc(p.id) + '" aria-selected="' + (i === active) + '">' +
        R.esc(p.name) + '<span>' + R.esc(M.countries[p.country] || p.country) + '</span></li>';
    }).join('');
    if (active >= 0) input.setAttribute('aria-activedescendant', 'mp-opt-' + active);
    else input.removeAttribute('aria-activedescendant');
  }

  function pick(id) {
    input.value = '';
    refresh();
    input.removeAttribute('aria-activedescendant');
    guess(id);
    if (!game.done) input.focus();
  }

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!matches.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      drawList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) pick(matches[active].id);
    } else if (e.key === 'Escape') {
      input.value = '';
      refresh();
    }
  });
  list.addEventListener('mousedown', function (e) { e.preventDefault(); });
  list.addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('li[data-id]') : null;
    if (li) pick(li.getAttribute('data-id'));
  });
  document.addEventListener('click', function (e) {
    if (!form.contains(e.target)) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  });
  input.addEventListener('focus', function () { if (input.value) refresh(); });

  render();
})();

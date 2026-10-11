# CricketNation in numbers

A one-page site that rebuilds itself every day from Cricsheet. Live at https://numbers.cricketnationhq.com

## What updates, and when

- **Batter against bowler**: rebuilt every day from every ball in Cricsheet's men's Test, ODI and T20 international archives.
- **Record chases** (Root, Kohli): recalculated every day from the same archives.
- **Today's number** and **the mystery player**: change every day by date. No data needed.
- **Head-to-head and the mystery player pool**: retired players, so their figures are fixed in `data.json`.

Cricsheet usually adds a match a few days after it finishes, so the figures trail live play by that much. Its ball-by-ball records start in the early 2000s, so matchups cover the modern era only.

## Sharing

Every stat has its own address and its own preview picture, so a link pasted into WhatsApp or X shows a picture card:

| Address | What it opens |
| --- | --- |
| `/number/<name>/` | One of the daily numbers |
| `/chase/<name>/` | One record chase |
| `/matchup/<name>/` | One of the featured matchups |
| `/matchup/?f=test&b=JE Root&w=JJ Bumrah` | Any other matchup (shows the general matchup picture) |
| `/play/` | The mystery player game |

Social apps remember a link's picture for days. To check a picture after a change, paste the link into the Facebook Sharing Debugger or a fresh WhatsApp chat.

## Set it up once

1. Create a GitHub repository and upload everything in this folder, including the `.github` and `fonts` folders.
2. In the repository, open Settings, then Pages, and set Source to "GitHub Actions".
3. Open the Actions tab, pick "Daily refresh and deploy", and press "Run workflow".
4. For your own address, add it under Settings, Pages, Custom domain, then create the CNAME record GitHub asks for.
5. Set `meta.siteUrl` in `data.json` to that address. Share links and preview pictures are built from it.

After that it runs by itself at 00:10 UTC every day. If the Test or ODI download fails, the run fails and the previous site stays live. If the matchup data or the pictures fail, the site is still published without that part, and the run shows a warning.

GitHub pauses scheduled runs on a repository with no activity for 60 days. The job commits `data.json` whenever a figure changes, which normally keeps it active.

## Files

| File | What it is |
| --- | --- |
| `data.json` | Every fixed number and story on the page, plus settings. |
| `refresh.mjs` | Updates the chase figures in `data.json` from Cricsheet. |
| `matchups.mjs` | Builds the batter against bowler files from Cricsheet. |
| `cards.mjs` | Draws the preview pictures. Uses the fonts in `fonts/`. |
| `build.mjs` | Builds every page into the `public` folder. |
| `lib.mjs` | Helpers shared by the scripts above. |
| `template.html`, `render.js`, `game.js`, `matchups.js` | The page layout and the code that runs in the browser. |
| `package.json`, `package-lock.json` | The one outside package used: the picture renderer. |
| `.github/workflows/daily.yml` | The daily schedule: download, refresh, build, deploy. |

## Changing things in `data.json`

**Featured matchups.** `matchups.featured` lists the pairs shown as "Popular" buttons. Each gets its own page and picture.

```json
{ "format": "test", "batter": "DA Warner", "bowler": "SCJ Broad" }
```

Names must be written exactly as Cricsheet writes them: initials and surname. A pair that is not found is skipped, with a warning on the run. `format` is `test`, `odi` or `t20`.

**Matchup size.** Each format has a `minBalls`: pairs who have met for fewer balls are left out. If a format has more than `maxPairs` pairs, the job raises the minimum until it fits, and the page states the minimum it used.

**Record chases.** Each chase has a `feed`:

```json
"feed": { "name": "JE Root", "format": "Test", "stat": "runs",
          "base": { "value": 14278, "matches": 169, "date": "2026-09-12" } }
```

`base` is a verified career figure and the date it was correct. The job adds everything from matches that started after that date, so the baseline must fall between matches. `stat` is `runs`, `hundreds` or `wickets`.

## Before you promote it

- Check the 59 mystery players and the head-to-head figures in `data.json` against your own data.
- The chase baselines came from news reports dated 12 and 27 September 2026. Confirm them once.
- Matchup averages count only dismissals credited to a bowler, so they run slightly higher than career averages. The page says so.

## Run it on your own machine

```
npm ci
mkdir -p cricsheet/tests cricsheet/odis cricsheet/t20s
curl -L -o tests.zip https://cricsheet.org/downloads/tests_json.zip && unzip -q tests.zip -d cricsheet/tests
curl -L -o odis.zip https://cricsheet.org/downloads/odis_json.zip && unzip -q odis.zip -d cricsheet/odis
curl -L -o t20s.zip https://cricsheet.org/downloads/t20s_json.zip && unzip -q t20s.zip -d cricsheet/t20s
node refresh.mjs cricsheet
npm run build
```

The fonts in `fonts/` are Antonio and Hanken Grotesk, both under the SIL Open Font License. Their licence files sit beside them.

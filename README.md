# CricketNation in numbers

A one-page site that rebuilds itself every day from Cricsheet.

## What updates, and when

- **Record chases** (Root, Kohli): recalculated every day from Cricsheet's Test and ODI archives.
- **Today's number** and **the mystery player**: change every day by date. No data needed.
- **Head-to-head and the mystery player pool**: retired players, so their figures are fixed in `data.json`.

Cricsheet usually adds a match a few days after it finishes, so chase figures trail live play by that much. Each one shows the date it is correct to.

## Set it up once

1. Create a new GitHub repository and upload everything in this folder, including the hidden `.github` folder.
2. In the repository, open Settings, then Pages, and set Source to "GitHub Actions".
3. Open the Actions tab, pick "Daily refresh and deploy", and press "Run workflow". The page address appears on the finished run.
4. For your own address (for example `numbers.cricketnationhq.com`): add it under Settings, Pages, Custom domain, then create the CNAME record GitHub asks for where your domain's DNS is managed.

After that it runs by itself at 00:10 UTC every day. If a Cricsheet download fails, the run fails and the previous page stays live.

GitHub pauses scheduled runs on a repository that has had no activity for 60 days. The job commits `data.json` whenever a figure changes, which normally keeps it active. If it is ever paused, GitHub emails you and one click re-enables it.

## Files

| File | What it is |
| --- | --- |
| `data.json` | Every number and story on the page. |
| `refresh.mjs` | Updates the chase figures in `data.json` from Cricsheet. |
| `build.mjs` | Bakes `data.json` into one HTML file. |
| `template.html`, `render.js`, `game.js` | The page layout, the display code and the game. |
| `.github/workflows/daily.yml` | The daily schedule: download, refresh, build, deploy. |

## Adding or changing a chase

Each chase in `data.json` has a `feed`:

```json
"feed": { "name": "JE Root", "format": "Test", "stat": "runs",
          "base": { "value": 14278, "matches": 169, "date": "2026-09-12" } }
```

- `name` is the player's name exactly as Cricsheet writes it (initials and surname).
- `format` is `Test` or `ODI`. `stat` is `runs`, `hundreds` or `wickets`.
- `base` is a verified career figure and the date it was correct. The job adds everything from matches that started after that date, so the baseline must fall between matches, not during one.

To add a T20 chase, also download `t20s_json.zip` in `daily.yml`.

## Before launch

- Check the 59 mystery players and the head-to-head figures in `data.json` against your own data.
- The three baselines came from news reports dated 12 and 27 September 2026. Confirm them once.
- `meta.shareUrl` is the link added to shared stats and results. It points at the app; change it if you want shares to land on this page.

## Run it on your own machine

```
curl -L -o tests.zip https://cricsheet.org/downloads/tests_json.zip && unzip -q tests.zip -d cricsheet/tests
curl -L -o odis.zip https://cricsheet.org/downloads/odis_json.zip && unzip -q odis.zip -d cricsheet/odis
node refresh.mjs cricsheet
node build.mjs index.html
```

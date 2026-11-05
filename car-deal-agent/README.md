# Car Deal Agent

A bot that watches **Kleinanzeigen** for used cars that fit your budget and limits, spots the ones priced **below market value**, and judges whether a car is **worth buying to resell**. Good finds come to Telegram with the numbers, an AI review of the ad text, and questions to ask the seller.

```
search (your budget, km, year, region)
   │  every ~20 min, slow and polite
   ▼
store every ad in SQLite ──► market data for the valuation
   │
   ▼
market price from comparable ads (regression on year + km, median, outlier filter)
   │  cheap filter: ≥ 12 % below market and profitable before repairs?
   ▼
load the full ad (description, HU/TÜV, seller type, features)
   │
   ▼
Claude reviews the description: hidden defects, repair costs, scam signals, verdict
   │
   ▼
profit after negotiation, repairs, fees, HU (and §25a VAT if you trade as a business)
   │
   ▼
deal / check / low_profit / skip ──► Telegram message (deal and check)
```

## How the numbers work

**Exact comparables.** Every ad page carries Kleinanzeigen's own filter values for the car (model, fuel, gearbox, body type, power). After opening an ad, the bot searches private, undamaged ads of the same model and fuel with the same engine (±5 % PS, e.g. 122 PS → 116–128 PS) from ±2 years. It first also requires the same gearbox and body type and drops those (body first) when fewer than 8 cars match, but never model, fuel, power or years: a petrol Fiesta is no diesel Fiesta, and with too few matches there is no market price rather than a wrong one. If too few comparables have a similar mileage, the mileage range is widened and their prices are adjusted by the mileage effect learned from the same data. Models Kleinanzeigen files under "Andere" (e.g. Scirocco) are searched by the model name from the title. Sellers often type the kW from the registration papers into the PS field (103 for a 140 PS Insignia 1.8): when the ad text says so, or the PS value finds hardly any car while the kW reading finds plenty, the bot compares with that and says so in the message. The Telegram message shows what was compared, with a link to exactly that search. Cars the seller marks as damaged are never a "deal".

**Clean comparables.** Not every ad in a search is a fair price for a running car. Before the median, the bot drops ads that say "Bastler", "Export", "Motorschaden", "ohne TÜV"/"TÜV abgelaufen", parts ("komplett oder Teile"), leasing take-overs, wanted ads and swaps (in the title or the ad text; "kein Export" or "unfallfrei" don't count), mileages that can't be right (1,360,000 km typed for 136,000, or 114 km meant as 114,000), cabrios when the car isn't one, and the same car posted twice (same exact mileage, or same place and registration with nearly the same mileage), including a second ad of the car being valued. In real searches around Halle about one ad in twenty was such a case, nearly all of them cheap, so they pulled market prices down.

**Regional price level.** Comparables come from all of Germany, but the car is resold around home. From all comparables it has stored, the bot learns how asking prices within `valuation.local_radius_km` (150 km) of `trip.home_zip` compare with the rest of Germany (each ad against the median of its own search, so the model mix doesn't matter) and adjusts the market price accordingly; the fewer local ads, the closer the factor stays to 1. Around Halle prices were about 5 % lower than elsewhere.

**Market price.** Every ad the bot sees is stored. For a candidate it takes the comparables within ±2 years and ±40 % mileage, adjusts each one's price to the candidate's registration month and mileage, and uses the median. The adjustment factors (how much a year or 10,000 km cost in this segment) are fitted by least squares on log prices once there are ≥ 12 ads, pulled towards typical values (−8 % per year, −4 % per 10,000 km) the more the prices scatter, and kept between +2 and +25 % per year and −1 and −10 % per 10,000 km; with fewer ads the typical values are used. The number of comparables and their spread set the confidence (high: ≥ 12 cars within ±25 %, medium: ≥ 8 cars within ±40 %); with low confidence a car is never more than "check", and the message says why (too few cars, prices too far apart, PS read as kW).

**Check every number.** After a report, write `تفاصيل` (or `details`) to the bot: it sends the comparables it used (nearest first, each asking price and its adjusted value, with links), the year and mileage factors, the regional factor, and resale, purchase, every cost and the profit as a sum.

The market data search is wider than your limits (by the same ±2 years / ±40 % km) so that a car at the edge of your filters is still compared with cars on both sides of it.

**Broad searches** ("all cars up to 3,000 € around Halle", no make/model): one search mixes Corsas and BMWs, so its results can't serve as one market. Instead every new ad is opened to read its make and model, and comparables for exactly that model and year (±2) are fetched nationwide, with the same seller filter (private/dealer). They are cached for 24 h per model and year, so popular models cost no extra requests. `scraper.max_details_per_run` caps how many ads are opened per run.

**Profit.**

```
buy      = asking price × (1 − negotiation_discount)        # only for "VB" ads
resale   = market price × resale_factor                       # asking prices are not sale prices
costs    = repairs named in the ad + fuel to fetch the car + TÜV if expired or due within 2 months
           (+ deal.fixed_costs if you set any, + §25a margin VAT if enabled)
profit   = resale − buy − costs
max buy  = the purchase price at which profit = deal.min_profit (guides the offer in the seller message)
```

The TÜV date comes from the ad's "HU bis" field, or from the title and text ("TÜV bis 09/27") when the field is empty; "ohne TÜV" or "TÜV abgelaufen" in the ad counts as due. An ad without a real price ("VB" only, "1 €", a leasing rate) gets no made-up profit: the message says what to pay at most instead. An ad that says the car is for tinkerers, for export or has engine damage is never a "deal" (the market price is for a running car), and searches skip such ads. A mileage that can't be right is reported instead of valued.

**Repair costs.** The AI lists problems it sees in the ad, and every cost must come with the exact words from the ad (`quote`). The program checks that those words really are in the ad; costs without a matching quote, and typical-for-the-model risks the ad doesn't mention, count as 0 € and become questions for the seller instead. The Telegram message shows each counted cost with its quote, or "No defects mentioned in the ad".

**Verdict.** `deal` ("Schnäppchen") when profit and ROI pass your minimums and nothing speaks against it; `check` ("Lohnt sich – vorher prüfen") when the numbers work but the market data is thin, the price is suspiciously low (≥ 40 % below market), the ad mentions damage or a defect, or the AI review says skip; `low_profit` ("Zu wenig Gewinn") for a profit under your minimums; `skip` ("Finger weg") only for a loss or a high scam risk. The AI review is a reason to read, not a veto: its caution is listed ("KI rät zur Vorsicht: …") without turning good numbers bad. For buying to keep: `buy` up to 5 % above the market price, `negotiate` 5–15 % above (or over budget), `avoid` beyond that, `check` for the same warnings as above.

**First run.** The first run of a search only collects market data. Alerts start with ads posted after that, which is what you want for being first to call. Set `deal.alert_existing: true` to also rate the ads already online.

## Setup

**macOS, one command:** paste into Terminal. It installs Python if needed (via Homebrew, or opens the python.org download), puts the bot into `~/car-deal-agent`, asks for the API key and Telegram bot token (it finds the chat id itself), and creates a double-clickable `Car Deal Agent starten.command`. Running it again updates the code and keeps your config, keys and database.

```bash
curl -fsSL https://raw.githubusercontent.com/MoZien/MoZien/claude/intelligent-fermi-lme4t3/car-deal-agent/install-mac.sh | bash
```

**Manually (any OS):**

```bash
cd car-deal-agent
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

cp config.example.yaml config.yaml   # budget, km, year, region ...
cp .env.example .env                 # API key + Telegram
```

- **Claude API key:** create one at <https://platform.claude.com> and put it in `.env` as `ANTHROPIC_API_KEY`.
- **Telegram:** create a bot with [@BotFather](https://t.me/BotFather), send it any message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id`. Without Telegram the deals are printed to the console.
- **make / model slugs:** search on kleinanzeigen.de, pick brand and model in the filters, and copy the values from the URL, e.g. `...+autos.marke_s:volkswagen+autos.model_s:golf`.

## Usage

**Ask in Telegram:** while `cardeal run` (or `cardeal chat`) is running, send the bot a Kleinanzeigen link, e.g. via *Share → Copy link* in the app. It answers with market price, profit and the AI review; `تفاصيل` / `details` afterwards shows the whole calculation with the comparables. Only the chat in `TELEGRAM_CHAT_ID` gets answers, so nobody else can spend your API credit. To let friends send links too, put their chat ids into `TELEGRAM_ALLOWED_CHATS` (comma separated). When someone unknown writes to the bot, it tells you their id; deal alerts stay with you. Links sent during a search run are answered right after it.

**Search on demand:** write `suche 3` (or `search 3`, `دورلي 3`) to the bot. It goes through the newest ads of your searches in `config.yaml`, sends every worthwhile car (deal or check) the moment it finds it, and stops after 3 finds or `scraper.max_ads_per_hunt` evaluated ads (default 40). Ads it has already evaluated are skipped, so asking again brings new cars. Write `stop` (or `وقف`) to end a running search; other messages sent meanwhile are answered after it. A search request that arrived while the bot was off (older than 10 minutes) is not started automatically.

```bash
cardeal once                     # run all searches one time
cardeal run                      # keep watching (every interval_minutes) and answer links in Telegram
cardeal chat                     # only answer links in Telegram, no searches
cardeal analyze <ad-url>         # evaluate one ad in the terminal
cardeal deals -n 20              # latest deals from the database
cardeal --no-ai once             # numbers only, no Claude calls
```

To keep it running, use a small always-on machine (Raspberry Pi, home server, cheap VPS) with `tmux`, `systemd` or `cron` (`*/20 * * * * cd /path/car-deal-agent && .venv/bin/cardeal once`). GitHub Actions is a poor fit: Kleinanzeigen tends to block data-centre IPs, and the SQLite market data has to persist between runs.

## Web app (AutoHalle)

The same engine as a website: paste a Kleinanzeigen link, value a car by hand, or let it hunt
through the newest ads. Arabic, German and English (right-to-left for Arabic), dark and light
theme, installable on the phone's home screen.

- **Two purposes, two evaluations.** *For me* rates the price against the market (bargain …
  overpriced), suggests a first offer and a ceiling, and adds up the first year (fuel for your
  yearly kilometres, TÜV, repairs from the ad, inspection, fetching the car); the AI writes a
  buyer's review with known weak points, an inspection checklist, questions and a German message
  to the seller. *Trade* shows profit, ROI and the costs of a resale; the AI judges the flip.
  Both sets of numbers are always computed, so you can switch after the analysis.
- **Pages:** dashboard, analyse ad, deal hunt (live finds, stop keeps them), manual valuation,
  saved cars with notes and status, side-by-side comparison, garage, tools (flip profit, trip
  cost, running costs, financing, TÜV date, ad-text scan, seller messages), settings (all costs
  and limits), help.
- **Per car:** score, price position, comparables chart with links, the whole calculation step by
  step, AI review, chat about the car, share / print / PDF.
- Settings stay on the device; saved cars, the garage and saved searches sync between the devices
  of an account (see *Sync* below). In device mode the server keeps no ads at all.

```bash
pip install -e ".[web]"
cd frontend && npm ci && npm run build && cd ..
cardeal-web                      # http://localhost:8000 (dev UI with hot reload: cd frontend && npm run dev)
```

**Sign-in.** Users type their email address and get a six-digit code (and a one-tap link) by
email; the session lasts 30 days. The free way: your own Gmail sends the codes through a small
Google Apps Script, [`deploy/gmail-sender.gs`](deploy/gmail-sender.gs) (setup steps at the top of
the file; about 100 mails a day, works on Render's free plan) – set `GMAIL_SCRIPT_URL` and
`GMAIL_SCRIPT_SECRET`. Alternatives: [Brevo](https://www.brevo.com)'s API (`BREVO_API_KEY` +
`MAIL_FROM`) or a Gmail [app password](https://myaccount.google.com/apppasswords) over SMTP
(`GMAIL_USER` + `GMAIL_APP_PASSWORD`, not on Render's free plan, which blocks SMTP). `ALLOWED_EMAILS` limits who may sign up (`name@x.de,@company.de`; empty = anyone),
`ADMIN_EMAILS` names the owner (no daily limit, "Test the AI" in the settings). Access codes
(`ACCESS_CODES`, `ADMIN_CODE`) still work as a second way in. Without mail and codes the app is open.

Other environment variables: `ANTHROPIC_API_KEY`, `AI_MODEL` (default `claude-sonnet-5-5`),
`SECRET_KEY`, `AI_DAILY_LIMIT` (40 per user), `CHAT_DAILY_LIMIT` (150), `AI_GLOBAL_LIMIT` (400 for
all users together), `CHAT_GLOBAL_LIMIT` (3000), `JOB_WORKERS` (analyses at the same time, default 2;
requests to Kleinanzeigen stay one at a time), `PUBLIC_URL` (address used in the email link),
`APP_NAME`, `DATA_DIR`, `SCRAPE_MIN_DELAY` / `SCRAPE_MAX_DELAY`. API docs at `/api/docs`.

**How many users at once?** Browsing, saved cars and the chat are not limited by the app. Analyses
go through a queue: `JOB_WORKERS` run at the same time (each takes about 10–40 seconds, most of it
waiting politely between requests to Kleinanzeigen and for the AI), the rest wait their turn with
their place shown. A user can have at most 3 analyses waiting.

### Online with Render

`render.yaml` in the repository root is a Render Blueprint (Docker, Frankfurt, free plan):

1. <https://dashboard.render.com> → **New** → **Blueprint** → connect GitHub and pick this
   repository and branch.
2. Enter `ANTHROPIC_API_KEY`, the mail settings (above) and `ADMIN_EMAILS`.
3. **Deploy Blueprint**. After the first build (a few minutes) the app runs at the
   `https://….onrender.com` address Render shows; every push to the branch redeploys it.

On the free plan the instance sleeps after 15 idle minutes. The app still opens at once on the
phone (the service worker keeps the app itself) and shows "server is starting" while the first
request wakes it (about a minute); outgoing SMTP is blocked there, which the Apps Script avoids.
The **Starter** plan (about 7 $ a month) keeps the server awake.
Kleinanzeigen may block data-centre IPs; if the app reports "blocked", run it on a machine at home.

When Kleinanzeigen answers "too many requests" the app waits (its Retry-After, else 15 s, 30 s)
and tries again; during a hunt it also takes up to two one-minute breaks per ad before it stops
and says so.

**Other platforms.** Links from AutoScout24 (any country site, read from the page's embedded
data) and Autohero (a dealer with fixed prices, read from the page's schema.org Vehicle data) are
valued against the same private Kleinanzeigen market. Checked and not possible: mobile.de,
AutoUncle, auto.de and eBay block automated requests (HTTP 403); pkw.de loads its ads only in the
browser; Carvago has no car data in the page; heycar left Germany; willhaben is Austrian. Their
ads can be valued with "Value a car" instead.

### Device mode: the user's phone or browser loads the pages

Instead of the server, the user's own device can open the ad and the comparison searches, like
the user browsing; the server only computes and keeps no ads (each such job values against an
in-memory store that is gone when the job ends). The marketplaces see ordinary visitors loading a
few pages each, the server's IP is never blocked, and a check takes seconds (1–2.5 s between
pages instead of 4–9 s).

How it works: a job started with `device: true` puts each page it needs into `partial.fetch`
(`{id, url}`); the app loads it and posts it to `POST /api/jobs/{id}/fetch`, whose answer is the
job's next state (long polling: `GET /api/jobs/{id}?since=<version>&wait=8`). The sources get a
`DeviceSession` (`cardeal/web/device.py`) instead of `requests.Session`, so parsing and valuation
are unchanged. Only Kleinanzeigen, AutoScout24 and Autohero pages are ever requested. If the
device stops answering for 45 s (app closed), an analysis ends with `device_gone` and a hunt stops
and keeps what it found.

Who can load pages:

- **Native app** (`frontend/android`, `frontend/ios`, Capacitor 8): the bundled web app talks to
  the live server (`.env.app` sets `VITE_API_BASE`); its native HTTP may load other sites.
  "Teilen" from the Kleinanzeigen app: on Android the app receives the shared text directly; on
  the iPhone the share extension (`ios/App/ShareExtension`) posts a notification with the link
  (Apple doesn't let share extensions open their app), and tapping it opens the check — the app
  asks for the notification permission when the user sets sharing up; without it the extension
  copies the link. Bundle id and version are set once at project level (`AUTOHALLE_BUNDLE_ID`,
  `MARKETING_VERSION`); the extension uses `$(AUTOHALLE_BUNDLE_ID).share`. A GitHub workflow
  (`.github/workflows/ios-app.yml`) builds the iOS app with the extension on a Mac runner.
- **Browser helper** (`extension/`, Chrome/Edge, Manifest V3): loads the pages for AutoHalle's
  tab, without the user's cookies, and adds a "Mit AutoHalle prüfen" button to ad pages. The
  Docker image serves it as `/autohalle-helfer.zip`; the help page explains how to install it
  (until it is in the Chrome Web Store: developer mode, "Load unpacked").
- A **normal browser tab** can't (browsers don't let one site read another): there the server
  loads the pages only if `FETCH_MODE` allows it (default `device`: it doesn't, and the app shows
  how to get the app or the helper; `both` lets the server step in, `server` turns device mode off).

**Sync.** Saved cars, the garage and saved searches of an account are kept on the server too
(`cardeal/web/sync.py`, `frontend/src/lib/sync.ts`), so every device the account signs in on has
them. Each item is stored on its own with the time it last changed; a deletion leaves a note
without content for 180 days. A device and the server compare `id -> last change` and swap only
what is newer on either side (the latest change wins). Settings, the compare list and seen ads stay
on the device; open mode (no accounts) doesn't sync. On Render's free plan the disk is wiped at
every deploy: devices then simply send their data again; a Render disk (`DATA_DIR`) keeps it.

**Photo check.** For a single check the AI also looks at up to six of the ad's photos (dents,
rust, repainted panels, tyres, interior, warning lights, the odometer) and lists what it sees,
each finding next to its photo; a mileage on the dashboard that doesn't match the ad is flagged.
In device mode the server asks the device for them (`{"kind": "photos", "urls": [...]}` in
`partial.fetch`): the app loads them as plain images – the platforms' photo servers allow that
(CORS) – shrinks them to 1024 px JPEGs on a canvas (`frontend/src/lib/photos.ts`) and posts them
back; a new review after switching the purpose sends them with `POST /api/evaluate`. In server
mode the server loads them (`cardeal/web/photos.py`). They go to Claude with the ad and are not
stored. Each photo adds about 1,000 input tokens (about 1 cent per check with Sonnet 5.5). It
can be turned off in the settings ("KI prüft auch die Fotos"); hunts never send photos.

Building the app:

```bash
cd frontend
npm run app:build            # web app with the live server's address, copied into android/ and ios/
npm run app:android          # + debug APK: android/app/build/outputs/apk/debug/app-debug.apk
                             #   (needs JDK 21 and the Android SDK, ANDROID_HOME)
npm run app:ios              # + opens Xcode (needs a Mac; signing with an Apple developer account)
```

App id `io.github.mozien.autohalle` (change it in `capacitor.config.json` and the Android
namespace before the first store upload if you get your own domain).

## Costs

Claude is only called for real candidates (after the price and profit filters), typically a few ads per day per search. With the default `claude-opus-5-5` ($4 / $20 per million input/output tokens) one review costs roughly 3–8 cents. Model and effort can be changed under `ai:` in the config. Refusal fallbacks are enabled, so a rare safety-classifier decline is retried on another model instead of failing.

## Tests

```bash
pytest
```

The tests use synthetic HTML fixtures and fakes for the marketplace, Claude and Telegram, so they run offline.

## Limitations and legal notes

- **Kleinanzeigen has no public API**, and its terms of use restrict automated access. The bot reads the normal pages slowly (random 4–9 s pauses, a few pages per run) and is meant for personal use. Check the terms yourself. When Kleinanzeigen changes its HTML, the parser in `sources/kleinanzeigen.py` may need an update; it keys on text patterns instead of CSS classes to make this rarer.
- **Asking prices, not sale prices.** `resale_factor` covers the gap; tune it with your own sales.
- **Variants are mixed.** A Golf GTI and a Golf 1.2 TSI share one segment. Make separate searches (`query: "gti"`, `fuel`, `gearbox`) for variants that matter.
- **The AI only sees the ad text.** It cannot replace a test drive, an OBD scan or a look underneath the car.
- **Impressum, privacy policy, terms.** The web app has them under `#/impressum`, `#/datenschutz`
  and `#/nutzungsbedingungen` (also before sign-in). The operator's details come from `LEGAL_NAME`,
  `LEGAL_ADDRESS` (lines separated by `;`), `LEGAL_EMAIL` and optionally `LEGAL_PHONE` /
  `LEGAL_VAT_ID`. The texts describe what the app does as built (Render in Frankfurt, Gmail for the
  codes, Anthropic for the AI, no tracking, fonts served by the app, ads cached for at most 60 days);
  they are a starting point, not legal advice. "Konto löschen" in the settings removes what the
  server keeps about an account and the account's data on that device.
- **Flipping as a business.** Buying and reselling cars regularly is a trade in Germany: you need a Gewerbeanmeldung, a dealer cannot exclude warranty (Sachmängelhaftung) when selling to consumers, and the margin scheme under §25a UStG applies (`deal.vat_margin_scheme: true`). Factor in income tax and insurance as well.

## Project structure

```
src/cardeal/
├── sources/kleinanzeigen.py   search URL builder, result + detail page parser, polite HTTP client
├── valuation.py               market price from comparables
├── flip.py                    profit calculation and the trade verdict
├── analyzer.py                Claude review with structured output
├── pipeline.py                one hunting pass, the cheap checks before the expensive ones
├── storage.py                 SQLite: market data, evaluated prices, reports
├── notifier.py                Telegram / console messages
├── i18n.py                    Arabic, German, English texts
├── config.py                  config.yaml + .env
├── personal.py                buying to keep: price rating, offer range, first-year costs
├── cli.py                     `cardeal` command
└── web/                       FastAPI app: jobs, access codes, preferences, the service layer
frontend/                      React + TypeScript + Tailwind single-page app (Vite)
Dockerfile                     builds the frontend and serves it together with the API
```

## Ideas for next steps

- mobile.de as a second source (bigger market, better price data)
- variant-aware valuation using power (PS) and trim from the detail page
- Claude vision on the ad photos (rust, paint differences, dashboard warning lights)
- Telegram commands to change the budget or add a search from the phone

## Credits

Postal code coordinates for the fuel distance: [GeoNames](https://www.geonames.org), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (`src/cardeal/data/de_zip.csv`).

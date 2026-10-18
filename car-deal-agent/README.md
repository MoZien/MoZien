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
deal / check / skip ──► Telegram message
```

## How the numbers work

**Market price.** Every ad the bot sees is stored. For a candidate it takes ads of the same make and model within ±2 years and ±40 % mileage, adjusts each one's price to the candidate's year and mileage, and uses the median. The adjustment factors (how much a year or 10,000 km cost in this segment) are fitted by least squares on log prices once there are ≥ 12 ads; before that, defaults are used (−8 % per year, −4 % per 10,000 km). The number of comparables and their spread set the confidence; with low confidence a car is never more than "check".

The market data search is wider than your limits (by the same ±2 years / ±40 % km) so that a car at the edge of your filters is still compared with cars on both sides of it.

**Broad searches** ("all cars up to 3,000 € around Halle", no make/model): one search mixes Corsas and BMWs, so its results can't serve as one market. Instead every new ad is opened to read its make and model, and comparables for exactly that model and year (±2) are fetched nationwide, with the same seller filter (private/dealer). They are cached for 24 h per model and year, so popular models cost no extra requests. `scraper.max_details_per_run` caps how many ads are opened per run.

**Profit.**

```
buy      = asking price × (1 − negotiation_discount)        # only for "VB" ads
resale   = market price × resale_factor                       # asking prices are not sale prices
profit   = resale − buy − repairs (AI estimate) − fixed costs − HU if due soon − VAT (§25a, optional)
ROI      = profit / (buy + repairs + costs)
```

**Repair costs.** The AI lists problems it sees in the ad, and every cost must come with the exact words from the ad (`quote`). The program checks that those words really are in the ad; costs without a matching quote, and typical-for-the-model risks the ad doesn't mention, count as 0 € and become questions for the seller instead. The Telegram message shows each counted cost with its quote, or "No defects mentioned in the ad".

**Verdict.** `deal` when profit and ROI pass your minimums and nothing is suspicious; `check` when the market data is thin, the price is suspiciously low (≥ 40 % below market), the AI review failed, or the AI wants an inspection first; `skip` for high scam risk or when the AI finds problems that eat the margin.

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

**Ask in Telegram:** while `cardeal run` (or `cardeal chat`) is running, send the bot a Kleinanzeigen link, e.g. via *Share → Copy link* in the app. It answers with market price, profit and the AI review. Only the chat in `TELEGRAM_CHAT_ID` gets answers, so nobody else can spend your API credit. To let friends send links too, put their chat ids into `TELEGRAM_ALLOWED_CHATS` (comma separated). When someone unknown writes to the bot, it tells you their id; deal alerts stay with you. Links sent during a search run are answered right after it.

**Search on demand:** write `suche 3` (or `search 3`, `دورلي 3`) to the bot. It goes through the newest ads of your searches in `config.yaml`, sends every worthwhile car (deal or check) the moment it finds it, and stops after 3 finds or `scraper.max_ads_per_hunt` evaluated ads (default 40). Ads it has already evaluated are skipped, so asking again brings new cars.

```bash
cardeal once                     # run all searches one time
cardeal run                      # keep watching (every interval_minutes) and answer links in Telegram
cardeal chat                     # only answer links in Telegram, no searches
cardeal analyze <ad-url>         # evaluate one ad in the terminal
cardeal deals -n 20              # latest deals from the database
cardeal --no-ai once             # numbers only, no Claude calls
```

To keep it running, use a small always-on machine (Raspberry Pi, home server, cheap VPS) with `tmux`, `systemd` or `cron` (`*/20 * * * * cd /path/car-deal-agent && .venv/bin/cardeal once`). GitHub Actions is a poor fit: Kleinanzeigen tends to block data-centre IPs, and the SQLite market data has to persist between runs.

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
- **Flipping as a business.** Buying and reselling cars regularly is a trade in Germany: you need a Gewerbeanmeldung, a dealer cannot exclude warranty (Sachmängelhaftung) when selling to consumers, and the margin scheme under §25a UStG applies (`deal.vat_margin_scheme: true`). Factor in income tax and insurance as well.

## Project structure

```
src/cardeal/
├── sources/kleinanzeigen.py   search URL builder, result + detail page parser, polite HTTP client
├── valuation.py               market price from comparables
├── flip.py                    profit calculation and deal/check/skip decision
├── analyzer.py                Claude review with structured output
├── pipeline.py                one hunting pass, the cheap checks before the expensive ones
├── storage.py                 SQLite: market data, evaluated prices, reports
├── notifier.py                Telegram / console messages
├── i18n.py                    Arabic, German, English texts
├── config.py                  config.yaml + .env
└── cli.py                     `cardeal` command
```

## Ideas for next steps

- mobile.de as a second source (bigger market, better price data)
- variant-aware valuation using power (PS) and trim from the detail page
- Claude vision on the ad photos (rust, paint differences, dashboard warning lights)
- Telegram commands to change the budget or add a search from the phone

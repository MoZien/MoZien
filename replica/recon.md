# Layout recon for AutoHalle 2.1

A layout study, not a clone. Taken from other apps: how they **arrange** screens (the order of
things, what stays fixed, what folds away). Nothing else: no names, logos, copy, colours, images
or code. AutoHalle keeps its own look from 2.0 (quiet colours, IBM Plex, ink buttons, one blue).

## Sources

| source | what it showed | how |
| --- | --- | --- |
| autoscout24.de, search results (public, phone size) | result count as a header, a "Filter (n)" button and removable chips in one line, rows with a photo on the side, price, a few fact chips | looked at once, consent banner only hidden on screen, nothing accepted |
| autoscout24.de, one listing (public, phone size) | full-width photos you swipe, a "1 / n" counter, title with save/share next to it, big price, facts as a two-column grid, two actions fixed at the bottom | same |
| banking apps (N26, Revolut, Monzo style), from their public store screenshots | one figure at the top (the balance), quick actions under it, everything else as short rows grouped under small headings, settings and edits in sheets from the bottom | from what is generally known; the store page did not load in this session, so this row is not re-checked |

## Patterns (P01…), and where they go in AutoHalle

| ID | pattern | seen in | AutoHalle screen |
| --- | --- | --- | --- |
| P01 | The one task of the screen fits the first screen: a short headline, one line of text, the form | banking home (one figure, one action) | home: whole form above the fold, intro one line |
| P02 | Detail page order: photos → title and price → the answer → facts → details | car listing | result |
| P03 | Smaller hero photo, swiped with the finger, counter in the corner, tap for full screen | car listing | result gallery (2:1 on phones) |
| P04 | The main actions fixed at the bottom, two buttons, outline + filled | car listing | result: "Merken" and "Anzeige" in a bar above the tabs |
| P05 | Section tabs stay at the top while scrolling | banking (account tabs), car listing on desktop | result tabs |
| P06 | Long details folded, the header row says what is inside (a sum, a count) | banking (statements), car listing (equipment) | reasons, money, market calculation, comparables, AI lists |
| P07 | Lists as compact rows: small photo, title, one line of facts, price at the end | car search, banking transactions | saved cars, deal-hunt results, recent checks |
| P08 | Filters as one summary line plus an edit button; editing in a bottom sheet | car search ("Filter (n)" + chips) | deal hunt criteria; saved-cars sort and filter |
| P09 | Desktop detail in two columns: content on the left, price/answer/actions in a column that stays put | car listings on desktop | result on a computer (mirrors in Arabic) |
| P10 | One spacing scale and one title size on every screen | all of them | page titles, gaps between sections, card padding |

## Screens touched (S…)

| ID | screen | route | change |
| --- | --- | --- | --- |
| S01 | Check a car (home) | `#/analyze` | P01, P07 (recent checks), "More tools" section removed (it is in "More") |
| S02 | Result | `#/analyze/<id>` | P02–P06, P09 |
| S03 | Saved | `#/saved` | P07, P08 |
| S04 | Find deals | `#/hunt` | P08, P07 (results) |
| S05 | Other pages (valuate, compare, garage, tools, settings, help, legal) | `#/…` | P10 only |

States to keep working: empty lists, running check / hunt, errors, no market price, no AI review,
AI review for the other purpose, photos turned off in the settings, dark mode, Arabic (RTL).

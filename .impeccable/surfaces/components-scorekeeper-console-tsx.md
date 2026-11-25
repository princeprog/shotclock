---
version: 1
slug: "components-scorekeeper-console-tsx"
primary_target: "components/scorekeeper-console.tsx"
related_targets: ["components/scoring-workspace.tsx","components/shot-clock-controls.tsx"]
---

# Surface brief: live scoring console

Scope: `/scorekeeping/games/[gameId]` live console (scheduled setup and completed box score keep their current screens). Mode: Operate.

Audience and job: one scorekeeper at the scorer's table on a landscape tablet runs both clocks and every player stat alone. The most important task is fast play entry: tap the player, tap the action, see the result confirmed. Constraints: Shotclock's current app look (neutral shadcn with the orange brand), shadcn components, offline queue, single owning device.

Build path: code-led, because this is an Operate surface. The project's recorded comp default covers landing and showcase pages.

Unresolved: none.

## Direction contract

THESIS: The scoreboard is also the game's story. Both rosters stay open on either side of one central action pad, under a scoreboard whose centre charts the line score quarter by quarter. It refuses the category default of a lone score panel above a tabbed roster.

OWN-WORLD: Neutral zinc surfaces and white shadcn cards with 1px zinc borders. Shotclock orange #E67145 marks the home side, the selected player and fresh confirmation. Slate #64748b marks the away side. Amber marks bonus and four fouls, red marks fouled out and a shot clock at zero. Inter with tabular numerals. Primary actions are near-black shadcn buttons.

STORY: The scorekeeper reads score, period and both clocks in one glance. They tap a player in either roster, tap +2, and see the pad confirm "Nico Reyes +2" with Undo while that quarter's orange bar grows.

FIRST VIEWPORT: Slim app bar (logo, Games link, sync, Box score). A scoreboard card: home name, fouls and score left, paired Q1–Q4 line-score bars centre, away mirrored right. A muted clock strip below it holds the game clock with Pause, the shot clock with Pause and resets, and End period at the right. Under it sit three columns: home roster table, the action pad (selected player, +1/+2/+3, six stats, latest play with its resulting score, and Undo), and the away roster table. Each roster header carries its team's Timeout. Below 1024px the actions open under the selected roster row. Once the clock strip scrolls away, a compact bar keeps the score, both clocks and the shot-clock resets in reach.

FORM: Game flow header, position 7 of 7 on the ranked structure list, seed:eeed8a520ad5a671

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **League scorekeepers** (confirmed primary user of the scoring page). Owners invite them per league. During a game, one scorekeeper sits at the scorer's table with a tablet and runs the game clock, the optional shot clock and every player stat alone. A second device can take over the shot clock when a league has a separate operator.
- **Organization owners** who set up and administer leagues, seasons, divisions, teams, rosters, venues, schedules, results and standings. Owners can also score games.
- **Public viewers** who follow published leagues, live games and stats on the separate public website.

## Product Purpose

Shotclock lets a basketball organization run its leagues from setup and scheduling through live scoring, results, standings and player statistics. At the scorer's table, success means every play lands on the right player quickly and correctly, the clocks stay in step with the game, and finishing the game saves the official result and stats with no re-entry.

## Positioning

One system carries a game from the schedule to the final standings: live play-by-play becomes the official result and player stats through the same path as a manual score, streams to the league's public website, and keeps working when the gym's internet drops.

## Operating Context

- Gym courtside, at the scorer's table, usually a landscape tablet held or propped at arm's length. The scorekeeper glances between the court and the screen during fast, noisy play.
- Internet is unreliable. Plays, undos and clock changes queue on the device and send when the connection returns. The venue clock stays authoritative when one exists.
- One device owns scoring at a time. Another device must take over, and a separate device can own the shot clock in two-operator mode.

## Capabilities and Constraints

- Scoring page states: scheduled game setup (format, roster and jersey checks, optional shot clock), live console, read-only view while another device scores, two-operator shot-clock mode, and the completed game's box score.
- Live entry: select a player, then +1, +2, +3, rebound, assist, steal, block, turnover or foul; team timeouts; undo of any recorded play. The player stays selected until another player is chosen or the selection is cleared.
- Clocks: game clock start, stop, correction while stopped, automatic stop at zero; shot clock start, stop, full and short resets (24 and 14 seconds by default), adjust, hide and sound at zero. Stopping the game clock stops the shot clock.
- Game flow: team fouls per period with bonus, five-foul limit, period changes, overtime when tied, and End game, which writes the result, player stats and best player.
- Not tracked: missed shots and minutes played.
- Stack: Next.js App Router, React, Tailwind CSS, shadcn/ui on the Base UI base-vega variant, TanStack Query and Redux Toolkit.

## Brand Commitments

- The name Shotclock and the reusable Shotclock logo (`public/shotclock-mark.svg`, `components/shotclock-logo.tsx`) with its orange (#E67145) mark.
- A clean, professional interface built from the project's shadcn components.
- The scoring page keeps the app's current look: neutral shadcn surfaces with the orange brand (confirmed for the scoring page redesign).

## Evidence on Hand

- Real leagues, teams, rosters and games exist only in each organization's own data. There are no customer names, testimonials, usage figures or benchmarks to cite, and none may be invented.

## Product Principles

1. At the scorer's table, fast and correct entry comes first: tap the player, tap the action, and see the result confirmed.
2. The gym's reality wins: offline entry, one owning device, and the venue clock as the authority.
3. Enter once: live play-by-play becomes the official result, the player stats and the public feed.
4. Clean and professional, built from shared components rather than one-off styling.

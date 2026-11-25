---
name: Shotclock
description: Basketball league management and live scoring, built on neutral shadcn surfaces that carry the Shotclock orange.
colors:
  shotclock-orange: "#E67145"
  orange-ink: "#A64320"
  orange-ink-dark: "#FFAE88"
  selection-wash: "#fdf0ea"
  selection-wash-dark: "#3a2318"
  focus-orange: "#c2410c"
  focus-orange-dark: "#fb923c"
  text-selection: "#f8d3c3"
  text-selection-dark: "#7a3a20"
  away-slate: "#64748b"
  away-slate-dark: "#94a3b8"
  caution-amber: "oklch(55.5% 0.163 48.998)"
  caution-amber-dark: "oklch(82.8% 0.189 84.429)"
  destructive: "oklch(0.577 0.245 27.325)"
  dark-destructive: "oklch(0.704 0.191 22.216)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  border: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
  desk-floor: "#f4f4f5"
  desk-floor-dark: "#0f0f11"
  desk-ink: "#18181b"
  desk-ink-dark: "#fafafa"
  desk-muted-ink: "#5c5c66"
  desk-muted-ink-dark: "#a1a1aa"
  dark-background: "oklch(0.145 0 0)"
  dark-foreground: "oklch(0.985 0 0)"
  dark-card: "oklch(0.205 0 0)"
  dark-primary: "oklch(0.922 0 0)"
  dark-primary-foreground: "oklch(0.205 0 0)"
  dark-muted: "oklch(0.269 0 0)"
  dark-muted-foreground: "oklch(0.708 0 0)"
  dark-border: "oklch(1 0 0 / 10%)"
  dark-input: "oklch(1 0 0 / 15%)"
  dark-ring: "oklch(0.556 0 0)"
typography:
  display:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "3.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: '"tnum"'
  headline:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
    fontFeature: '"tnum"'
  title:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title-sm:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
  action:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
  body:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  button:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  label:
    fontFamily: "Inter, 'Inter Fallback'"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.333
rounded:
  sm: "0.27rem"
  md: "0.36rem"
  lg: "0.45rem"
  xl: "0.63rem"
  "4xl": "1.17rem"
  desk-sm: "0.36rem"
  desk-md: "0.48rem"
  desk-lg: "0.6rem"
  desk-xl: "0.84rem"
  full: "9999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 0.625rem"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, oklch(0.205 0 0) 80%, transparent)"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 0.625rem"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 0.625rem"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
  button-console:
    typography: "{typography.button}"
    rounded: "{rounded.desk-md}"
    height: "2.75rem"
    padding: "0 0.75rem"
  button-score:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.desk-md}"
    height: "3.5rem"
  button-score-idle:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.action}"
    rounded: "{rounded.desk-md}"
    height: "3.5rem"
  button-stat:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.desk-md}"
    height: "3rem"
    padding: "0 0.25rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  console-panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.desk-xl}"
    padding: "1rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0.25rem 0.625rem"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.4xl}"
    height: "1.25rem"
    padding: "0.125rem 0.5rem"
  roster-row:
    typography: "{typography.body}"
    height: "3rem"
  roster-row-selected:
    backgroundColor: "{colors.selection-wash}"
    textColor: "{colors.desk-ink}"
    typography: "{typography.body}"
    height: "3rem"
  jersey-tile-home:
    backgroundColor: "{colors.shotclock-orange}"
    textColor: "#ffffff"
    rounded: "{rounded.desk-lg}"
    size: "3.5rem"
  jersey-tile-away:
    backgroundColor: "{colors.away-slate}"
    textColor: "#ffffff"
    rounded: "{rounded.desk-lg}"
    size: "3.5rem"
  jersey-tile-empty:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.desk-muted-ink}"
    rounded: "{rounded.desk-lg}"
    size: "3.5rem"
  team-dot-home:
    backgroundColor: "{colors.shotclock-orange}"
    rounded: "{rounded.full}"
    size: "0.625rem"
  team-dot-away:
    backgroundColor: "{colors.away-slate}"
    rounded: "{rounded.full}"
    size: "0.625rem"
  line-score-bar-home:
    backgroundColor: "{colors.shotclock-orange}"
    rounded: "{rounded.desk-sm}"
    width: "1.25rem"
  line-score-bar-away:
    backgroundColor: "{colors.away-slate}"
    rounded: "{rounded.desk-sm}"
    width: "1.25rem"
  clock-strip:
    backgroundColor: "color-mix(in oklab, oklch(0.97 0 0) 40%, transparent)"
    padding: "0.75rem 2rem"
  compact-bar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    padding: "0.375rem 2rem"
  play-receipt:
    backgroundColor: "color-mix(in oklab, oklch(0.97 0 0) 40%, transparent)"
    typography: "{typography.body-sm}"
    rounded: "{rounded.desk-lg}"
    height: "3.5rem"
    padding: "0.375rem 0.375rem 0.375rem 0.75rem"
  play-receipt-confirm:
    backgroundColor: "color-mix(in oklab, #e67145 22%, transparent)"
  sync-pill:
    backgroundColor: "oklch(97.9% 0.021 166.113)"
    textColor: "oklch(43.2% 0.095 166.913)"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.625rem"
  play-chip-score:
    backgroundColor: "oklch(95% 0.052 163.051)"
    textColor: "oklch(43.2% 0.095 166.913)"
    rounded: "{rounded.desk-md}"
    width: "4rem"
  play-chip-stat:
    backgroundColor: "oklch(95.1% 0.026 236.824)"
    textColor: "oklch(44.3% 0.11 240.79)"
    rounded: "{rounded.desk-md}"
    width: "4rem"
  play-chip-turnover:
    backgroundColor: "oklch(96.2% 0.059 95.617)"
    textColor: "oklch(47.3% 0.137 46.201)"
    rounded: "{rounded.desk-md}"
    width: "4rem"
  play-chip-foul:
    backgroundColor: "oklch(93.6% 0.032 17.717)"
    textColor: "oklch(50.5% 0.213 27.518)"
    rounded: "{rounded.desk-md}"
    width: "4rem"
---

# Design System: Shotclock

## Overview

**Creative North Star: "The Scorer's Table"**

Shotclock is the table where a league gets run: a clean, neutral work surface with the orange of the Shotclock mark set down only where something belongs to the brand or needs the eye. Every screen is built from the project's shadcn components (base-vega on Base UI) over the stock neutral palette: white cards, near-black primary buttons, quiet gray meta text and hairline borders. It reads as a professional tool first; the basketball comes through the mark, the orange and the numbers.

The live scoring console is the same table at courtside. It keeps the app's look and tightens it for a tablet read at arm's length: a zinc floor under white panels, large tabular numerals for scores and clocks, 44px touch targets, and a strict color grammar. Orange is the home side, the player you selected, the focus ring and the play you just recorded; slate is the away side; amber warns; red marks a limit. Apart from those and the play-type chips in the history list, the console stays neutral.

Density follows the job. App pages keep shadcn's default sizing (36px controls, 14px text). The console enlarges what a scorekeeper reads in a glance or taps under pressure and leaves the rest at app scale. Light and dark themes both exist, switched by the .dark class, and each token below has a dark counterpart.

**Key Characteristics:**
- Neutral shadcn surfaces (zero-chroma OKLCH grays) with one brand hue, Shotclock orange.
- Near-black primary actions; orange marks and fills, it does not color buttons.
- Inter throughout, with tabular numerals on every number that changes during a game.
- Flat surfaces separated by hairlines and tonal steps; resting shadows stay at extra-small.
- Gently rounded corners driven by one radius variable, scaled up slightly on the console.
- Home orange against away slate, repeated in dots, line-score bars and jersey tiles.

## Colors

A zero-chroma neutral scale carries the structure and one warm orange carries the brand, with slate, amber and red reserved for meaning on the scoring console.

### Primary
- **Shotclock Orange** (#E67145): the brand hue from the mark. It fills the logo tile, sets the period in the "Shotclock." wordmark, draws the session-restore ring and the sign-in illustration, and on the console is the home side: the 10px dot beside the home team's name, home line-score bars, the home jersey tile and the start of the confirmation wash. At 10% opacity it tints initials chips across the app.
- **Orange Ink** (#A64320; dark #FFAE88): the text color for orange that has to be read, always on the 10% orange tint (initials chips in the league workspace and games list).
- **Selection Wash** (#fdf0ea; dark #3a2318): the console's accent token. It fills the selected roster row, and at 40% the inline action row beneath it below 1024px, with Desk Ink (#18181b; dark #fafafa) on top. The row's check mark uses Tailwind orange-700 (orange-400 in dark).
- **Focus Orange** (#c2410c; dark #fb923c): the console's ring token. Every focus outline on the console uses it, including the inset 2px ring around a roster row.
- **Text Selection Tint** (#f8d3c3; dark #7a3a20): highlighted text on the console.

### Secondary
- **Away Slate** (#64748b; dark #94a3b8): the console's away token. It mirrors every home marker for the away side: dot, line-score bars, jersey tile.

### Tertiary
- **Caution Amber** (Tailwind amber-700, oklch(55.5% 0.163 48.998); dark amber-400, oklch(82.8% 0.189 84.429)): the warning one step before a limit. It colors the "Bonus" label, a player's fourth personal foul, the shot clock at 5 seconds or under, roster gaps on the setup screen and sync problems.
- **Destructive Red** (oklch(0.577 0.245 27.325); dark oklch(0.704 0.191 22.216)): shadcn's destructive token, used for the limit itself: a fifth foul (with the word "Out"), a game or shot clock at zero, failed saves and invalid clock entries.

### Neutral
- **Ink** (oklch(0.145 0 0)): foreground text and headings; also the dark theme's background.
- **Paper** (oklch(1 0 0)): background and card; every card, the app bar, outline buttons. Dark cards are oklch(0.205 0 0).
- **Near-Black** (oklch(0.205 0 0)): the primary token, filling primary buttons (Start game, Pause game clock, solid +1/+2/+3) under Near-White (oklch(0.985 0 0)) labels. Dark theme flips it to an oklch(0.922 0 0) fill with an oklch(0.205 0 0) label.
- **Mist** (oklch(0.97 0 0)): muted, secondary and accent on app pages; hover fill for outline and ghost buttons and the empty jersey tile. At 40% it bands the clock strip and the play receipt; at 70% it marks the current period in the line score.
- **Hairline** (oklch(0.922 0 0)): border and input; card edges, table dividers, input strokes. Dark uses white at 10% for borders and 15% for inputs.
- **Quiet Gray** (oklch(0.556 0 0)): muted text on app pages; descriptions, meta lines, table heads.
- **Desk Gray Text** (#5c5c66; dark #a1a1aa): the console's darker muted text, for meta lines read from arm's length.
- **Desk Floor** (#f4f4f5; dark #0f0f11): the console's page background beneath its white panels.
- **Neutral Ring** (oklch(0.708 0 0); dark oklch(0.556 0 0)): focus rings on app pages, drawn at 50%.

### Named Rules
**The Two Sides Rule.** Home is Shotclock orange and away is slate everywhere a team appears on the console: the dot beside its name, its line-score bars, its jersey tile, its marker in play history. Team identity comes from nothing else.

**The Orange Has Four Jobs Rule.** On the console, orange marks the brand, the home side, the current selection (wash, check and focus ring) and the play just recorded. Primary buttons stay near-black.

**The Fill, Then Ink Rule.** Shotclock orange (#E67145) is a fill: tiles, dots, bars, rings. Orange text that has to be read uses Orange Ink on a 10% orange tint. The wordmark's period is the one place #E67145 is set as text.

**The Warn, Then Stop Rule.** As a text color, amber comes one step before a limit and red marks the limit. Each state also carries a word ("Bonus", "Out") or the number itself, so color is never the only signal.

## Typography

**Display Font:** Inter (loaded with next/font, falling back to the generated Inter Fallback)
**Body Font:** Inter
**Label/Mono Font:** none distinct; labels use Inter.

**Character:** One neutral grotesque does everything. Hierarchy comes from size and weight, with display sizes tightened to -0.025em.

### Hierarchy
- **Display** (700, 3.75rem from 1024px and 3rem below, line-height 1, tabular): team scores on the scoreboard.
- **Headline** (700, 2.25rem from 1024px and 1.875rem below, line-height 1.25, tabular): the game clock and shot clock in the clock strip.
- **Title** (600, 1.5rem from 1024px and 1.25rem below, line-height 1.25): team names on the scoreboard. The selected player's name in the action pad uses 1.25rem at 600.
- **Title Small** (600, 1.125rem, line-height 1.25): panel headings such as "Record play" and the roster team names.
- **Action** (600, 1.5rem): the +1, +2 and +3 labels.
- **Body** (500, 1rem, line-height 1.5): roster rows and player names; PTS counts at 600, all tabular.
- **Body Small** (400, 0.875rem, line-height 1.43): the shadcn default for cards, descriptions, meta lines and the play receipt. Button labels use this size at 500 (Button).
- **Label** (600, 0.75rem, line-height 1.33): table column heads (No., Player, PTS, PF) and the sync pill. Line-score period labels and totals use the same size at 400, with the current period at 600; play chips are 11px at 600.

The app bar's game title and the wordmark are both 1rem at 600 with tight tracking.

### Named Rules
**The Tabular Rule.** Every number that changes during a game uses tabular numerals so digits hold their place as they tick: scores, both clocks, jersey numbers, PTS and PF, line-score totals, play timestamps and the compact bar.

**The Weight Ladder Rule.** Weight 700 belongs to game numbers: scores, clocks, the jersey tile and a fouled-out count. Names and headings stop at 600, controls at 500.

## Layout

The app follows Tailwind's 0.25rem spacing step and shadcn's default component sizes. Outside the live state, the scoring page sits in a centered column up to 72rem wide with 12px padding (24px from 640px).

The live console fills the viewport height on the Desk Floor. A slim app bar (at least 64px tall, white, bottom hairline) holds the logo, a breadcrumb back to Games, the game title, sync status and Box score. Content is centered at up to 88rem with side gutters of 12px (16px in the app bar), 24px from 640px and 32px from 1024px, and 16px between blocks (20px from 1024px).

The scoreboard card is a three-column grid from 640px: home team and score, a line-score chart 12–20rem wide (14–26rem from 1024px), and the away team mirrored on the right. Below 640px the two teams share a row and the chart drops beneath them. The muted clock strip runs along the bottom of the same card: game clock and its control, a vertical divider, shot clock and resets, and the period control pushed to the right edge.

The workspace changes with width:
- From 1024px: three columns, home roster | action pad (20–23rem) | away roster. The pad sticks 64px from the top so it stays beside long benches.
- From 768px to 1023px: the two rosters side by side; the action pad hides and the play buttons open in a row under the selected player.
- Below 768px: one column with the same inline actions.

When the clock strip scrolls out of view, a compact bar pins to the top with both scores, the game clock and its control, and the shot clock with its resets. Focus targets keep a top scroll margin of 4rem plus the safe-area inset so the bar never covers them. Inside panels the rhythm is 8px between pad buttons, 16px between pad sections, 16px panel padding (20px from 1024px) and 48px roster rows.

### Named Rules
**The Arm's-Length Rule.** Every console control is at least 44px tall, and on coarse pointers every button, summary and link inside the console is at least 44 × 44px. Score buttons are 56px and stat buttons 48px.

## Elevation & Depth

Shotclock is flat. Depth comes from tonal steps and hairlines: white panels on the zinc Desk Floor, the clock strip and play receipt tinted with Mist at 40%, the current period at 70%, the selected row in Selection Wash. Shadows exist but are barely visible.

### Shadow Vocabulary
- **Rest** (box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05), Tailwind shadow-xs): cards, console panels, outline buttons and inputs.
- **Pinned** (box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1), shadow-sm): the compact scoreboard bar only.
- **Card Edge** (a 1px ring of foreground at 10%): how shadcn cards draw their edge. Console panels replace it with a 1px Hairline border.

### Named Rules
**The Flat Desk Rule.** Resting surfaces sit at shadow-xs or below. The only lift on the console is the compact bar, because it physically covers content.

## Shapes

One variable drives every corner. The app's base radius is 0.45rem, and shadcn derives its steps from it (sm 0.6×, md 0.8×, lg 1×, xl 1.4×): buttons and inputs round to about 6px, cards to about 10px. The console raises the base to 0.6rem inside its scope, so its buttons round to about 8px, the play receipt and jersey tile to about 10px, and its panels to about 13px. The curves stay gentle throughout.

Pills appear only for status and identity: the sync pill, badges, and the team dots (10px on the scoreboard and rosters, 8px in the compact bar, 6px in play history). Line-score bars round only their top corners and stand on a hairline baseline. The Shotclock mark is a rounded orange square (corner radius 18 on a 64 grid) holding a ball-and-stopwatch drawing in #181310 with a #FFF5E9 hand; treat it as a fixed asset.

## Components

### Buttons
Quiet, compact and solid: shadcn base-vega buttons that press down 1px when clicked.
- **Shape:** gently rounded (rounded.md on app pages, rounded.desk-md on the console).
- **Primary:** Near-Black fill, Near-White 14px/500 label, 36px tall with 10px side padding. Hover drops the fill to 80%. On the console it drives the game clock, Start game and the solid score buttons.
- **Outline:** Paper fill, 1px Hairline border, shadow-xs; hover fills Mist. Dark theme uses the input token at 30% for the fill and as the border. Used for Timeout, Undo, shot-clock Pause and resets, End period, Box score and the six stat buttons.
- **Ghost:** transparent until hover fills it with Mist. Used for Clear, the small icon buttons that adjust the clock or undo a history row, and the player-name hit area in roster rows.
- **Hover / Focus:** focus draws a ring-colored border plus a 3px ring at 50%; on the console the ring is Focus Orange. Disabled buttons drop to 50% opacity.
- **Console sizing:** console buttons are at least 44px tall; +1/+2/+3 are 56px with 24px/600 labels; stat buttons are 48px.

### Chips
- **Play chips** (play history): 64px wide labels in 11px/600, rounded.desk-md, tinted by play type: scores emerald-100 with emerald-800 text, stats sky-100 with sky-800, turnovers amber-100 with amber-800, fouls red-100 with red-700. Dark theme uses the 500 hue at 15% under 300 text. Undone plays fall back to Mist with gray text and a strikethrough.
- **Sync pill:** fully rounded, 12px/600 with a 14px icon. Emerald-50 with emerald-800 text when synced (dark: emerald-900 at 40% with emerald-200), Mist with gray text while syncing or offline.
- **Badges** (app pages): 20px pills in 12px/500. Besides shadcn's variants the app defines season states (draft amber-300 on slate-950, active emerald-700 on white, completed slate-600 on white) and a sky tint for scheduled games.

### Cards / Containers
- **Corner Style:** rounded.xl on app pages (about 10px), rounded.desk-xl on the console (about 13px).
- **Background:** Paper (dark oklch(0.205 0 0)).
- **Shadow Strategy:** shadow-xs; see Elevation & Depth.
- **Border:** shadcn cards use a 1px foreground ring at 10%; console panels use a 1px Hairline border.
- **Internal Padding:** 24px on app pages (16px for small cards); console panels 16px, 20px from 1024px. Panel headers sit on a bottom hairline with 12px vertical padding.

### Inputs / Fields
- **Style:** 36px tall, 1px input-token stroke, transparent fill (input at 30% in dark), rounded.md, 10px side padding, 16px text that drops to 14px from 768px, shadow-xs.
- **Focus:** ring-colored border plus a 3px ring at 50%.
- **Error / Disabled:** destructive border with a 3px destructive ring at 20% (40% in dark); disabled fields at 50% opacity. Number fields on the game setup screen grow to 44px with tabular numerals.

### Navigation
The console app bar is a breadcrumb: the Shotclock logo (36px mark plus the 16px/600 wordmark with its orange period), a chevron, "Games" as a 14px/500 gray link that darkens to Ink on hover, another chevron, then the game title (16px/600) with league, division and venue beneath it in gray from 768px. The sync pill and an outline Box score button sit at the right.

### Scoreboard
The game's story in one card. Each team shows its dot and name (Title), "Home · 3 fouls" or "Away · 5 fouls" in gray with a Caution Amber "Bonus" when it applies, and its score (Display). Between the teams the line score draws each period as a pair of bars, home orange beside away slate, each up to 20px wide, scaled against the highest period total and growing over 500ms ease-out (no motion under reduced motion). Under each pair sit the period label and the period score. The current period gets a Mist panel and a 600 label; unplayed periods show an empty baseline and a dash.

### Roster Table
One shadcn table per team inside a console panel, headed by the team dot, name, timeouts used and an outline Timeout button. Rows are 48px with columns for a selection check, jersey number (gray, tabular), player name (16px/500; the whole row is the hit area), PTS (600) and PF. PF turns Caution Amber at four fouls and red with "Out" at five. The selected row fills with Selection Wash, shows an orange check and sets the name in 600.

### Action Pad
The center column from 1024px. A 56px jersey tile (the team color with a white 20px bold number, or Mist with a person icon when nobody is selected) leads the selected player's name and line. Below it a three-column grid holds +1, +2 and +3, then Rebound, Assist, Steal, Block, Turnover and Foul. The play receipt closes the pad.

**The Quiet Pad Rule.** The +1, +2 and +3 buttons stay outlined until a player is selected, then turn solid near-black, so the resting pad does not shout.

### Play Receipt
A 56px strip tinted with Mist at 40%, with a hairline border and rounded.desk-lg: a history icon, the period and clock in gray, the play ("Nico Reyes +2") at 500, the resulting score, and an outline Undo. A newly recorded play arrives with the confirmation wash, Shotclock orange at 22% behind the strip with an orange border, settling over 1.4s on cubic-bezier(0.16, 1, 0.3, 1). Reduced motion removes the wash. An undone play is struck through and labeled "Undone".

### Clock Strip and Compact Bar
The clock strip is the Mist band at the bottom of the scoreboard: a 14px gray label ("Game clock · 3rd quarter") above each clock in Headline. The game clock always shows mm:ss with a leading zero. At zero a clock turns red; the shot clock turns amber at 5 seconds or under. The compact bar repeats the scores (20px), the clocks and the shot-clock controls on a white strip with shadow-sm once the clock strip scrolls away.

## Do's and Don'ts

### Do:
- **Do** build every surface from the shared shadcn components in components/ui (Button, Card, Table, Dialog, Popover, Alert, Collapsible) and their variants.
- **Do** mark home with Shotclock orange (#E67145) and away with slate (#64748b; #94a3b8 in dark) everywhere a team appears on the console.
- **Do** keep primary actions Near-Black (oklch(0.205 0 0)) with Near-White labels.
- **Do** set scores, clocks, jersey numbers and stat counts in Inter with tabular numerals.
- **Do** use amber (amber-700; amber-400 in dark) one step before a limit and destructive red at the limit, each paired with a word or number.
- **Do** give every console control at least 44px of height (56px for +1/+2/+3, 48px for stat buttons).
- **Do** confirm a recorded play with the 1.4s orange wash on the play receipt, and drop the wash under reduced motion.
- **Do** keep console overrides (radius 0.6rem, home, away, accent, ring, muted text, floor) scoped to the console; app pages keep the stock tokens.
- **Do** use the ShotclockLogo component or public/shotclock-mark.svg for the brand mark.

### Don't:
- **Don't** fill buttons with Shotclock orange; it belongs to the mark, team markers, the selection and the confirmation.
- **Don't** set #E67145 as running text; readable orange text uses Orange Ink (#A64320; #FFAE88 in dark) on a 10% orange tint.
- **Don't** signal a team, a foul state or a clock state with color alone; pair it with the team name, "Bonus", "Out" or the number.
- **Don't** put white text smaller than the jersey tile's 20px bold on Shotclock orange; white on #E67145 measures about 3.1:1, which passes only at large sizes.
- **Don't** raise resting surfaces above shadow-xs; shadow-sm belongs to the pinned compact bar.
- **Don't** recolor, redraw or crop the Shotclock mark.
- **Don't** make the idle pad loud: +1/+2/+3 stay outlined until a player is selected.

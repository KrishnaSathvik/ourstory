# Design

## Creative direction: "after hours"

Most intimate conversations happen late. Duet's world is the screen-glow at 1 am: a warm plum-black, cream type, and two lights, one per person, orbiting each other.

- **Two-body motif.** The signature `Orbs` canvas shows two glowing bodies in a slow, eccentric orbit, shedding particles (messages). It appears on the landing page, while weaving, and behind the story, tinted per beat.
- **Person colours carry meaning everywhere.** Person A is **Ember** `#ff7a59`; person B is **Tide** `#8c9bff`. Every chart, award and name uses them; the blend between them (`--blend`) is the brand gradient.
- **Editorial, not dashboard.** The serif display type is large; numbers are set like headlines; stats are woven into sentences ("Theo replies in a typical 2 min; Maya takes 4 min."); sections carry roman-numeral eyebrows.
- **Film grain** over everything for warmth (a fixed SVG noise layer at 6% opacity).

## Tokens (`src/styles/global.css`)

| Token | Value | Use |
|---|---|---|
| `--ink` / `-2` / `-3` / `-4` | `#0f0b14` → `#2e253b` | backgrounds and surfaces |
| `--cream` / `-2` / `-3` | `#f4ebdd`, `#c9bfcf`, `#9a90a6` | text: primary, secondary (9.6:1), tertiary (5.6:1) |
| `--a`, `--b` | Ember, Tide | person colours |
| `--gold` | `#f2c46d` | focus rings, "you called it", busiest-day marks |
| `--serif` | Instrument Serif | display, numerals, italics |
| `--sans` | Bricolage Grotesque (variable) | UI and body |

Fonts are self-hosted through `@fontsource`; a Google Fonts request would leak usage to a third party.

## Motion

- Slides use a staggered `sl-rise` (fade, rise and de-blur) driven by a `--i` custom property. Awards flip in on X.
- Count-ups ease out over about 1.4 s. The convergence line draws itself; bars grow from the baseline.
- `prefers-reduced-motion` turns off animation globally, renders a static orb frame, and makes CountUp jump straight to the final value.

## Interaction patterns

- **Call it first.** Prediction cards before a reveal turn the story into a game for two. Forward navigation waits until a guess is made or skipped.
- **Tap zones.** The left 30% goes back, the rest goes forward; also ←/→/Space and Esc. Visible prev/next buttons support assistive tech.
- **Pass the phone.** A full-screen hand-off ("Pass to Theo") hides the previous answer.
- **Reveal gate.** Sensitive content (words) needs a deliberate tap.

## Accessibility

- Semantic headings, landmarks, `aria-live` slide announcements, `aria-pressed` segmented controls, labelled inputs, and `role="img"` with labels on charts and canvases.
- Focus rings are visible (`--gold`); everything is keyboard-operable, including the Almanac charts (arrow keys, Home/End).
- Contrast: body text is at least 9.6:1 and tertiary text at least 5.6:1 on `--ink`.
- Layout works down to 360 px wide (checked with Playwright at 360 and 390), with safe-area insets in the story player.

## Keepsakes

**Our Fingerprint** is an Archimedean spiral with one revolution per year and 1 January at twelve o'clock. Each day is a radial stroke: length is the square root of that day's count against the 99.8th-percentile day, colour is the A/B share (stretched so who led stays visible), and silent days are faint dots. The busiest day gets a gold ring, and the first message a glowing dot. It comes as a 3:4 poster (2400×3200) or a 9:16 story. Cards (numbers, awards, hours, chapters) share the same palette, grain and wordmark.

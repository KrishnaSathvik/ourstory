# Design

## Creative direction: "Paper & Ink"

Duet is a keepsake, so it looks like one: warm ivory paper, aubergine ink, and two people as two inks, **Ember** (coral) and **Tide** (lavender). It is light, luminous and intimate, more like a beautifully printed almanac than an app.

The first version was dark ("after hours"). It was cinematic, but it felt more mysterious than welcoming, which suited couples less well. The light theme keeps every composition, interaction and animation, and changes only the atmosphere, through a role-based token system.

- **Two-body motif, as watercolour.** The `Orbs` canvas still shows two bodies in a slow orbit. On paper they're soft washes (`mix-blend-mode: multiply`) shedding ink flecks, not additive light.
- **Every story scene has its own paper.** Ember scenes are peach, Tide scenes lilac, shared scenes rose-ivory, and the late-night scenes go to a quieter "dusk" lilac with locally deepened ink, so they stay at AA.
- **Person colours carry meaning everywhere.** Vivid tones are used for marks and large display type (≥ 3:1); the `-ink` variants for small text (≥ 5:1).
- **Depth without darkness.** Warm-tinted layered shadows (never grey), paper tooth (a multiplied grain layer), and soft corner light on the page background.
- **Editorial, not dashboard.** Large serif display type; numbers set like headlines; stats woven into sentences; sections with roman-numeral eyebrows.

## Tokens (`src/styles/global.css`)

Components use **role tokens only**; raw colours live in `:root`. Each colour also has an `-rgb` channel token for tints, e.g. `rgb(var(--text-rgb) / 0.06)`.

| Role | Value | Contrast on `--bg` |
|---|---|---|
| `--bg` (paper) / `--surface` (lifted) / `--surface-2`, `-3` (recessed) | `#faf5ec` / `#fffcf6` / `#f3ebdf`, `#e9dfd0` | |
| `--text` / `--text-2` / `--text-3` | `#2b2130` / `#5c4f60` / `#76697a` | 14.2 / 7.1 / 4.8 |
| `--a` / `--a-ink` (Ember) | `#e2603f` / `#b4432a` | 3.2 / 5.1 |
| `--b` / `--b-ink` (Tide) | `#7a78e6` / `#5552c4` | 3.4 / 5.7 |
| `--mid` | `#d4709a` | the rose between them in `--blend` |
| `--blend-deep` | brick → plum-rose → indigo | white text ≥ 5.4 (filled CTAs) |
| `--honey` / `--gold` | `#edb54d` / `#a86a12` | honey fills with ink text (7.2); amber for icons and focus (4.1) |
| `--line`, `--line-strong` | ink at 10% / 20% | |
| `--serif` / `--sans` | Instrument Serif / Bricolage Grotesque (variable) | |

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
- Focus rings are visible (amber `--gold`, ≥ 3:1); everything is keyboard-operable, including the Almanac charts (arrow keys, Home/End).
- Contrast: all text roles pass WCAG AA on every paper, including the four story scenes; checked numerically (see the token table).
- Layout works down to 360 px wide (checked with Playwright at 360 and 390), with safe-area insets in the story player.

## Keepsakes

Keepsakes are printed on the same paper: an ivory ground with soft person washes, a faint warm edge, and dark paper tooth. Marks are drawn with `multiply`, so overlapping days deepen like ink.

**Our Fingerprint** is an Archimedean spiral with one revolution per year and 1 January at twelve o'clock. Each day is a radial stroke: length is the square root of that day's count against the 99.8th-percentile day, and colour is the A/B share, stretched ×3 so who led stays visible on paper. Silent days are faint ink dots. The busiest day gets an amber ring; the first message is an ink dot in a honey halo. It comes as a 3:4 poster (2400×3200) or a 9:16 story. Cards (numbers, awards, hours, chapters) share the same palette, grain and wordmark.

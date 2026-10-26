# Product

## The bet

Couples have years of everyday conversation spread across apps. Read back, it's mostly noise ("omw", "what do you want for dinner"); counted, it's a portrait: who texts first, the hour you talk most, the day you first wrote "love you", the 145 days in a row you never went silent. **Duet turns that portrait into something you play together and keep, without anyone (including us) ever reading a message.**

## What research told us

Full notes: [research/competitors.md](research/competitors.md) and [research/export-formats.md](research/export-formats.md).

1. **The category is crowded but shallow.** There are dozens of "WhatsApp Wrapped" apps. Nearly all are WhatsApp-only, single-player and template-looking, sold on weekly subscriptions.
2. **Nobody merges platforms.** Couples typically move from a dating app or Instagram DMs to WhatsApp or iMessage. A single continuous history is open space.
3. **The AI "relationship analysis" apps are the anti-pattern.** They upload raw chats to LLMs, frame the result as suspicion ("red flag scanner", "loyalty test"), and the other person never consented.
4. **Privacy has to be provable, not promised.** The most trusted analyser we found is an Android app with no internet permission. The web equivalent is a page that technically cannot make network requests.
5. **Two-player mechanics are proven elsewhere** (Paired's hidden answers, Spotify's group Wrapped) but absent here.
6. **What makes data feel meaningful:** one stat per screen, count-ups, identity labels ("Night Owl"), a final summary card, and "firsts". It also matters to **not paywall the core moment** (Strava's backlash).

## Positioning

> *Every message you've sent each other, played back.* A story for two, made on your device.

| | Typical wrapped app | AI analysis app | **Duet** |
|---|---|---|---|
| Platforms | WhatsApp only | 1–3 | 7 formats, **merged** into one timeline |
| Processing | varies, often server | server + LLM | **in-browser, network-blocked** |
| Shows messages? | sometimes | yes, quotes them | **never** |
| Claims | stats | psychological verdicts | **only measurements** |
| Players | one | one | **built for two** |

## The experience we built

1. **Landing.** Value in one line, privacy proven by specifics ("switch on airplane mode"), real examples whose numbers are verified against the demo by a test.
2. **Import.** Drop files, zips or whole folders from any mix of apps; step-by-step export guides per platform; a consent step ("a conversation belongs to both of you"); a live offline indicator.
3. **Who's who.** Duet guesses identities across apps (Maya Okafor / Maya O. / Maya). You confirm, rename, exclude third parties, and pick a time zone.
4. **The story.** About 18 full-screen beats. Many ask the couple to **call it first** ("Who replies faster?") before revealing, and the outro scores their guesses. Topics: first message, totals, who talks more, the app journey, your hour, night owl, reply speed, who starts conversations, busiest day, longest streak and gap, first "love you", the little words counted, emoji, "speaking the same language" (vocabulary convergence), chapters, awards.
5. **Almanac.** An editorial, explorable view: overview, monthly and daily timelines, chapters, milestones, rhythms (heatmap, radial clock), language (phrases, style, emoji, convergence, words behind a reveal gate), awards, and the fine print.
6. **Play.** A pass-the-phone quiz: each partner answers in secret, then both answers are revealed together, with scores. There's also a solo mode.
7. **Keepsakes.** **Our Fingerprint**, a spiral print with one mark per day since the first message (length = volume, colour = who spoke more), plus 9:16 cards (numbers, awards, hours, chapters) and a portable `.duet` story file a partner can open in their own browser.
8. **Privacy.** What's in memory, save encrypted, hidden words, forget everything.

## Ideas we challenged or cut

- **No AI-generated narrative.** An LLM would need the messages (a privacy breach) or would invent texture (a grounding breach). Our copy is templated over measurements, and every line can be traced to a number.
- **No "relationship health score", sentiment or psychology.** These are unfounded conclusions about people. We describe habits ("Maya starts 57% of conversations"), never meaning.
- **No transcript search, "on this day" quotes or message highlights.** Each would display content.
- **No accounts or cloud sync.** They'd create a breach surface for no core value. Sharing happens through images or files the user controls.
- **No share links that encode data in a URL.** They end up in chat histories and link previews; a file is more deliberate.
- **Word stats are kept, but gated.** Single words used at least 6 times on at least 3 different days, hidden until revealed, and hideable one by one.
- **Group chats are deferred.** The analysis is person-keyed, but the story's voice is designed for two. A group-chat edition ("Chorus") is on the roadmap.

## Monetisation (proposal, not built)

The story, almanac and quiz stay free, because that's the shareable moment and the growth loop. Optional paid upgrades:

- **Printed Fingerprint**: a poster or framed print, ordered by uploading only the rendered image (an explicit, separate consent).
- **Keepsake packs**: more card designs, an anniversary edition, a printed "almanac book".
- **Occasion editions**: Valentine's or anniversary re-runs with a fresh export.

## Roadmap

1. iMessage directly from `chat.db` (sql.js in the worker) so Mac users skip the CLI step.
2. Streaming JSON parsing for multi-GB Telegram and Meta exports.
3. Chorus: best friends and group chats (group awards, "who replies to whom").
4. Localisation (lexicons and copy) beyond English, plus the Spanish/Portuguese/French/German/Italian phrase lexicons already included.
5. An installable PWA with full offline caching.

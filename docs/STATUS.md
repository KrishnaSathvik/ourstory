# Status

_Last updated: 26 Oct 2026, v0.1.0_

## Done

- [x] Research: competitors, consumer patterns, export formats (`docs/research/`)
- [x] Product direction, positioning, cut list (`PRODUCT.md`)
- [x] Importers: WhatsApp, Telegram, Instagram, Messenger, iMessage (exporter TXT), Discord, SMS XML; random-access Zip64 reader; folder drag-and-drop
- [x] Identity matching across apps, merging and multiset de-duplication, time-zone normalisation
- [x] Single-pass analysis: totals, rhythms, replies, lexicons, emoji, words with privacy thresholds, convergence, milestones, chapters, awards, quiz
- [x] Worker pipeline, terminated after analysis
- [x] UI: landing, import with guides and consent, who's-who review, weaving, the story (18 beats with predictions), almanac (6 sections), play (solo and pass-the-phone), keepsakes (fingerprint plus 4 cards, `.duet` files), privacy panel
- [x] Encrypted vault, validated and redactable story files
- [x] Production CSP (`connect-src 'none'`), offline-capable flow
- [x] Synthetic demo couple through the real pipeline; landing copy verified against it
- [x] Light "Paper & Ink" theme (default): role-based token system, per-scene story papers, watercolour orbs, paper keepsakes; all text roles WCAG AA (see `DESIGN.md`)

## Tests

`npm test` runs 115 tests in 13 files. `npm run test:e2e` runs 4 Playwright tests against the production build.

| Area | Files | Notable checks |
|---|---|---|
| Parsers | `tests/whatsapp.test.ts`, `tests/importers/*` | iOS/Android/de/es formats, U+202F, date-order inference, system-line authors, Telegram entities and calls, Meta mojibake, imessage-exporter tapbacks, Discord, SMS scanner, Zip64, lazy slicing, time-zone shifts |
| Merge | `tests/merge.test.ts` | cross-app identity, multiset dedupe, no cross-platform dedupe |
| Pipeline | `tests/pipeline.test.ts` | 3-platform demo end to end, exact message accounting, designed patterns found, quiz consistency, **privacy contract** |
| Storage | `tests/storage/*` | encryption round-trip, wrong passphrase, redaction, hostile-file validation |
| UI | `tests/ui/explore.test.tsx` | almanac renders, no text leak, reveal gate, hidden words |
| Copy | `tests/landing-examples.test.ts` | landing numbers equal pipeline output |
| E2E | `e2e/flow.spec.ts` | CSP blocks fetch and beacons; **offline** import of 3 real export files through to story, almanac and keepsakes; no message text at any beat; pass-the-phone secrecy; forget-everything |

## Known limitations

- **Real-world format drift.** Parsers are built from documented formats, open-source parser behaviour and synthetic fixtures, not real user exports (by design, none were used). Some details are unconfirmed: the E2EE Messenger JSON shape, imessage-exporter edit/unsend markers, and non-English Meta system strings. Before launch, test with volunteer exports locally.
- **Lexicons and copy are English-first.** The phrase lexicons include common ES/PT/FR/DE/IT forms; laughter detection is multilingual; there are only English stopwords plus a few others.
- **Time zones.** WhatsApp and iMessage times are taken as written on the exporting phone. Couples who lived in different zones get each export in its own phone's local time.
- **Large JSON.** JSON and XML parsers read whole files into memory. That's fine for typical chat exports; a multi-GB Telegram full export needs streaming parsing.
- **Group chats.** Supported only by selecting two people; everyone else is left out.
- **Offline.** Works once the import screen has loaded. There's no service worker yet, so a cold start with no network won't load the site.
- The lint run has only warnings, mostly about dev-only React fast refresh.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Platforms change export formats | imports break silently | sniff scores plus clear "format not recognised" errors; per-parser fixtures; a fast parser update path |
| Users import chats without the partner's consent | ethical harm | a consent step, together-first design, no surveillance framing; consider a "partner confirms" second step |
| Word stats reveal something sensitive | privacy harm | thresholds, reveal gate, per-word hiding, off by default in shared files |
| Trademark or name collision ("Duet") | rebrand | a working name; trademark search needed before launch |
| Memory on low-end phones with huge histories | crash | about 210 MB at 600k messages; an error path exists; next step is a struct-of-arrays message store |

## Next steps (suggested order)

1. Test with real volunteer exports (local sessions) across locales and fix parser gaps.
2. Service worker / PWA for cold-start offline and "install".
3. iMessage `chat.db` via sql.js inside the worker, with a chat picker.
4. Streaming JSON parsing for Telegram and Meta full exports.
5. Chorus (groups): N-person analysis and group awards.
6. Localisation of copy and lexicons.
7. Deployment: static hosting with security headers (requires approval; see `PRIVACY.md`).

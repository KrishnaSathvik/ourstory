# Duet

**Every message you've sent each other, played back.**

Duet turns a couple's messaging history (WhatsApp, Instagram, Telegram, iMessage, Messenger, Discord, SMS) into a story they can relive together: an interactive, tap-through story with guesses along the way, an editorial almanac of their rhythms and firsts, a pass-the-phone quiz, and keepsakes like a one-of-a-kind print made from every day they talked.

It runs entirely in the browser. **No message is ever uploaded, stored, shown, or read by an AI.** The production page is blocked from making any network connection at all (`connect-src 'none'`).

> Working name: Duet (for two people). The planned group-chat edition is "Chorus".

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173, then "Watch the demo couple"
npm run samples      # writes synthetic export files to samples/ to try the real import flow
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (CSP relaxed for HMR) |
| `npm run build` / `preview` | Production build with strict CSP, then serve it locally |
| `npm test` | Unit and integration tests (vitest), 115 tests |
| `npm run test:e2e` | Playwright against the production build: CSP, offline import, no-text-leak checks |
| `npm run check` | Typecheck, lint, then unit tests |
| `npm run samples` | Generate synthetic WhatsApp, Instagram and Telegram exports |

## Demo vs real

- **The demo couple (Maya & Theo) is fictional.** `src/demo/generate.ts` writes their history as *real export files* in three formats, which then go through exactly the same parsers, merge and analysis as user files. Every demo surface is labelled "Demo · fictional couple", and keepsakes are watermarked.
- **Everything else is the functioning product.** Importing your own exports works end to end.

## How it's built (one paragraph)

React 19 + TypeScript + Vite, with no UI or chart libraries; the charts and canvas keepsakes are hand-built. Files are parsed in a **Web Worker** (`src/worker`), which is the only place raw message text ever exists. The UI receives only text-free `ChatSummary` objects, then a `Story` made of aggregates (`src/analysis/story.ts`). The worker is **terminated** as soon as the Story exists, which releases every message. Saving is opt-in, covers the Story only, and is AES-GCM encrypted with a passphrase.

```
src/
  core/        types, time-zone handling, text utilities and lexicons
  importers/   zip reader (random access, Zip64) + parsers: whatsapp, telegram, meta (instagram/messenger), imessage, discord, sms
  merge/       identity matching across apps, merging and de-duplication
  analysis/    single-pass analysis → Story (chapters, awards, quiz, vocabulary)
  worker/      worker protocol, pipeline, UI-side client
  storage/     encrypted vault, .duet story files (validated, redactable)
  demo/        synthetic couple generator
  ui/          landing, import, who's-who, story player, almanac, play, keepsakes, privacy
tests/         vitest (parsers, merge, pipeline, privacy contract, storage, UI smoke)
e2e/           playwright (production build)
docs/          product, architecture, privacy, design, status, research
```

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md): research synthesis, positioning, what we built and cut, monetisation, roadmap
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, data flow, formats, algorithms, performance
- [docs/PRIVACY.md](docs/PRIVACY.md): threat model, guarantees, consent, sharing and deletion
- [docs/DESIGN.md](docs/DESIGN.md): creative direction, design tokens, motion, accessibility
- [docs/STATUS.md](docs/STATUS.md): progress, test inventory, known limitations, risks, next steps
- [docs/research/](docs/research/): competitor landscape and export-format reference

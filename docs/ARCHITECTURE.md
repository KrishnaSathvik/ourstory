# Architecture

## Decision: a fully client-side static app

| Option | Verdict |
|---|---|
| Server-side parsing / LLM analysis | Rejected. Raw chats would leave the device, creating a breach target, logging risk and consent problems. |
| Hybrid (parse locally, upload aggregates) | Rejected for MVP. No feature needs a server; sharing works with files and images. |
| **Static SPA, parsing in a Web Worker, no backend** | **Chosen.** Strongest privacy story, enforceable with CSP, works offline, costs nothing to host. |

Stack: React 19, TypeScript (strict), Vite. **No UI, chart or animation libraries.** That keeps the look original and the bundle small (96 KB gzip for the main chunk, with the Almanac and Keepsakes lazy-loaded). Runtime dependencies are `react`, `react-dom`, `fflate` (inflate for zip entries) and two self-hosted font packages.

## Data flow and the privacy boundary

```
 UI thread                                  │ Web Worker (only place raw text exists)
────────────────────────────────────────────┼──────────────────────────────────────────────
 File/zip/folder handles  ── postMessage ──▶│ importers: zip → sniff → parse → coalesce
                                            │   ParsedChat[] (messages with text)
 ChatSummary[] + identity guess ◀───────────│ summarize() (names + counts only)
 Who's-who UI → IdentityMap  ── postMessage▶│ merge (identity, dedupe) → analyze() → Story
 Story (aggregates) ◀───────────────────────│ forget()
 worker.terminate()  ← all messages gone    │
```

- `src/core/types.ts` documents the boundary: `Message` and `ParsedChat` never cross it. `ChatSummary` and `Story` contain no message text **by type**.
- `tests/pipeline.test.ts › privacy contract` serialises the demo Story and asserts that none of the 2+ word messages from the source appear in it.
- `e2e/flow.spec.ts` checks the rendered DOM at every story beat for known message phrases.

## Import

- **Zip** (`importers/zip.ts`): a random-access reader. It reads the end-of-central-directory record, then inflates only the entries it needs from `Blob.slice`. A 2 GB Instagram export with photos never gets fully read. It supports Zip64 and throws on encrypted entries.
- **Candidate filtering** (`importers/index.ts › isCandidatePath`): only `.txt`, `.xml`, `result.json` and `messages/**/message_N.json` (plus shallow `.json`) are opened. Media is never touched.
- **Sniffing**: each parser scores the first 4 KB; the best scorer above 0.3 parses the file.
- **Coalescing**: split exports (Instagram's `message_1..N.json`) are joined by `threadKey`.

### Format support

| Format | Parser | Notes |
|---|---|---|
| WhatsApp `.txt` / `.zip` (iOS and Android, many locales) | `whatsapp.ts` | Day/month order inferred (values > 12, then monotonicity, then change frequency), with a warning when it's a guess. Handles 12/24h, U+202F, `a. m.`, multi-line messages, media/deleted/edited markers in about 6 languages, and system lines containing ": ". Detects the exporting user from "You deleted this message" or the chat title. |
| Telegram Desktop JSON (single chat or full export) | `telegram.ts` | `date_unixtime` converted to the user's zone; service `phone_call` becomes a call with duration; reactions from `recent[]`. |
| Instagram / Messenger JSON | `meta.ts` | Repairs Meta's mojibake (UTF-8 bytes written as `\u00XX`); handles split files and English auto-generated strings; best-effort E2EE Messenger format. |
| iMessage via `imessage-exporter` TXT | `imessage.ts` | Tapbacks become reactions. `chat.db` directly is on the roadmap. |
| DiscordChatExporter JSON | `discord.ts` | |
| Android SMS Backup & Restore XML | `sms.ts` | A tag-by-tag scanner that skips base64 MMS data; one chat per contact. |

## Time

Exports disagree. WhatsApp writes the phone's wall-clock time with no zone; Telegram, Meta and Discord store absolute instants. Duet stores **wall-clock time encoded as UTC ms** (`Message.t`), so "11 pm" means what the person saw on their clock. Absolute sources are shifted into the user-chosen IANA zone with per-instant offsets (DST-correct, cached hourly). The review screen explains this and offers a zone picker; changing it re-imports.

## Identity and merging (`src/merge/merge.ts`)

- **Identity guess**: the exporting user (where detectable) becomes person A; other chats are matched by normalised-name similarity (exact, then first name, then substring, then a shared token). The user can always correct it, swap the two, or leave senders out.
- **De-duplication**: partners often export the same chat from both phones (iOS with seconds, Android with minutes). Within a platform, messages are keyed by (person, minute, kind, text hash), and each key is kept as many times as the most any single export contains it (multiset semantics), so a genuine "ok" sent twice survives. Different platforms are never de-duplicated against each other. When every platform has a single export, the step is skipped entirely.

## Analysis (`src/analysis`)

A **single pass** over the merged stream. Each text message is tokenised and emoji-scanned once, and the results are shared by accumulators (`WordAccumulator`, `EmojiAccumulator`, `ConvergenceAccumulator`, `ChapterAccumulator`). It computes:

- **Totals and activity**: daily counts per person, monthly counts per platform, a 7×24 week-hour grid, night (00–05) and morning (05–09) shares, streaks, longest gap, and the busiest day with its hourly shape.
- **Rhythm**: conversations (a new one starts after ≥ 6 h of silence), who initiates, who has the last word, median reply time (replies over 12 h don't count as replies), double texts (a follow-up after ≥ 20 min with no answer), first/last message of the "social day" (which ends at 4 am), longest monologue, and "jinx" (identical short message within a minute).
- **Language**: fixed multilingual phrase lexicons (love you, miss you, goodnight, good morning, sorry, thanks, laughter), style counts, emoji (top, signature via relative frequency, reactions), and words (privacy thresholds: at least 6 uses on at least 3 distinct days, displayable tokens only: no digits, codes or long strings).
- **Convergence**: per-quarter cosine similarity of the two people's content-word and emoji frequency vectors.
- **Milestones**: first message, first per platform, first "love you" / "miss you" / goodnight / call, message #1k/#10k/…, busiest day, streak, return after the longest gap.
- **Chapters**: calendar years (or seasons for short histories), each themed by its most distinctive stat compared with the other chapters.
- **Awards**: about 19 candidate superlatives, awarded only with a margin of at least 15%, balanced between the two people.
- **Quiz**: generated from the Story, with deterministic shuffles; person questions are only asked when the gap is at least 12%.

### Performance (Node 22, one core)

| Messages | Input | Import | Analyse | Extra heap |
|---|---|---|---|---|
| 36k (demo, 3 platforms) | ~1 MB | < 1 s | < 0.5 s | small |
| 600k (single WhatsApp file) | 25 MB | 3.8 s | 5.3 s | ~210 MB |

The Story stays around 40 KB regardless of input size.

## Storage and sharing (`src/storage`)

- **Vault**: opt-in. The Story (never messages, never hidden words) is encrypted with PBKDF2-SHA256 (310k iterations) and AES-GCM-256, then kept in `localStorage`.
- **`.duet` file**: a redactable Story export, optionally passphrase-encrypted. Imports are **untrusted**: `validateStory` rebuilds a Story from known fields with type, length and range checks, rejects prototype-pollution keys, caps size at 5 MB, and bounds PBKDF2 iterations so a hostile file can't freeze the tab.

## UI

A state machine in `ui/App.tsx`: landing → import → reading → review → building → story → home (almanac | play | keepsakes | privacy). The Almanac and Keepsakes are lazy chunks, **preloaded when the import screen opens** so the whole flow works after going offline. An error boundary covers a failed chunk load.

## Security headers for deployment

The CSP is injected as a `<meta>` tag by the Vite plugin in `vite.config.ts`. When deploying, also send it, together with `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and `Permissions-Policy`, as **HTTP headers**, and do not add analytics or third-party scripts. See [PRIVACY.md](PRIVACY.md).

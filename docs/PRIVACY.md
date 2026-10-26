# Privacy & security model

Imported conversations are treated as the most sensitive data a person owns. They also belong to someone else: the other person in the chat.

## Guarantees (and how each is enforced)

| Guarantee | Enforcement |
|---|---|
| Messages never leave the device | No backend exists. The production CSP sets `connect-src 'none'`, which blocks fetch, XHR, WebSocket, EventSource and beacons, even from a compromised dependency. Verified by `e2e › CSP blocks every outgoing connection`. |
| No third parties | Fonts are self-hosted. No analytics, CDNs, cookies or tracking. `referrer` is set to `no-referrer`. |
| Messages are never displayed | The type-level boundary (`ChatSummary` and `Story` contain no text), the `tests/pipeline › privacy contract` test, and e2e DOM checks at every story beat. |
| Messages aren't kept | Raw text exists only inside a Web Worker, which is **terminated** once the Story is built. Nothing is persisted by default. |
| Never sent to AI | There are no AI calls anywhere, and the CSP would block them. Narrative copy is deterministic templates over measurements. |
| Works offline | Once the import screen is open, everything needed has been loaded. Verified by an e2e test that imports and builds the story with the browser offline. |

## What the Story does contain

Counts, durations, dates, names as the user typed them, emoji, the fixed lexicon phrases ("love you", "goodnight"…), and **single words** that pass all of these:

- displayable (letters only, 3–18 characters, no digits, not a stopword);
- used at least **6 times** in total;
- used on at least **3 different days**.

This keeps one-off sensitive tokens (an address, a code pasted repeatedly in one message, a diagnosis mentioned once) out of the Story. On top of that, word stats sit behind a "reveal when you're somewhere private" gate, and any word can be hidden. Hidden words are removed from keepsakes, story files and saved copies.

## Data lifecycle

1. **Select files.** The browser grants file handles; nothing is read until the user consents and clicks "Read my files".
2. **Parse.** Inside the worker, only chat files are opened; zip entries for media are never inflated.
3. **Review.** The UI sees sender names and per-sender counts, needed to answer "who's who".
4. **Analyse.** The Story is built, then the worker is terminated.
5. **Optional save.** The Story is encrypted with a user passphrase (PBKDF2-SHA256 at 310k iterations, AES-GCM-256) and stored in `localStorage`. There is no recovery: there is no "us".
6. **Forget.** "Forget everything" clears memory and the vault.

## Consent

- The import screen requires confirming that the other person is on board ("a conversation belongs to both of you").
- The product is designed to be opened together: predictions and pass-the-phone play.
- Copy never frames the data as surveillance (no "who cares more", no "red flags").

## Sharing

- **Images**: rendered locally on canvas from aggregates and saved through a normal download. Demo images are watermarked.
- **`.duet` files**: word stats are off by default, emoji on, and an optional passphrase. On import the file is untrusted and fully validated (`storage/sharefile.ts › validateStory`).
- **No share links and no server-side sharing**, by design.

## Grounding rule

Every sentence is a measurement or a clearly labelled estimate ("roughly 52 hours of typing (an estimate)"). Duet never infers feelings, intentions or relationship quality. Gaps are described as gaps "in these exports", with the explicit caveat that conversations may have happened elsewhere.

## Threats considered

| Threat | Mitigation |
|---|---|
| Malicious dependency trying to exfiltrate | `connect-src 'none'`, a minimal dependency set, and lockfile pinning |
| XSS via a crafted export (names, titles) | React escapes all text; no `innerHTML` or `eval`; CSP `script-src 'self'` |
| Hostile `.duet` file (prototype pollution, huge arrays, CPU-freezing KDF) | Allow-list rebuild, `__proto__`/`constructor` rejection, size and length caps, bounded KDF iterations |
| Zip bombs or giant files | Only candidate entries are inflated; single text files over 1.5 GB are refused |
| Shoulder-surfing words | Reveal gate and per-word hiding |
| Someone else on the same device | Nothing persisted by default; the vault is passphrase-encrypted; forget-everything |

## Deployment checklist (not yet deployed)

- Serve the same CSP as an HTTP header, plus `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Host with no access logs that capture query strings, or with logging disabled. The app never puts data in URLs anyway.
- Add no analytics. If product metrics are ever needed, use opt-in, aggregate, server-side page counts only, which would require a reviewed CSP change.

# Competitive & Pattern Research — "Our Story" (chat-history Wrapped for couples)

_Researched 2026-10-26. Method: web search only. Direct page fetches (App Store, product sites, the 3 inspiration sites) failed in this environment (DNS/proxy 403), so details come from search-result snippets of store listings, mirrors (mwm.ai, appfollow), press, and READMEs. Privacy and pricing claims are **developer self-reports, not verified**. Items marked (UV) are unverified/unclear._

## 1. Existing products

### A. "Wrapped for WhatsApp" mobile apps (crowded, low-differentiation iOS category)
| Product | Capabilities | Pricing | Processing | Notes / gaps |
|---|---|---|---|---|
| **WhatsAnalyzer: Couple Chats** (iOS) | Swipeable story cards: reply speed, emoji/word habits, streaks | Free + IAP (amounts UV) | Claims on-device | Closest to our concept; WhatsApp only; generic visuals (UV) |
| **Corpus: Wrapped Chat Recap** (iOS) | Couples/friends recaps, shareable visuals | Weekly / yearly / lifetime subs (amounts UV) | Claims on-device | Weekly-sub pattern common in this category = trust/value friction |
| **ChatWrapped: Love Wrapped** (iOS) | Message counts, top emoji/words, cards for IG Stories/TikTok | Free core + subs (UV) | UV | No confirmed couples mode or iMessage |
| **WA Wrapped 2025**, **Wrapped for Chats**, **Wasp Wrapped**, **WaVibe Wrapped** (iOS) | Yearly recap stats, share cards | Free + IAP; Wasp paywalls "unlimited analysis" | UV | Seasonal clones; "not affiliated with WhatsApp" disclaimers |
| **WhatsWrapped AI** (iOS) | Wrapped recap + "relationship score", emotional balance | UV | "Locally or on E2E-encrypted servers" — i.e. not purely local | AI-heavy |
| **Spilk** (iOS) | AI chat coach + Chat Wrapped; WhatsApp, Telegram, Instagram; "who says I love you first" | UV | Server/AI (UV) | Only multi-platform consumer app found; coach framing |
| **ChatStats** (Android, J.L. Galán) | Classic stats/charts | Free, ad-free | On-device; reportedly **no internet permission** (verifiable trust signal) | Utilitarian UI, no storytelling |

### B. Web analyzers
- **OurChatStory.co** — WhatsApp .txt upload → stats as "stories" (when you chat, who writes first, top emoji). Open source (Next.js/React), says chats aren't stored in a DB. Successor to a defunct "WhatsApp Wrapped" site. **Name collides with "Our Story" — check trademark/SEO.** Server vs. browser processing UV.
- **WhatsAnalyze** (web) — upload export, charts for group + 1:1 chats; popular in DE press. Privacy model/pricing UV.
- **MyChatWrap / Chatlytics** (onrender.com) — free, relationship score, sentiment over time, Wrapped recap; claims content never leaves browser (UV).
- **Generic "chat-analytics"** (GitHub, AutoAtende) — WhatsApp/Telegram/etc., single offline HTML report, Docker self-host. Developer-grade, not consumer-pretty.

### C. iMessage
- **advayc/wrapped** (GitHub, Go) — reads macOS `chat.db`, opens a local Spotify-style Wrapped page; "nothing is uploaded".
- **caleb531 iMessage Conversation Analyzer** (Python CLI) — per-conversation metrics, macOS only, no group chats.
- **imessage-mcp** — local MCP with a yearly "Wrapped" summary for AI agents.
- No polished consumer iMessage Wrapped found; all require Mac + Full Disk Access. **iPhone-only users have no easy path** (iOS has no native per-chat export; options are Mac sync or iTunes-backup tools).

### D. Telegram
Only dev tools: Telegram Desktop JSON export → tgnize (PyPI), Sanjeev-Kumar78 Telegram-Chat-Analyzer (web upload), a HF Space with SQLite FTS + dashboard, a "Telegram JSON Schema Viewer" (claims in-browser). **No consumer-grade Telegram Wrapped.** JSON export is clean and easy to parse.

### E. Couple apps (adjacent, not analyzers)
- **Paired** — daily questions, answers hidden until both respond (great two-player mechanic), therapist-led courses, quizzes. ~$14.99/mo (habi.app; older source $74.99/yr).
- **Between** — private 2-person chat + shared calendar/memories. ~$13.99/yr (UV).
- **Lovewick** — 1,000+ questions, date ideas, anniversary countdowns, memory timeline. Free / ~$29.99/yr.
- None ingest existing chat histories — **years of real history is untapped by them**; potential partner/channel or feature competitor.

### F. AI "relationship analysis" (LLM upload)
WhatsAI (effort score, toxic/manipulation reports), LoveLog (sentiment, response time), Red Flag Scanner AI, Red Flags Detector (1.5★), Cheater AI ("GPT" deceit detection), Telr AI ("loyalty test"), Love Flags, Auracheck, WhatsAnalyse (App Store privacy label: user content linked to identity). Plus the DIY trend of pasting exports into ChatGPT (Business Insider essay: "throwing data privacy to the wind").
- **Shortcomings:** raw text sent to third-party servers/LLMs; the *other* person never consented; suspicion/judgment framing (red flags, cheating) that is corrosive; confident, unreliable verdicts; weekly subs. **This is the anti-pattern we position against.**

**Category-wide gaps:** WhatsApp-only; iOS-only; no multi-platform merge; single-player (one partner uploads, the other is a subject); stats-not-story (lists of numbers); generic templates; privacy claims unprovable; seasonal throwaways; transcripts/quotes often shown.

## 2. Patterns that make personal data feel meaningful

**Spotify Wrapped** (2025 edition, Dec 3)
- Bite-size full-screen 9:16 slides, tap-to-advance; vivid gradients, kinetic type, music per slide.
- Pacing: warm-up totals → escalating specificity → identity reveal → share. Big number + one-line flattering interpretation.
- **Identity labels**: "Listening Age", 6 "Clubs" (e.g. "Soft Hearts Club") with your role inside; past: audio auras, personality types.
- **Comparison/rank**: top-X% fan, fan leaderboard, quiz ("guess your top song" — prediction before reveal).
- **Wrapped Party** (new 2025): up to 9 people compare live, group superlatives ("most obsessed fan", "early bird") — direct template for couple/group mode.
- One-tap share, pre-formatted, subtle branding; scarcity (once a year) creates a cultural moment; copy flatters the user.

**Duolingo Year in Review** — stats vs. other learners; final all-in-one share card; 8 learner personas (2021+) from behavior (time of day, hours). Blog: highlighting **percentile on the share card and persona share lifted share rates**; 2024 rewarded sharers with a badge.

**Strava Year in Sport** — cute animated cards; eligibility threshold (3+ activities); 2025 moved behind the ~$80/yr paywall and app-only → user backlash. Lesson: don't paywall the core emotional moment; paywall keepsakes/extras.

**Apple Photos Memories** — automatic curation into a movie; "moods"/Memory Mixes = music + color look applied together; user can swap song/key photo; chronological order. Lesson: auto-generate a great default, allow light personalization (theme/song/cover).

**Snapchat Memories / Flashbacks** — resurfacing the past ("on this day"); reshared old content framed as "from the past". Lesson: anniversary-triggered resurfacing drives return visits.

**BeReal RéCap** — year of photos auto-compiled to video; launch waitlist created buzz, but critics called it an uncurated click-through with no music. Lesson: curation + soundtrack matter.

**Letterboxd Year in Review** — waits for year end for completeness; personal URL + social-ready graphics; long scroll with large imagery (Cactuslab build). **GitHub Wrapped** — third-party, low-effort but viral within a niche; shows any activity log can be Wrapped.

**Concrete mechanics to steal:** 9:16 cards; tap-through with progress bar; one stat per screen; predict-then-reveal; counting-up numbers; superlatives ("Night owl", "First to say goodnight"); identity labels/archetypes as couple; percentiles vs. other couples (needs aggregate, opt-in); per-chapter music/mood; "you vs. me" split screens; final summary card; anniversary resurfacing; personal share link.

## 3. Differentiation opportunities
1. **Provably local processing** — parse in-browser (Web Workers/WASM), zero network calls during analysis, works offline/airplane-mode (ChatStats' no-internet-permission is the trust model to emulate); publish open-source parser; show a live "0 bytes uploaded" indicator. Optional on-device ML (e.g. small sentiment/topic models via WebGPU) instead of cloud LLMs.
2. **No transcripts, ever** — only aggregates, emoji, counts, timing, derived themes. Safe to screenshot; ends the "quote leaks" problem. Strong marketing line against LLM-upload apps.
3. **Multi-platform merge** — couples' history is split (dating-app → Instagram DMs → WhatsApp → iMessage). Merge exports into one timeline ("we moved to WhatsApp on…"). Nobody does this. Telegram JSON and Instagram JSON are clean; iMessage needs a Mac helper/guide.
4. **Two-player by design** — both partners join (consent!), Paired-style hidden answers: "Guess who sends more good-mornings" before reveal; score each other; "Wrapped Party" for groups later. Turns analysis into a date-night game.
5. **Warm framing, not judgment** — celebrate (firsts, streaks, inside-emoji, longest call nights) instead of red flags/toxicity scores.
6. **Keepsakes** — printable poster/book, anniversary video with music, "relationship timeline" chapters; paid physical/digital keepsakes instead of weekly subs or paywalling the core story.
7. **Recurring moments** — anniversary, Valentine's, year-end editions; "on this day" resurfacing.
8. **Craft** — bespoke motion and typography vs. the template-y clone apps; name/trademark check vs. OurChatStory.co.

## 4. Inspiration sites
- **beautifului.dev** — Unreachable (DNS/proxy blocked) and no search results describe it; could not assess.
- **libraries.dev/orbs** — Unreachable directly; per search it's the demo of `thinking-orbs` (npm): monochrome dotted canvas orbs with states (breathing, weaving, listening…), plain 2D canvas, no WebGL. Useful as a lightweight "analyzing your story locally…" loader / ambient couple-avatar motif.
- **recent.design** — Unreachable directly; per third-party descriptions a daily-updated curated gallery of fresh web/app/brand design (~125k newsletter subs). Use for current landing-page and motion references.

## Sources (selection)
App Store listings via search: WhatsAnalyzer Couple Chats (id6744703917), Corpus (id6749516540), Spilk (id6627342798), WhatsAI (id6744169392), LoveLog (id6743008000), WA Wrapped (id6739847325), Red Flag Scanner (id6740946063); mwm.ai ChatWrapped; appfollow ChatStats; xatakamovil (OurChatStory); giga.de (WhatsAnalyze); github.com/advayc/wrapped; caleb531 analyzer; tgnize (PyPI); habi.app couple-app comparison; Axios / Spotify newsroom (Wrapped 2025); blog.duolingo.com/year-in-review-behind-the-scenes; Android Authority (Duolingo 2025); Ars Technica via tagteam (Strava paywall); Apple support (Memories); PetaPixel/Bustle (BeReal recap); cactuslab.com (Letterboxd); Business Insider (ChatGPT relationship analysis); thinking-orbs README (jsDelivr); uiuxshowcase (recent.design).

# Messaging Export Formats: Technical Reference for In-Browser Parsers

Status: research notes, 2026-10. All samples are synthetic (names like "Alice Example").
Primary sources: `Pustur/whatsapp-chat-parser` (src/parser.ts, date.ts, time.ts), `mlomb/chat-analytics` (pipeline/parse/parsers/*), `telegramdesktop/tdesktop` (`export/output/export_output_json.cpp`), `ReagentX/imessage-exporter`. Items marked **(unverified)** need a real export to confirm.

---

## 1. WhatsApp (.txt, optionally inside .zip)

### 1.1 Container
| Platform | Export file | Text file inside zip | Media naming |
|---|---|---|---|
| iOS | `WhatsApp Chat - <Name>.zip` (always zip) | `_chat.txt` | `00000012-PHOTO-2024-03-12-21-05-01.jpg`, `...-AUDIO-...opus`, `...-VIDEO-...mp4` |
| Android | `WhatsApp Chat with <Name>.txt`, or `.zip` when "Include media" | `WhatsApp Chat with <Name>.txt` | `IMG-20240312-WA0003.jpg`, `PTT-20240312-WA0004.opus`, `VID-...mp4` |

The filename prefix is localized ("Chat de WhatsApp con ", "WhatsApp Chat mit ", "Discussion WhatsApp avec ", "Conversa do WhatsApp com ", "Чат WhatsApp с ", sometimes with `_` instead of spaces). chat-analytics looks for `_chat.txt` first, then falls back to the shortest file matching `/.*(?:chat|whatsapp).*\.txt$/i`. Use `fflate` (`unzipSync`) to unzip in the browser and skip media entries when you only need text. Strip a leading BOM `﻿` and split lines on `/\r?\n/`.

### 1.2 Line formats (message header)
Timestamps are in **device-local time with no timezone**, formatted using the phone's locale.

```text
# iOS, en-GB (24h, seconds, brackets, author then ": ")
[12/03/24, 21:04:15] Alice Example: Are we still on for Saturday?
# iOS, en-US (12h; iOS 17+ puts U+202F NARROW NO-BREAK SPACE before AM/PM)
[3/12/24, 9:04:15 PM] Alice Example: Are we still on for Saturday?
# Android, en-GB (no brackets, no seconds, " - " separator, 4-digit year on newer builds)
12/03/2024, 21:04 - Alice Example: Are we still on for Saturday?
# Android, en-US (U+202F before PM on Android 13+ / ICU 72+)
3/12/24, 9:04 PM - Alice Example: Are we still on for Saturday?
# de-DE (dots), iOS and Android
[12.03.24, 21:04:15] Alice Example: Hallo
12.03.24, 21:04 - Alice Example: Hallo
# nl / some locales use dashes; sv uses ISO order (year first)
12-03-2024 21:04 - Alice Example: Hoi
2024-03-12 21:04 - Alice Example: Hej
# es with "p. m." and other "a. m."/"p.m." variants
12/3/24, 9:04 p. m. - Alice Example: Hola
```

Variations to tolerate: date separators `/ . -` (sometimes followed by a space); 1–4 digit components in any order; date/time separator `, ` or ` ` or `. `; time separators `:` or `.` (e.g. fi `21.04`); optional seconds; AM/PM tokens `AM`, `am`, `a.m.`, `a. m.`; the space before AM/PM may be U+0020, U+00A0 or U+202F (JS `\s` matches all three). Some locales add a word between date and time (e.g. pt "às"), which is why the reference regex has `\D*?`.

**Reference regex** (whatsapp-chat-parser, flag `i`):

```ts
const shared =
  /^(?:‎|‏)*\[?(\d{1,4}[-/.]\s?\d{1,4}[-/.]\s?\d{1,4})[,.]?\s\D*?(\d{1,2}[.:]\d{1,2}(?:[.:]\d{1,2})?)(?:\s([ap]\.?\s?m\.?))?\]?(?:\s-|:)?\s/;
const userMsg   = new RegExp(shared.source + /(.+?):\s([^]*)/.source, 'i'); // date,time,ampm,author,text
const systemMsg = new RegExp(shared.source + /([^]+)/.source, 'i');       // date,time,ampm,text
```

Algorithm: for each line, if it matches `userMsg` start a user message; else if it matches `systemMsg` start a system message; else append `"\n" + line` to the previous message (**multi-line messages**). Note that `(.+?):\s` is lazy, so the author is everything up to the first `": "`. Author names containing `": "` are rare; system lines containing `": "` are misread as user messages, e.g. `Bob changed the subject to "Re: trip"`. Mitigate by checking the author against the set of known participants, or by the frequency of each author.

### 1.3 Bidi and invisible characters
iOS prefixes many lines and payloads with U+200E LEFT-TO-RIGHT MARK. RTL locales add U+200F, and some exports contain U+202A/U+202C (LRE/PDF) around phone numbers and U+00A0. After matching, strip them from the text: `s.replace(/[‎‏‪-‮⁦-⁩]/g, '')`. Keep U+00A0/U+202F only inside the time token. Normalize them to a space before you parse AM/PM.

### 1.4 Media, deleted, edited, system
```text
# Android, media not included (localized: "<Medien weggelassen>", "<multimedia omitido>", ...)
12/03/2024, 21:05 - Alice Example: <Media omitted>
# Android, media included
12/03/2024, 21:05 - Alice Example: IMG-20240312-WA0003.jpg (file attached)
# iOS, media not included (type-specific, LRM-prefixed, no angle brackets on newer builds)
[12/03/24, 21:05:01] Alice Example: ‎image omitted
[12/03/24, 21:05:09] Alice Example: ‎audio omitted        (also video/sticker/GIF/document omitted)
# iOS, media included
[12/03/24, 21:05:01] Alice Example: ‎<attached: 00000012-PHOTO-2024-03-12-21-05-01.jpg>
# Deleted
12/03/2024, 21:06 - Bob Example: This message was deleted
12/03/2024, 21:06 - Alice Example: You deleted this message
[12/03/24, 21:06:00] Bob Example: ‎This message was deleted.
# Edited (suffix on the message body)
12/03/2024, 21:07 - Bob Example: See you at 8 <This message was edited>
# View-once, polls, locations
12/03/2024, 21:08 - Bob Example: location: https://maps.google.com/?q=0.000000,0.000000
12/03/2024, 21:08 - Bob Example: POLL:
OPTION: Pizza (2 votes)
# System messages. Android has no author; iOS uses the chat name as the "author"
12/03/2024, 20:00 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.
12/03/2024, 20:01 - Alice Example created group "Weekend Trip"
12/03/2024, 20:01 - Alice Example added Bob Example
[12/03/24, 20:01:00] Weekend Trip: ‎Alice Example created group “Weekend Trip”
```
Attachment regex (whatsapp-chat-parser): `/^(?:‎|‏)*(?:<.+:(.+)>|([\w-]+\.\w+)\s[(<].+[)>])/` captures the filename from `<attached: X>` or `X (file attached)`. Omitted-media detection needs a **localized string table**: chat-analytics has about 60 languages and matches with `endsWith` after lowercasing (see `pipeline/parse/parsers/WhatsApp.ts`). Unknown contacts appear as phone numbers (`+1 555 010 0000`) with U+202A/U+202C around them. Ephemeral (disappearing) messages are not exported.

### 1.5 dd/mm vs mm/dd resolution (whatsapp-chat-parser `daysBeforeMonths`)
1. `orderDateComponents`: move the longest component (year) to the end. A leading 4-digit year means ISO `y-m-d`, which becomes `[m,d,y]`, so it is treated as month-first.
2. `checkAbove12`: if any first component is > 12, days come first; else if any second component is > 12, months come first.
3. `checkDecreasing`: group dates by year. Within a year, if the first component ever decreases between consecutive unique dates, it is the day (months only increase within a year).
4. `changeFrequencyAnalysis`: the component with the larger sum of absolute deltas is the day.
5. Allow a user override (`daysFirst`) and show a confirmation UI when only steps 3–4 decided.
Two-digit years are padded as `20yy`. The result is built with `new Date(y, m-1, d, h, min, s)`, which is local time. For 12h times, `12 AM` becomes 00 and `PM` adds 12. Sort messages after parsing: lines can be out of order. Bonus heuristic: the 12h/24h choice and the separator don't settle the day/month order on their own, but `[`+seconds means iOS.

---

## 2. Telegram Desktop (JSON)

Settings → Advanced → Export Telegram data (full export), or chat menu → Export chat history (single chat). Choose "Machine-readable JSON". Media is referenced by **relative path** next to `result.json`. Excluded files become `"(File not included. Change data exporting settings to download.)"`.

```jsonc
// Single chat export: the root IS the chat
{ "name": "Alice Example", "type": "personal_chat", "id": 123456789,
  "messages": [
  { "id": 101, "type": "message",
    "date": "2024-03-12T21:04:15", "date_unixtime": "1710277455",   // date = local time of exporting machine, no TZ
    "edited": "2024-03-12T21:05:00", "edited_unixtime": "1710277500", // only when edited
    "from": "Alice Example", "from_id": "user123456789",
    "reply_to_message_id": 100,
    "text": ["See ", {"type": "link", "text": "https://example.com"}, " ok?"],
    "text_entities": [{"type":"plain","text":"See "},{"type":"link","text":"https://example.com"},{"type":"plain","text":" ok?"}],
    "reactions": [{"type":"emoji","count":2,"emoji":"❤","recent":[{"from":"Bob Example","from_id":"user987654321","date":"2024-03-12T21:06:00"}]}] },
  { "id": 102, "type": "message", "date": "...", "date_unixtime": "1710277600",
    "from": "Bob Example", "from_id": "user987654321",
    "file": "stickers/sticker.webp", "media_type": "sticker", "sticker_emoji": "👍", "text": "" },
  { "id": 103, "type": "service", "date": "...", "date_unixtime": "1710277700",
    "actor": "Alice Example", "actor_id": "user123456789", "action": "phone_call",
    "duration_seconds": 42, "text": "" }
]}
// Full export: { "about": "...", "personal_information": {...}, "contacts": {"list": [...]},
//   "chats": { "about": "...", "list": [ <chat object as above>, ... ] },
//   "left_chats": { "list": [...] } }
```
Key facts (from tdesktop `export_output_json.cpp`):
- `type`: `"message"` or `"service"`. Service messages have `action` (`create_group`, `invite_members`, `phone_call`, `pin_message`, ...) and `actor`/`actor_id` instead of `from`.
- `text` is a **string** when there are no entities, otherwise an **array** mixing strings and `{type,text}` objects. Flatten with `typeof t === 'string' ? t : t.map(p => typeof p === 'string' ? p : p.text).join('')`. Prefer `text_entities` (always an array of `{type,text}`) when present.
- Prefer `date_unixtime` (a **string** of seconds). `date` is ISO without an offset.
- `from_id` prefixes: `user<id>`, `channel<id>`, `chat<id>`. `from` can be `null` for deleted accounts.
- `media_type`: `sticker`, `voice_message`, `video_message`, `animation`, `video_file`, `audio_file`. Photos use `"photo": "photos/photo_1@12-03-2024_21-04-15.jpg"`. Other fields: `forwarded_from`, `via_bot`, `poll`, `location_information`, `contact_information`, `mime_type`, `duration_seconds`.
- `reactions[]`: `{type: "emoji"|"custom_emoji"|"paid", count, emoji? | document_id?, recent?: [{from, from_id, date}]}`. Only newer Desktop versions emit this. Older parsers (chat-analytics) note "Telegram doesn't export reactions".
- Chat `type`: `personal_chat`, `bot_chat`, `private_group`, `private_supergroup`, `public_supergroup`, `private_channel`, `public_channel`, `saved_messages`, `replies`.
- Files can be hundreds of MB. Use a streaming JSON parser (e.g. `@streamparser/json`) in a Web Worker for full exports.

---

## 3. Instagram & Facebook Messenger (Meta "Download your information", JSON)

Path (current Accounts Center layout): `your_instagram_activity/messages/inbox/<thread>_<id>/message_1.json` and `your_facebook_activity/messages/inbox/<thread>_<id>/message_1.json`. Older archives use `messages/inbox/...`. There is also `.../e2ee_cutover/`, `archived_threads/`, `filtered_threads/`, `message_requests/`. Large threads are split into `message_1.json`, `message_2.json`, ... (about 10k messages each). Messages are sorted **newest first**. You must choose **JSON** (the default is HTML) when requesting the export.

```json
{
  "participants": [{"name": "Alice Example"}, {"name": "Bob Example"}],
  "messages": [
    {"sender_name": "Bob Example", "timestamp_ms": 1710277455000,
     "content": "CafÃ© at 8? ð\u009f\u0098\u0080",
     "reactions": [{"reaction": "â\u009d¤", "actor": "Alice Example"}],
     "is_geoblocked_for_viewer": false},
    {"sender_name": "Alice Example", "timestamp_ms": 1710277400000,
     "photos": [{"uri": "your_instagram_activity/messages/inbox/bob_123/photos/1.jpg", "creation_timestamp": 1710277400}]},
    {"sender_name": "Alice Example", "timestamp_ms": 1710277300000,
     "share": {"link": "https://www.instagram.com/p/XXXX/", "share_text": "..."}, "content": "Alice sent an attachment."}
  ],
  "title": "Bob Example", "is_still_participant": true, "thread_path": "inbox/bob_123", "magic_words": []
}
```
Other message fields: `videos`, `audio_files`, `files`, `gifs`, `sticker {uri}`, `call_duration`, `is_unsent`, `type` (FB: `Generic`, `Share`, `Call`, `Subscribe`, `Unsubscribe`), `users`. Auto-generated `content` strings ("Liked a message", "reacted ❤ to your message", "sent an attachment.") are localized system text. Filter them or classify them as reactions/attachments.

**Mojibake bug:** Meta serializes each UTF-8 *byte* as a `\u00XX` escape, so `é` (C3 A9) becomes `Ã©` and decodes to "Ã©". Apply the fix to every string (names, content, reactions, title) after `JSON.parse`:
```ts
const fixMeta = (s: string) =>
  /[\u0080-ÿ]/.test(s) && !/[^\u0000-ÿ]/.test(s)
    ? new TextDecoder('utf-8').decode(Uint8Array.from(s, c => c.charCodeAt(0)))
    : s;
```
Use a JSON reviver (`JSON.parse(txt, (k, v) => typeof v === 'string' ? fixMeta(v) : v)`). The guard skips strings that are already correct.

**E2EE Messenger (2024+):** E2EE chats are **not** in the standard DYI inbox (or appear only up to `e2ee_cutover`). You export them separately via Privacy & safety → End-to-end encrypted chats → Message storage → Download secure storage data (desktop only, needs secure storage enabled). You get a zip with `media/` and one JSON per thread. Reported shape **(unverified)**: camelCase keys, `participants: string[]`, `threadName`, `messages[{senderName, text, timestamp (ms), type, isUnsent, media[{uri}], reactions[{actor, reaction}]}]`, correctly encoded UTF-8 (no mojibake). Detect it by key names and verify against a real export.

---

## 4. iMessage / SMS on Apple devices

There is no native export. The options:
| Source | Format | Notes |
|---|---|---|
| `~/Library/Messages/chat.db` (macOS) | SQLite | Needs Full Disk Access to copy. The user uploads a copy. Also include `chat.db-wal` or the latest messages are missing. |
| iPhone unencrypted backup | `3d/3d0d7e5fb2ce288813306e4d4636395e047a3d28` (= sms.db) | Same schema |
| `imessage-exporter` (ReagentX, Rust CLI) | `-f txt` or `-f html`, one file per chat | Handles attributedBody, tapbacks, edits, attachments |
| iMazing / 3uTools / iExplorer | CSV/PDF/TXT | Column layouts are vendor-specific. iMazing CSV: `Chat Session, Message Date, Delivered Date, Read Date, Edited Date, Service, Type (Incoming/Outgoing), Sender ID, Sender Name, Status, Replying to, Subject, Text, Attachment, Attachment type` **(verify header)** |

chat.db essentials:
```sql
SELECT m.ROWID, m.guid, m.date, m.is_from_me, m.text, m.attributedBody,
       m.associated_message_type, m.associated_message_guid, m.date_edited,
       h.id AS handle, c.chat_identifier, c.display_name
FROM message m
LEFT JOIN handle h ON h.ROWID = m.handle_id
JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
JOIN chat c ON c.ROWID = cmj.chat_id
ORDER BY m.date;
```
- `message.date`: **nanoseconds since 2001-01-01T00:00:00Z** (macOS 10.13+/iOS 11+). Older databases store seconds. Convert with `unixMs = (d > 1e12 ? d / 1e6 : d * 1000) + 978307200000`. Read it as BigInt-safe: sql.js returns a JS number, which loses sub-µs precision, and that's fine here.
- `handle.id` is a phone number in E.164 or an email. `is_from_me = 1` means the owner sent it, and then `handle_id` points to the recipient or is 0.
- On macOS Ventura+ / iOS 16+ `text` is often NULL and the body is only in `attributedBody`, an NSAttributedString in **typedstream** (NSArchiver) format. Pragmatic extraction: find the bytes after `NSString`, skip the `\x01\x2b` (`+`) marker, read a length byte (`0x81` means a 2-byte little-endian length follows, `0x82` a 3-byte one), then decode that many UTF-8 bytes. imessage-exporter's `crabstep`/typedstream code is the reference.
- Tapbacks are rows with `associated_message_type` 2000–2006 (add love/like/dislike/laugh/emphasis/question/emoji) and 3000–3006 (remove). `associated_message_guid` = `p:0/<guid>`.
- Attachments: `attachment` + `message_attachment_join` (filename like `~/Library/Messages/Attachments/..`). The files are not inside the DB.

**Browser feasibility:** sql.js (WASM, about 1 MB) can open `chat.db` from a `File` → `ArrayBuffer` entirely client-side. Databases of 1–5 GB exceed practical memory, so tell the user to run `VACUUM INTO` on a copy or use imessage-exporter txt instead. WAL is not merged automatically. Ask the user to quit Messages first, or copy with `sqlite3 chat.db ".backup out.db"`.
**Privacy:** chat.db holds *every* conversation, including 2FA codes and other people's messages. Filter to the chats the user selects, never upload the DB, process it in a Worker and discard the buffer afterwards, and say this plainly in the UI.

imessage-exporter txt sample:
```text
Mar 12, 2024  9:04:15 PM (Read by them after 1 minute)
Me
Are we still on for Saturday?

Mar 12, 2024  9:05:02 PM
+15555550100
Yes! Tapbacks: Loved by Me
```

---

## 5. Other platforms (brief)

- **Signal:** there's no plaintext export on iOS/Desktop. Android backups (`.backup`) are encrypted with a 30-digit passphrase in protobuf frames. Signal Desktop's DB is SQLCipher, with the key held in OS safeStorage. Third-party `signal-export` (Python) or `signalbackup-tools` produce JSON/HTML/CSV. A browser parser is out of scope at MVP. You could accept `signal-export` output later.
- **Discord (DiscordChatExporter):** JSON root `{guild{id,name}, channel{id,type,name}, dateRange, messages[{id, type:"Default"|"Reply"|..., timestamp:"2024-03-12T21:04:15.123+00:00", timestampEdited, isPinned, content, author{id,name,nickname,isBot}, attachments[{url,fileName}], embeds, stickers, reactions[{emoji{name}, count, users?}], mentions, reference{messageId}}], messageCount}`. Timestamps carry an **offset**. CSV columns: `AuthorID,Author,Date,Content,Attachments,Reactions`. Discord's own data package (`messages/c<id>/messages.json` or `.csv` with `ID,Timestamp,Contents,Attachments`) contains **only the user's own messages**.
- **Google Chat / Hangouts (Takeout):** `Google Chat/Groups/<DM or Space id>/messages.json` → `{messages:[{creator{name,email,user_type}, created_date:"Tuesday, March 12, 2024 at 9:04:15 PM UTC", text, attached_files, annotations, message_id}]}`, plus `group_info.json` (members). The date is an English-formatted string with a TZ abbreviation, so parse it with a custom regex. Legacy `Hangouts.json` has `conversations[].events[]` with `timestamp` in **µs** and `chat_message.message_content.segment[].text`.
- **LINE (.txt):** Header `[LINE] Chat history with Alice Example` and `Saved on: 2024/03/13 10:00`, then day headers `Tue, 03/12/2024` (format localized), then lines `21:04\tAlice Example\tAre we still on?` (**tab-separated**). Multi-line messages are wrapped in double quotes. Stickers and photos appear as `[Sticker]` / `[Photo]`.
- **Snapchat (My Data):** `json/chat_history.json` maps a username to `[{From, Media Type: "TEXT"|"MEDIA"|"STICKER"|"SHARE", Created: "2024-03-12 21:04:15 UTC", Content, Conversation Title, IsSender, Created(microseconds)}]`. `Content` is empty for snaps and for unsaved/ephemeral chats, so text coverage is partial. Newer exports may be HTML-only unless JSON is chosen. Key names vary across years, so match them loosely.
- **SMS Backup & Restore (Android, XML):**
  ```xml
  <smses count="2">
    <sms address="+15555550100" date="1710277455000" type="1" body="Hi!" readable_date="Mar 12, 2024 9:04:15 PM" contact_name="Alice Example"/>
    <mms date="1710277500000" msg_box="2" address="+15555550100~+15555550101"><parts><part ct="text/plain" text="Pics"/><part ct="image/jpeg" data="BASE64..."/></parts><addrs><addr address="+15555550100" type="137"/></addrs></mms>
  </smses>
  ```
  `type` 1 = received, 2 = sent. MMS `msg_box` uses the same values, and addr `type` 137 = from, 151 = to. `date` is ms epoch. Files with base64 media reach GBs, so use a SAX-style streaming parser (`saxes`) instead of DOMParser.

---

## 6. Recommendations

### MVP support & difficulty
| Format | MVP? | Difficulty | Main risks |
|---|---|---|---|
| WhatsApp txt/zip (iOS+Android) | **Yes** | Medium | Locales, date order, system-line false positives, localized media strings |
| Telegram JSON | **Yes** | Low | Size (streaming), text-array flattening |
| Instagram / Messenger JSON | **Yes** | Low–Medium | Mojibake, multi-file threads, folder variants, newest-first order |
| iMessage via imessage-exporter txt | Phase 2 | Medium | Loose text format |
| iMessage chat.db via sql.js | Phase 2 | High | attributedBody, size, WAL, privacy |
| SMS Backup & Restore XML | Phase 2 | Low–Medium | Size, MMS group addressing |
| Discord (DCE JSON) | Phase 2 | Low | Mostly group/servers |
| Google Chat, LINE, Snapchat | Later | Medium | Sparse or localized formats |
| Signal | No | Very high | Encrypted |

Architecture: detect the format by sniffing (zip entries, JSON keys, first-line regex) rather than by extension. Run parsers in a Web Worker and emit a normalized `Message {platform, chatId, sourceId?, authorKey, authorDisplay, isSelf?, tsUtcMs, tsLocalWallClock?, text, attachments[], reactions[], editedAt?, deleted, system, replyTo?}`.

### Edge cases checklist
- **Timezones:** WhatsApp, LINE and the Telegram `date` string are wall-clock time without an offset. Telegram `date_unixtime`, Meta `timestamp_ms`, iMessage, Discord and SMS XML are absolute. Store both the UTC instant and the original wall-clock time. Ask for (or infer from the browser) the IANA zone for wall-clock sources, and convert with `Temporal`/`date-fns-tz`, not `new Date(y,m,d)` (that uses the *viewer's* zone).
- **DST:** a nonexistent local time (spring-forward gap) should map forward. An ambiguous one (the fall-back hour) is ambiguous for minute-resolution Android lines, so use message order to keep timestamps monotonic. Travel changes the device zone mid-export without notice, which shows up as sudden ±N h jumps.
- **Precision:** Android WhatsApp has minute resolution, so many messages share a timestamp. Keep the source line index as a tiebreaker.
- **Duplicates:** overlapping exports of the same chat (re-export later). Key on `(platform, chatId, sourceId)` when IDs exist (Telegram `id`, Discord `id`, iMessage `guid`). Otherwise use a hash of `(authorKey, tsBucket, normalizedText)` with a ±60 s window and order-preserving alignment (like a diff/LCS), because WhatsApp has no IDs and its minute rounding differs between iOS and Android.
- **Cross-platform merging:** the same conversation can appear in WhatsApp and SMS, or Messenger and Instagram (cross-platform threads). Don't dedupe across platforms by default. Merge only for display, sorted by UTC.
- **Identity mapping:** authors are display names (WhatsApp, Meta, LINE), phone/email handles (iMessage, SMS), or IDs (Telegram `user123`, Discord). Names change over time and contacts are saved differently on each phone. WhatsApp shows unsaved contacts as `+1 555 ...` with bidi marks. Normalize phones to E.164 (`libphonenumber-js`), let the user merge aliases into one person, and ask "which one is you?" (WhatsApp/Meta have no `is_from_me`; "You deleted this message" and the export owner's absence from Meta `participants` are hints).
- **Text normalization:** NFC-normalize, strip bidi marks, unify CRLF. Remove WhatsApp's `<This message was edited>` suffix into an `edited` flag. Detect deleted placeholders per locale.
- **Group events and system lines:** joins, leaves, renames, encryption notices and calls. Classify them, don't count them as messages.
- **Large files:** zips over 300 MB usually include media. Stream entries, read only the text, and warn the user.

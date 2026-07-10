# LSCroster — Projection API Reference (v1)

**Audience:** Developer of the church's Mac projection software.
**Status:** Contract for `apiVersion: 1`. This document supersedes the earlier drafts
(`LSCRoster-Projection-API.md`, and the server sections of `Mac-Projection-Client.md`).
The client-side guidance in the old Mac doc (fetch-before-service, cache-then-project,
Keychain storage) still applies — only the endpoints, URLs and JSON shapes changed.

---

## 1. Overview

Two read-only `GET` endpoints let a projection app pull the church's published service
plans and the lyrics for each song on a plan:

| # | Purpose | Route |
|---|---------|-------|
| 1 | List published services (10 days back → 60 days ahead) | `GET {BASE}/plans` |
| 2 | Lyrics sheet for one service | `GET {BASE}/plans/{planId}/lyrics` |

The flow: call endpoint 1 (no parameters) to get the upcoming services, let the operator
pick one, then call endpoint 2 for everything needed to build slides.

These endpoints are a **stable contract**. The projection app never talks to the
database directly, so internal schema changes stay invisible as long as the JSON shapes
below are preserved.

---

## 2. What you need from the church admin

Each church runs its own LSCroster deployment, so you need two values per church:

| Setting | Example | Where to store |
|---------|---------|----------------|
| Base URL | `https://abcdefgh.supabase.co/functions/v1/projection-api` | App preferences |
| API key | `lscp_` + 64 hex chars | **macOS Keychain** — never plist/UserDefaults |

The admin generates the API key in **LSCroster → Settings → Projection API** and it is
shown **once** — it cannot be retrieved later, only replaced. Keys are per-device:
request one key per install (e.g. "AV Desk Mac Mini") so the church can revoke a single
machine without breaking the others. Treat the key like a password: Keychain item, never
logged, never displayed after entry.

There is no Supabase key, JWT, or login involved — the API key is the only credential.

---

## 3. Authentication

Send the key on every request, either way:

```
Authorization: Bearer lscp_...
```
or
```
x-api-key: lscp_...
```

Missing, wrong, or revoked key → `401 {"error":"unauthorized"}` (the body never says
which part failed). On `401`, stop and tell the operator to check the key — do not
retry silently.

---

## 4. Endpoint 1 — List published services

### Request
```
GET {BASE}/plans
Authorization: Bearer <key>
```

No parameters. The server always returns **published** plans dated from **10 days
before today to 60 days after today**, computed in the church's own timezone. This
window is fixed on the server (CCLI licensing does not permit bulk historical export,
so there is deliberately no way to query arbitrary dates).

### Response `200`
```json
{
  "apiVersion": 1,
  "generatedAt": "2026-07-10T09:15:00.000Z",
  "window": { "from": "2026-06-30", "to": "2026-09-08" },
  "plans": [
    {
      "id": "0e7b9c2a-…",
      "date": "2026-07-12",
      "serviceType": "Sunday Service",
      "title": "Communion Sunday",
      "startTime": "10:00",
      "songCount": 5
    }
  ]
}
```

**Field notes**
- `plans` is sorted by `date` ascending, then `startTime`. Two services on one date
  (e.g. morning + evening) appear as two entries — disambiguate with `serviceType`
  and `startTime`.
- `date` is the church-local calendar date, `YYYY-MM-DD`. Compare it against *today in
  the church's timezone*, not UTC.
- `title` is an optional per-plan label; `null` when the plan has none. Display
  `serviceType` as the primary name.
- `startTime` is 24-hour `HH:MM`, or `null` when the church hasn't set one.
- `songCount` counts song items only (headers/announcements etc. are excluded).
- An empty `plans` array is a normal `200`, not an error.

Draft (unpublished) plans are never returned. A plan the church unpublishes disappears
from this list — and endpoint 2 stops serving it — until it is published again.

---

## 5. Endpoint 2 — Lyrics sheet for a service

### Request
```
GET {BASE}/plans/0e7b9c2a-…/lyrics
Authorization: Bearer <key>
```

Only plans that endpoint 1 would list are servable: published, and dated inside the
10-days-back / 60-days-ahead window. Anything else is a `404 plan_not_found`.

### Response `200`
```json
{
  "apiVersion": 1,
  "planId": "0e7b9c2a-…",
  "date": "2026-07-12",
  "serviceType": "Sunday Service",
  "title": null,
  "churchName": "Life Sanctuary Church",
  "generatedAt": "2026-07-10T09:15:04.000Z",
  "songs": [
    {
      "order": 1,
      "title": "Amazing Grace / My Chains Are Gone",
      "arrangement": "Default",
      "key": "G",
      "bpm": 72,
      "meter": "3/4",
      "lyricsVersion": 3,
      "lyrics": "[Verse 1]\nAmazing grace, how sweet the sound\n…",
      "sections": [
        {
          "type": "verse",
          "label": "Verse 1",
          "lines": [
            "Amazing grace, how sweet the sound",
            "That saved a wretch like me"
          ]
        },
        { "type": "chorus", "label": "Chorus", "lines": ["…"] }
      ],
      "sourceSongs": [
        {
          "title": "Amazing Grace",
          "author": "John Newton",
          "ccli": "22025",
          "copyright": null
        }
      ]
    }
  ]
}
```

**Field notes**

- `order` — 1-based position in the order of service; songs arrive already sorted.
- `title` — display title of the item. A medley shows all its songs
  (`"Song A / Song B"`).
- `arrangement` — the arrangement name being played (e.g. `Default`, `Acoustic`,
  a medley name). May be `null` if the song was deleted from the library after
  publishing (see below).
- `key` / `bpm` / `meter` — performance metadata; each may be `null`. `key` already
  reflects any per-plan key override.
- `lyricsVersion` — **the lyrics version number for this song on this plan.** LSCroster
  versions lyrics per arrangement; publishing a plan pins each song to the then-current
  version, so the API always returns exactly what the worship team published, even if
  the lyrics were edited afterwards. Show this number on the operator UI (e.g.
  "Amazing Grace — lyrics v3") and use a change in it as the signal to rebuild slides.
  `null` when no lyrics exist.
- `lyrics` — the raw lyrics text, exactly as entered (may contain `[Verse 1]`-style
  header lines). Provided for completeness; prefer `sections` for slide building.
- `sections` — the lyrics split into slide-ready sections (see §6). Empty only when
  `lyrics` is `null`.
- `sourceSongs` — one entry per library song behind the item (two or more for a
  medley), in medley order. This is the CCLI attribution data: `author`, `ccli`
  (CCLI song number) and `copyright` may each be `null` when the church hasn't
  recorded them. `copyright` is **multi-line** text (lines separated by `\n`,
  e.g. the © line plus the church's CCLI licence number) — render every line.
- **Deleted-song edge case:** if a song was removed from the library after the plan was
  published, its item still appears (the title is preserved) but `arrangement`,
  `lyricsVersion` and `lyrics` are `null`, `sections` and `sourceSongs` are empty.
  Render a "lyrics unavailable" placeholder rather than failing.

---

## 6. Sections

Each section maps to one or more slides. `lines` is a pre-split string array — slide
chunking is just array slicing, no text parsing needed.

```json
{ "type": "verse", "label": "Verse 1", "lines": ["…", "…"] }
```

- `type` values currently emitted: `verse`, `chorus`, `pre-chorus`, `bridge`, `intro`,
  `outro`, `tag`, `refrain`, `interlude`, `instrumental`, `ending`, `vamp`,
  `turnaround`, `coda`, `hook`, `reprise`, `breakdown`, `channel`, `descant`, `other`.
  **Treat any unrecognised value as `other`** — never fail decoding on a new type.
- `label` is the human display label (`Verse 1`, `Chorus`). It is `null` for
  unlabeled blocks (lyrics whose stanzas were separated only by blank lines) — use it
  as an optional tag, never assume it is present.
- Sections arrive in performance order. Keep slide order = song `order`, then section
  order, then chunk order.
- If the church entered lyrics without any section headers, each blank-line-separated
  stanza becomes one section of type `other` with a `null` label — so `sections` is
  always usable whenever lyrics exist.

---

## 7. Errors

All errors share one shape; branch on `error` and the HTTP status, not on `message`:

```json
{ "error": "plan_not_found", "message": "Optional human-readable detail" }
```

| Status | `error` | When |
|--------|---------|------|
| 401 | `unauthorized` | Missing, wrong, or revoked API key |
| 404 | `not_found` | Unknown route |
| 404 | `plan_not_found` | No published plan with that ID inside the date window |
| 405 | `method_not_allowed` | Anything but `GET` |
| 429 | `rate_limited` | Too many requests (see §8) |
| 500 | `database_error` | Server-side query failure — safe to retry after a pause |

Suggested operator surfaces (unchanged from the old client doc):

| Situation | Surface to operator |
|-----------|---------------------|
| `unauthorized` | "Projection key rejected — check settings." No silent retry. |
| `plan_not_found` | "That service is no longer available." Offer to reload the list. |
| Empty `plans` list | "No upcoming services published." Not an error. |
| Network failure, cache present | Project from cache; show "Offline — showing last saved copy." |
| Network failure, no cache | Clear retry prompt; never show a blank projector. |

---

## 8. Rate limits

**60 requests per minute per key**, across both endpoints. Exceeding it returns
`429 rate_limited`; back off for at least 30 seconds. A normal operator flow (list →
pick → fetch → occasional refresh) uses a handful of requests per service, so the limit
only bites scripted polling. Do not poll on a timer faster than once a minute.

Every request is also logged server-side (key, endpoint, plan ID, timestamp) for the
church's CCLI usage reporting and abuse detection.

---

## 9. Client obligations (CCLI-licensed content)

Lyrics are copyright works licensed to the church under CCLI SongSelect. The projection
app must:

1. **Display attribution.** Show each song's `author`, CCLI number and `copyright`
   line (when present) on at least the first slide of the song, or on a per-song
   attribution slide. Use `sourceSongs` — a medley needs every song's attribution.
2. **No bulk export.** Fetch only what the operator is preparing to project. Don't
   mirror the whole window on a schedule.
3. **Cache responsibly.** Cache setlists locally so projection survives Wi-Fi loss
   (that remains the #1 rule), but: encrypt the cache at rest if practical (e.g.
   AES-GCM keyed from the API key via HKDF), purge cached setlists after ~7 days,
   and clear the cache when the API key changes.
4. **Keep lyrics out of logs.** Never write lyrics, song payloads, or the API key to
   console logs or crash reporters. Log IDs, counts and error codes only.
5. **Synthetic fixtures only.** Test fixtures committed to any repository must use fake
   titles, placeholder lyrics and a fake CCLI number (e.g. `TEST-0000`) — never real
   API responses.

---

## 10. Versioning & forward compatibility

- Every response carries `"apiVersion": 1`.
- **Additive** changes (new optional fields, new `type` values) can appear at any time
  within v1 — ignore unknown fields and tolerate unknown enum values.
- **Breaking** changes ship under a new path (`…/v2/plans`); v1 keeps working until the
  client migrates.
- Fields are never removed or repurposed within a version.

---

## 11. Quick test with curl

```bash
KEY="lscp_paste-key-here"
BASE="https://<project-ref>.supabase.co/functions/v1/projection-api"

# upcoming published services
curl -s -H "Authorization: Bearer $KEY" "$BASE/plans" | jq

# lyrics for one service
curl -s -H "Authorization: Bearer $KEY" "$BASE/plans/<plan-id>/lyrics" | jq

# auth failure (expect 401)
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/plans"
```

---

## 12. Changes from the earlier draft spec

If you built against `LSCRoster-Projection-API.md` / `Mac-Projection-Client.md`:

| Old | New |
|-----|-----|
| Vercel `/api/services?date=…` per-date query | Supabase `{BASE}/plans` — fixed −10/+60 day window, no date parameter |
| `/api/services/{id}/setlist` | `{BASE}/plans/{planId}/lyrics` |
| One static shared `PROJECTION_API_KEY` | Per-device revocable keys (`lscp_…`), generated in the LSCroster Settings UI |
| `songKey` | `key` (override-aware), plus `bpm`, `meter`, `arrangement` |
| — | `lyricsVersion` per song (pinned at publish time) |
| — | `sourceSongs[]` with per-song `author`/`ccli`/`copyright` (medley-aware) |
| `sections[].type` small enum, `label` always set | Larger `type` vocabulary (§6), `label` nullable |
| No rate limiting | 60 req/min per key, `429 rate_limited` |
| `ccli`/`author` at song level | Moved into `sourceSongs[]` |

The client architecture from the old Mac doc — Keychain for the key, fetch-then-cache,
project from local copy, `generatedAt` "last refreshed" label — carries over unchanged.

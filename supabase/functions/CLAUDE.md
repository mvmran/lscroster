# Edge Functions — LSCroster

## Scheduled jobs (reminders, nudges, roster-status digest)

Reminders: an hourly `pg_cron` job (`lscroster-reminders`, created in migration 0004) calls the `reminders` Edge Function via `pg_net`, reading the function URL and a shared secret from **Vault** (`reminders_function_url`, `reminders_cron_secret`); the function checks the `x-cron-secret` header against its `CRON_SECRET` env. It runs three jobs off the one hourly schedule: at the **9am** hour (church timezone) it nudges unanswered requests after `church_settings.request_nudge_days` and reminds confirmed people `reminder_days_before` days out (idempotent via `nudged_at`/`reminded_at`); at the **8pm** hour it emails the "upcoming roster status" digest (issue #117) to Team Leaders, Team Viewers and admins (a plain `leader` only qualifies if also a TL/TV), covering `church_settings.roster_status_weeks` weeks ahead and scoped to each recipient's teams (admins see all). A `0` setting disables that job. An admin can run any job on demand from Settings → Scheduled jobs ("(send now)"), which calls the `run-scheduled-job` function (admin-only); it POSTs the `reminders` function `{ force: true, only: <job> }` in the background. No new cron/Vault secret — it reuses the existing hourly job and `CRON_SECRET`. The digest's pie chart is rendered by **QuickChart.io** (an `<img>` whose URL encodes only the aggregate category counts — no personal data — because email clients can't render inline SVG reliably); the RAG-coloured table is the authoritative data and stands alone if the image is blocked.

## generate-meaning + lyrics-assist (optional, per instance)

Drafts the English **meaning** layer of a song from its native script, for the
lyrics editor. Needs `manage_songs` (admins and coordinators hold it implicitly),
mirroring the `has_permission('manage_songs')` policy on
`song_arrangement_lyrics`.

Entirely optional: the feature is enabled by the presence of `GEMINI_API_KEY`.
The client asks once per session with `{ probe: true }`, which answers
`{ configured }` without calling the model, and hides the button when false — so
a church that never sets the key sees the editor it always had. Two callers: the
Meaning pane's draft link, and the lyrics import dialog, which drafts a meaning
for a paste that brought native script without one (`withGeneratedMeaning`), so
an import fills all three layers at once. `GEMINI_MODEL`
overrides the default `gemini-3.5-flash-lite`.

Calls Google's **Interactions API** (`/v1beta/interactions`, `x-goog-api-key`),
not the legacy `generateContent`, with `generation_config.thinking_level:
'minimal'` — this model cannot disable thinking outright, and a line-by-line
gloss gains nothing from it. Structured output (`response_format` with an
array-of-strings schema) is requested so the reply parses as JSON.

**The line-parallel invariant is enforced server-side, not trusted:**
`alignToLines` forces the model's array back to exactly one entry per input
line, blank where the source line was blank. A model that miscounts would
otherwise shift a song's layers permanently out of step. `extractText` reads
only `model_output` steps — a response can also carry the `user_input` step, and
taking every text block prepends the prompt to the answer.

Nothing is written to the database: the draft goes into the editor buffer and is
saved by a human like any other edit.

**`lyrics-assist`** is the same contract for three more jobs, chosen by a `task`
field: `transliteration` (polish the offline romanisation — the model sees both
the native script and the draft, and `alignTransliteration` falls back to the
draft line, never to nothing, so the worst case is "unchanged"), `tags` (suggest
library tags; `normalizeTags` respells a suggestion the way the church already
spells it and drops what the song has), and `sections` (label paragraphs Verse 1
/ Chorus / Bridge; `alignLabels` validates every label against the shared header
grammar, because these strings are written into a person's lyrics as header
lines). Its own `{probe:true}` answers `{configured}` — deploy it before the
bundle that calls it, or the probe fails closed and the buttons stay hidden.

The wire-level plumbing for all three lives in `_shared/gemini.ts` (endpoint,
key, `extractText`, `parseStringArray`, and the two ask helpers — `askForStrings`
for the lyrics jobs, `askForObject` for a structured object — both throwing
`GeminiError` with the status the handler should answer; `askModel` takes the
model, `thinkingLevel` (`minimal`|`low`|`medium`|`high`) and schema so a
reasoning caller can raise both). Pure helpers and their Deno tests are in
`_shared/meaning.ts`, `_shared/lyrics-assist.ts` and `_shared/song-suggest.ts`.

## suggest-song (optional, per instance)

On a plan's "Add a song" box, suggests the next song to add. Same optionality
and probe as the lyrics helpers (`GEMINI_API_KEY` switches it on; `{probe:true}`
answers `{configured}`; deploy before the bundle or the button stays hidden),
but gated on **`edit_order_of_service`**, not `manage_songs` — it adds to a plan,
not a song. It **writes nothing**: it returns one `songId` the client adds
through the ordinary RLS-gated add-song path.

Unlike the line-gloss lyrics jobs this is a reasoning task — musical key fit
(prefer a song that works in or near the plan's current keys *even without a
matching-key arrangement*, and say so in `keyNote`), the church's past song
groupings (from `song_plan_usage`), and the plan's language balance (tags may
name a language). So it asks a stronger model at a higher thinking level:
**`GEMINI_SUGGEST_MODEL` (default `gemini-3.5-flash`), `thinkingLevel: 'medium'`**
— independent of `GEMINI_MODEL`, which the cheap lyrics jobs use.

The handler assembles the context server-side (plan songs, candidate library
songs minus those on the plan and minus the client's rejected ids, and recent
plan groupings), capped at 300 candidates / 40 history plans to bound the
prompt. `parseSuggestion` validates the model's pick is a real, offered
candidate — a hallucinated or excluded id yields a 422, never a phantom song.
**Rejected songs are remembered client-side** (localStorage keyed by plan id, in
`use-song-suggest.ts`): rejects survive closing the dialog and a reload but reset
for a different plan, and every Suggest press sends the accumulated list so the
model skips them.

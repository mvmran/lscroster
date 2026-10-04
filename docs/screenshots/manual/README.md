# Manual screenshots

Images for [docs/USER-MANUAL.md](../../USER-MANUAL.md). Referenced from the
manual relative to that file, e.g. `screenshots/manual/dashboard.png`.

Follow the same rules as [../README.md](../README.md): shoot from a demo-data
instance (`npm run db:demo`) in light mode, 2× device pixel ratio, so **no real
person's details are ever published**. Full screens ~1280×800, phone shots
~390×844. Name each file after what it shows (`dashboard.png`, `plan.png`,
`matrix.png`, `respond-phone.png`, …) and keep each under ~300 kB.

Embed in the manual with alt text, and a caption via `<figure>`:

```markdown
<figure>
  <img src="screenshots/manual/plan.png" width="720"
       alt="A published plan with the order of service and running clock">
  <figcaption><em>Figure 6.3 — Building the order of service.</em></figcaption>
</figure>
```

Re-shoot after a significant UI change, keeping the same filename so the manual
doesn't drift from the app.

The manual also uses the five shared shots in [../](../README.md)
(`dashboard`, `plan`, `matrix`, `request-phone`, `settings-church`). These are
its own:

| File | Figure | What it shows |
| --- | --- | --- |
| `accept-invite-phone.png` | 3.1 | The invitation (set password) page, phone width |
| `sign-in.png` | 3.2 | The sign-in page |
| `people.png` | 5.1 | The People list, as an admin |
| `person.png` | 5.2 | A person page on a wide screen |
| `new-plan.png` | 6.2 | The New plan dialog |
| `publish-gate.png` | 6.6 | "Publish with errors?" |
| `song-layers.png` | 7.3 | An arrangement with the Chord layer open beside the lyrics |
| `plan-people.png` | 8.1 | A plan's People card, every status, the ⋯ menu open |
| `conditional-rule.png` | 8.4 | The conditional rule builder |
| `my-schedule-phone.png` | 9.2 | My Schedule, phone width |
| `email-prefs.png` | 10.5 | The Email preferences card |
| `notice-board-phone.png` | 12.12 | The Notice Board card on Home, phone width |
| `manage-notice-board.png` | 14.6 | Settings → Manage notice board |

Shot on 2026-10-05 from a throwaway local stack (its own project id and ports, so
it never touches the everyday local database) loaded with `demo-data.sql`, plus a
few extras for the shots: an admin login, a draft roster showing every status, a
blockout, chords on Amazing Grace, an unaccepted invitation and two notices.

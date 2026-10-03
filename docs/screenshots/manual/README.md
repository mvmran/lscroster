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

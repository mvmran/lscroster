<!--
  LSCroster — User Manual (SKELETON)
  ----------------------------------
  This is a structural skeleton to fill in. It mirrors the organisation of a
  reference field manual: a cover block, a notice, a contents list, a
  "If you want… go to" quick-reference, numbered chapters with decimal
  subsections, task walkthroughs, and an appendix (glossary / roles /
  troubleshooting / document control).

  HOUSE CONVENTIONS for whoever fills this in:

  • Screenshots — put image files under docs/screenshots/manual/ and reference
    them RELATIVE TO THIS FILE, e.g.  ![Alt text](screenshots/manual/plan.png)
    Give a caption with the <figure> form (see the example in §4.2). Shoot from
    a demo-data instance in light mode (see docs/screenshots/README.md) so no
    real person's details are ever published. See "Embedding screenshots" at the
    very bottom of this file for the full how-to.

  • Callouts — use blockquotes with a bold lead word:
      > **Note** — context the reader should keep in mind.
      > **Tip** — a faster way to do something.
      > **Warning** — something that can't be undone, or will email people.

  • Cross-references — write "see §5.4" and link it to the heading anchor, e.g.
    [§5.4](#54-roles-permissions-and-team-access). GitHub makes an anchor from
    each heading: lower-case, spaces→hyphens, punctuation dropped.

  • Roles — where a feature is limited to a role, mark it inline:
    "**(Admins & coordinators)**". The three roles are Member, Coordinator, Admin.

  • Delete this comment block and every _(placeholder …)_ line as you write.

  The final "graphic look and feel" (branded cover, page headers/footers, fonts,
  the dot-leader contents) is applied when this Markdown is rendered to PDF or a
  web page — see "Producing the PDF" at the bottom. The Markdown holds the
  content and the structure; the renderer gives it the house style.
-->

<div align="center">

# LSCroster

### User Manual &amp; Guide

Worship &amp; service planning for your church — plan services, schedule teams,
and respond to requests from your phone.

**Version _v1.0.x_**  ·  _Month YYYY_

_Your Church Name_  ·  _your-instance.example.org_

<!-- Replace with your church logo once you have one in the repo:
     <img src="screenshots/manual/logo.png" width="160" alt="Church logo"> -->

</div>

---

## Notice — about this manual

_(placeholder: one short paragraph. Who this manual is for, which version of
LSCroster it describes, and that screens may differ slightly as the app is
updated. Note that LSCroster is open-source and each church runs its own copy,
so some settings in this manual are decided by your church's administrator.)_

> **Note** — Screenshots in this manual were captured on a demonstration
> instance with sample data, so no real member's details appear. Your own
> screens will show your church's people, teams and plans.

---

## Contents

**Front matter**
- [Notice — about this manual](#notice--about-this-manual)
- [How this manual is organised](#how-this-manual-is-organised)
- [If you want… go to](#if-you-want-go-to)

**Chapters**
1. [Introduction &amp; Overview](#1-introduction--overview)
2. [Key Concepts](#2-key-concepts)
3. [Getting Started](#3-getting-started)
4. [Navigation &amp; Interface](#4-navigation--interface)
5. [People](#5-people)
6. [Services &amp; Plans](#6-services--plans)
7. [Songs &amp; Lyrics](#7-songs--lyrics)
8. [Scheduling &amp; Rostering](#8-scheduling--rostering)
9. [Responding to Requests](#9-responding-to-requests)
10. [Emails &amp; Notifications](#10-emails--notifications)
11. [Reports &amp; Records](#11-reports--records)
12. [Common Tasks (step-by-step)](#12-common-tasks-step-by-step)
13. [Tips &amp; Good Practice](#13-tips--good-practice)
14. [Administration &amp; How It Works](#14-administration--how-it-works)
15. [Appendix](#15-appendix)
    - [A. Glossary](#a-glossary)
    - [B. Roles &amp; permissions reference](#b-roles--permissions-reference)
    - [C. Troubleshooting &amp; FAQ](#c-troubleshooting--faq)
    - [D. Quick reference](#d-quick-reference)
    - [E. Document control](#e-document-control)
    - [F. About this manual](#f-about-this-manual)

---

## How this manual is organised

_(placeholder: 1 short paragraph. Suggested wording — "Read chapters 3 and 4
first: chapter 3 gets you signed in, chapter 4 maps the screens. Chapter 12 is
step-by-step walkthroughs for the jobs you actually do week to week. The rest is
reference, by feature. Your role — member, coordinator or admin — decides which
parts apply; role-only features are marked.")_

## If you want… go to

_(placeholder: fill the right column with section links as you write. This table
is the fastest way in for a busy reader — keep it.)_

| If you want to… | Go to |
| --- | --- |
| Sign in for the first time | [Chapter 3](#3-getting-started) |
| Install LSCroster on my phone | [§3.3](#33-installing-lscroster-on-your-phone) |
| See this week's plan | [§4.2](#42-the-home-dashboard) |
| Respond to a scheduling request | [Chapter 9](#9-responding-to-requests) |
| Set the dates I'm unavailable | [§9.4](#94-blockouts-and-email-preferences) |
| Plan this Sunday's service | [§12.2](#122-plan-this-sundays-service) |
| Schedule a team and send requests | [§12.3](#123-schedule-a-team-and-send-out-requests) |
| Add a song with lyrics | [§12.5](#125-add-a-new-song-with-lyrics) |
| Roster a whole month quickly | [§12.6](#126-roster-a-month-in-the-matrix) |
| Invite a new person | [§12.9](#129-invite-a-new-member) |
| A word I don't recognise | [Glossary](#a-glossary) |
| Something isn't working | [Troubleshooting](#c-troubleshooting--faq) |

---

# 1. Introduction &amp; Overview

## 1.1 What LSCroster is
_(placeholder: 1–2 paragraphs. What the app does in plain terms — plan services,
schedule teams, send and answer requests. Mention it replaces spreadsheets /
group chats for rostering.)_

## 1.2 Who it's for
_(placeholder: the three audiences and what each mostly does — Members respond to
requests and keep their profile; Coordinators plan services and roster teams;
Admins manage people, settings and the whole instance. Point to
[§B](#b-roles--permissions-reference).)_

## 1.3 How your church runs it
_(placeholder: each church runs its own private copy; data is not shared between
churches; your admin controls church-wide settings. Keep this short.)_

## 1.4 A few words used throughout
_(placeholder: 4–6 key terms readers meet immediately — Plan, Service type, Team,
Position, Blockout, Scheduling request. One line each. Full list in the
[Glossary](#a-glossary).)_

## 1.5 What LSCroster does — and what it doesn't
_(placeholder: a short two-column table of in-scope vs out-of-scope, so
expectations are set. e.g. in: service planning, rostering, songs, email
requests; out: giving, check-ins, SMS.)_

---

# 2. Key Concepts

## 2.1 People, roles and permissions
_(placeholder)_

## 2.2 Service types and plans
_(placeholder)_

## 2.3 Teams and positions
_(placeholder)_

## 2.4 Songs, arrangements and lyrics
_(placeholder)_

## 2.5 Scheduling requests, blockouts and responses
_(placeholder)_

---

# 3. Getting Started

## 3.1 Accepting your invitation
_(placeholder: the invitation email → set a password → you're in. Figure: the
invitation email / set-password screen.)_

## 3.2 Signing in and setting your password
_(placeholder: the sign-in screen; the show/hide password eye; resetting a
forgotten password. Figure: sign-in.)_

## 3.3 Installing LSCroster on your phone
_(placeholder: it's a web app — "Add to Home Screen" on iPhone/Android for an
app-like icon. Most members use it on a phone.)_

## 3.4 Your profile and photo
_(placeholder: editing your own contact details and photo.)_

## 3.5 A quick tour of the home screen
_(placeholder: a labelled screenshot of the dashboard. Figure: dashboard.)_

---

# 4. Navigation &amp; Interface

## 4.1 Main layout and menu
_(placeholder: the sidebar / sections. Figure: the main layout with the menu.)_

## 4.2 The Home / Dashboard

_(placeholder: "This week" and "My upcoming dates". Replace the figure below with
a real screenshot — this is the example of the figure form to copy elsewhere.)_

<figure>
  <img src="screenshots/manual/dashboard.png" width="720"
       alt="The LSCroster home screen showing this week's plan and my upcoming dates">
  <figcaption><em>Figure 4.2 — The home screen: this week's plan and your upcoming dates.</em></figcaption>
</figure>

## 4.3 What you see by role
_(placeholder: a note that menus and buttons differ by role; forward-reference
[§B](#b-roles--permissions-reference).)_

## 4.4 Searching and filtering
_(placeholder: searching people/songs/plans; filters.)_

## 4.5 Light and dark mode
_(placeholder)_

---

# 5. People

## 5.1 The people directory
_(placeholder)_

## 5.2 Viewing a person
_(placeholder)_

## 5.3 Adding and inviting people **(Admins &amp; coordinators)**
_(placeholder)_

## 5.4 Editing contact details and photo
_(placeholder)_

## 5.5 Roles, permissions and team access **(Admins &amp; coordinators)**
_(placeholder)_

## 5.6 Archiving and managed accounts
_(placeholder)_

## 5.7 Importing people from a spreadsheet (CSV) **(Admins)**
_(placeholder)_

---

# 6. Services &amp; Plans

## 6.1 Service types
_(placeholder)_

## 6.2 Creating and duplicating a plan
_(placeholder)_

## 6.3 Building the order of service
_(placeholder: add headers / songs / items; drag to reorder; the running clock.
Figure: plan page.)_

## 6.4 Plan times (rehearsal and service)
_(placeholder)_

## 6.5 Attachments and notes
_(placeholder)_

## 6.6 Draft vs published
_(placeholder: members only see published plans; what publishing emails.)_

## 6.7 Stepping through plans (prev / now / next)
_(placeholder)_

---

# 7. Songs &amp; Lyrics

## 7.1 The song library
_(placeholder)_

## 7.2 Arrangements and keys
_(placeholder)_

## 7.3 Lyrics, chords and multi-lingual layers
_(placeholder)_

## 7.4 Importing lyrics and AI help
_(placeholder: only appears if your church has enabled AI help.)_

## 7.5 Song usage and CCLI
_(placeholder)_

---

# 8. Scheduling &amp; Rostering **(Coordinators &amp; team schedulers)**

## 8.1 Scheduling people into positions
_(placeholder)_

## 8.2 Blockouts and conflicts
_(placeholder: how blockouts and double-booking are flagged when you schedule.)_

## 8.3 Sending requests and the Matrix view
_(placeholder: the weeks × positions grid. Figure: matrix.)_

## 8.4 Minimum counts and conditional rules
_(placeholder)_

## 8.5 AI song suggestions and roster helpers
_(placeholder: only if enabled by your church.)_

---

# 9. Responding to Requests

## 9.1 From the email link (no login needed)
_(placeholder: the Accept / Decline buttons in the email → the public respond
page. Figure: respond-phone.)_

## 9.2 In the app — My Schedule
_(placeholder)_

## 9.3 Accepting, declining and changing your answer
_(placeholder: you can change your answer until the service date.)_

## 9.4 Blockouts and email preferences
_(placeholder)_

---

# 10. Emails &amp; Notifications

## 10.1 Invitations and account access
_(placeholder)_

## 10.2 Scheduling requests and reminders
_(placeholder)_

## 10.3 Published-plan and set-list emails
_(placeholder)_

## 10.4 The roster-status digest
_(placeholder)_

## 10.5 Your email preferences
_(placeholder)_

---

# 11. Reports &amp; Records

## 11.1 Song usage reports
_(placeholder)_

## 11.2 Email log **(Admins)**
_(placeholder)_

## 11.3 Audit log **(Admins)**
_(placeholder)_

## 11.4 Printing and PDF run sheets
_(placeholder)_

---

# 12. Common Tasks (step-by-step)

> **Tip** — These are the jobs you do week to week. Each is a short numbered
> walkthrough. Skim [§12.1](#121-how-to-use-these-walkthroughs) once, then jump
> to the one you need.

## 12.1 How to use these walkthroughs
Each walkthrough uses the same shape (modelled on the reference manual's
"playbooks"): a one-line **Who / When**, a **Start here**, numbered **Steps**, a
**You should see** check, and a callout for anything easy to get wrong. Copy the
shape in §12.2 for every task below.

## 12.2 Plan this Sunday's service

**Who / When.** _(placeholder: e.g. Coordinators, when preparing an upcoming service.)_

**Start here.** _(placeholder: e.g. Services → pick the service type → **Create plan**.)_

**Steps.**

1. _(placeholder step)_
2. _(placeholder step)_
3. _(placeholder step — add a screenshot at the key step, see the figure form in §4.2)_

**You should see.** _(placeholder: the plan's order of service with the running
clock, saved as a draft.)_

> **Tip** — _(placeholder: a shortcut, e.g. "Duplicate last week's plan instead
> of starting from scratch.")_

> **Warning** — _(placeholder: anything that emails people or can't be undone,
> e.g. "Publishing a plan can email the whole team — check it first.")_

## 12.3 Schedule a team and send out requests
_(placeholder)_

## 12.4 Respond to a request from your phone
_(placeholder)_

## 12.5 Add a new song with lyrics
_(placeholder)_

## 12.6 Roster a month in the Matrix
_(placeholder)_

## 12.7 Publish a plan and email the set list
_(placeholder)_

## 12.8 Set up a new team and its positions
_(placeholder)_

## 12.9 Invite a new member
_(placeholder)_

## 12.10 Grant someone a permission or team access
_(placeholder)_

## 12.11 Find a replacement when someone declines
_(placeholder)_

---

# 13. Tips &amp; Good Practice

## 13.1 Sunday-morning-proofing
_(placeholder: big touch targets, confirm the plan is published, etc.)_

## 13.2 Keeping the directory tidy
_(placeholder: archive vs delete; managed accounts for family.)_

## 13.3 Working on a phone
_(placeholder)_

## 13.4 Data, privacy and who can see what
_(placeholder: contact details visibility, notes, draft rosters.)_

---

# 14. Administration &amp; How It Works **(Admins)**

## 14.1 Church settings and branding
_(placeholder: name, logo, timezone, accent colour.)_

## 14.2 Permission templates and deletion safety
_(placeholder)_

## 14.3 Backups
_(placeholder: point to [docs/BACKUPS.md](BACKUPS.md).)_

## 14.4 How LSCroster is built (one page)
_(placeholder: a plain-language architecture overview for the curious admin.)_

## 14.5 Upgrading and self-hosting
_(placeholder: point to [docs/SETUP.md](SETUP.md) and [docs/UPGRADE.md](UPGRADE.md).)_

---

# 15. Appendix

## A. Glossary

_(placeholder: fill in the definitions. Seeded from the app's own terminology.)_

| Term | Meaning |
| --- | --- |
| Service type | A recurring gathering, e.g. "Sunday 10am". |
| Plan | One dated instance of a service type, with an order of service and scheduled people. |
| Plan item | A row in the order of service: a header, a song, or a generic item, with a length. |
| Order of service | The ordered list of items that make up a plan. |
| Team | A group people serve on, e.g. Worship, Media. |
| Position | A role within a team, e.g. Acoustic guitar, Sound. |
| Blockout | A date range when a person is unavailable. |
| Scheduling request | A pending assignment a person accepts or declines. |
| Draft / Published | A plan members can't see yet vs one they can. |
| Role | Member, Coordinator, or Admin — sets what a person can do. |
| Permission | A specific job a member can be granted (e.g. manage songs). |
| Team access | A per-team grant: Viewer, Scheduler, or Manager. |
| Arrangement | A version of a song (its key, tempo, lyrics). |
| Managed account | A profile one person looks after on another's behalf (e.g. a child). |

## B. Roles &amp; permissions reference

_(placeholder: who can do what. Expand to match your instance; the app itself is
the source of truth — see docs/ACCESS-CONTROL.md for the authoritative list.)_

| Capability | Member | Coordinator | Admin |
| --- | :---: | :---: | :---: |
| View plans they're on, respond to requests | ✅ | ✅ | ✅ |
| Manage own profile &amp; blockouts | ✅ | ✅ | ✅ |
| Plan services, manage songs &amp; teams | — | ✅ | ✅ |
| Grant permissions &amp; team access | — | ✅ | ✅ |
| Church settings, people admin, everything | — | — | ✅ |

> **Note** — Individual members can also be *granted* specific jobs (e.g. manage
> songs, publish plans) without being a coordinator. See [§5.5](#55-roles-permissions-and-team-access).

## C. Troubleshooting &amp; FAQ

_(placeholder: grow this from real questions.)_

| Problem | What to try |
| --- | --- |
| I didn't get my invitation email | Check spam; ask an admin to resend it. |
| The Accept/Decline link says it expired | You can still respond in the app under My Schedule. |
| I can't see a plan | Members only see **published** plans and plans they're scheduled on. |
| A button I expect isn't there | It may be limited to your role — see [§B](#b-roles--permissions-reference). |

## D. Quick reference
_(placeholder: optional — a one-page cheat sheet of the most common actions.)_

## E. Document control

| Field | Value |
| --- | --- |
| Manual version | _v0.1 (draft)_ |
| Describes app version | _v1.0.x_ |
| Last updated | _YYYY-MM-DD_ |
| Maintainer | _name / role_ |

## F. About this manual
_(placeholder: how this manual is produced and how to suggest changes.)_

---

<!--
================================================================================
 AUTHORING NOTES — delete this whole block before publishing the manual.
================================================================================

EMBEDDING SCREENSHOTS IN MARKDOWN
---------------------------------
Basic image (alt text in the brackets, path in the parentheses):

    ![Home screen with this week's plan](screenshots/manual/dashboard.png)

• The path is RELATIVE TO THIS FILE. This file is docs/USER-MANUAL.md, so
  `screenshots/manual/dashboard.png` means docs/screenshots/manual/dashboard.png.
• Always write alt text (the part in [ ]) — it's read aloud by screen readers and
  shows if the image fails to load.

Caption + controlled width — plain Markdown images can't be sized or captioned,
so use a small HTML <figure> (works on GitHub and in most renderers):

    <figure>
      <img src="screenshots/manual/plan.png" width="720"
           alt="A published plan with the order of service and running clock">
      <figcaption><em>Figure 6.3 — Building the order of service.</em></figcaption>
    </figure>

• width is in pixels; pick ~720 for a full screen, ~320 for a phone screenshot.
• For a phone shot, a narrow width keeps it from dominating the page.

Where the files live — keep manual screenshots in docs/screenshots/manual/ (make
the folder). Follow docs/screenshots/README.md: shoot from a demo-data instance
in light mode, 2× pixel ratio, so no real person appears. Name files after what
they show (dashboard.png, plan.png, matrix.png, respond-phone.png, …) and keep
each under ~300 kB.

How it renders:
• GitHub / VS Code preview — shows the images inline; <figure> works.
• PDF / web export — see "Producing the PDF" below.

THE "GRAPHIC LOOK AND FEEL" (from the reference manual, adapted to LSCroster)
----------------------------------------------------------------------------
The reference manual's visual signature, element by element — reproduce these in
the renderer (below), not in this Markdown:

• Cover — dark (near-black) full-bleed page: a small-caps kicker ("USER MANUAL ·
  GUIDE"), a very large wide-tracked bold product name, an accent-coloured
  subtitle, thin horizontal rules, a centred hero graphic, and accent-coloured
  metadata (version, date, church) low on the page.
• Interior pages — white background with a DARK running header band (product
  name in the accent colour on the left, "User Manual & Guide" in grey on the
  right) and a DARK footer band (version · church · handles left, page number
  right).
• Tables are the workhorse — bordered two-column tables with a shaded header row
  and roomy padding ("Term | Meaning", "If you want… | Go to", "Tab | Function").
• Screenshots are floated figures with a caption line "Fig. N — …" underneath.
• Structured prose uses bold inline-lead labels (**Question.** **Steps.** **You
  should see.**) rather than many sub-headings.
• Callout boxes — a tinted panel with a left accent border for a Tip/Warning.

USE LSCROSTER'S OWN BRAND, not the reference's green. LSCroster's accent is its
indigo/violet (the app's `--brand-hue`, 278 by default — see src/index.css).
Swap the cover hero for the church logo, and use the indigo for the kicker,
rules, header name, table header tint and callout border.

PRODUCING THE PDF / WEB PAGE
----------------------------
The Markdown holds content + structure; a renderer applies the cover, bands,
fonts and the dot-leader contents. Options, simplest first:

• Pandoc → PDF:   pandoc docs/USER-MANUAL.md -o lscroster-manual.pdf \
                    --toc --toc-depth=2 -V geometry:margin=2.5cm
  (A LaTeX engine such as TeX Live gives the nicest result; an --include-in-header
   .tex or a reference .docx carries the cover, bands and accent colour.)
• Pandoc → styled HTML:  pandoc docs/USER-MANUAL.md -o manual.html --toc -s -c manual.css
  (A single manual.css can reproduce the whole look above; easiest to iterate on.)
• VS Code "Markdown PDF" extension, or print the GitHub preview to PDF, for a
  quick draft with no styling.
-->

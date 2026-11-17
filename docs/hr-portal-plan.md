# HR Portal — plan

A separate portal inside Resumetrics where a hiring manager describes a job opening, uploads resumes
for it, and sees every resume scored and ranked against that opening. Nothing else.

## 1. Scope

**In scope**
- HR sign-in with email and password only (no Google), plus "Explore the demo": a private sample workspace per visitor.
- Job openings: create, edit, delete.
- Resumes inside an opening: upload many at once (PDF, DOCX, TXT), score, rank, view the breakdown, remove one.
- Plan: 2 job openings free; unlimited on Hiring Pro (subscription).

**Out of scope (deliberately not built)**
- Candidate stages, notes, ratings, emails to candidates, comparisons, CSV export, interview scheduling,
  team members, AI chat, resume editing. Nothing from the candidate app appears in the portal.

## 2. Routes

| URL | Screen | Access |
|---|---|---|
| `/hr/login` | HR sign-in | public |
| `/hr` | Overview | HR session |
| `/hr/openings` | All job openings | HR session |
| `/hr/openings/new` | Describe a new job | HR session |
| `/hr/openings/:id` | Opening: upload + ranked resumes | HR session |
| `/hr/openings/:id/edit` | Edit the job description | HR session |
| `/hr/plan` | Plan & billing | HR session |

The candidate login page gets one small link: "Hiring? Sign in to the HR portal".
An HR session never opens the candidate app, and a candidate Google session never opens the HR portal.

## 3. Authentication

- `POST /api/hr/auth/login { email, password }` → `{ token, account }`.
- Accounts sign up through the portal (password stored as a salted scrypt hash). An optional login can also come
  from `RESUMETRICS_HR_EMAIL` / `RESUMETRICS_HR_PASSWORD` in `server/.env.local`. There is no built-in password.
- `POST /api/hr/auth/demo` opens a private demo workspace (`hrdemo_…` account seeded from `server/hr/demoFixture.json`,
  made-up people only, free plan, small AI allowance), deleted after 24 hours or on sign-out. (Until 2026-11-17 the demo
  was one shared login, which let every visitor see and change what others uploaded.)
- `POST /api/hr/auth/logout` raises the account's session version, ending its tokens on every device;
  `PUT /api/hr/account/password` does the same and returns a new token.
  (Firebase Auth refuses passwords shorter than 6 characters, so HR sign-in is checked by our server, not Firebase.)
- The token is an HMAC-SHA256 signed session (`payload.signature`), valid 12 hours.
  Secret: `RESUMETRICS_SESSION_SECRET` (server/config/secrets.js), else derived from the Firebase service-account key;
  a production server with neither refuses to sign. Each token carries the account's session version (`ver`).
- Comparison is constant-time; failed sign-ins are rate-limited per IP (10 per 15 minutes).
- The browser keeps the token in `localStorage` (`resumetrics.hr.session`) and sends `Authorization: Bearer …`.
  Sign out clears it. A 401 from any HR call returns to `/hr/login`.
- `GET /api/hr/auth/me` confirms the session when the portal loads.

## 4. Data (Firestore, server-only via Admin SDK; client rules stay closed)

```
hrAccounts/{hrId}                      hrId = "hr_" + sha256(email)[0..24]
  email, createdAt
  plan: { tier: 'free' | 'pro', status, term, currentPeriodEnd }
  openingsCreated: number              lifetime count; deleting does not give a slot back

hrAccounts/{hrId}/openings/{openingId}
  title, employmentType, location, minYears, education,
  mustHave[], niceToHave[], description, keywords[], responsibilities[],
  candidateCount, createdAt, updatedAt

hrAccounts/{hrId}/openings/{openingId}/candidates/{candidateId}
  fileName, resumeData (structured, normalised), parsedBy: 'ai' | 'basic', createdAt
```

Resume files themselves are not stored; only the structured data read from them.
Scores are never stored: they are computed from the opening + resumeData on every read,
so editing an opening re-ranks every resume immediately and for free.

## 5. Plans

| | Free | Hiring Pro |
|---|---|---|
| Job openings | 2 (lifetime) | Unlimited |
| Resumes per opening | 50 | 50 |
| Price | ₹0 | ₹999 / month or ₹9,599 / year |

- Defined once in `shared/hrPlans.js` (prices are placeholders, change them there).
- Server enforces: creating a 3rd opening on Free → `403 { code: 'plan_limit' }` inside a transaction.
- The portal shows "x of 2 openings used" and an upgrade prompt when the limit is hit.
- Payments are not wired yet (same as the candidate Pro plan): Upgrade shows "Checkout opens soon".
  A webhook will later write `hrAccounts/{hrId}.plan`.
- The 50-resume cap protects the AI budget; it is the same on both plans.

## 6. How a resume is scored — and against what

Every resume is scored **only against the job opening it was uploaded to**, using the requirements the
HR wrote when describing that job:

| Opening field | Used for |
|---|---|
| Must-have skills | Skills score (each counts double) |
| Nice-to-have skills | Skills score (each counts once) |
| Job title + responsibilities | Experience relevance (does each past role match this job?) |
| Minimum years | Experience score (years ÷ required, capped at 100%) |
| Education requirement | Education score (degree level and field) — only when given |
| Description keywords | Keywords score (how much of the posting's language the resume covers) |

Pipeline for each file:
1. Browser reads the file text (existing `extractResumeDocument`: PDF, DOCX, TXT).
2. Server turns the text into structured resume data with the existing AI extractor
   (`extractCompleteResumeDocument`). If the AI is busy the client waits the reported time and retries;
   if the AI fails, the basic text parser is used and the resume is marked "Basic read".
3. `shared/hrScoring.js` wraps the existing deterministic `scoreResumeAgainstJd` and weights it for hiring:

| Category | Weight | What it measures |
|---|---|---|
| Skills | 50% | Must-haves ×2 + nice-to-haves ×1 found anywhere in the resume (synonyms understood: JS = JavaScript) |
| Experience | 30% | Relevance of the best roles to the title/duties (80%) + years vs minimum (20%) |
| Education | 10% | Meets the stated degree level and field (skipped and re-weighted if none stated) |
| Keywords | 10% | Posting keywords found, extra credit when they appear in the summary or latest role |

Match bands: **Strong** ≥ 75 · **Good** 60–74 · **Fair** 40–59 · **Weak** < 40.
Every number is explainable: the breakdown lists each must-have found or missing, each role's relevance,
the years counted and the education check. The score ranks; the HR decides. Nothing is rejected automatically.

## 7. Sidebar

```
[R] Resumetrics  HIRING
────────────────────────
  + New opening           (primary button)
  ▸ Overview
  ▸ Job openings      (2)
  ▸ Plan & billing
────────────────────────
  Free plan · 1 of 2 openings used
  Priya Shah · Corp
  Sign out
```

## 8. Screens

**Sign-in (`/hr/login`)** — split screen. Left: ivory panel with a ranked-list illustration and
"Hire from evidence, not guesswork." Right: email, password, Sign in. Demo hint below the form.
No Google button.

**Overview (`/hr`)**
- Header: "Good morning" + date, "New opening" button.
- Four figures: Open roles · Resumes evaluated · Strong matches · Openings left (Free) / Unlimited (Pro).
- Openings table: title, type · location, resumes, best score, strong matches, created → opens the opening.
- Empty state: three numbered steps (Describe the job → Upload resumes → Read the ranking).

**Job openings (`/hr/openings`)** — the full list as cards, plus the plan counter; Free accounts at the limit see
an upgrade note instead of the New button.

**Describe a job (`/hr/openings/new`, `/edit`)** — a single form:
- Job title*, Employment type (Full-time / Part-time / Internship / Contract), Location.
- Job description (textarea) with "Pull requirements from description" (existing `extractJd`) that fills
  the skill lists and keywords; HR can then edit them.
- Must-have skills* and Nice-to-have skills as tag inputs (Enter to add, × to remove).
- Minimum years of experience, Education requirement.
- Right column: "Resumes will be scored against" — a live preview of the weights and requirements.

**Opening (`/hr/openings/:id`)**
- Header: title, meta, Edit, Delete.
- Requirements strip (what the scoring uses).
- Upload zone: drop or choose up to 50 files; a queue shows each file Reading → Scoring → Done / Failed,
  with "waiting for AI capacity (30s)" when throttled.
- Ranked table: #, candidate (name + headline), score + band, Skills / Experience / Education / Keywords bars,
  must-haves met (4/6), years, missing must-haves. Sortable by score, name and years.
- Clicking a row opens a right-side panel: contact, overall score dial, category bars with weights,
  must-have and nice-to-have checklist, experience relevance per role, education check, keywords found/missing,
  file name and read method, "Remove resume".

**Plan & billing (`/hr/plan`)** — usage meter, Free vs Hiring Pro cards (monthly/yearly toggle), Upgrade →
"Checkout opens soon".

## 9. Look

Deliberately unlike the candidate app (cool grey + violet, dark navy rail, sans headings):
warm ivory paper (`#f5f1e8`), deep forest-green ink accent (`#1e4d3b`), a light sidebar ruled with hairlines,
Instrument Serif headings, tabular figures for scores, square-ish 6px corners, no shadows beyond a hairline.
Scoped under `.hr-app` so neither app's styles leak into the other.

## 10. Code

```
shared/hrPlans.js                 plan limits + prices + isHrPro
shared/hrScoring.js               opening → jd, weights, bands, scoreCandidate
server/hr/hrAuth.js               credentials, signed session tokens, requireHr
server/db/hrStore.js              accounts, openings, candidates (createHrStore({ getDb }))
server/routes/hr.routes.js        /api/hr/* (auth, openings, candidates, account)
server/index.js                   mounts /api/hr
src/hr/                           HrApp (routes + guard), hrApi.js, HrLogin, HrLayout (sidebar),
                                  HrOverview, HrOpenings, HrOpeningForm, HrOpening, CandidatePanel, HrPlan, hr.css
src/main.jsx                      one route: /hr/* → HrApp
tests/hrScoring.test.js, tests/hrStore.test.js, tests/hrRoutes.test.js
```

API

| Method | Path | Does |
|---|---|---|
| POST | `/api/hr/auth/login` | sign in |
| GET | `/api/hr/auth/me` | account + plan + usage |
| GET | `/api/hr/openings` | list with resume counts and best scores |
| POST | `/api/hr/openings` | create (plan-limited) |
| GET | `/api/hr/openings/:id` | opening + ranked candidate summaries |
| PUT | `/api/hr/openings/:id` | edit (re-ranks automatically) |
| DELETE | `/api/hr/openings/:id` | delete with its resumes |
| POST | `/api/hr/openings/:id/candidates` | read + store one resume, return its score |
| GET | `/api/hr/openings/:id/candidates/:cid` | full breakdown |
| DELETE | `/api/hr/openings/:id/candidates/:cid` | remove one resume |

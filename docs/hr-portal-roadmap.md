# HR portal — next features (for review)

Status: proposal. Nothing here is built until approved.

## What the research says matters

- Screening tools are expected to **rank, but leave the decision to a person**, and to **show why** a resume scored
  as it did. A recruiter should be able to record their own decision (and why they overrode a ranking).
- **Must-haves vs nice-to-haves** should be separate, and hard requirements work best as filters the recruiter
  chooses, not silent auto-rejects.
- **Blind screening** (hiding name, contact, photo, location) is the most common bias control.
- Dashboards work as a **summary first, then drill-down**, with the common actions a click away.

## Phase 1 — Decide faster (the core screening loop)

| # | Feature | UX |
|---|---|---|
| 1.1 | **Decision per resume**: New / Shortlisted / Rejected | Buttons in the breakdown panel and on each row; optional one-line reason on reject; counts in the opening header |
| 1.2 | **Filter bar** above chart + table | Status chips (All · New · Shortlisted · Rejected), "Meets all must-haves" toggle, minimum score slider, search by name or skill. Chart and table show the same filtered set |
| 1.3 | **Next / previous** in the breakdown panel | Arrow buttons and ← → keys walk the ranking without closing the panel; deciding moves to the next "New" resume |
| 1.4 | **"Why this score" line** | One plain sentence at the top of the breakdown, e.g. "Meets 5 of 5 must-haves, 6.3 years against 2+, strong match in latest role" |

## Phase 2 — Fair and explainable

| # | Feature | UX |
|---|---|---|
| 2.1 | **Blind mode** toggle per opening | Names become "Candidate 4"; contact, location, links and institution names hidden in table, chart and panel until a decision is made |
| 2.2 | **Evidence for each skill** | In the breakdown, each found must-have shows the resume line it was found in |
| 2.3 | **Adjustable weights** per opening | Sliders for Skills / Experience / Education / Keywords (always total 100%), live re-rank, "Reset to default" |

## Phase 3 — Handle volume

| # | Feature | UX |
|---|---|---|
| 3.1 | **Duplicate check on upload** | Same email or same file skipped with "Already in this opening" in the upload list |
| 3.2 | **Bulk actions** | Select rows (or drag a box on the chart) → Shortlist / Reject / Remove |
| 3.3 | **Compare side by side** | Pick 2–3 resumes → columns of scores, must-haves, experience, education |
| 3.4 | **Export shortlist** | CSV of shortlisted candidates with scores and contact details |
| 3.5 | **Opening status** | Open / Closed; closed openings are read-only and listed separately |

## Phase 4 — Overview that guides the day

| # | Feature | UX |
|---|---|---|
| 4.1 | **Needs attention** | Openings with unreviewed ("New") resumes first, with the count |
| 4.2 | **Pipeline per opening** | Small bar: uploaded → reviewed → shortlisted |

## Data changes

- `candidates/{id}`: add `status` ('new' | 'shortlisted' | 'rejected'), `reason`, `decidedAt`, `fileHash`.
- `openings/{id}`: add `blind` (bool), `weights` (optional override), `status` ('open' | 'closed').
- New routes: `PATCH /openings/:id/candidates/:cid` (decision), `POST /openings/:id/candidates/bulk`, `GET /openings/:id/export.csv`.
- Scoring stays deterministic and computed on read; custom weights feed `weightsFor()`.

## AI key: shared or separate?

Groq rate limits apply to the **organization**, not the key: a second key in the same Groq account shares the same
requests/tokens per minute and the same spend cap. A new key therefore adds no capacity; only a separate organization
(or a paid tier) does.

Recommendation:
1. **Keep sharing the one key for the OJT demo**, but give the HR portal its own lane in the server's AI budget
   (e.g. HR bulk uploads may use at most half the per-minute tokens), so 50 resumes uploaded at once can't make the
   candidate app wait. Small code change in `server/ai/providerBudget.js` + the HR route.
2. Add an optional `RESUMETRICS_HR_AI_API_KEY` that falls back to the main key, so a separate (paid) organization
   can be plugged in later without code changes. Check Groq's terms before opening extra free accounts.

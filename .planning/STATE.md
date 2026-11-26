# State

**Updated:** 2026-10-06
**Milestone:** M2.4: Cover letters (PLAN-033 executed; signed-in walkthrough and letter evals pending). M2.3 (PLAN-027…032) done, signed-in checks pending
**Latest plan:** PLAN-033 (done, see `CURRENT.md`; next plan slot is PLAN-034).
**Position:** M2 (PLAN-008…017) and M2.1 simplicity pass (PLAN-020…025) executed; see phase SUMMARY files. Remaining: user-run AI evals, signed-in walkthrough, commit. Next milestone: M3 ATS scoring.

## Done
- PLAN-000 routing; PLAN-001 editor shell; PLAN-002 style engine; PLAN-003 format panel + undo/zoom; PLAN-004 AI rail; PLAN-005 section form; PLAN-006 PDF export; PLAN-007 clean-up. See each phase's `SUMMARY.md`.
- Everything is on branch `ui-redesign-phase-2`, **not committed**.

## Decisions
- D1: Rails resize coupled — left + right width is constant, so the resume width never changes (PLAN-001).
- D2: Formatting is element-level in M1; no word-level rich text inside a bullet (PLAN-002).
- D3: All manual and AI style edits go through `resumeEditingEngine` (PLAN-002).
- D4: No Share button, no "Saved" indicator, no element-position align or shadow effects — they would not work (PLAN-003, FMT-12).
- D5: NIMBUS and Job match share the left rail through a switch; evidence is a collapsed dock at the bottom (PLAN-004).
- D6: Form page has two containers (form left, resume centre); font/style controls live in the editor (PLAN-005).
- D7: PDF export via the browser print path for exact, selectable output — accepted by user (PLAN-006).
- D8 (user, 2026-10-04): Continue to editor is **blocked** until all mandatory fields are filled; the warning links to sections with missing fields highlighted red (FORM-10).
- D9 (user, 2026-10-04): Form back arrow → templates if untouched, otherwise confirm discard; no settings panel on the form page (FORM-11).
- D10: Partly filled sections keep the "+" button; it becomes "Edit section" only when complete.
- D11: Required sections are Personal information, Summary, Education, Skills; Experience is optional so students without jobs can finish (PLAN-005 summary).
- D12 (M2 plan): Workspace state moves into a store above the routes, persisted to sessionStorage, before any evidence work (PLAN-008).
- D13 (M2 plan): "AI training" = per-task prompts, strict schemas, few-shot examples, fact guard and a golden-set eval harness; no fine-tuning of hosted models (PLAN-011).
- D14 (M2 plan): JD fixes and NIMBUS share one validated operation set, so "Execute" and NIMBUS edits go through the same applier and undo (PLAN-012/014).

## M2 answers (user, 2026-10-04)
- D15: PLAN-018 is the **LinkedIn** profile PDF.
- D16: Language % = share of bytes of code, repo count alongside.
- D17: Scan only the **25 most recently pushed** repos, and say so in the UI ("Only your 25 most recent repositories are scanned").
- D18: Formatting works on highlighted words within a sentence **and** on whole elements.
- D19: Never auto-shrink. Overflow flows to page 2 below (scroll). If a user asks NIMBUS to fit to one page and that would need text below a readable size, NIMBUS warns instead of shrinking further.
- D20: Download ~100 open-licence font families and commit them.
- D21: Larger Groq model allowed for NIMBUS/JD if evals show it is better.
- D22: "Add evidence" returns to the editor for now.

## M2.1 decisions (user, 2026-10-05)
- D23: Comparison is **GitHub only**. LinkedIn is a third way to start a resume ("Import from LinkedIn"): parse → templates → editor. Supersedes D15/PLAN-018 compare.
- D24: NIMBUS edits **content only** (deepen summary, add education item, rename…). Styling is manual. Supersedes NIMBUS style ops, mood option cards and NIMBUS fit-to-one-page (D19's NIMBUS part).
- D25: NIMBUS UI = Bloub cloud (follows cursor, animates per state) + rainbow-shine wordmark + plain chat (user messages in translucent bubbles) + a shimmering current-task line above the composer. Nothing else.
- D26: Job match = chat box + ring + missing line + fixes with Execute.
- D27: UI simplicity first: one button system, no filters in the font dropdown, no redundant descriptions/icons.

## Blockers / notes
- Groq rate limits (429) hit during testing; the eval harness makes many calls, so the user runs it.
- Protected routes need Google sign-in, so `MainPage` was not run end to end by automation. Fixtures: `tests/editor-studio.html` and `tests/scratch-builder.html` (serve with `npm run dev`).
- Web search was blocked in the planning session; GSD conventions here come from prior knowledge. GSD's own commands are not installed (see `SKILLS.md`).
- `graft` index not rebuilt (CLI fails on this Windows setup per the handoff).

## M2.3 decisions (user, 2026-10-05)
- D28: Clone six supplied LaTeX résumés on the shared renderer (PLAN-027); Simple Hipster is rebuilt in place (same id).
- D29: Skills are user-defined groups for every profession; the form targets WCAG 2.2 AA (PLAN-028).
- D30: Job match moves to its own Job tailoring page with the live resume beside it; the editor rail becomes NIMBUS-only (PLAN-029).

## M2.4 decisions (planned 2026-10-06, user may veto before execution)
- D31: Sidebar Job tailoring / Cover letters / Evidence check never navigate: they open a "Select a resume first" pop-up over the current page, with the page blurred (user, 2026-10-06; supersedes the first reading as a separate page). For now it asks to start or import a resume and lists the resume in this session; later it lists saved resumes (`ResumePicker` takes an array). A direct visit to a tool without a resume goes to the start page with the pop-up open.
- D32: One cover letter per resume, following its template: 24 templates → 5 layout families using each template's real masthead (PLAN-033).
- D33: Once added, the cover letter is page 1 of the document (editor, PDF, DOCX/TXT).
- D34: The letter is edited in its own studio; the resume editor shows it as a page with Edit/Remove.
- D35: Signature import removes the background to transparent and recolours the ink, so it matches any paper colour; no draw/type signature yet.
- D36: NIMBUS edits letters content-only with letter-specific operations, prompt, fact guard and evals; asks instead of inventing company facts.
- Note: Web research for PLAN-033 used the ResumeWay guide (no downloadable images on the page; the four user references are the visual source). `graft` CLI still fails on this machine (missing tree-sitter-kotlin native build), so the graph was read from source.

## M2.4 outcome (2026-10-06)
- PLAN-033 executed: gate, letter on all 24 templates, studio with Details/Format, signature import, NIMBUS letter engine, add-to-resume as page 1, exports. D31–D36 were applied as planned (user did not veto).
- Graft: the global CLI was upgraded to 0.21.1 (`npm i -g @nanonets/graft@latest --ignore-scripts`). `tree-sitter-kotlin` has no Windows prebuild and no Visual Studio build tools are installed, so `dist/graph/extract.js` in the global install was patched to load Kotlin lazily (backup `extract.js.orig`; re-apply after any reinstall). `graft init --no-agents --no-global` re-wired Claude Code; it also deleted `AGENTS.md`/`GEMINI.md`/other agent files, which were restored from git. `graft build` indexes 137 files. Use `graft init` without `--no-agents` if agent files should be refreshed. Graft sends anonymous usage stats unless disabled (`graft telemetry disable`).
- Open: signed-in walkthrough (gate, add to resume, PDF/Word/TXT export); `npm run ai:eval -- --task letter`; per-template visual review of the 13 templates not viewed individually.

## M2.5: NIMBUS guide (PLAN-034, 2026-11-26)
- D37: D24 is reversed for the resume: NIMBUS changes design, sections and spacing through validated operations. The cover letter stays content-only (D36).
- D38: Open-ended requests get a `suggest` list; each item is ready (operations, no AI on press), deferred (one focused turn on press) or a question. NIMBUS never answers an open-ended ask with a question.
- D39: Removals of entries, sections, skills and links only happen from an arrow press (or an exact request). Whole sections are hidden (`presentation.sections.hidden`), never deleted. Limits: 40% of bullets, half of entries, never the only entry or bullet.
- D40: Operations that change or remove existing text carry `expect`; stale items say so instead of overwriting.
- D41: Page spacing is `presentation.layout` (density + sectionGap / itemGap / pageMargin multipliers), rendered through CSS variables, also in the format panel.
- D42: Typing is a client effect (~480 characters a second; skipped with reduced motion or a click).
- D43: Local checks (`shared/resumeLint.js`) are free and unlimited, feed the strength score, deterministic fixes and the prompt.
- D44: Free: everything conversational plus the top 3 quick fixes and 20 NIMBUS turns a day. Pro: Apply all, every quick fix, guided tools (add numbers, tone, tailor, smart one page, template advice), 150 AI actions a day. Enforced on the server (`server/routes/nimbus.routes.js`).
- D45: Per-item undo replays the list from its starting snapshot without that item; refused (Ctrl+Z instead) if the page was edited by hand since.

---
version: 2.0
name: Resumetrics Evidence Studio
description: A calm, precise resume studio where every claim looks provable — cool paper surfaces, one confident accent, and proof shown as first-class UI.
colors:
  # Accent is user-selectable (Settings → Appearance). Violet is the default; the
  # other shades (ocean, emerald, rose, sunset, graphite) swap the same seven slots.
  accent: "#5b45e4"          # --accent
  accent-light: "#6c58f2"    # --accent-light  (gradients, illustrations)
  accent-strong: "#5340dc"   # --accent-strong (hover / pressed)
  accent-ink: "#4f3fbb"      # --accent-ink    (accent text on pale fills)
  accent-soft: "#efecff"     # --accent-soft   (chips, selected rows)
  accent-softer: "#f7f5ff"   # --accent-softer (secondary hover)
  accent-border: "#d4ccff"   # --accent-border (secondary outline)
  canvas: "#f6f7fb"          # app background
  surface: "#ffffff"         # panels, inputs, cards
  ink: "#172033"             # primary text
  ink-muted: "#697386"       # helper copy, metadata
  ink-faint: "#9aa4b5"       # counters, placeholders
  line: "#e6e9f0"            # panel borders
  line-soft: "#edf0f5"       # internal dividers
  field-line: "#dfe3eb"      # input borders
  sidebar: "#111828"         # app navigation rail
  success: "#15803d"         # verified evidence, saved, passing checks
  success-soft: "#e3f4e9"
  warning: "#b45309"         # weak / unverified claims, partial matches
  warning-soft: "#fdf1e1"
  danger: "#b42318"          # validation errors, destructive actions
  danger-soft: "#fdecea"
  dark-canvas: "#111827"
  dark-surface: "#1a2336"
  dark-field: "#121a2b"
  dark-line: "#303a52"
  dark-ink: "#edf1ff"
  dark-ink-muted: "#aab5ca"
typography:
  display:
    fontFamily: "Google Sans Flex"
    fontSize: "clamp(34px, 4.6vw, 62px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.045em"
  display-lede:              # landing page only
    fontFamily: "Instrument Serif"
    fontSize: "clamp(27px, 3.3vw, 46px)"
    fontWeight: 400
    fontStyle: italic
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline-lg:               # page titles
    fontFamily: "Google Sans Flex"
    fontSize: "clamp(27px, 3.1vw, 41px)"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.045em"
  headline-md:               # panel titles
    fontFamily: "Google Sans Flex"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline-sm:               # settings / dialog titles
    fontFamily: "Google Sans Flex"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body-lg:                   # marketing paragraphs
    fontFamily: "Google Sans Flex"
    fontSize: "clamp(15.5px, 1.35vw, 18px)"
    fontWeight: 400
    lineHeight: 1.65
  body-md:                   # studio default
    fontFamily: "Google Sans Flex"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Google Sans Flex"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  label-lg:                  # marketing CTAs
    fontFamily: "Google Sans Flex"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1
  label-md:                  # studio buttons, form labels
    fontFamily: "Google Sans Flex"
    fontSize: "13.5px"
    fontWeight: 650
    lineHeight: 1
  label-sm:
    fontFamily: "Google Sans Flex"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1
  caption:
    fontFamily: "Google Sans Flex"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.45
  metric:                    # scores, counts, stats
    fontFamily: "Google Sans Flex"
    fontSize: "clamp(26px, 4vw, 48px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.06em"
    fontVariantNumeric: tabular-nums
rounded:
  xs: 6px      # tags, small badges
  sm: 8px      # inputs, small buttons, nav items
  md: 10px     # buttons, score cards, list cards
  lg: 14px     # panels
  xl: 18px     # hero cards, modals, sheets
  full: 999px  # chips, pills, avatars, status dots
spacing:
  2xs: 4px
  xs: 8px
  sm: 12px
  md: 18px     # default gap between panels
  lg: 24px     # panel padding
  xl: 32px
  2xl: 48px    # section rhythm in the app
  3xl: 72px    # section rhythm on marketing pages
elevation:
  flat: "none"
  panel: "0 8px 24px rgba(23, 32, 51, .035)"
  raised: "0 12px 32px rgba(23, 32, 51, .08)"      # menus, popovers
  overlay: "0 24px 64px rgba(23, 32, 51, .18)"     # modals, sheets
  focus: "0 0 0 3px rgba(var(--accent-rgb), .3)"
motion:
  fast: ".15s ease"
  base: ".2s ease"
  emphasis: ".5s cubic-bezier(.2, .8, .2, 1)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
    shadow: "0 4px 12px rgba(var(--accent-rgb), .28)"
  button-primary-marketing:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 22px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent-ink}"
    borderColor: "{colors.accent-border}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    borderColor: "#f2d1ce"
    rounded: "{rounded.md}"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label-sm}"
    padding: "0"
  panel:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.lg}"
    shadow: "{elevation.panel}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.field-line}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0 12px"
    focus: "{elevation.focus}"
  chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "5px 10px"
  evidence-badge:
    verified: { backgroundColor: "{colors.success-soft}", textColor: "{colors.success}" }
    partial: { backgroundColor: "{colors.warning-soft}", textColor: "{colors.warning}" }
    missing: { backgroundColor: "{colors.danger-soft}", textColor: "{colors.danger}" }
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "3px 8px"
  score-card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.md}"
    padding: "18px"
    valueTypography: "{typography.metric}"
---

# Resumetrics Evidence Studio

## Overview

Resumetrics is a resume builder that backs claims with evidence from GitHub, LinkedIn and coding profiles. The interface should feel **calm, precise and trustworthy**, like a well-lit editing studio rather than a marketing funnel. Users are anxious job seekers. The UI should lower that anxiety in two ways: keep the next step obvious, and show proof (verification status, match scores, evidence sources) as real interface, not decoration.

The resume itself is the content we're selling. Studio chrome stays quiet and neutral so the document is always the most important thing on screen.

Two density modes share one token set:

- **Marketing** (landing, pricing, login). Spacious, larger type (`body-lg`), 48px CTAs, 72px section rhythm.
- **Studio** (dashboard, editor, form, evidence, jobs). Compact, 13–14px body, 36px controls, 18px panel gaps.

## Colors

- **Accent (`--accent`).** The single action colour. It's used for primary buttons, active navigation, focus rings, selected states and links. Users can switch it between six shades in Settings, so **always reference the CSS variable, never a hex value**. Resume templates keep their own palettes and never inherit the app accent.
- **Accent family (`-strong`, `-ink`, `-soft`, `-softer`, `-border`).** `-strong` is for hover and pressed states. `-ink` is for accent-coloured text on pale fills, because it has better contrast than `--accent`. `-soft` is for chips and selected rows, `-softer` for secondary hovers, `-border` for secondary outlines.
- **Canvas (#F6F7FB) and Surface (#FFFFFF).** A cool, slightly blue off-white canvas with white panels on it. This tonal step is the main depth cue in the app.
- **Ink (#172033).** A deep slate, not pure black, for all primary text. **Ink-muted (#697386)** is for helper copy and metadata. **Ink-faint (#9AA4B5)** is for counters and placeholders only, never for text someone needs to read.
- **Status colours (success, warning, danger).** These encode the evidence state of a claim: verified, partial or unverified, missing or invalid. They also cover save and validation feedback. Each one has a `-soft` fill for badges. Use them only to carry status, never as a decorative accent, and keep them visually below the accent.
- **Sidebar (#111828).** The dark navigation rail anchors the app shell. It is the one large dark surface in light mode.
- **Dark mode.** Uses the `dark-*` tokens through `[data-resolved-theme="dark"]`. The resume page itself always renders on white, because it is a printed document.

## Typography

**Google Sans Flex** is the only UI typeface. **Instrument Serif** (italic) is allowed only for the landing-page lede, where an editorial voice helps. It never appears in the studio.

Headlines use tight negative tracking (−0.025em to −0.045em) at semibold weights, which gives a confident, engineered feel that suits a metrics product. Body text stays at weight 400 with generous line height (1.6–1.65). Labels and buttons use weight 650 so actions read clearly without going bold-heavy.

Numbers are a big part of the brand: match scores, readiness, evidence counts. Render them with the `metric` style, using tabular figures and very tight tracking, and pair each one with a small muted label. Never show a score without saying what it measures.

Rules:

- **Use sentence case everywhere**: buttons, headings, labels and navigation. No all-caps labels, and no tracked-out uppercase eyebrows.
- Keep line length under about 75 characters. Use `text-wrap: balance` on headings and `pretty` on paragraphs.
- Hierarchy comes from size and weight, not colour. Don't highlight one word in a headline with a different colour or italic.

## Layout

- **App shell.** 240px sidebar plus fluid main content (max 1600px), with main padding of `clamp(24px, 4vw, 68px)`.
- **Marketing.** Max width 1200px, side padding `clamp(18px, 5vw, 72px)`, sections separated by whitespace (`3xl`) rather than dividers.
- **Spacing.** Use the `spacing` scale. 18px is the default gap between panels, 24px the default panel padding. Don't make up in-between values.
- **Responsive.** Single column below 700px with 18px gutters, and the sidebar becomes a sticky, horizontally scrolling nav. Nothing may scroll horizontally at phone width except deliberate rails.
- Group related panels in balanced columns. The editor uses canvas plus rail, the dashboard a card grid. Avoid dense, table-like walls of boxes.

## Elevation and depth

Depth comes from **tonal layering first** (white surface on cool canvas, a 1px `line` border), and from shadow only second.

- `panel`: a nearly invisible shadow that just lifts panels off the canvas.
- `raised`: menus, popovers, dropdowns.
- `overlay`: modals and sheets, always over a dimmed scrim.

Use one clear surface hierarchy per view. Don't put a raised card inside a panel inside a card. If an element needs a border and a shadow and a tinted fill to stand out, the layout is wrong.

## Shapes

Corners are soft but restrained. Use the `rounded` scale:

| Element | Radius |
| --- | --- |
| Tags, small badges | `xs` 6px |
| Inputs, small buttons, nav items | `sm` 8px |
| Buttons, score cards, list cards | `md` 10px |
| Panels | `lg` 14px |
| Hero cards, modals, sheets | `xl` 18px |
| Chips, pills, avatars, status dots | `full` |

Pill shapes (`full`) are for chips and status only. Buttons are never pills.

## Components

**Buttons** (`src/buttons.css`, the `.btn` system). There are five intents:

- **Primary.** Solid accent, white label. Use one per view or region: it is the next step.
- **Secondary.** White fill, accent-ink label, accent-border outline. For paired or alternative actions.
- **Ghost.** Transparent, muted label. For toolbars and low-priority actions.
- **Danger.** Red label on white that turns solid red on hover. Use it only for destructive actions, and always confirm.
- **Link.** Inline text action.

Buttons press 1px down on `:active`, never turn white on hover, and show a focus ring from `elevation.focus`. Marketing pages use the taller `button-primary-marketing` (48px) for the main conversion action. Pair it with at most one secondary action.

**Panels.** White surface, `line` border, `rounded.lg`, `panel` shadow, 24px padding. Panel titles use `headline-md`, and a single muted sentence underneath explains the panel's purpose.

**Inputs.** White field, `field-line` border, `rounded.sm`. Focus uses the accent border plus the soft focus ring, not a thick outline. Errors turn the border `danger` and show a one-line message below the field. Never colour the whole field red. Labels sit above fields in `label-md`.

**Chips.** Pale accent fill with accent-ink text, `rounded.full`. Use them for skills, keywords, filters and template tags. Keep them to one line. If there are more than about 12, collapse the rest into "+N more".

**Evidence badges.** These are specific to Resumetrics. Each badge combines a small status dot or icon with a short label ("Verified on GitHub", "Partial match", "No source"), styled in the matching status colour. Badges always say where the proof came from. Colour reinforces the label but is never the only signal.

**Score cards.** A metric value plus a label plus a single line of explanation. Use a progress ring or bar only when the score is a ratio. Show the change ("+12 since last scan") when there is history.

**Navigation.** Understated: label-sized text, muted until active. The active state uses a tinted surface, not a coloured underline. The accent appears in navigation only as a focus or active indicator.

**Trust markers (marketing).** Use concrete, checkable statements ("Connects to GitHub via a read-only app", "Exports ATS-friendly PDF"), each with a small success check. No invented testimonials, logos or user counts.

## Motion

- Interaction feedback uses `fast` (.15s). Panel and menu transitions use `base` (.2s).
- Allow one orchestrated entrance per page at most (the dashboard already has one). Don't add a fade-and-slide on every section.
- Motion should explain change: a score updating, an evidence item being verified, a section reordering.
- Always honour `prefers-reduced-motion: reduce` by removing transitions and transforms.

## Accessibility

- Text contrast must be at least 4.5:1, and 3:1 for large text and UI boundaries. For accent text on pale fills, use `accent-ink`, not `accent`.
- Every interactive element needs a visible `:focus-visible` state (`elevation.focus`).
- Status is never shown by colour alone. Always pair it with a label or icon.
- Hit targets are at least 36px in the studio and 44px on touch layouts.

## Do's and don'ts

- **Do** keep the resume page the brightest, most important thing on screen.
- **Do** keep the accent for actions, focus and selection, so it stays meaningful.
- **Do** show evidence and scores as real UI, with their sources and their meaning.
- **Do** use tonal layering and borders before reaching for shadows.
- **Do** use tokens and CSS variables. Never hard-code the accent hex.
- **Don't** use more than one primary button per region.
- **Don't** use all-caps or letter-spaced labels, or uppercase display headlines.
- **Don't** stack elevations or nest bordered boxes inside bordered boxes.
- **Don't** use status colours as decoration, or use the serif face in the studio.
- **Don't** let studio chrome compete with the document: no gradients, glows or saturated fills behind the editor.

## Marketing theme (landing page)

The landing page (`src/styles/landing-page.css`, scoped under `.lp`) has its own warm theme: a mustard hero, an ivory page (`--lp-paper`), and one violet-night band for NIMBUS. This is intentional. It gives the public page an editorial feel that is separate from the studio. Every other rule in this spec still applies there:

- anything you can press uses the app accent (`--lp-violet` maps to `--accent`)
- status uses the shared tokens (`--lp-green` maps to `--success`)
- headings are sentence case
- Instrument Serif appears in two places only: the hero line and the closing line

The `--lp-*` colours must never be used outside `.lp`.

## Implementation notes

- **Status colours** are CSS variables on `:root` in `src/styles.css`: `--success`, `--warning`, `--danger`, each with `-soft`, plus `--danger-strong` (solid fills, hover) and `--danger-border`. Dark-mode values sit under `[data-resolved-theme="dark"]`. Use them instead of hex values.
- **Buttons** all use `.btn` plus an intent class (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-link`). The older `.primary-button`, `.secondary-button` and `.quiet-button` classes have been removed.
- **Case exceptions.** Uppercase is allowed only where it is content, not styling: resume templates and resume miniatures (they are documents), hex colour values, and the NIMBUS wordmark.

## Provenance

This spec documents Resumetrics' existing identity: the user-selectable accent, Google Sans Flex, Instrument Serif lede, and `.btn` system. It also adopts general, widely used design-system practices from industry review: a token-first spec format, a semantic status palette, an explicit radius and spacing scale with usage rules, keeping the accent for actions, sentence-case typography, a single surface hierarchy, and separate marketing and studio densities. No competitor's name, typeface, palette values, copy, imagery or layouts are reused.

# Landing page — one colour family

## Problem

Scrolling the landing page today passes through unrelated hues:

| Section | Colour now |
|---|---|
| Nav, hero | mustard / honey gold (`#cf9f35`, `#f0c960`, `#ecd48f`), golden fibers, brown-black ink buttons |
| Page body | warm ivory paper (`#faf8f3`), warm brown text and lines |
| NIMBUS, Inside the app | lavender (violet) |
| Progress ring "done" | green |
| Screenshot frames | red / yellow / green window dots |
| Closing CTA | violet → peach → gold gradient, violet + gold + pink orbs |

Gold turns into violet halfway down, so the page reads as two brands.

## Decision

Use **one hue: the app's violet** (`--accent` `#5b45e4`, hue ≈ 250°). It is already the colour of every
screen after sign-in, the sign-in page backdrop and the HR portal, so the landing page leads straight into
the product. Everything else on the page is a tint or shade of that one hue; neutrals get a faint violet
tint instead of the warm brown/ivory.

### Scale

| Token | Hex | Use |
|---|---|---|
| violet-50 | `#f7f5ff` | page wash, hero highlight |
| violet-100 | `#efecff` | soft fills, hero mid |
| violet-200 | `#e3ddff` | hero edge, CTA gradient |
| violet-300 | `#d4ccff` | borders, outlines, inactive dots |
| violet-400 | `#a99bff` | fibers glow, orbs |
| violet-500 | `#7d6bff` | fiber lines, secondary accents |
| violet-600 | `#5b45e4` | primary buttons, rings, links (= `--accent`) |
| violet-700 | `#4b36d6` | hover, the "done" state |
| violet-900 | `#24197a` | deepest shade, CTA orb, headings accent |
| ink | `#161331` | text (violet-black) |
| ink-2 | `#363252` | secondary text |
| muted | `#625e7c` | helper text |
| line | `#e6e3f2` | rules and borders |
| paper | `#faf9ff` | page background |

### Section by section

- **Nav**: white glass; "Start free" in violet-600 with white text.
- **Hero**: radial wash violet-50 → violet-100 → violet-200; fibers in violet-500 / violet-400; ink headline;
  primary button violet-600, outline button violet-300 border.
- **Writer**: progress ring violet-600; when done it fills violet-700 (was green).
- **Stats**: ink numbers on paper, violet-tinted rules.
- **NIMBUS / Inside the app**: keep the lavender bands (already in family).
- **Screenshot frames**: window dots in violet-300 / 400 / 500.
- **Closing CTA**: violet-50 → violet-100 → violet-300 gradient; orbs violet-600, violet-900, violet-400.
- **Footer**: social buttons hover violet-700.

Contrast: ink `#161331` on paper/violet-50 ≈ 16:1; white on violet-600 ≈ 6.3:1; muted on paper ≈ 6:1.

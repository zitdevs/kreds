# Building with the Kreds design system

Kreds is **dark only, deliberately**: there is no light theme, and `styles.css`
paints the page `--color-bg` with `--color-ink` text for you. Design on the dark
ground; never put a Kreds component on a white surface.

## Setup

There is **no provider and no theme wrapper**. Every component is plain
presentational React, so import it and render it. Load `styles.css`; everything
else (tokens, the Geist faces, component CSS) is reachable from its `@import`
closure.

One API note that catches people: **`Button` is always a link.** It takes
`href`, never `onClick`. The same is true of the links inside `SiteHeader`,
`SiteFooter` and `Brand`.

## The styling idiom: Tailwind v4 utilities over semantic tokens

Style with utility classes built on **semantic colour names, never raw palette
values**. There is no `bg-slate-900` or `text-green-400` here: the whole colour
vocabulary is:

| Family   | Names                                                     |
| -------- | --------------------------------------------------------- |
| Surfaces | `bg`, `bg-elev`, `surface`, `surface-hi`                  |
| Lines    | `line`, `line-strong`                                     |
| Text     | `ink`, `ink-dim`, `ink-faint`                             |
| Accents  | `accent`, `accent-deep`, `accent-wash`, `amber`, `danger` |

Each composes with `bg-`, `text-`, `border-`, `ring-`, `fill-` and `stroke-`:
`bg-surface`, `text-ink-dim`, `border-line`, `text-accent`.

The rules that make it read as Kreds rather than generic dark mode:

- **`accent` (green) is for action and affirmation**: the primary button, the
  eyebrow label, checkmarks, links inside prose. Not for decoration.
- **`amber` is only ever a KRED number.** A currency figure, nothing else.
- **`danger` is debt and destruction.** Negative balances, removals.
- **Body copy is `text-ink-dim`, headings `text-ink`, captions `text-ink-faint`.**
- **`font-mono` marks machine facts**: counts, ledger rows, domains, eyebrow
  labels. Prose is `font-sans` (Geist).

Also shipped: `rounded-card` (the standard card radius), `grid-field` (the faint
grid backdrop), `text-gradient` (the fading headline treatment used in the hero),
and `animate-rise` / `animate-sheen`.

The ordinary Tailwind layout, spacing, sizing and type utilities are all
available, including their `sm:`/`md:`/`lg:`/`xl:`, `hover:` and `focus:` forms.
Colour utilities exist **only** for the token names above, and that restriction is
the point.

## Where the truth lives

- `_ds/<folder>/tokens/tokens.css`: every token, with the reasoning in comments.
- `_ds/<folder>/tokens/prose.css`: the `.prose` rules for long-form documents.
- `_ds/<folder>/styles.css`: the entry that pulls in tokens, fonts and component CSS.
- `components/<group>/<Name>/<Name>.d.ts` and `<Name>.prompt.md`: the exact props.

Read the real files before styling; they beat any summary here.

## An idiomatic build

```jsx
<Section
  eyebrow="How it works"
  title="Merged work becomes a leaderboard."
  lead="Kreds reads the events your team already produces."
>
  <div className="grid gap-4 sm:grid-cols-3">
    <div className="border-line bg-surface rounded-card border p-5">
      <Trophy className="text-accent h-5 w-5" />
      <h3 className="text-ink mt-3 text-sm font-semibold">Leaderboards</h3>
      <p className="text-ink-dim mt-2 text-sm leading-relaxed">Weekly, monthly and all-time.</p>
      <p className="text-amber mt-3 font-mono text-sm">+1,240 K</p>
    </div>
  </div>
  <Button href="#start" className="mt-8">
    Start the leaderboard
  </Button>
</Section>
```

`Section` supplies the page rhythm, the max-width column and the heading block,
reach for it before hand-rolling a section wrapper. `SiteHeader` and `SiteFooter`
are the page chrome. The `web` group holds whole kreds.sh sections (`Hero`,
`Pricing`, `Faq`, `LeaderboardShowcase`, …) which take no props and are the
fastest way to show a realistic Kreds page.

---
name: ui
description: >-
  Build UI components using shadcn/ui as a pattern reference for API design,
  accessibility, and interaction behavior. Do not add shadcn as a dependency.
---

# ui skill

When building interactive UI components (dialogs, popovers, dropdowns, tabs, etc.), use shadcn/ui source as a **pattern reference** — not as a dependency.

## File structure

```
./
├── SKILL.md                          # this file
└── references/                       # gitignored
    └── shadcn/                       # shallow clone of shadcn-ui/ui
        └── apps/v4/registry/new-york-v4/
            ├── ui/                   # component source (dialog.tsx, dropdown-menu.tsx, …)
            ├── hooks/                # composable hooks
            ├── lib/                  # utilities (cn, etc.)
            ├── examples/             # usage examples
            └── blocks/              # full-page compositions
```

## Reference material

The shadcn/ui source is available locally at `references/shadcn/` (gitignored). Key paths:

| Path                                                    | Contents               |
| ------------------------------------------------------- | ---------------------- |
| `references/shadcn/apps/v4/registry/new-york-v4/ui/`    | Component source files |
| `references/shadcn/apps/v4/registry/new-york-v4/lib/`   | Utilities (cn, etc.)   |
| `references/shadcn/apps/v4/registry/new-york-v4/hooks/` | Composable hooks       |

## Workflow

1. Identify the component to build (e.g. dialog, dropdown)
2. Read the shadcn source in `references/shadcn/apps/v4/registry/new-york-v4/ui/<component>.tsx`
3. Extract patterns (see table below)
4. Implement using our own design tokens and styling conventions
5. Do NOT add Radix, cva, or shadcn dependencies

## What to extract vs skip

| Take                                                | Skip                          |
| --------------------------------------------------- | ----------------------------- |
| Component API design (props, composition)           | Tailwind class strings        |
| Aria attributes and keyboard handling               | `cn()` / `cva()` utilities    |
| State management patterns (open/close, portals)     | Radix primitive dependencies  |
| Animation and transition approach                   | Their theming system          |
| Accessibility patterns (focus trap, screen readers) | Their specific file structure |

## Conventions

- Use our existing design tokens (see `src/` for current styling approach)
- Prefer native HTML elements (`<dialog>`, `<details>`) when they suffice
- Keep components minimal — only add features we actually need

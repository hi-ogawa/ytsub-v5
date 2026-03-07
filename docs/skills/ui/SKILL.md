---
name: ui
description: >-
  Build UI components following shadcn/ui patterns: Radix primitives for
  behavior, thin styled wrappers in src/components/ui/.
---

# ui skill

Build interactive UI components following the shadcn pattern: **Radix handles behavior, we handle styling**.

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

The shadcn/ui source is available locally at `references/shadcn/` (gitignored). If missing, clone it:

```sh
git clone --depth 1 https://github.com/shadcn-ui/ui.git references/shadcn
```

Key paths:

| Path                                                    | Contents               |
| ------------------------------------------------------- | ---------------------- |
| `references/shadcn/apps/v4/registry/new-york-v4/ui/`    | Component source files |
| `references/shadcn/apps/v4/registry/new-york-v4/lib/`   | Utilities (cn, etc.)   |
| `references/shadcn/apps/v4/registry/new-york-v4/hooks/` | Composable hooks       |

## Approach

shadcn components are thin styled wrappers around Radix primitives. We do the same, but strip down to only what we need:

1. **Use Radix** (`radix-ui`) for behavior (keyboard nav, focus management, aria, portals)
2. **Wrap with styling** using our design tokens in `src/components/ui/<component>.tsx`
3. **Strip down** — shadcn exports many sub-components we don't use. Only wrap/export what we need.
4. **Re-export when no styling needed** — if a Radix primitive needs no customization, re-export it directly instead of wrapping

### Example: `src/components/ui/dropdown-menu.tsx`

```tsx
// Re-export — no styling needed
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

// Wrap — applies our design tokens
function DropdownMenuContent({ className, sideOffset = 4, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={
          "z-50 min-w-[8rem] ... bg-popover ..." +
          (className ? ` ${className}` : "")
        }
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
```

## Workflow

1. Identify the component to build (e.g. dialog, popover)
2. Read the shadcn source in `references/shadcn/apps/v4/registry/new-york-v4/ui/<component>.tsx`
3. Identify which Radix primitives it uses
4. Decide per sub-component: **re-export** (no styling needed) or **wrap** (apply our tokens)
5. Only export what the app actually uses — skip checkbox items, radio groups, etc. until needed
6. Add a `// Reference:` comment at the top linking to the shadcn source file

## Conventions

- File names match shadcn: `dropdown-menu.tsx`, `dialog.tsx`, `popover.tsx`, etc.
- Component names match shadcn: `DropdownMenu`, `DropdownMenuContent`, etc.
- Components live in `src/components/ui/`
- Use our design tokens (see `src/styles.css`) — not shadcn's Tailwind classes
- No `cn()` utility — use string concatenation for optional className
- No `cva()` — use `data-[variant=...]` selectors for variants
- No `data-slot` — we don't use it; drop it when adapting from shadcn
- Keep components minimal — add sub-components as needed, not upfront

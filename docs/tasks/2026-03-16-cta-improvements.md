# Improve CTA Between Extension and Web App

## Problem

The extension and web app are two halves of the same product, but they barely acknowledge each other's existence in the UI. Users in one surface get almost no guidance about the other.

### Current state

| CTA               | From → To                                                           | Where                   |
| ----------------- | ------------------------------------------------------------------- | ----------------------- |
| Sign up link      | Extension login dialog → web `/register`                            | `bookmarks.tsx:226`     |
| "Sign in to sync" | Extension caption panel → opens extension bookmarks page            | `caption-panel.tsx:347` |
| Empty state text  | Web app bookmarks page: "Open a YouTube video and create bookmarks" | `bookmarks-page.tsx:48` |

That's it. Three CTAs total, and the empty state text doesn't even mention the extension.

### Gaps

1. **Web app → Extension**: Zero CTAs. No install link, no Chrome Web Store link, no explanation of what the extension does. A new user who lands on the web app (e.g. from the `/register` link) sees "Bookmarked Videos" with an empty state that says "open a YouTube video" — but has no idea they need an extension to do that.

2. **Extension → Web app**: Only the sign-up link in the login dialog. No explanation of _why_ you'd want a web account (cross-device access, mobile viewing). The sync menu item says "Sign in to sync" but doesn't explain the value proposition.

3. **Empty states lack guidance**: Both extension and web app show minimal empty states with no actionable next steps.

4. **Login/register pages are bare**: Just a form. No context about what Zamak is, why to sign up, or what signing in enables.

5. **No post-login guidance**: After registering via the extension's sign-up link, the user lands on the web app home page with zero videos and no guidance about what to do next (go back to the extension and sync).

## Design observations

Beyond CTAs, a few structural UX issues:

- **Web app login page has no product context**: `/login` and `/register` are just floating forms. A first-time user arriving from the extension sign-up link sees "Zamak — sign up" with no explanation of what Zamak is or why they'd want an account.
- **The web app has no public landing page**: Unauthenticated users go straight to `/login`. There's no place to explain the product, show screenshots, or link to the Chrome Web Store.
- **"Bookmarked Videos" heading** on the web app home assumes the user already has data. The PRD backlog notes this: "rework heading/framing — home page is just 'Videos'; empty state text assumes extension but web app uses import/sync."

## Login/register page design: split layout pattern

### Pattern: form + marketing side panel

A widely used SaaS pattern for login/register pages: the screen is split into two columns.

```
┌─────────────────────────┬─────────────────────────┐
│                         │                         │
│   (Brand / marketing)   │      (Login form)       │
│                         │                         │
│   - Product name/logo   │   Email: [________]     │
│   - Tagline             │   Password: [________]  │
│   - Screenshot or       │   [Log in]              │
│     illustration        │                         │
│   - Key value props     │   No account? Sign up   │
│   - Social proof        │                         │
│                         │                         │
└─────────────────────────┴─────────────────────────┘
```

**Left side** (marketing panel): brand-colored or dark background, product screenshot or abstract illustration, tagline, maybe 2-3 bullet points of value props. This is the "why" side.

**Right side** (form panel): clean white/neutral background, centered form with minimal fields. This is the "how" side.

On mobile, the marketing panel collapses — either hidden entirely or condensed to a small header above the form.

### Variations

| Variant            | Left side content              | Best for                                |
| ------------------ | ------------------------------ | --------------------------------------- |
| **Screenshot**     | Product UI screenshot          | Showing what the user gets after login  |
| **Illustration**   | Abstract/branded illustration  | Products without a visual-heavy UI      |
| **Testimonial**    | Customer quote + avatar        | Social proof for conversion             |
| **Value props**    | Icon + bullet list of features | Explaining the product to new signups   |
| **Gradient/brand** | Just brand colors + logo       | Minimal, when the product is well-known |

### Real-world examples

Products known to use this split-layout login pattern (visit their login pages to see current designs):

- **Supabase** (`supabase.com/dashboard/sign-in`) — dark left panel with brand gradient + product illustration, form on right
- **WorkOS** (`workos.com/login`) — left panel with brand illustration, clean form right
- **Pitch** (`pitch.com/login`) — left panel with product screenshot/illustration
- **Loops** (`loops.so/login`) — left panel with brand visuals
- **Clay** (`clay.com/login`) — dark left panel with product screenshot
- **Raycast** (`raycast.com/login`) — left panel with brand illustration
- **Dropbox** (`dropbox.com/login`) — left side illustration of person "signing in", form on right
- **Pocket** (`getpocket.com/login`) — left side shows app on multiple devices

These are well-known SaaS products; their exact designs may change over time, but the split pattern is stable.

### Design references

- [Untitled UI — Log in page components](https://www.untitledui.com/components/log-in-pages) — Figma component library with 12 login page layout variants including split layouts
- [Untitled UI — Sign up page components](https://www.untitledui.com/components/sign-up-pages) — matching signup variants
- [SaaSFrame — 60 SaaS Login UI Examples](https://www.saasframe.io/categories/login) — real SaaS product login screenshots (filterable, many show split layouts)
- [Dribbble — Split screen login](https://dribbble.com/search/split-screen-login) — design inspiration gallery
- [Mockplus — 50 Login Page Examples](https://www.mockplus.com/blog/post/login-page-examples) — curated examples with analysis

### Recommendation for Zamak

Use the **value props + extension CTA** variant:

```
┌─────────────────────────┬─────────────────────────┐
│                         │                         │
│   Zamak                 │      Log in             │
│   YouTube dual subs     │                         │
│   for language learners │   Username: [________]  │
│                         │   Password: [________]  │
│   ♦ Dual captions       │   [Log in]              │
│   ♦ Bookmark vocab      │                         │
│   ♦ AI-assisted study   │   No account? Sign up   │
│                         │                         │
│   [Get the extension]   │                         │
│   ↗ Chrome Web Store    │                         │
│                         │                         │
└─────────────────────────┴─────────────────────────┘
```

**Why this variant over screenshot/illustration:**

- Zamak's UI is a YouTube overlay — hard to show meaningfully in a small panel
- The primary CTA for new users is "get the extension", not "log in" — the left panel can carry this message
- No need to create/maintain illustration assets
- Value props + extension link serve as a lightweight landing page, solving the "no public surface" problem without a separate route

**Responsive behavior:**

- **Desktop (`lg`+)**: side-by-side, left panel ~40%, form ~60%
- **Mobile**: collapse the left panel entirely — just show the form with a minimal tagline ("Zamak — YouTube dual subs for language learners") above it. Rationale:
  - Users arriving on mobile at `/register` are almost certainly coming from the extension's sign-up link — they already know what Zamak is
  - Chrome extensions don't exist on mobile, so the "Get the extension" CTA is irrelevant
  - The web app's mobile value prop (view synced bookmarks on your phone) is already implied
  - Stacking both panels vertically forces users to scroll past marketing to reach the form — bad UX for a returning user on `/login`

**Implementation in `src/routes/login.tsx`:**

- Wrap existing form in a flex container
- Add left panel component (shared between login and register)
- Left panel content: product name, tagline, 3 bullet value props, Chrome Web Store link
- Use `hidden lg:flex` for responsive collapse

## Proposed improvements

### P1: Split-layout login/register pages (web app)

**File**: `src/routes/login.tsx`

Convert login and register pages to split layout:

- Left panel: product name, tagline, value props, Chrome Web Store extension link
- Right panel: existing form (unchanged)
- Responsive: left panel hidden on mobile
- Shared left-panel component between login and register

### P2: Web app empty state + extension install CTA

**File**: `src/components/bookmarks-page.tsx`

Replace the one-line empty state with a richer component that:

- Explains that videos come from the Chrome extension
- Links to the Chrome Web Store listing (or GitHub if not published yet)
- Mentions import as an alternative ("or import from a file")
- Differentiates messaging based on context (extension vs web app) — the `BookmarksPage` is shared, so accept an optional `emptyState` prop or use context

### P3: Extension sign-in value proposition

**File**: `src/extension/bookmarks.tsx`, `src/components/caption-panel.tsx`

When showing "Sign in to sync" or the login dialog, add a brief value prop:

- "Sign in to access your bookmarks on any device"
- Or a small subtitle under the "Sign in" menu item

### P4: Post-registration guidance on web app

**File**: `src/components/bookmarks-page.tsx` (empty state)

When the user is authenticated but has zero videos, show contextual guidance:

- "Go back to the extension and push your bookmarks to sync them here"
- Or: "Your bookmarked videos will appear here after syncing from the extension"

### P5: Extension bookmarks page → web app link

**File**: `src/extension/bookmarks.tsx`

Add a link to the web app in the extension header menu:

- "Open web app" menu item that opens the server URL in a new tab
- Only shown when authenticated (since the web app requires auth)

### Implementation approach

All changes are small, copy-focused UI tweaks in existing components. No new routes or architectural changes needed.

**Key files to modify**:

- `src/routes/login.tsx` — split layout with marketing panel
- `src/components/bookmarks-page.tsx` — empty state enhancement
- `src/extension/bookmarks.tsx` — web app link, sign-in value prop
- `src/components/caption-panel.tsx` — sync menu item subtitle

**Shared component concern**: `BookmarksPage` is used by both extension and web app. Empty state messaging needs to differ:

- Web app: "Install the extension to get started" + Chrome Web Store link
- Extension: "Open a YouTube video to get started"

Options: (a) pass `emptyState` ReactNode prop, (b) pass a `context: "extension" | "webapp"` prop. Option (a) is simpler and more flexible.

## Steps

1. Create shared left-panel component for login/register marketing side
2. Convert login/register pages to split layout
3. Add `emptyState` prop to `BookmarksPage` — render custom empty state per surface
4. Create web app empty state in `video-list.tsx` with extension install CTA + import mention
5. Create extension empty state in `extension/bookmarks.tsx` with "open a YouTube video" guidance
6. Add "Open web app" menu item to extension bookmarks header (authenticated only)
7. Add value prop text near "Sign in to sync" in caption panel
8. Verify with `pnpm tsc && pnpm lint && pnpm build && pnpm build-ext`

## Status

- Plan drafted, awaiting feedback

## Feedback log

(append here)

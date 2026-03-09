# Claude for Chrome — Gotchas

Findings from testing `window.__zamak` with Claude for Chrome (2026-03-10).

## JS tool output sanitizer

The JS execution tool scans **return values** for patterns resembling cookies or query strings and blocks them.

### What triggers it

- `?` characters (e.g. TypeScript optional fields `translation?`)
- `key=value` patterns with `;` or `&` separators
- Recursive — wrapping in an object doesn't help, the filter inspects individual string values within the object

`getSkillPrompt()` reliably trips it because SKILL.md contains code fences with `?`, `;`, `=` throughout. Purely a false positive.

### Workaround: console.log bypass

The filter only operates on JS tool return values. `console.log()` writes to the browser console buffer instead, which Claude reads via a separate `read_console_messages` tool with looser filtering.

```js
// Blocked — return value filtered
window.__zamak.getSkillPrompt(); // → [BLOCKED: Cookie/query string data]

// Works — goes through console buffer
console.log(window.__zamak.getSkillPrompt()); // → readable
```

This is why the API has `window.__zamak.log.*` methods — they wrap `console.log()` internally.

## console.log with objects

`read_console_messages` cannot read object arguments. `console.log("tag", obj)` comes through as `tag [object Object]`.

**Fix:** Use `JSON.stringify` with string concatenation, not comma-separated arguments:

```js
// Broken
console.log("ZAMAK:captions", array);

// Works
console.log("ZAMAK:captions " + JSON.stringify(array));
```

The `log.*` methods handle this internally.

## Behavioral fallback

When a JS call returns unexpected results (blocked, undefined, error), Claude escalates to screenshots, clicking, DOM reading, and typing to accomplish the goal. This is counterproductive for an API-only workflow.

**Mitigation:** Prompts must include both:

- Positive constraint: "Use ONLY `window.__zamak.*` methods"
- Negative enumeration: "No screenshots, no clicking, no typing, no DOM interaction"
- Explicit exit: "If any call fails, STOP and report"

One without the other is insufficient. These are embedded in `SKILL.md` under `## Rules`.

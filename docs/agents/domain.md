# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo: one `CONTEXT.md` plus `docs/adr/` at the repo root.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the project's domain glossary.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If either of these doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved. As of this writing `CONTEXT.md` does not exist yet; `docs/adr/` holds `0001-backend-stack.md`.

## File structure

```
/
├── CONTEXT.md            ← created lazily by /domain-modeling
├── docs/adr/
│   └── 0001-backend-stack.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (backend stack) — but worth reopening because…_

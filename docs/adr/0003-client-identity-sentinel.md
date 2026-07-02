# ADR 0003: Client identity stays the `'u-me'` sentinel; the server orients domain rows

Date: 2026-07-01
Status: superseded by ADR-0005

## Context

In API mode the client keeps `meId` as the constant sentinel `'u-me'` and
discards the signed-in user's real (Better Auth) id — `updateProfile` copies the
server profile's name/email/timezone into the local me-user but never its id
(`src/store/use-store.ts`, `src/app/login.tsx`, `src/app/_layout.tsx`). Server
domain rows (friendships now; pacts/check-ins/notifications later) are keyed by
the real user id, so they cannot be dropped into the client store as-is: the
selectors locate "me" by matching `'u-me'`, so raw server rows match nothing and
the lists render empty.

## Decision

The server orients each row to the requesting user and returns only the
*counterpart's* profile; the client stitches the local side to `'u-me'`. For
friends, `GET /friends` returns `{ friends, incoming, outgoing }`, each item
carrying the friendship id/status/createdAt plus the counterpart `user` profile.
The client rebuilds client-shaped rows with the local side hardcoded to `'u-me'`
and caches counterparts (by their real server id) in `users`. The existing
selectors are unchanged.

We explicitly do **not** adopt the server id as `meId`.

## Considered options

- **Adopt the server id as `meId` on sign-in.** Rejected for this slice: it
  needs a new "adopt identity" action (`updateProfile` is keyed on id) and
  touches the auth flow, the `ME` constant, `resetLocal`, `buildBareState`, and
  persisted state that locally-created pacts/check-ins/notifications reference —
  a large blast radius to entangle with a single feature.

## Consequences

- Cached `requesterId`/`addresseeId` are synthetic (the local side is always
  `'u-me'`); nothing client-side reads the server's real requester/addressee
  ids. The friendship id (a server uuid) is what accept/decline calls use.
- This is the precedent for all domain sync: pacts, check-ins and notifications
  should orient server-side and stitch to `'u-me'` the same way, rather than
  each adopting the server id independently.
- If a future feature genuinely needs the client to know its own server id,
  revisit this — adopting the server id becomes the cleaner model once identity
  plumbing is centralised.

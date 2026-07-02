# ADR 0005: Adopt the server id as client identity once the domain syncs

Date: 2026-07-02
Status: accepted — supersedes ADR-0003

## Context

ADR-0003 kept `meId` as the `'u-me'` sentinel and had the server orient every
domain row to the requesting user, with the client stitching its own side back
to the sentinel. That was cheap for friends — pre-split lists, one counterpart
per row — but it scales badly into the remaining slices: pacts carry two user
roles (creator, keeper), and check-ins from both sides interleave in a single
list distinguished only by `userId`, which the client cannot compare against
anything while it doesn't know its own id. Every deeper DTO would grow a
`mine` discriminator or pre-split lists, in three more slices. Meanwhile the
blast radius ADR-0003 cited is gone: demo mode is removed (ADR-0004), persisted
local data is discarded by the v4 migration, and the client already receives
its real id at sign-in (`ApiProfile`) — it just drops it.

## Decision

Set `meId` to the real server id at sign-in and store domain rows with real
ids on both sides, caching counterpart profiles in `users`. The friends
stitching in `refreshFriends` simplifies to storing real
requester/addressee ids. Selectors are unchanged — they match on `meId`,
whose value is now real. `'u-me'` survives at most as the never-rendered
pre-auth placeholder (or dies entirely if the store stays empty until
sign-in — implementation's choice).

Timing: a small standalone change after the demo-mode removal lands and
**before** the pacts endpoints, so orientation-stitching is not copied into
three more slices.

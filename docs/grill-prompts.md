# Grilling prompts — mock → real feature slices

One self-contained prompt per slice from the 2026-07-02 completeness audit,
ordered as audited. Copy a single block into a fresh session to start a
`/grilling` interview on that slice. Each prompt tells the grill which files
and docs to ground itself in first, states where things stand, sketches a
deliberately loose plan, and lists the tensions to probe hardest.

Usage notes:

- Slices 5 → 6 → 7 → 8 → 9 form a dependency chain (pacts → check-ins →
  cron → notifications → push), so grilling them in that order lets earlier
  answers feed later sessions.
- Slice 10 (demo mode) was grilled **first**, as recommended — see its
  section for the outcome (demo mode deleted, server id adopted as client
  identity). Prompts 1–9 predate that outcome, so their "Where things
  stand" notes still describe demo-era behavior; re-ground before copying
  one into a session.

---

## 1. Email+password auth — hardening the one real slice

```text
Grill me on my plan to harden email+password auth — the only fully real
slice today — before the domain endpoints pile more weight on it.

Ground yourself in these first:
- src/store/use-auth.ts (session store, demo shim, signOut wipe)
- src/lib/api.ts (bearer flow, set-auth-token header)
- src/app/_layout.tsx:72-95 (launch-time fetchMe; only 401 signs out)
- server/auth.ts and docs/backend-setup.md ("How auth works")
- docs/adr/0001-backend-stack.md

Where things stand: registration/login/sign-out run for real against Better
Auth (bearer plugin), token in expo-secure-store (AsyncStorage/localStorage
on web). Launch validates the session via fetchMe — 401 signs out, network
failure keeps the session so offline start works. Demo mode mints
`mock-jwt-*` tokens nothing validates. Missing entirely: password reset,
email verification (the emailVerified column exists, unused), email change,
account deletion, rate limiting. There is no email transport anywhere in
the repo.

My loose plan: pick an email provider, enable Better Auth's
forgetPassword + email verification, add a forgot-password screen, add
basic rate limiting, and revisit session expiry defaults.

Grill me hardest on:
- Unverified emails + friend-lookup-by-email: today anyone can register
  someone else's address and receive friend requests meant for them. Does
  verification need to gate the friends graph, not just exist?
- Session lifetime: infinite bearer sessions vs expiry/refresh — what does
  Better Auth default to, and what should a habit app do?
- Web token storage: localStorage-backed today (XSS surface) — acceptable,
  or should web use cookies while native keeps bearer?
- Account deletion: cascades exist in the schema but no endpoint or UI.
  What does deletion do to friendships and (future) pacts the user keeps?
- Password reset UX on native (deep link back into the app?).
- The demo shim: how do we keep it from drifting from real auth behavior?
```

---

## 2. Google / Apple sign-in — from 501 stub to working OAuth

```text
Grill me on my plan to turn the Google/Apple sign-in buttons from stubs
into a working flow.

Ground yourself in these first:
- docs/backend-setup.md ("Google / Apple login" checklist + "Client-side
  wiring" section)
- server/auth.ts:29-49 (providers activate only when env creds exist)
- src/store/use-auth.ts:92-102 (signInSocial throws 501 in API mode,
  fakes a session in demo mode)
- src/components/auth-bits.tsx (SocialButtons)
- src/lib/api.ts (expo-origin header / app scheme handling)

Where things stand: the UI is fully scaffolded and the server activates
each provider from env credentials, but the client never calls
/api/auth/sign-in/social and no OAuth redirect flow exists. Native needs
expo-web-browser + the mypact:// scheme or the @better-auth/expo client,
and a dev build (not Expo Go).

My loose plan: follow the docs checklist to provision both consoles, then
wire the buttons to Better Auth's social sign-in, native-first via
@better-auth/expo.

Grill me hardest on:
- Account linking: the same email arriving via Google when a password
  account exists — what are Better Auth's linking rules and is there a
  takeover risk?
- Apple private relay emails: friends are invited by email, so a relay
  address makes that user effectively un-invitable. Do we need
  invite-by-username/link first?
- Apple client secrets are 6-month JWTs — who rotates them and how do we
  notice expiry?
- Web: redirect vs popup, and what happens to the bearer-token flow when
  the OAuth callback lands on the server, not the app?
- Testing story: dev build required — what's the local loop for iOS and
  Android?
- Sequencing: is this slice even worth doing before pacts/check-ins land?
```

---

## 3. Profile & settings — closing the real slice's gaps

```text
Grill me on my plan to close the gaps in the profile/settings slice, which
is real (GET/PATCH /users/me) but has soft spots.

Ground yourself in these first:
- server/routes/users.ts and server/routes/shared.ts
- server/auth.ts:22-28 (additionalFields: timezone, notificationTime,
  tintIndex with input: false)
- src/app/settings.tsx:43-49 (fire-and-forget updateMe)
- src/app/_layout.tsx:76-95 (launch fetchMe overwrites local profile)
- src/store/types.ts (User)

Where things stand: username/timezone/notificationTime round-trip for
real. But (a) profile writes are fire-and-forget — a failed PATCH silently
reverts on the next launch's fetchMe; (b) tintIndex is in the schema and
wire shape yet nothing can ever set it (sign-up input:false, PATCH rejects
it), so every real user renders with avatar tint 0; (c) remindersEnabled
is device-local only — the future push scheduler can't see opt-outs;
(d) usernames have no uniqueness constraint; (e) email is immutable;
(f) the device clock owns timezone and pushes it up on launch.

My loose plan: surface save failures, assign tintIndex at sign-up
(hash of user id?) or make it user-editable, sync remindersEnabled to the
server ahead of push, and decide whether usernames are handles.

Grill me hardest on:
- Is username a unique handle (the UI renders "@name") or a display name?
  Friend flows key on email, so uniqueness is cosmetic today — but is it
  once notifications/push copy says "@nicklas missed a day"?
- Save-failure UX: blur-save with a toast? explicit save? optimistic with
  retry? What does multi-device last-write-wins do to notificationTime?
- tintIndex ownership: server-assigned identity color vs user-picked —
  friends see it, so consistency across devices matters.
- Why keep timezone in PATCH at all if the device always overwrites it?
- Email change (depends on verification from slice 1) and account
  deletion — where do they live in settings?
```

---

## 4. Friends — the remaining mock edges on a real slice

```text
Grill me on my plan for the remaining rough edges of the friends slice —
the lifecycle is real and tested, but its surroundings are still mock.

Ground yourself in these first:
- server/routes/friends.ts (full lifecycle, ADR-0002 pair index)
- docs/adr/0002-friendship-unordered-pair.md and
  docs/adr/0003-client-identity-sentinel.md
- src/store/use-store.ts:399-477 (refreshFriends: ME-sentinel stitching)
- src/screens/friends.tsx (tab-focus refetch, decline sheet)
- server/routes/friends.test.ts

Where things stand: request-by-email, accept/decline/block/remove all hit
Postgres with real tests. Edges: the server writes no notification rows —
friend_request/friend_accepted inbox entries exist only as demo-mode
client fabrications, so in API mode an incoming request is discoverable
only by opening the Friends tab (no badge, no push). Blocking is reachable
only from the decline sheet on incoming requests (the server allows
blocking accepted friends; the UI doesn't), there is no unblock, and the
send-request response reveals whether an email has an account
(enumeration).

My loose plan: server writes notification rows on request/accept (lands
with slice 8), some badge signal for incoming requests, block from the
friend row, and reconsider the not_found response.

Grill me hardest on:
- Email enumeration vs honest UX: "no one with that email has an account"
  is genuinely useful copy. Always-say-sent? Invite links instead?
- Discovery cadence: is tab-focus refetch enough until push exists, or
  does the home badge need to poll something?
- Block semantics as a product: what happens to active shared pacts when
  one side blocks (matters the moment pacts are server-side)? Is there
  unblock, and what does the blocked side observe?
- The ADR-0003 sentinel stitching discards the true requester/addressee
  orientation. What future feature breaks on that (notifications keyed by
  friendId? "you sent this" copy?), and when do we pay the debt?
- Does GET /friends need pagination before we care?
```

---

## 5. Pacts — from device-local illusion to server-backed — ✅ COMPLETED 2026-07-03

**Outcome:** grilled to ten decisions; ADR-0006/0007/0008 record the durable
ones, CONTEXT.md gained the Pact vocabulary (Creator, Solo/Mutual pact, Twin,
Proposal, Partner), and PRD #10 (`ready-for-agent`) carries the full
implementation spec. Mutual pacts become consent-gated: a Proposal is a single
pending row owned by the proposer; acceptance materializes the partner's twin
transactionally and re-anchors dates to the accepter's local today with
`endDate = start + duration − 1` (fixing an off-by-one that made every
"30-day" pact span 31 due days); decline is a hidden tombstone, withdrawal a
soft-delete; either partner voiding an active mutual voids the other's active
twin (completed twins stand). Solo pacts stay unilateral — the friendship is
the keeper's consent. Remove leaves contracts standing; block severs all live
contracts between the pair (ADR-0007). Keepers get full transparency as the
end-state; this slice ships the keeping list + proposal surfaces with a
terms-only keeper detail until check-ins sync. The engine narrows to
`creatorUserId === meId` (killing the fabricated-twin miss-recording bug and
pre-empting keeper-device fabrication over synced pacts), with interim
creator-called `/complete` + `/settle` transition endpoints until the slice-7
cron; keeper breach nudges stay honestly dark until then. Migration: persist
v6 discard-all (v4/v5 precedent) — the sentinel rewrite was already moot per
ADR-0005. No notification rows this slice: the four lying copy sites get
honest copy; slice 8 owns the taxonomy (it needs new enum types for
proposal/void events). Sync stays the hand-rolled friends idiom; the README's
React Query promise is withdrawn (ADR-0008). Feeds slice 6: the server
"today in tz X" helper, unique-index idempotent optimistic sealing, keeper
`progressValue` visibility, reconciling device-local check-ins at sync, and
the still-open backfill contradiction. Feeds slice 7: `/complete` + `/settle`
become cron-internal or die; the keeper-nudge dark window ends. The prompt
below is kept as the historical record of what was probed — do not copy it
into a new session.

```text
Grill me on my plan to move pacts server-side — the biggest gap in the
app. Today they are a device-local illusion even in API mode.

Ground yourself in these first:
- server/db/schema.ts:86-117 (pacts table, unused)
- src/store/use-store.ts (createPact, cancelPact; note the local twin
  fabrication for mutual pacts)
- src/app/create.tsx (keeper picker, "Your keeper is notified" copy)
- src/store/use-auth.ts:104-112 (signOut → resetLocal wipes pacts)
- docs/adr/0003-client-identity-sentinel.md (ME sentinel vs real ids)
- README "Pacts" + "Backend status"; docs/backend-setup.md "Not wired yet"

Where things stand: createPact/cancelPact are pure zustand+AsyncStorage in
both modes. In API mode: pacts die on sign-out (resetLocal), never sync
across devices, and the keeper — a real server friend — never learns the
pact exists. Mutual pacts fabricate the friend's twin locally on MY
device; the friend never receives it. Pact rows mix id spaces: creator is
the ME sentinel, keepers are real server ids. Client entity ids embed
Date.now().

My loose plan (per README): pact endpoints (create incl. transactional
mutual twin, list mine+keeping, get, cancel with twin cascade), store
actions become server mutations, keeper gets read access, engine keeps
running over synced data until slice 7.

Grill me hardest on:
- Mutual-pact consent: server-side, creating a twin unilaterally commits
  ANOTHER USER to a habit. Propose/accept flow, or keep it unilateral?
  This is the biggest product decision in the slice.
- Migration: what happens to existing device-local pacts on first launch
  after this ships — upload, discard, or prompt? And the ME-sentinel →
  real-user-id rewrite of persisted rows.
- Offline: the app currently works fully offline. Does pact creation go
  online-only, or offline-first with a sync queue? What does that do to
  check-ins (slice 6)?
- Keeper visibility scope: full pact + check-in history, or progress only?
- Cancellation of a mutual pact: may either twin's owner void both? Who
  gets told?
- Whose timezone computes startDate/endDate?
- React Query (new dependency, per README) vs hand-rolled sync like
  refreshFriends — pick one pattern before three slices copy it.
```

---

## 6. Check-ins — sealing against the server

```text
Grill me on my plan to move check-ins (seals + goal progress) server-side.
The daily core action is enforced client-side only today.

Ground yourself in these first:
- server/db/schema.ts:119-140 (check_ins: unique (pact,user,date),
  timezone column, immutable — unused)
- src/store/use-store.ts:145-192 (checkIn action: today+grace only,
  one-per-day via array scan, creator-only, goal auto-complete)
- src/lib/dates.ts (local date keys, 00:00-00:30 grace window)
- src/lib/engine.ts:193-196 (canBackfill — defined, never called)
- src/components/goal-log-sheet.tsx; README "Check-ins"

Where things stand: all rules live in the client. The schema is ready and
stricter-than-nothing (unique index), but no route writes it. Spec
mismatch worth settling: README says back-fill is allowed up to 7 days;
the store only ever allows today + the grace window; canBackfill is dead
code embodying the README rule.

My loose plan: POST /pacts/:id/check-ins with {date, progressValue,
timezone}; server validates ownership, pact status, and the date rules in
the user's claimed timezone; unique-violation maps to idempotent success;
goal completion flips pact status + writes notifications in one
transaction.

Grill me hardest on:
- Whose clock is truth: the server validates a client-supplied local date
  against a client-supplied timezone — trivially spoofable. Is streak
  cheating in our threat model at all, and what's proportionate?
- The grace window server-side: 00:00-00:30 local — validated how, and
  does it race the slice-7 cron that fails yesterday at 00:30?
- Resolve the backfill contradiction: 7-day rule or today-only? One
  answer, then delete canBackfill or wire it.
- Offline sealing: this is THE daily action. Online-only sealing on a
  subway breaks a streak. Queue-and-sync (with the unique index as the
  dedupe) or accept online-only?
- Immutability: no un-seal, no editing progressValue — confirmed as
  product, including mis-taps?
- Who may read check-ins: keeper sees everything including progressValue?
```

---

## 7. Accountability engine — retiring engine.ts for server cron

```text
Grill me on my plan to replace the client-side accountability engine with
server cron — miss detection, breach escalation, and pact settlement.

Ground yourself in these first:
- src/lib/engine.ts (the whole stand-in: miss recording, ≥3 trailing
  misses escalate, 80% settlement rule, grace handling)
- src/app/_layout.tsx:59-68 and 99-106 (runs on launch + foreground,
  dedupes per day+grace stamp)
- README "Accountability engine"; docs/adr/0001 (Vercel cron plan)
- CLAUDE.md "Scheduler engine" note (rules must stay in sync with README)

Where things stand: reconciliation only happens when a user opens their
own app. Keeper-perspective breach notifications can only fire in demo
mode — in API mode the keeper's device has no copy of the pact. There is
no server scheduler of any kind. Depends on slices 5/6 being server-side.

My loose plan (per ADR): Vercel cron hitting authed Hono routes on a
cadence, sweeping users whose local midnight+grace just passed; the cron
becomes the sole author of failed check-ins, breach notifications, and
settlement; engine.ts keeps running for demo mode only.

Grill me hardest on:
- The timezone sweep: users at :30/:45 offsets; hourly vs 15-min cron;
  what do Vercel's plan tiers actually allow for cron frequency and
  function duration, and does a full-user sweep fit?
- Idempotency and catch-up: a missed cron run, a redeploy mid-sweep, or
  Vercel retrying — what makes double-processing harmless?
- The 00:30 boundary race: cron fails yesterday at exactly the moment a
  user seals it. Unique index arbitration or explicit locking?
- Escalation state: trailing-consecutive-misses computed per sweep or
  stored as a counter?
- The transition: client engine and cron both writing failed rows for the
  same day — dual-author period or hard cutover flag?
- Two implementations forever (engine.ts for demo, cron for real) with
  README as the only shared spec — what test strategy keeps them from
  drifting?
- Cron route auth (CRON_SECRET header?) so nobody else can trigger sweeps.
```

---

## 8. Notifications & inbox — real rows, real timestamps

```text
Grill me on my plan to back the inbox with the server, including a
breaking shape change: timestamps are currently display strings.

Ground yourself in these first:
- server/db/schema.ts:142-159 (notifications table + 5-type enum, unused)
- src/store/types.ts:61-70 (sentAt: 'Just now' / 'Today · 09:12',
  readAt: 'read' — display strings, not timestamps)
- src/store/use-store.ts (markRead/markAllRead; every site that fabricates
  notifications: checkIn, cancelPact, acceptFriend demo path, runReconcile)
- src/app/inbox.tsx and src/screens/home.tsx (unread badge)
- src/store/seed.ts:233-278 (the five seeded examples)

Where things stand: every inbox row is client-fabricated and persisted in
AsyncStorage. In API mode the inbox only ever shows what the local engine
generates for local pacts; friend events write nothing; daily_reminder
rows exist only in seeds. The server table is ready but route-less.

My loose plan: GET /notifications (paginated) + mark-read/mark-all-read;
rows written server-side by the friend routes, check-in completion, and
the slice-7 cron; client types move to ISO timestamps with a relative
formatter at render; unread badge derives from the server.

Grill me hardest on:
- The type migration: demo-mode AsyncStorage carries display-string rows —
  migrate them, or version-bump and reseed? API mode starts bare, so does
  it even matter there?
- Transition merge: while the client engine still fabricates rows (demo,
  or pre-cron API mode), how do local and server rows coexist without
  duplicates?
- Badge freshness: the unread count sits on the home header — poll on
  foreground? on tab switch? push-driven later?
- Retention and pagination: infinite inbox or a 30-day window?
- Dangling deep links: pactId/friendId are set-null FKs — what does a
  notification pointing at a deleted pact render?
- Should the daily reminder write an inbox row (seeds pretend it does;
  the real local notification doesn't)?
- Read state across devices: readAt as timestamp — good enough?
```

---

## 9. Reminders & push — from local stand-in to FCM/APNs

```text
Grill me on my plan to take reminders from a single local notification to
real remote push.

Ground yourself in these first:
- src/lib/reminders.ts (including the header comment on Expo Go/Android
  constraints — remote push needs a dev build since SDK 53)
- src/app/settings.tsx (reminder toggle + 11 fixed preset times)
- server/auth.ts additionalFields (notificationTime, timezone already
  stored server-side; remindersEnabled is NOT)
- README "Notifications"; docs/adr/0001 (FCM after cron)

Where things stand: one daily local notification, silently no-op on web
and Android Expo Go. No push tokens, no token registry table, no remote
delivery. The server knows when to remind (notificationTime + timezone)
but not whether the user opted out.

My loose plan: expo-notifications push tokens into a device_tokens table;
the slice-7 cron family sends the daily reminder at each user's local
notificationTime plus event pushes (breach, completion, friend request);
the local scheduled notification retires in API mode.

Grill me hardest on:
- Double delivery: local + remote both firing during the transition — how
  is the local one disabled, and is it worth keeping as offline fallback?
- Expo push service vs raw FCM/APNs — operational tradeoffs on Vercel.
- Token lifecycle: multiple devices per user, rotation, sign-out revoking
  the right token, dead-token cleanup from receipt errors.
- Content: "Your morning run awaits its seal" needs server-side pact
  knowledge — hard dependency on slice 5; what ships before that?
- Does remindersEnabled=off silence only the daily reminder, or breach
  and friend pushes too? (Product decision; also needs the slice-3 sync.)
- Permission-denied devices: does the server keep sending into the void?
- Web: skip push entirely, or web-push later?
```

---

## 10. Demo mode — keep, shrink, or sunset — ✅ COMPLETED 2026-07-02

**Outcome:** grilled first, answered hardest: position (d) plus the sentinel
unwind. Demo mode was deleted outright — API-only app, fail-fast startup,
persist v4 wipe (ADR-0004, issue #8) — and the client then adopted the real
server id as its identity, retiring ADR-0003's `'u-me'` sentinel from all
domain rows with a pure, unit-tested friends normalization
(`src/lib/friends.ts`) and a persist v5 wipe (ADR-0005, issue #9). PRD #7
records the full decision set; both issues closed. This also settles the
ADR-0003 debt probes in slices 4 and 5 (true Requester/Addressee orientation
is stored; no sentinel-to-real rewrite awaits the pacts slice) and replaces
the CLAUDE.md verification loop with the three-process real-stack workflow.
The prompt below is kept as the historical record of what was probed — do
not copy it into a new session.

```text
Grill me on what offline demo mode should become as the backend absorbs
the domain — every server slice doubles the code paths today.

Ground yourself in these first:
- src/store/seed.ts (the whole parallel universe: 6 users, 5 friendships,
  7 pacts incl. keeper/mutual storylines, ~100 check-ins, 5 notifications)
- src/store/use-store.ts:99-118 and 531-565 (freshState, DATA_MODE
  partition, merge/migrate guards between demo and API datasets)
- src/store/use-auth.ts (mock sessions)
- Every apiEnabled branch in use-store.ts (friends actions already fork;
  pacts/check-ins/notifications forks are coming)
- CLAUDE.md "Verifying changes" (web verification leans on demo mode);
  README "Backend status" ("offline demo mode keeps working throughout")

Where things stand: demo mode is a commitment, not a fallback — mock
auth, seeded data, the engine as its scheduler, demo-only reset UI, and a
persist-layer dataMode wall so the two universes never bleed. ADR-0003's
ME sentinel exists largely to serve this duality. Once cron lands, the
engine's rules live twice (engine.ts for demo, server for real) with the
README as the only shared spec.

My loose plan: none yet — that's what I want stress-tested. Candidate
positions: (a) keep demo mode first-class forever (App Store review,
instant showcase, dev-without-Docker, CLAUDE.md verification loop);
(b) freeze it as a read-only tour; (c) replace it with a server-seeded
demo account; (d) sunset it once pacts sync.

Grill me hardest on:
- Who is demo mode actually for, concretely, per audience — and which
  audiences justify N parallel code paths?
- The drift problem: what test or spec artifact keeps engine.ts and the
  server cron enforcing the same rules? (Neither has tests today.)
- What demo mode costs each new slice in branches, and whether a seam
  (one data-layer interface, two implementations) beats scattered
  apiEnabled forks before three more slices copy the pattern.
- If it stays: does it need its own tests, and does "Reset demo data"
  remain the only reseed path?
- If it goes: what replaces the CLAUDE.md web-verification workflow and
  the App Store review story?
- When pacts sync, does the ME sentinel unwind (per-account real ids) or
  does demo mode force keeping it forever?
```

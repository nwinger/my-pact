# My Pact

Domain glossary for My Pact — a social habit-tracking app where friends witness
and hold each other accountable to time-boxed commitments.

## Friendship

**Friendship**:
The bond between two users. Undirected — at most one friendship exists per
unordered pair of users — even though a row records who asked (see Requester /
Addressee). Its status is `pending`, `accepted`, `declined`, or `blocked`.
_Avoid_: "friend request" for the stored record — a request is just a *pending*
friendship, not a separate entity.

**Requester**:
The user who initiated a friendship. A storage role that captures direction; it
does not make the relationship directional.

**Addressee**:
The user a friendship request was sent to — the one who accepts or declines.

**Incoming request**:
A pending friendship seen from the addressee's side (someone asked *me*).
_Avoid_: "received request".

**Outgoing request**:
A pending friendship seen from the requester's side (I asked *them*).
_Avoid_: "sent request".

**Witness**:
The product word for a friend — someone bound to you who can see and vouch for
your pacts. The Friends screen labels the accepted list "Witnesses".
_Avoid_: follower, contact.

**Keeper**:
The one friend a given pact names as its accountability holder. Narrower than a
Witness: every keeper is a friend, but a keeper is scoped to a single pact.
A keeper sees the pact whole — terms, every seal and miss, progress — because
naming them *is* the consent to be seen; witnessing requires sight.
_Avoid_: using "witness" for this role — a keeper is a specific job on a pact,
not the general bond.

## Pact

**Pact**:
A time-boxed commitment to a habit, made by its Creator and witnessed by a
Keeper. Two shapes: frequency (check in on chosen weekdays) and goal (log
progress toward a target). _Avoid_: "habit" for the stored record — the habit
is the behavior; the pact is the contract around it.

**Creator**:
The user a pact binds — the one who checks in on it. Every pact has exactly
one.

**Solo pact**:
A pact binding only its Creator (the default shape). The Keeper witnesses but
is not bound; their consent to witness is the friendship itself, so creating
one is unilateral.

**Mutual pact**:
A pact two friends enter together. It begins as a one-sided Proposal and
becomes two linked Twins only when the Partner accepts — it binds no one until
then; commitment to act always requires that user's own agreement. It dies as
one contract too: either partner voiding their twin voids the other's, though
a twin that already completed stays completed.

**Twin**:
One partner's half of a mutual pact. Each partner is the Creator of their own
twin and the Keeper of the other's.

**Proposal**:
A mutual pact awaiting the Partner's agreement — just a *pending* mutual pact,
not a separate entity (mirrors "friend request"). Only the proposer's side
exists while pending, and a proposal that never binds (declined or withdrawn)
leaves no visible record: the Archive holds contracts that existed. Solo pacts
are never proposals. _Avoid_: "invite", "pact request".

**Partner**:
The friend on the other side of a mutual pact: Keeper of my twin, Creator of
their own.

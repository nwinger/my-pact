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
_Avoid_: using "witness" for this role — a keeper is a specific job on a pact,
not the general bond.

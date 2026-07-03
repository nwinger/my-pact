/**
 * Pure normalization of the `GET /pacts` wire payload into domain rows —
 * the friends idiom (ADR-0008), copied: server payload in, `Pact` rows plus
 * the counterpart profiles for the user cache out.
 *
 * Deliberately React-Native-free — imports from the API client are type-only
 * (erased at compile time) so the node test runner can execute this module
 * outside the Expo tree.
 */

import type { ApiProfile } from '@/lib/api';
import { profileToUser } from '@/lib/friends';
import type { Pact, PactStatus, PactType, User } from '@/store/types';

/**
 * One pact on the wire: the flat server row with real user ids (ADR-0005).
 * Optionals travel as `null`; the server's `wirePact()` (server/routes/
 * pacts.ts) is the other half of this contract.
 */
export type ApiPact = {
  id: string;
  creatorUserId: string;
  keeperUserId: string;
  title: string;
  description: string | null;
  type: PactType;
  status: PactStatus;
  startDate: string;
  endDate: string;
  daysOfWeek: number[] | null;
  goalTarget: number | null;
  goalUnit: string | null;
  isMutual: boolean;
  mutualPactId: string | null;
  tintIndex: number;
};

/**
 * Wire shape of `GET /pacts`: every pact the caller created or keeps (the
 * client partitions by comparing ids against `meId`), plus the counterpart
 * profile sidecar to merge into the user cache.
 */
export type PactsPayload = {
  pacts: ApiPact[];
  counterparts: ApiProfile[];
};

/** Project one wire pact onto the client's `Pact` shape (null → undefined). */
export function apiPactToPact(p: ApiPact): Pact {
  return {
    id: p.id,
    creatorUserId: p.creatorUserId,
    keeperUserId: p.keeperUserId,
    title: p.title,
    description: p.description ?? undefined,
    type: p.type,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    daysOfWeek: p.daysOfWeek ?? undefined,
    goalTarget: p.goalTarget ?? undefined,
    goalUnit: p.goalUnit ?? undefined,
    isMutual: p.isMutual,
    mutualPactId: p.mutualPactId ?? undefined,
    tintIndex: p.tintIndex,
  };
}

export function normalizePacts(payload: PactsPayload): { pacts: Pact[]; counterparts: User[] } {
  return {
    pacts: payload.pacts.map(apiPactToPact),
    counterparts: payload.counterparts.map(profileToUser),
  };
}

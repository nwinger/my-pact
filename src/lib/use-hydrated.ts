import { useSyncExternalStore } from 'react';

import { useAuth } from '@/store/use-auth';
import { useStore } from '@/store/use-store';

const subscribeData = (cb: () => void) => useStore.persist.onFinishHydration(cb);
const subscribeAuth = (cb: () => void) => useAuth.persist.onFinishHydration(cb);
const dataSnapshot = () => useStore.persist.hasHydrated();
const authSnapshot = () => useAuth.persist.hasHydrated();

/** True once both persisted stores have finished rehydrating from disk. */
export function useHydrated(): boolean {
  const dataReady = useSyncExternalStore(subscribeData, dataSnapshot, dataSnapshot);
  const authReady = useSyncExternalStore(subscribeAuth, authSnapshot, authSnapshot);
  return dataReady && authReady;
}

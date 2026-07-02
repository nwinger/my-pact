import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ApiError, signInEmail, signOutSession, signUpEmail } from '@/lib/api';
import { useStore } from '@/store/use-store';

/**
 * Auth session, stored in expo-secure-store on device and localStorage (via
 * AsyncStorage) on web. Email+password auth runs against the real backend
 * (Better Auth, bearer token) — there is no offline mode (ADR-0004). Social
 * sign-in is scaffolded and throws until OAuth credentials exist.
 */

const secureStorage = {
  getItem: (name: string) =>
    Platform.OS === 'web' ? AsyncStorage.getItem(name) : SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    Platform.OS === 'web'
      ? AsyncStorage.setItem(name, value)
      : SecureStore.setItemAsync(name, value),
  removeItem: (name: string) =>
    Platform.OS === 'web'
      ? AsyncStorage.removeItem(name)
      : SecureStore.deleteItemAsync(name),
};

export type AuthProvider = 'password' | 'google' | 'apple';

type AuthState = {
  signedIn: boolean;
  email: string | null;
  provider: AuthProvider | null;
  /** Better Auth bearer session token */
  token: string | null;
  hydrated: boolean;

  /**
   * Establishes the session and adopts the server identity into the domain
   * store (ADR-0005). Throws ApiError.
   */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    username: string;
    email: string;
    password: string;
    timezone: string;
  }) => Promise<void>;
  /** Scaffolded: throws until OAuth credentials exist. */
  signInSocial: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => void;
  setHydrated: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      signedIn: false,
      email: null,
      provider: null,
      token: null,
      hydrated: false,

      signIn: async (email, password) => {
        const { token, profile } = await signInEmail({ email, password });
        // Adopt the server identity BEFORE signedIn flips (ADR-0005): the
        // protected stack mounts on signedIn and must never see a store
        // still keyed by the pre-auth placeholder.
        useStore.getState().adoptIdentity(profile);
        set({ signedIn: true, email: profile.email, provider: 'password', token });
      },

      signUp: async ({ username, email, password, timezone }) => {
        const { token, profile } = await signUpEmail({ username, email, password, timezone });
        useStore.getState().adoptIdentity(profile);
        set({ signedIn: true, email: profile.email, provider: 'password', token });
      },

      signInSocial: async (provider) => {
        const label = provider === 'google' ? 'Google' : 'Apple';
        throw new ApiError(
          `${label} sign-in isn’t available yet — use your email and password instead.`,
          501
        );
      },

      signOut: () => {
        const { token } = get();
        // best-effort server-side revocation; local state clears regardless
        if (token) void signOutSession(token).catch(() => {});
        // local domain data is account-scoped — clear it so the next
        // sign-in doesn't inherit this account's pacts
        useStore.getState().resetLocal();
        set({ signedIn: false, email: null, provider: null, token: null });
      },

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'mypact-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        signedIn: s.signedIn,
        email: s.email,
        provider: s.provider,
        token: s.token,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);

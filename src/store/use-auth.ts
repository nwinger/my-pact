import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  apiEnabled,
  ApiError,
  signInEmail,
  signOutSession,
  signUpEmail,
  type ApiProfile,
} from '@/lib/api';

/**
 * Auth session, stored in expo-secure-store on device and localStorage (via
 * AsyncStorage) on web. With EXPO_PUBLIC_API_URL set, actions call the real
 * backend (Better Auth, bearer token); without it the app stays in offline
 * demo mode and mints mock sessions exactly as before.
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
  /** Better Auth bearer session token (a mock token in offline demo mode) */
  token: string | null;
  hydrated: boolean;

  /** Resolves with the server profile, or null in offline demo mode. Throws ApiError. */
  signIn: (email: string, password: string) => Promise<ApiProfile | null>;
  signUp: (input: {
    username: string;
    email: string;
    password: string;
    timezone: string;
  }) => Promise<ApiProfile | null>;
  /** Scaffolded: mock session in demo mode; throws until OAuth credentials exist. */
  signInSocial: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => void;
  setHydrated: () => void;
};

const mockToken = () => `mock-jwt-${Math.random().toString(36).slice(2)}`;

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      signedIn: false,
      email: null,
      provider: null,
      token: null,
      hydrated: false,

      signIn: async (email, password) => {
        if (!apiEnabled) {
          set({ signedIn: true, email, provider: 'password', token: mockToken() });
          return null;
        }
        const { token, profile } = await signInEmail({ email, password });
        set({ signedIn: true, email: profile.email, provider: 'password', token });
        return profile;
      },

      signUp: async ({ username, email, password, timezone }) => {
        if (!apiEnabled) {
          set({ signedIn: true, email, provider: 'password', token: mockToken() });
          return null;
        }
        const { token, profile } = await signUpEmail({ username, email, password, timezone });
        set({ signedIn: true, email: profile.email, provider: 'password', token });
        return profile;
      },

      signInSocial: async (provider) => {
        if (!apiEnabled) {
          set({ signedIn: true, email: 'you@mypact.app', provider, token: mockToken() });
          return;
        }
        const label = provider === 'google' ? 'Google' : 'Apple';
        throw new ApiError(
          `${label} sign-in isn’t configured yet — see docs/backend-setup.md.`,
          501
        );
      },

      signOut: () => {
        const { token } = get();
        // best-effort server-side revocation; local state clears regardless
        if (apiEnabled && token) void signOutSession(token).catch(() => {});
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

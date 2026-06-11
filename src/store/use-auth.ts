import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Mock auth session, stored the way a real one would be:
 * expo-secure-store on device, localStorage (via AsyncStorage) on web.
 * Swapping in Better Auth later only changes the action bodies.
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
  /** mock access token, stands in for the Better Auth JWT */
  token: string | null;
  hydrated: boolean;

  signIn: (email: string, provider: AuthProvider) => void;
  signOut: () => void;
  setHydrated: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      signedIn: false,
      email: null,
      provider: null,
      token: null,
      hydrated: false,

      signIn: (email, provider) =>
        set({
          signedIn: true,
          email,
          provider,
          token: `mock-jwt-${Math.random().toString(36).slice(2)}`,
        }),

      signOut: () => set({ signedIn: false, email: null, provider: null, token: null }),

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

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiToken } from '../lib/data';
import { setApiRefreshToken, registerAuthHandlers } from '../lib/api';

interface User {
  id: string;
  phone: string;
  role: string;
  email?: string;
  controlNumber?: string;
  firstName?: string;
  lastName?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  farmerId: string | null;
  isAuthenticated: boolean;
  hasOnboarded: boolean;
  pushToken: string | null;
  _hydrated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken?: string) => void;
  setFarmerId: (id: string | null) => void;
  clearAuth: () => void;
  setOnboarded: () => void;
  setPushToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      farmerId: null,
      isAuthenticated: false,
      hasOnboarded: false,
      pushToken: null,
      _hydrated: false,
      setAuth: (user, accessToken, refreshToken) => {
        setApiToken(accessToken);
        setApiRefreshToken(refreshToken ?? null);
        set({ user, accessToken, refreshToken: refreshToken ?? null, isAuthenticated: true });
      },
      setFarmerId: (farmerId) => set({ farmerId }),
      clearAuth: () => {
        setApiToken(null);
        setApiRefreshToken(null);
        set({ user: null, accessToken: null, refreshToken: null, farmerId: null, isAuthenticated: false });
      },
      setOnboarded: () => set({ hasOnboarded: true }),
      setPushToken: (pushToken) => set({ pushToken }),
    }),
    {
      name: 'mayode-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        farmerId: state.farmerId,
        isAuthenticated: state.isAuthenticated,
        hasOnboarded: state.hasOnboarded,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-inject the persisted tokens into axios and flag hydration complete.
        if (state?.accessToken) setApiToken(state.accessToken);
        if (state?.refreshToken) setApiRefreshToken(state.refreshToken);
        useAuthStore.setState({ _hydrated: true });
      },
    },
  ),
);

// Let api.ts persist a refreshed token pair and force a logout if the
// refresh token itself has expired/been revoked (see registerAuthHandlers
// in ../lib/api.ts for why this indirection exists).
registerAuthHandlers({
  onTokensRefreshed: (accessToken, refreshToken) => {
    useAuthStore.setState({ accessToken, refreshToken });
  },
  onRefreshFailed: () => {
    useAuthStore.getState().clearAuth();
  },
});

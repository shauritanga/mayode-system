'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  /** Mobile drawer (sidebar is always visible on ≥1024px). */
  sidebarOpen: boolean;
  /** Desktop icon-only rail; persisted so it survives reloads. */
  sidebarCollapsed: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleCollapsed: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarOpen: false,
      sidebarCollapsed: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      toggleCollapsed: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
    }),
    {
      name: 'mayode-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);

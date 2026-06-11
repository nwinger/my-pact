import { create } from 'zustand';

export type TabName = 'home' | 'pacts' | 'friends' | 'profile';

type TabState = {
  tab: TabName;
  setTab: (tab: TabName) => void;
};

/** Active bottom-tab. Owned by us (not the router) so scene
 *  visibility is fully controlled and identical on web + native. */
export const useTabs = create<TabState>((set) => ({
  tab: 'home',
  setTab: (tab) => set({ tab }),
}));

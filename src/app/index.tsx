import { View } from 'react-native';

import { FabTabBar } from '@/components/fab-tab-bar';
import { FriendsScreen } from '@/screens/friends';
import { HomeScreen } from '@/screens/home';
import { PactsScreen } from '@/screens/pacts';
import { ProfileScreen } from '@/screens/profile';
import { useTabs, type TabName } from '@/store/use-tabs';

const SCREENS: { name: TabName; Screen: () => React.ReactNode }[] = [
  { name: 'home', Screen: HomeScreen },
  { name: 'pacts', Screen: PactsScreen },
  { name: 'friends', Screen: FriendsScreen },
  { name: 'profile', Screen: ProfileScreen },
];

/**
 * The main tabbed surface. All four scenes stay mounted (scroll positions
 * survive switching); inactive ones are display:none.
 */
export default function Main() {
  const tab = useTabs((s) => s.tab);

  return (
    <View style={{ flex: 1 }}>
      {SCREENS.map(({ name, Screen }) => (
        <View
          key={name}
          style={{
            flex: 1,
            display: tab === name ? 'flex' : 'none',
            pointerEvents: tab === name ? 'auto' : 'none',
          }}
        >
          <Screen />
        </View>
      ))}
      <FabTabBar />
    </View>
  );
}

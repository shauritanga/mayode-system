import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Tabs, useRouter, usePathname, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Home01Icon, Plant01Icon, ShoppingCart02Icon, UserCircleIcon, Notification03Icon, BellIcon, TaskDaily01Icon } from '@hugeicons/core-free-icons';
import { notificationsApi } from '../../src/lib/data';
import { useI18n } from '../../src/i18n';

/** Bell button with live unread badge; opens the notification center. */
export function NotificationBell({ light = false }: { light?: boolean }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      notificationsApi
        .unreadCount()
        .then((res) => { if (!cancelled) setCount(res.data?.count ?? 0); })
        .catch(() => { /* offline — keep last known count */ });
      return () => { cancelled = true; };
    }, []),
  );

  return (
    <TouchableOpacity
      style={[styles.notificationBtn, light && styles.notificationBtnLight]}
      onPress={() => router.push('/notifications')}
    >
      <HugeiconsIcon icon={BellIcon} size={22} color={light ? '#fff' : '#4B5563'} strokeWidth={1.8} />
      {count > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Custom Top App Bar
function CustomTopAppBar({ options }: any) {
  const { t } = useI18n();
  return (
    <SafeAreaView edges={['top']} style={styles.appBarContainer}>
      <StatusBar style="dark" />
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>M</Text>
          </View>
          <Text style={styles.appBarTitle}>{options.title || t('dashboard')}</Text>
        </View>
        <NotificationBell />
      </View>
    </SafeAreaView>
  );
}

// Custom Bottom Navigation Bar
function CustomBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  const isDashboard = pathname === '/' || pathname === '/(tabs)';
  const isFarms = pathname === '/farms' || pathname === '/(tabs)/farms';
  const isProfile = pathname === '/profile' || pathname === '/(tabs)/profile';

  return (
    <SafeAreaView edges={['bottom']} style={styles.bottomNavContainer}>
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navTab}
          onPress={() => router.push('/')}
        >
          <HugeiconsIcon
            icon={Home01Icon}
            size={24}
            color={isDashboard ? '#10B981' : '#6B7280'}
            strokeWidth={isDashboard ? 2 : 1.5}
          />
          <Text style={[styles.navText, isDashboard && styles.navTextActive]}>
            {t('dashboard')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => router.push('/farms')}
        >
          <HugeiconsIcon
            icon={Plant01Icon}
            size={24}
            color={isFarms ? '#10B981' : '#6B7280'}
            strokeWidth={isFarms ? 2 : 1.5}
          />
          <Text style={[styles.navText, isFarms && styles.navTextActive]}>
            {t('farms')}
          </Text>
        </TouchableOpacity>

        {/* Activities — coming soon */}
        <TouchableOpacity
          style={styles.navTab}
          onPress={() => Alert.alert(t('comingSoon'), t('activitiesComingSoon'))}
        >
          <View>
            <HugeiconsIcon icon={TaskDaily01Icon} size={24} color="#9CA3AF" strokeWidth={1.5} />
            <View style={styles.soonBadge}><Text style={styles.soonBadgeText}>{t('soon')}</Text></View>
          </View>
          <Text style={[styles.navText, { color: '#9CA3AF' }]}>{t('activities')}</Text>
        </TouchableOpacity>

        {/* M-LAX — coming soon */}
        <TouchableOpacity
          style={styles.navTab}
          onPress={() => Alert.alert(t('comingSoon'), t('marketplaceComingSoon'))}
        >
          <View>
            <HugeiconsIcon icon={ShoppingCart02Icon} size={24} color="#9CA3AF" strokeWidth={1.5} />
            <View style={styles.soonBadge}><Text style={styles.soonBadgeText}>{t('soon')}</Text></View>
          </View>
          <Text style={[styles.navText, { color: '#9CA3AF' }]}>M-LAX</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTab}
          onPress={() => router.push('/profile')}
        >
          <HugeiconsIcon
            icon={UserCircleIcon}
            size={24}
            color={isProfile ? '#10B981' : '#6B7280'}
            strokeWidth={isProfile ? 2 : 1.5}
          />
          <Text style={[styles.navText, isProfile && styles.navTextActive]}>
            {t('profile')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      tabBar={(props) => <CustomBottomNav />}
      screenOptions={{
        header: (props) => <CustomTopAppBar {...props} />,
        sceneStyle: styles.sceneStyle,
      }}
    >
      {/* Dashboard renders its own green weather hero, so hide the shared app bar */}
      <Tabs.Screen name="index" options={{ title: t('dashboard'), headerShown: false }} />
      {/* Farms tab has its own Stack (farms/_layout) that renders headers per screen */}
      <Tabs.Screen name="farms" options={{ title: t('manageFarms'), headerShown: false }} />
      <Tabs.Screen name="marketplace" options={{ title: t('marketplace') }} />
      <Tabs.Screen name="profile" options={{ title: t('myProfile') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  appBarContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
    borderBottomColor: '#E5E7EB',
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logoBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  appBarTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
  },
  notificationBtn: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
  },
  notificationBtnLight: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  unreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  sceneStyle: {
    backgroundColor: '#F3F4F6',
  },
  bottomNavContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navTab: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
  navTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  soonBadge: {
    position: 'absolute',
    top: -7,
    right: -16,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  soonBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
});

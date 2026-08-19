import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/store/auth.store';
import { farmersApi, usersApi } from '../src/lib/data';
import { isMobileAllowedRole } from '../src/lib/mobile-roles';
import { useI18n } from '../src/i18n';
import {
  setNotificationHandler,
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  isPushSupported,
} from '../src/services/notifications.service';
import { syncQueue } from '../src/services/sync-queue';

// Configure foreground notification presentation globally (no-op in Expo Go).
setNotificationHandler();

export default function RootLayout() {
  const { isAuthenticated, hasOnboarded, setPushToken, _hydrated, user, clearAuth, farmerId, setFarmerId } =
    useAuthStore();
  const { t } = useI18n();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  // Queue is replayed automatically on reconnect. Updates to the same resource
  // use last-write-wins; the backend's updatedAt timestamp remains authoritative.
  useEffect(() => syncQueue.start(), []);

  // Backfill farmerId for sessions that logged in before /farmers/me was used
  // (old flow hit a staff-only control-number endpoint and left farmerId null).
  useEffect(() => {
    if (!_hydrated || !isAuthenticated || user?.role !== 'FARMER' || farmerId) return;
    let cancelled = false;
    farmersApi
      .me()
      .then((res) => {
        if (!cancelled && res.data?.id) setFarmerId(res.data.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [_hydrated, isAuthenticated, user?.role, farmerId, setFarmerId]);

  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  // ──────────────────────────────────────────────────────────────
  // Register push token & set up notification listeners once authenticated
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !isPushSupported()) return;

    registerForPushNotifications().then(async (token) => {
      if (token) {
        setPushToken(token);
        try {
          await usersApi.updatePushToken(token);
        } catch (e) {
          console.warn('[Notifications] Failed to register push token on backend:', e);
        }
      }
    });

    notificationListener.current = addNotificationReceivedListener((notification) => {
      console.log('[Notification Received]', notification);
    });

    responseListener.current = addNotificationResponseReceivedListener((response) => {
      console.log('[Notification Tapped]', response);
      const data = response.notification.request.content.data;

      if (data?.screen === 'marketplace') {
        router.push('/marketplace');
      } else if (data?.screen === 'farms') {
        router.push('/farms');
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated, setPushToken, router]);

  // ──────────────────────────────────────────────────────────────
  // Auth-based navigation guard
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    // Wait until persisted auth state has rehydrated to avoid a flash-logout.
    if (!_hydrated) return;

    // Drop persisted sessions for roles that belong on the web dashboard.
    if (isAuthenticated && user && !isMobileAllowedRole(user.role)) {
      clearAuth();
      Alert.alert(t('mobileAccessDeniedTitle'), t('mobileAccessDeniedMessage'));
      return;
    }

    const timer = setTimeout(() => {
      const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';
      const inOnboardingGroup = segments[0] === 'splash' || segments[0] === 'onboarding';

      if (!hasOnboarded && !inOnboardingGroup) {
        router.replace('/splash');
      } else if (hasOnboarded && !isAuthenticated && !inAuthGroup && !inOnboardingGroup) {
        router.replace('/login');
      } else if (isAuthenticated && (inAuthGroup || inOnboardingGroup)) {
        router.replace('/(drawer)/(tabs)');
      }
    }, 1);

    return () => clearTimeout(timer);
  }, [isAuthenticated, hasOnboarded, segments, rootNavigationState?.key, _hydrated, user, clearAuth, t, router]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen
          name="edit-profile"
          options={{ headerShown: true, title: t('editProfile'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff' }}
        />
        <Stack.Screen
          name="boundary"
          options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen
          name="farm/[id]"
          options={{ headerShown: true, title: t('farm'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="farm-register"
          options={{ headerShown: true, title: t('registerFarm'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="plot-new"
          options={{ headerShown: true, title: t('addPlot'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="notifications"
          options={{ headerShown: true, title: t('notificationCenter'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="finances"
          options={{ headerShown: true, title: t('finances'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="insurance"
          options={{ headerShown: true, title: t('insurance'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="inventory"
          options={{ headerShown: true, title: t('warehouseStock'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="membership"
          options={{ headerShown: true, title: t('membership'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="marketplace"
          options={{ headerShown: true, title: t('marketplace'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="leases"
          options={{ headerShown: true, title: t('myLeases'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="lease-new"
          options={{ headerShown: true, title: t('addLease'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="alerts"
          options={{ headerShown: true, title: t('farmAlerts'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="alert/[id]"
          options={{ headerShown: true, title: t('alertDetail'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="identity"
          options={{ headerShown: true, title: t('identityVerification'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="rewards"
          options={{ headerShown: true, title: t('myRewards'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen name="votes" options={{ headerShown: true, title: 'Member voting', headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff' }} />
        <Stack.Screen
          name="farm-report/[id]"
          options={{ headerShown: true, title: t('farmReport'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
        <Stack.Screen
          name="claim-farms"
          options={{ headerShown: true, title: t('confirmYourFarms'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

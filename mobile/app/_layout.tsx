import React, { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../src/store/auth.store';
import { usersApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';
import {
  setNotificationHandler,
  registerForPushNotifications,
} from '../src/services/notifications.service';
import { syncQueue } from '../src/services/sync-queue';

// Configure foreground notification presentation globally
setNotificationHandler();

export default function RootLayout() {
  const { isAuthenticated, hasOnboarded, setPushToken, _hydrated } = useAuthStore();
  const { t } = useI18n();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  // Queue is replayed automatically on reconnect. Updates to the same resource
  // use last-write-wins; the backend's updatedAt timestamp remains authoritative.
  useEffect(() => syncQueue.start(), []);

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // ──────────────────────────────────────────────────────────────
  // Register push token & set up notification listeners once authenticated
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    // Register for push notifications and store the token
    registerForPushNotifications().then(async (token) => {
      if (token) {
        setPushToken(token);
        // Register push token on backend for server-side push delivery
        try {
          await usersApi.updatePushToken(token);
        } catch (e) {
          console.warn('[Notifications] Failed to register push token on backend:', e);
        }
      }
    });

    // Foreground: notification received while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Notification Received]', notification);
    });

    // Background/Quit: user tapped a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[Notification Tapped]', response);
      const data = response.notification.request.content.data as Record<string, unknown>;

      // Navigate based on notification payload (customise as needed)
      if (data?.screen === 'marketplace') {
        router.push('/(tabs)/marketplace');
      } else if (data?.screen === 'farms') {
        router.push('/(tabs)/farms');
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated]);

  // ──────────────────────────────────────────────────────────────
  // Auth-based navigation guard
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    // Wait until persisted auth state has rehydrated to avoid a flash-logout.
    if (!_hydrated) return;

    const timer = setTimeout(() => {
      const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';
      const inOnboardingGroup = segments[0] === 'splash' || segments[0] === 'onboarding';

      if (!hasOnboarded && !inOnboardingGroup) {
        router.replace('/splash');
      } else if (hasOnboarded && !isAuthenticated && !inAuthGroup && !inOnboardingGroup) {
        router.replace('/login');
      } else if (isAuthenticated && (inAuthGroup || inOnboardingGroup)) {
        router.replace('/(tabs)');
      }
    }, 1);

    return () => clearTimeout(timer);
  }, [isAuthenticated, hasOnboarded, segments, rootNavigationState?.key, _hydrated]);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splash" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
          name="membership"
          options={{ headerShown: true, title: t('membership'), headerStyle: { backgroundColor: '#065F46' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '800' } }}
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

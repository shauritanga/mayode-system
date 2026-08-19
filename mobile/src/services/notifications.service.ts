import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ENABLE_PUSH_NOTIFICATIONS } from '../lib/config';

/**
 * Expo Go (SDK 53+) throws on import of expo-notifications on Android.
 * Keep the module out of the Expo Go bundle path so the app can still run.
 */
const isExpoGo = Constants.appOwnership === 'expo';

type NotificationsModule = typeof import('expo-notifications');
type Subscription = { remove: () => void };

let Notifications: NotificationsModule | null = null;
if (!isExpoGo) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications') as NotificationsModule;
}

export function isPushSupported(): boolean {
  return !isExpoGo && Notifications != null && ENABLE_PUSH_NOTIFICATIONS;
}

/**
 * Configure how notifications are presented when the app is in the FOREGROUND.
 * Must be called once at app startup before any notifications can arrive.
 */
export function setNotificationHandler() {
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request notification permissions and obtain an Expo Push Token.
 * Returns the token string if successful, or null if unavailable / Expo Go.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!isPushSupported() || !Notifications) {
    if (isExpoGo) {
      console.warn('[Notifications] Push is unavailable in Expo Go — use a development build.');
    }
    return null;
  }

  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a physical device.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Push notification permission denied.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('mayode-default', {
      name: 'MAYODE Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
      sound: 'default',
    });
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    console.log('[Notifications] Expo Push Token:', token.data);
    return token.data;
  } catch (error) {
    console.warn('[Notifications] Push token unavailable (FCM not configured):', error);
    return null;
  }
}

export function addNotificationReceivedListener(
  listener: (notification: unknown) => void,
): Subscription | null {
  if (!Notifications) return null;
  return Notifications.addNotificationReceivedListener(listener as never);
}

export function addNotificationResponseReceivedListener(
  listener: (response: {
    notification: { request: { content: { data: Record<string, unknown> } } };
  }) => void,
): Subscription | null {
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener(listener as never);
}

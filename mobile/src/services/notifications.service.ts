import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ENABLE_PUSH_NOTIFICATIONS } from '../lib/config';

/**
 * Configure how notifications are presented when the app is in the FOREGROUND.
 * Must be called once at app startup before any notifications can arrive.
 */
export function setNotificationHandler() {
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
 * Returns the token string if successful, or null if permissions denied / not a physical device.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Skip entirely until FCM credentials + a real EAS projectId are configured.
  if (!ENABLE_PUSH_NOTIFICATIONS) {
    return null;
  }

  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a physical device.');
    return null;
  }

  // Check existing permission status
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Push notification permission denied.');
    return null;
  }

  // Set up Android notification channel
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
    // Downgraded from console.error so it never triggers the dev red-box overlay.
    console.warn('[Notifications] Push token unavailable (FCM not configured):', error);
    return null;
  }
}

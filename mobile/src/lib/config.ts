/**
 * Data-source switch.
 *
 * true  → all data is stored locally on the device (AsyncStorage). The app is
 *         fully functional offline; nothing talks to the backend.
 * false → the app uses the remote NestJS backend over HTTP (src/lib/api.ts).
 *
 * Flip this to false (and run the backend) when you're ready to link the real
 * backend. Screens import from src/lib/data.ts, so no screen code changes.
 */
export const USE_LOCAL_DATA = false;

/**
 * Push notifications require Firebase/FCM credentials (googleServicesFile) and a
 * real EAS projectId. Leave disabled while running local-first / in Expo dev —
 * otherwise getExpoPushTokenAsync throws. Enable once FCM is configured.
 */
export const ENABLE_PUSH_NOTIFICATIONS = false;

/**
 * OpenWeatherMap API key for the home-screen weather card.
 * Get a free key at https://openweathermap.org/api and paste it here.
 * If left blank, the app falls back to the free, key-less Open-Meteo API so the
 * weather card still works out of the box.
 */
export const OPENWEATHER_API_KEY = '';

/**
 * Push notifications require Firebase/FCM credentials (googleServicesFile) and a
 * real EAS projectId — both are configured (see app.json). Push tokens only
 * resolve on a physical device with a native build that includes google-services.json,
 * i.e. after `expo prebuild` + a real (non-Expo-Go) dev/release build.
 */
export const ENABLE_PUSH_NOTIFICATIONS = true;

/**
 * OpenWeatherMap API key for the home-screen weather card.
 * Get a free key at https://openweathermap.org/api and paste it here.
 * If left blank, the app falls back to the free, key-less Open-Meteo API so the
 * weather card still works out of the box.
 */
export const OPENWEATHER_API_KEY = '';

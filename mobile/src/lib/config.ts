/**
 * Push notifications require Firebase/FCM credentials (googleServicesFile) and a
 * real EAS projectId — both are configured (see app.json). Push tokens only
 * resolve on a physical device with a native build that includes google-services.json,
 * i.e. after `expo prebuild` + a real (non-Expo-Go) dev/release build.
 */
export const ENABLE_PUSH_NOTIFICATIONS = true;

/**
 * Production API base URL (Nest API on the DigitalOcean droplet).
 * Wired via app.json → expo.extra.apiUrl and EAS production env.
 */
export const PRODUCTION_API_URL = 'http://139.59.139.30:3002/api/v1';

/**
 * OpenWeatherMap API key for the home-screen weather card.
 * Get a free key at https://openweathermap.org/api and paste it here.
 * If left blank, the app falls back to the free, key-less Open-Meteo API so the
 * weather card still works out of the box.
 */
export const OPENWEATHER_API_KEY = '';

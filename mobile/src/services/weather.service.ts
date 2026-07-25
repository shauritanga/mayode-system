import * as Location from 'expo-location';
import { OPENWEATHER_API_KEY } from '../lib/config';
import { getCurrentPoint } from './location.service';
import { TranslationKey } from '../i18n';

export interface WeatherData {
  city: string;
  tempC: number;
  condition: TranslationKey;
  humidity: number; // %
  precipitationMm: number; // mm
  windKmh: number; // km/h
  icon: string; // emoji
  observedAt: Date;
  provider: 'OpenWeather' | 'Open-Meteo';
}

/** OpenWeather "main" → emoji + friendly label. */
function fromOpenWeather(main: string, description?: string): { icon: string; text: TranslationKey } {
  const m = (main || '').toLowerCase();
  if (m.includes('thunder')) return { icon: '⛈️', text: 'thunderstorm' };
  if (m.includes('drizzle')) return { icon: '🌦️', text: 'drizzle' };
  if (m.includes('rain')) return { icon: '🌧️', text: 'rain' };
  if (m.includes('snow')) return { icon: '❄️', text: 'snow' };
  if (m.includes('cloud')) return { icon: '☁️', text: 'cloudy' };
  if (m.includes('clear')) return { icon: '☀️', text: 'clearSunny' };
  if (m.includes('mist') || m.includes('fog') || m.includes('haze')) return { icon: '🌫️', text: 'fog' };
  return { icon: '🌤️', text: 'weatherUnavailable' };
}

/** WMO weather code (Open-Meteo) → emoji + label. */
function fromWmo(code: number): { icon: string; text: TranslationKey } {
  if (code === 0) return { icon: '☀️', text: 'clearSunny' };
  if (code <= 2) return { icon: '🌤️', text: 'partlyCloudy' };
  if (code === 3) return { icon: '☁️', text: 'overcast' };
  if (code <= 48) return { icon: '🌫️', text: 'fog' };
  if (code <= 57) return { icon: '🌦️', text: 'drizzle' };
  if (code <= 67) return { icon: '🌧️', text: 'rain' };
  if (code <= 77) return { icon: '❄️', text: 'snow' };
  if (code <= 82) return { icon: '🌧️', text: 'rainShowers' };
  if (code <= 86) return { icon: '🌨️', text: 'snowShowers' };
  if (code <= 99) return { icon: '⛈️', text: 'thunderstorm' };
  return { icon: '🌤️', text: 'weatherUnavailable' };
}

async function reverseCity(lat: number, lon: number): Promise<string> {
  try {
    const g = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const p = g?.[0];
    return p?.city || p?.subregion || p?.region || p?.country || 'My location';
  } catch {
    return 'My location';
  }
}

/** Fetch current weather. Uses OpenWeather when a key is set, else Open-Meteo. */
export async function fetchWeatherAt(lat: number, lon: number): Promise<WeatherData> {
  if (OPENWEATHER_API_KEY) {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`,
    );
    if (!res.ok) throw new Error(`OpenWeather ${res.status}`);
    const d: any = await res.json();
    const w = fromOpenWeather(d.weather?.[0]?.main, d.weather?.[0]?.description);
    return {
      city: d.name || (await reverseCity(lat, lon)),
      tempC: Math.round(d.main?.temp ?? 0),
      condition: w.text,
      humidity: Math.round(d.main?.humidity ?? 0),
      precipitationMm: Math.round((d.rain?.['1h'] ?? d.snow?.['1h'] ?? 0) * 10) / 10,
      windKmh: Math.round((d.wind?.speed ?? 0) * 3.6),
      icon: w.icon,
      observedAt: new Date((d.dt ? d.dt * 1000 : Date.now())),
      provider: 'OpenWeather',
    };
  }

  // Free, key-less fallback so the card works out of the box.
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&wind_speed_unit=kmh`,
  );
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const d: any = await res.json();
  const c = d.current || {};
  const w = fromWmo(Number(c.weather_code));
  return {
    city: await reverseCity(lat, lon),
    tempC: Math.round(c.temperature_2m ?? 0),
    condition: w.text,
    humidity: Math.round(c.relative_humidity_2m ?? 0),
    precipitationMm: Math.round((c.precipitation ?? 0) * 10) / 10,
    windKmh: Math.round(c.wind_speed_10m ?? 0),
    icon: w.icon,
    observedAt: new Date(),
    provider: 'Open-Meteo',
  };
}

/** Convenience: read device GPS then fetch weather. */
export async function fetchWeatherHere(): Promise<WeatherData> {
  const p = await getCurrentPoint();
  return fetchWeatherAt(p.latitude, p.longitude);
}

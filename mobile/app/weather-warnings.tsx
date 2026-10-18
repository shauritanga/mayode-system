import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { weatherWarningsApi as api } from '../src/lib/api';
import { useI18n, useLanguageStore } from '../src/i18n';

const SEV_COLOR: Record<string, string> = { LOW: '#3B82F6', MEDIUM: '#F59E0B', HIGH: '#EF4444', CRITICAL: '#B91C1C' };
const dayName = (d: string, sw: boolean) => new Date(`${d}T12:00:00Z`).toLocaleDateString(sw ? 'sw-TZ' : 'en-GB', { weekday: 'short', day: 'numeric' });

export default function WeatherWarningsScreen() {
  const { t } = useI18n();
  const sw = useLanguageStore((s) => s.language) === 'sw';
  const [advice, setAdvice] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [whatsapp, setWhatsapp] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, al, p] = await Promise.all([api.advice(), api.alerts(), api.preferences()]);
      setAdvice(a.data); setAlerts(al.data ?? []); setWhatsapp(!!p.data?.whatsappOptIn);
    } catch { /* offline: keep what we have */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (v: boolean) => {
    setWhatsapp(v);
    try { await api.setWhatsapp(v); } catch { setWhatsapp(!v); }
  };

  if (loading && !advice) {
    return <SafeAreaView style={styles.container} edges={['bottom']}><Stack.Screen options={{ headerShown: true, title: t('weatherWarnings') }} /><View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View></SafeAreaView>;
  }
  const days: any[] = advice?.forecast?.days ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('weatherWarnings') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>{t('weatherWarningsTitle')}</Text>
        {alerts.length === 0 && <Text style={styles.muted}>{t('noWeatherWarnings')}</Text>}
        {alerts.map((a) => (
          <View key={a.id} style={[styles.card, { borderLeftColor: SEV_COLOR[a.severity] ?? '#9CA3AF', borderLeftWidth: 4 }]}>
            <Text style={styles.cardTitle}>{sw ? (a.titleSw ?? a.title) : a.title}</Text>
            <Text style={styles.line}>{sw ? (a.messageSw ?? a.message) : a.message}</Text>
          </View>
        ))}

        <Text style={styles.section}>{t('weatherThisWeek')}{advice?.place ? ` · ${advice.place}` : ''}</Text>
        {days.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.days}>
              {days.map((d) => (
                <View key={d.date} style={styles.day}>
                  <Text style={styles.dayName}>{dayName(d.date, sw)}</Text>
                  <Text style={styles.dayTemp}>{d.maxTempC != null ? `${Math.round(d.maxTempC)}°` : '—'}</Text>
                  <Text style={styles.dayRain}>{Math.round((d.precipitationMm ?? 0) * 10) / 10}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.muted}>{advice.forecast.summary.totalMm} {t('weatherRainExpected')}</Text>
          </View>
        ) : <Text style={styles.muted}>—</Text>}

        <Text style={styles.section}>{t('weatherAdviceTitle')}</Text>
        {(advice?.crops ?? []).length === 0 && <Text style={styles.muted}>{t('noGrowingCrop')}</Text>}
        {(advice?.crops ?? []).map((c: any) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.cardTitle}>{c.farm} · {c.season}{c.stage ? ` · ${String(c.stage).replace(/_/g, ' ').toLowerCase()}` : ''}</Text>
            {(sw ? c.advice.sw : c.advice.en).map((line: string) => <Text key={line} style={styles.line}>• {line}</Text>)}
          </View>
        ))}

        <View style={[styles.card, styles.row]}>
          <Text style={[styles.line, { flex: 1, marginTop: 0 }]}>{t('whatsappAlertsOptIn')}</Text>
          <Switch value={whatsapp} onValueChange={toggle} trackColor={{ true: '#10B981' }} />
        </View>
        <Text style={styles.muted}>{t('weatherUssdHint')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  line: { fontSize: 13, color: '#374151', marginTop: 4 },
  muted: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', flex: 1 },
  dayName: { fontSize: 10, color: '#6B7280' },
  dayTemp: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 },
  dayRain: { fontSize: 11, color: '#3B82F6', marginTop: 2 },
});

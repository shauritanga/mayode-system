import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowLeft01Icon, ArrowRight01Icon, TaskDaily01Icon, Plant01Icon, Calendar01Icon } from '@hugeicons/core-free-icons';
import { cropCyclesApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';
import { MonthGrid, dayKey } from '../src/components/MonthGrid';

const DOT_COLOR: Record<Entry['type'], string> = { ACTIVITY: '#047857', RICE_TASK: '#B45309', PLANTING: '#3B82F6', HARVEST: '#3B82F6' };

interface Entry {
  type: 'ACTIVITY' | 'PLANTING' | 'HARVEST' | 'RICE_TASK';
  date: string;
  id: string;
  cropCycleId: string;
  activityType?: string;
  title?: string;
  status?: string;
  farm?: { farmCode?: string; name?: string } | null;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function FarmerCalendarScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [monthOffset, setMonthOffset] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Date());

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);
      const res = await cropCyclesApi.calendar({ from: from.toISOString(), to: to.toISOString() });
      setEntries(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(monthOffset); }, [load, monthOffset]));

  const now = new Date();
  const shownMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);

  const markers = useMemo(() => {
    const m: Record<string, string[]> = {};
    entries.forEach((e) => { (m[dayKey(new Date(e.date))] ||= []).push(DOT_COLOR[e.type]); });
    return m;
  }, [entries]);
  const dayEntries = entries.filter((e) => dayKey(new Date(e.date)) === dayKey(selected));

  const changeMonth = (delta: number) => {
    const next = monthOffset + delta;
    setMonthOffset(next);
    const target = new Date(now.getFullYear(), now.getMonth() + next, 1);
    setSelected(next === 0 ? new Date() : target);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('calendar') }} />
      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => changeMonth(-1)}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} color="#111827" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(shownMonth)}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}>
          <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#111827" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <MonthGrid month={shownMonth} markers={markers} selected={selected} onSelect={setSelected} />
      <Text style={styles.sectionHeader}>{dayLabel(selected)}</Text>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {dayEntries.length === 0 && (
            <View style={styles.center}>
              <HugeiconsIcon icon={Calendar01Icon} size={36} color="#D1D5DB" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{entries.length === 0 ? t('calendarEmpty') : t('nothingThisDay')}</Text>
            </View>
          )}
          {dayEntries.map((item) => {
            const isActivity = item.type === 'ACTIVITY';
            const isRiceTask = item.type === 'RICE_TASK';
            const farmLabel = item.farm?.farmCode || item.farm?.name || '';
            const title = isRiceTask
              ? (item.title || t('riceCalendarTask'))
              : isActivity
                ? item.activityType?.replace(/_/g, ' ')
                : t(item.type === 'PLANTING' ? 'plantingDue' : 'harvestDue', { farm: farmLabel });
            return (
              <TouchableOpacity
                key={item.id + item.type}
                style={styles.entry}
                onPress={() => {
                  if (isRiceTask) {
                    router.push({
                      pathname: '/calendar-task/[id]',
                      params: { id: item.id, cropCycleId: item.cropCycleId },
                    });
                    return;
                  }
                  router.push({ pathname: '/crop-cycle/[id]', params: { id: item.cropCycleId } });
                }}
              >
                <HugeiconsIcon
                  icon={isActivity || isRiceTask ? TaskDaily01Icon : Plant01Icon}
                  size={18}
                  color={DOT_COLOR[item.type]}
                  strokeWidth={2}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryTitle}>{title}</Text>
                  {(isActivity || isRiceTask) && !!farmLabel && (
                    <Text style={styles.entrySub}>
                      {farmLabel}
                      {isRiceTask && item.status === 'COMPLETED' ? ` · ${t('taskCompleted')}` : ''}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, paddingTop: 32 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 8, marginTop: 14, paddingHorizontal: 16, textTransform: 'uppercase', letterSpacing: 0.4 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  entryTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  entrySub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowLeft01Icon, ArrowRight01Icon, TaskDaily01Icon, Plant01Icon, Calendar01Icon } from '@hugeicons/core-free-icons';
import { cropCyclesApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

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

  const sections = Object.values(
    entries.reduce((acc: Record<string, { title: string; data: Entry[] }>, e) => {
      const day = new Date(e.date);
      const key = day.toDateString();
      if (!acc[key]) acc[key] = { title: dayLabel(day), data: [] };
      acc[key].data.push(e);
      return acc;
    }, {}),
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('calendar') }} />
      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => setMonthOffset((m) => m - 1)}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} color="#111827" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel(shownMonth)}</Text>
        <TouchableOpacity onPress={() => setMonthOffset((m) => m + 1)}>
          <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#111827" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <HugeiconsIcon icon={Calendar01Icon} size={40} color="#D1D5DB" strokeWidth={1.5} />
          <Text style={styles.emptyText}>{t('calendarEmpty')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id + item.type}
          contentContainerStyle={{ padding: 16 }}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => {
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
                  color={isRiceTask ? '#B45309' : isActivity ? '#047857' : '#3B82F6'}
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
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  entryTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  entrySub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});

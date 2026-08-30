import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowLeft01Icon, ArrowRight01Icon, TaskDaily01Icon, Plant01Icon, Calendar01Icon } from '@hugeicons/core-free-icons';
import { officerVisitsApi } from '../../../src/lib/data';
import { useI18n } from '../../../src/i18n';

interface Entry {
  type: 'VISIT' | 'PLANTING' | 'HARVEST';
  date: string;
  id: string;
  purpose?: string;
  farmer?: { firstName: string; lastName: string };
  farm?: { farmCode?: string; name?: string } | null;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function OfficerCalendarScreen() {
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
      const res = await officerVisitsApi.calendar({ from: from.toISOString(), to: to.toISOString() });
      setEntries(res.data ?? []);
    } catch {
      setEntries([]);
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
    <View style={styles.container}>
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
          <Text style={styles.emptyText}>{t('noVisitsYet')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id + item.type}
          contentContainerStyle={{ padding: 16 }}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => {
            const isVisit = item.type === 'VISIT';
            const farmLabel = item.farm?.farmCode || item.farm?.name || '';
            const farmerName = item.farmer ? `${item.farmer.firstName} ${item.farmer.lastName}` : '';
            return (
              <TouchableOpacity
                style={styles.entry}
                onPress={() => item.farmer && router.push(`/officer/farmer/${(item.farmer as any).id}`)}
              >
                <HugeiconsIcon
                  icon={isVisit ? TaskDaily01Icon : Plant01Icon}
                  size={18}
                  color={isVisit ? '#047857' : '#3B82F6'}
                  strokeWidth={2}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryTitle}>
                    {isVisit ? farmerName : t(item.type === 'PLANTING' ? 'plantingDue' : 'harvestDue', { farm: farmLabel })}
                  </Text>
                  {isVisit && <Text style={styles.entrySub}>{item.purpose?.replace(/_/g, ' ')}</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 12 },
  monthBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  monthLabel: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sectionHeader: { fontSize: 12, fontWeight: '800', color: '#6B7280', marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
  entry: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
    borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB',
  },
  entryTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  entrySub: { fontSize: 12, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
});

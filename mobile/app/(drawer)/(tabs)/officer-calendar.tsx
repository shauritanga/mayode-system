import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowLeft01Icon, ArrowRight01Icon, TaskDaily01Icon, Plant01Icon, Calendar01Icon } from '@hugeicons/core-free-icons';
import { officerVisitsApi } from '../../../src/lib/data';
import { useI18n } from '../../../src/i18n';
import { growthStageLabel, RiceGrowthStage } from '../../../src/lib/field-visit';
import { MonthGrid, dayKey } from '../../../src/components/MonthGrid';

const DOT_COLOR: Record<Entry['type'], string> = { VISIT: '#047857', FOLLOW_UP: '#B45309', PLANTING: '#3B82F6', HARVEST: '#3B82F6' };

interface Entry {
  type: 'VISIT' | 'PLANTING' | 'HARVEST' | 'FOLLOW_UP';
  date: string;
  id: string;
  purpose?: string;
  growthStage?: string;
  farmer?: { id?: string; firstName: string; lastName: string };
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
  const [selected, setSelected] = useState(() => new Date());

  const labelT = (key: string) => t(key as Parameters<typeof t>[0]);

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

  const markers = useMemo(() => {
    const m: Record<string, string[]> = {};
    entries.forEach((e) => { (m[dayKey(new Date(e.date))] ||= []).push(DOT_COLOR[e.type]); });
    return m;
  }, [entries]);
  const dayEntries = entries.filter((e) => dayKey(new Date(e.date)) === dayKey(selected));

  const changeMonth = (delta: number) => {
    const next = monthOffset + delta;
    setMonthOffset(next);
    setSelected(next === 0 ? new Date() : new Date(now.getFullYear(), now.getMonth() + next, 1));
  };

  return (
    <View style={styles.container}>
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
              <Text style={styles.emptyText}>{entries.length === 0 ? t('noVisitsYet') : t('nothingThisDay')}</Text>
            </View>
          )}
          {dayEntries.map((item) => {
            const isVisit = item.type === 'VISIT';
            const isFollowUp = item.type === 'FOLLOW_UP';
            const farmLabel = item.farm?.farmCode || item.farm?.name || '';
            const farmerName = item.farmer ? `${item.farmer.firstName} ${item.farmer.lastName}` : '';
            const stageLabel = item.growthStage
              ? growthStageLabel(item.growthStage as RiceGrowthStage, labelT)
              : '';
            return (
              <TouchableOpacity
                key={item.id + item.type}
                style={styles.entry}
                onPress={() => item.farmer?.id && router.push(`/officer/farmer/${item.farmer.id}`)}
              >
                <HugeiconsIcon
                  icon={isFollowUp ? Calendar01Icon : isVisit ? TaskDaily01Icon : Plant01Icon}
                  size={18}
                  color={DOT_COLOR[item.type]}
                  strokeWidth={2}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryTitle}>
                    {isFollowUp
                      ? t('followUpVisit')
                      : isVisit
                        ? farmerName
                        : t(item.type === 'PLANTING' ? 'plantingDue' : 'harvestDue', { farm: farmLabel })}
                  </Text>
                  <Text style={styles.entrySub} numberOfLines={2}>
                    {isVisit
                      ? [item.purpose?.replace(/_/g, ' '), farmLabel, stageLabel].filter(Boolean).join(' · ')
                      : isFollowUp
                        ? [farmerName, farmLabel, stageLabel].filter(Boolean).join(' · ')
                        : farmLabel}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 32 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 12 },
  monthBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  monthLabel: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sectionHeader: { fontSize: 12, fontWeight: '800', color: '#6B7280', marginTop: 14, marginBottom: 8, paddingHorizontal: 16, textTransform: 'uppercase' },
  entry: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
    borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB',
  },
  entryTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  entrySub: { fontSize: 12, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
});

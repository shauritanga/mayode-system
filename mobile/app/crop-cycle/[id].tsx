import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Add01Icon, WheatIcon, Wallet01Icon, CoinsDollarIcon } from '@hugeicons/core-free-icons';
import { cropCyclesApi, riceProtocolsApi, integrationsApi } from '../../src/lib/data';
import { timeAgo, useI18n } from '../../src/i18n';

interface Activity {
  id: string; activityType: string; activityDate: string; description?: string;
  laborWorkers?: number; laborHours?: number;
}
interface Cost {
  id: string; category: string; itemName: string; totalCost: number; dateIncurred: string;
}
interface Revenue {
  id: string; revenueType: string; quantityKg: number; totalRevenue: number;
  fairtradePremium?: number; saleDate: string;
}
interface CropCycle {
  id: string; season: string; riceVariety?: string; status: string;
  estimatedYieldKg?: number; actualYieldKg?: number;
  farm?: { id: string; farmCode: string };
  activities: Activity[]; costs: Cost[]; revenues: Revenue[];
  calendarTasks?: CalendarTask[];
}
interface CalendarTask { id: string; title: string; guidance: string; dueDate: string; status: string; evidenceRequired: boolean; }

type Tab = 'activities' | 'expenses' | 'sales';

export default function CropCycleDetail() {
  const { id, farmCode, tab: tabParam } = useLocalSearchParams<{ id: string; farmCode?: string; tab?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [cycle, setCycle] = useState<CropCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const initialTab: Tab =
    tabParam === 'expenses' || tabParam === 'sales' || tabParam === 'activities'
      ? tabParam
      : 'activities';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [actualYield, setActualYield] = useState('');
  const [saving, setSaving] = useState(false);
  const [readiness, setReadiness] = useState<{ ready: boolean; missing: string[] } | null>(null);
  const [advisoryLocked, setAdvisoryLocked] = useState(false);
  const [advisoryMessage, setAdvisoryMessage] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<any[]>([]);
  const [generatingAdvisory, setGeneratingAdvisory] = useState(false);

  const loadAdvisories = useCallback(async () => {
    if (!id) return;
    try {
      const ai = await integrationsApi.myAiRecords({ cropCycleId: id });
      setAdvisoryLocked(Boolean(ai.data?.locked));
      setAdvisoryMessage(ai.data?.message || null);
      setAdvisories(ai.data?.records || []);
    } catch {
      setAdvisories([]);
      setAdvisoryLocked(false);
      setAdvisoryMessage(null);
    }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await cropCyclesApi.getOne(id);
      setCycle(res.data);
      try { const quality = await riceProtocolsApi.readiness(id); setReadiness(quality.data); } catch { setReadiness(null); }
      await loadAdvisories();
    } finally {
      setLoading(false);
    }
  }, [id, loadAdvisories]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const runAdvisory = async () => {
    if (!id) return;
    setGeneratingAdvisory(true);
    try {
      await integrationsApi.generateFieldAdvisory(id);
      await loadAdvisories();
    } catch (e: any) {
      Alert.alert(t('fieldAdvisory'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setGeneratingAdvisory(false);
    }
  };

  const markHarvested = async () => {
    if (!actualYield.trim()) {
      Alert.alert(t('markHarvested'), t('fillHarvestFields'));
      return;
    }
    setSaving(true);
    try {
      await cropCyclesApi.update(id!, {
        status: 'HARVESTED',
        actualYieldKg: Number(actualYield),
        harvestDate: new Date().toISOString(),
      });
      Alert.alert(t('markHarvested'), t('cropCycleUpdated'));
      setHarvestOpen(false);
      load();
    } catch (e: any) {
      Alert.alert(t('markHarvested'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !cycle) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" size="large" /></SafeAreaView>;
  }
  if (!cycle) {
    return <SafeAreaView style={styles.center}><Text>{t('cropCycleDetail')}</Text></SafeAreaView>;
  }

  const totalExpenses = cycle.costs.reduce((s, c) => s + c.totalCost, 0);

  const fabAction = () => {
    if (tab === 'activities') {
      router.push({
        pathname: '/activity-new',
        params: {
          cropCycleId: cycle.id,
          farmId: cycle.farm?.id,
          farmCode: cycle.farm?.farmCode,
          season: cycle.season,
        },
      });
      return;
    }
    if (tab === 'expenses') {
      router.push({
        pathname: '/expense-new',
        params: { cropCycleId: cycle.id, farmCode: cycle.farm?.farmCode, season: cycle.season },
      });
      return;
    }
    router.push({
      pathname: '/revenue-new',
      params: { cropCycleId: cycle.id, farmCode: cycle.farm?.farmCode, season: cycle.season },
    });
  };

  const fabLabel =
    tab === 'activities' ? t('logActivity') : tab === 'expenses' ? t('addExpense') : t('recordSale');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: cycle.season }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.season}>{cycle.season}</Text>
          <Text style={styles.sub}>
            {cycle.farm?.farmCode} {cycle.riceVariety ? `· ${cycle.riceVariety}` : ''} · {cycle.status}
          </Text>
          {cycle.status !== 'HARVESTED' && cycle.status !== 'COMPLETED' && (
            <TouchableOpacity style={styles.harvestBtn} onPress={() => setHarvestOpen((o) => !o)}>
              <Text style={styles.harvestBtnText}>{t('markHarvested')}</Text>
            </TouchableOpacity>
          )}
          {harvestOpen && (
            <View style={{ marginTop: 10 }}>
              <TextInput
                style={styles.input}
                placeholder={t('actualYieldKg')}
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={actualYield}
                onChangeText={setActualYield}
              />
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={markHarvested} disabled={saving}>
                <Text style={styles.saveBtnText}>{t('cropCycleUpdated')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {(cycle.status === 'HARVESTED' || cycle.status === 'COMPLETED' || cycle.status === 'ACTIVE') && (
            <TouchableOpacity
              style={[styles.harvestBtn, { marginTop: 10, backgroundColor: '#0F766E' }]}
              onPress={() =>
                router.push({ pathname: '/inventory', params: { cropCycleId: cycle.id } })
              }
            >
              <Text style={styles.harvestBtnText}>{t('warehouseStock')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.calendarCard}>
          <Text style={styles.calendarTitle}>{t('fieldAdvisory')}</Text>
          {advisoryLocked && !!advisoryMessage && (
            <>
              <Text style={styles.readinessPending}>{advisoryMessage}</Text>
              <TouchableOpacity
                style={[styles.harvestBtn, { marginTop: 8, backgroundColor: '#065F46' }]}
                onPress={() => router.push('/membership')}
              >
                <Text style={styles.harvestBtnText}>{t('unlockMembershipCta')}</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[styles.harvestBtn, generatingAdvisory && { opacity: 0.6 }]}
            onPress={runAdvisory}
            disabled={generatingAdvisory}
          >
            <Text style={styles.harvestBtnText}>
              {generatingAdvisory ? t('generatingAdvisory') : t('generateAdvisory')}
            </Text>
          </TouchableOpacity>
          {!advisories.length ? (
            <Text style={styles.taskDue}>{t('noAdvisoriesYet')}</Text>
          ) : (
            advisories.slice(0, 3).map((record) => {
              const rec = record.recommendation || {};
              return (
                <View key={record.id} style={styles.taskRow}>
                  <View style={[styles.taskDot, rec.severity === 'HIGH' && styles.taskDotWarn]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>
                      {String(record.sourceType || '').replace(/_/g, ' ')}
                      {rec.severity ? ` · ${rec.severity}` : ''}
                    </Text>
                    <Text style={styles.taskDue} numberOfLines={3}>
                      {rec.summary || t('advisoryPreview')}
                    </Text>
                    {!advisoryLocked && Array.isArray(rec.actions) && rec.actions[0] ? (
                      <Text style={styles.taskDue} numberOfLines={2}>→ {rec.actions[0]}</Text>
                    ) : null}
                    {!advisoryLocked && Array.isArray(rec.findings) && rec.findings[0]?.message ? (
                      <Text style={styles.taskDue} numberOfLines={2}>{rec.findings[0].message}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {!!cycle.calendarTasks?.length && (
          <View style={styles.calendarCard}>
            <Text style={styles.calendarTitle}>{t('riceCalendarSection')}</Text>
            {readiness && (
              <Text style={[styles.readiness, readiness.ready ? styles.readinessOk : styles.readinessPending]}>
                {readiness.ready
                  ? t('riceReadyForSale')
                  : t('riceBeforeWarehouse', { missing: readiness.missing.join(', ') })}
              </Text>
            )}
            {cycle.calendarTasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskRow}
                onPress={() =>
                  router.push({
                    pathname: '/calendar-task/[id]',
                    params: { id: task.id, cropCycleId: cycle.id },
                  })
                }
              >
                <View style={[styles.taskDot, task.status === 'COMPLETED' && styles.taskDotDone]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskDue}>{new Date(task.dueDate).toLocaleDateString()}</Text>
                </View>
                <Text style={task.status === 'COMPLETED' ? styles.taskDone : styles.taskOpen}>
                  {task.status === 'COMPLETED' ? t('taskCompleted') : t('taskOpen')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'activities' && styles.tabBtnActive]} onPress={() => setTab('activities')}>
            <Text style={[styles.tabText, tab === 'activities' && styles.tabTextActive]}>{t('activitiesTab')} ({cycle.activities.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'expenses' && styles.tabBtnActive]} onPress={() => setTab('expenses')}>
            <Text style={[styles.tabText, tab === 'expenses' && styles.tabTextActive]}>{t('expensesTab')} ({cycle.costs.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'sales' && styles.tabBtnActive]} onPress={() => setTab('sales')}>
            <Text style={[styles.tabText, tab === 'sales' && styles.tabTextActive]}>{t('salesTab')} ({cycle.revenues.length})</Text>
          </TouchableOpacity>
        </View>

        {tab === 'activities' ? (
          cycle.activities.length === 0 ? (
            <View style={styles.empty}>
              <HugeiconsIcon icon={WheatIcon} size={36} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noActivitiesYet')}</Text>
            </View>
          ) : (
            cycle.activities.map((a) => (
              <View key={a.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{a.activityType.replace(/_/g, ' ')}</Text>
                  {!!a.description && <Text style={styles.rowSub} numberOfLines={1}>{a.description}</Text>}
                  {(a.laborWorkers || a.laborHours) ? (
                    <Text style={styles.rowSub}>
                      {a.laborWorkers ? `${a.laborWorkers} workers` : ''} {a.laborHours ? `· ${a.laborHours}h` : ''}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.rowTime}>{timeAgo(a.activityDate, t)}</Text>
              </View>
            ))
          )
        ) : tab === 'expenses' ? (
          cycle.costs.length === 0 ? (
            <View style={styles.empty}>
              <HugeiconsIcon icon={Wallet01Icon} size={36} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noExpensesYet')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('totalExpenses')}</Text>
                <Text style={styles.totalValue}>TZS {totalExpenses.toLocaleString()}</Text>
              </View>
              {cycle.costs.map((c) => (
                <View key={c.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.itemName}</Text>
                    <Text style={styles.rowSub}>{c.category.replace(/_/g, ' ')}</Text>
                  </View>
                  <Text style={styles.rowAmount}>TZS {c.totalCost.toLocaleString()}</Text>
                </View>
              ))}
            </>
          )
        ) : (
          cycle.revenues.length === 0 ? (
            <View style={styles.empty}>
              <HugeiconsIcon icon={CoinsDollarIcon} size={36} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noSalesYet')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('totalRevenue')}</Text>
                <Text style={styles.totalValue}>
                  TZS {cycle.revenues.reduce((s, r) => s + r.totalRevenue + (r.fairtradePremium ?? 0), 0).toLocaleString()}
                </Text>
              </View>
              {cycle.revenues.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{r.quantityKg}kg</Text>
                    <Text style={styles.rowSub}>{r.revenueType.replace(/_/g, ' ')}</Text>
                  </View>
                  <Text style={styles.rowAmount}>TZS {r.totalRevenue.toLocaleString()}</Text>
                </View>
              ))}
            </>
          )
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={fabAction}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={fabLabel}
      >
        <HugeiconsIcon icon={Add01Icon} size={26} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 110 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  season: { fontSize: 18, fontWeight: '900', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  harvestBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  harvestBtnText: { color: '#B45309', fontWeight: '700', fontSize: 12 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 10 },
  saveBtn: { backgroundColor: '#065F46', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  calendarCard: { backgroundColor: '#ECFDF5', borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#A7F3D0' },
  calendarTitle: { fontSize: 15, fontWeight: '900', color: '#065F46', marginBottom: 6 },
  readiness: { fontSize: 11, marginBottom: 8, fontWeight: '700' }, readinessOk: { color: '#047857' }, readinessPending: { color: '#B45309' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#D1FAE5' },
  taskDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#F59E0B' }, taskDotDone: { backgroundColor: '#10B981' },
  taskDotWarn: { backgroundColor: '#EF4444' },
  taskTitle: { fontWeight: '700', color: '#064E3B', fontSize: 13 }, taskDue: { fontSize: 11, color: '#6B7280', marginTop: 1 }, taskOpen: { color: '#047857', fontSize: 11, fontWeight: '800' }, taskDone: { color: '#059669', fontSize: 11, fontWeight: '800' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  tabTextActive: { color: '#fff' },
  empty: { alignItems: 'center', marginTop: 30, paddingHorizontal: 24 },
  emptyText: { color: '#6B7280', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  rowSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowTime: { fontSize: 11, color: '#9CA3AF', marginLeft: 8 },
  rowAmount: { fontSize: 13, fontWeight: '800', color: '#111827' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, marginBottom: 12 },
  totalLabel: { fontSize: 13, color: '#065F46', fontWeight: '700' },
  totalValue: { fontSize: 14, color: '#065F46', fontWeight: '900' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#065F46',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
});

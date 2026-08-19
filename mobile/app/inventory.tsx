import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Package01Icon, Add01Icon } from '@hugeicons/core-free-icons';
import { inventoryApi, cropCyclesApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

interface InventoryRecord {
  id: string;
  trackingCode: string;
  weightKg: number;
  qualityGrade?: string | null;
  moistureContentPct?: number | null;
  status: string;
  warehouseLocation?: string | null;
  receivedDate: string;
  lotNumber?: string | null;
  farm?: { farmCode?: string } | null;
  cropCycle?: { season?: string; riceVariety?: string | null } | null;
  lot?: { lotNumber?: string } | null;
}

interface Summary {
  recordCount: number;
  totalKg: number;
  inWarehouseKg: number;
  batchedOrSoldKg: number;
}

export default function InventoryScreen() {
  const { cropCycleId: paramCycleId } = useLocalSearchParams<{ cropCycleId?: string }>();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [cycles, setCycles] = useState<any[]>([]);
  const [cycleId, setCycleId] = useState(paramCycleId || '');
  const [weightKg, setWeightKg] = useState('');
  const [moisture, setMoisture] = useState('');
  const [grade, setGrade] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        inventoryApi.mine(paramCycleId ? { cropCycleId: paramCycleId } : undefined),
        inventoryApi.mySummary(),
      ]);
      setRecords(listRes.data || []);
      setSummary(sumRes.data || null);
    } catch {
      setRecords([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [paramCycleId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openReport = async () => {
    setReportOpen(true);
    if (!cycleId) {
      try {
        const res = await cropCyclesApi.getAll();
        const list = (res.data?.data || res.data || []).filter(
          (c: any) => c.status === 'HARVESTED' || c.status === 'ACTIVE' || c.status === 'COMPLETED',
        );
        setCycles(list);
        if (paramCycleId) setCycleId(paramCycleId);
        else if (list[0]) setCycleId(list[0].id);
      } catch {
        setCycles([]);
      }
    }
  };

  const submitReport = async () => {
    if (!cycleId || !weightKg.trim()) {
      Alert.alert(t('warehouseStock'), t('fillDeliveryFields'));
      return;
    }
    setSubmitting(true);
    try {
      await inventoryApi.reportDelivery({
        cropCycleId: cycleId,
        weightKg: Number(weightKg),
        moistureContentPct: moisture ? Number(moisture) : undefined,
        qualityGrade: grade.trim() || undefined,
      });
      setReportOpen(false);
      setWeightKg('');
      setMoisture('');
      setGrade('');
      Alert.alert(t('warehouseStock'), t('deliveryReported'));
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(
        t('warehouseStock'),
        Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('warehouseStock') }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>{t('warehouseStockIntro')}</Text>

        {summary && (
          <View style={styles.summaryRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Math.round(summary.inWarehouseKg).toLocaleString()}</Text>
              <Text style={styles.statLabel}>{t('inWarehouseKg')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Math.round(summary.batchedOrSoldKg).toLocaleString()}</Text>
              <Text style={styles.statLabel}>{t('batchedSoldKg')}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{summary.recordCount}</Text>
              <Text style={styles.statLabel}>{t('receiptsCount')}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.primaryBtn} onPress={openReport}>
          <HugeiconsIcon icon={Add01Icon} size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.primaryBtnText}>{t('reportDelivery')}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#10B981" style={{ marginTop: 32 }} />
        ) : !records.length ? (
          <View style={styles.empty}>
            <HugeiconsIcon icon={Package01Icon} size={40} color="#D1FAE5" strokeWidth={1.5} />
            <Text style={styles.emptyText}>{t('noWarehouseReceipts')}</Text>
          </View>
        ) : (
          records.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.code}>{r.trackingCode}</Text>
              <Text style={styles.meta}>
                {r.weightKg} kg · {r.status.replace(/_/g, ' ')}
                {r.qualityGrade ? ` · ${r.qualityGrade}` : ''}
                {r.moistureContentPct != null ? ` · ${r.moistureContentPct}%` : ''}
              </Text>
              <Text style={styles.meta}>
                {[r.farm?.farmCode, r.cropCycle?.season, r.lot?.lotNumber || r.lotNumber]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={styles.date}>{new Date(r.receivedDate).toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReportOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('reportDelivery')}</Text>
            <Text style={styles.modalHint}>{t('reportDeliveryHint')}</Text>

            {!paramCycleId && cycles.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.fieldLabel}>{t('cropCycle')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {cycles.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, cycleId === c.id && styles.chipActive]}
                      onPress={() => setCycleId(c.id)}
                    >
                      <Text style={[styles.chipText, cycleId === c.id && styles.chipTextActive]}>
                        {c.farm?.farmCode || 'Farm'} · {c.season}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.fieldLabel}>{t('weightKg')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={weightKg}
              onChangeText={setWeightKg}
              placeholder="450"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.fieldLabel}>{t('moistureOptional')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={moisture}
              onChangeText={setMoisture}
              placeholder="13.5"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.fieldLabel}>{t('gradeOptional')}</Text>
            <TextInput
              style={styles.input}
              value={grade}
              onChangeText={setGrade}
              placeholder="A / B / C"
              placeholderTextColor="#9CA3AF"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              onPress={submitReport}
              disabled={submitting}
            >
              <Text style={styles.primaryBtnText}>
                {submitting ? t('saving') : t('submitDelivery')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setReportOpen(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: '#6B7280' }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 16, paddingBottom: 40 },
  intro: { color: '#6B7280', fontSize: 13, marginBottom: 14, lineHeight: 18 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stat: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: '#065F46' },
  statLabel: { fontSize: 10, color: '#6B7280', marginTop: 4 },
  primaryBtn: {
    backgroundColor: '#065F46', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  code: { fontFamily: 'monospace', fontWeight: '700', color: '#047857', fontSize: 14 },
  meta: { color: '#6B7280', fontSize: 12, marginTop: 4 },
  date: { color: '#9CA3AF', fontSize: 11, marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalHint: { color: '#6B7280', fontSize: 12, marginTop: 6, marginBottom: 14, lineHeight: 17 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, marginTop: 6, color: '#111827',
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#D1FAE5' },
  chipText: { fontSize: 12, color: '#4B5563' },
  chipTextActive: { color: '#065F46', fontWeight: '700' },
});

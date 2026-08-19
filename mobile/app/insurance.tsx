import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Shield01Icon, Add01Icon } from '@hugeicons/core-free-icons';
import { insuranceApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

interface Claim {
  id: string;
  incidentType: string;
  description?: string | null;
  claimedAmount: number;
  paidAmount?: number | null;
  status: string;
  createdAt: string;
  inspectionDate?: string | null;
  inspectionNotes?: string | null;
  paidAt?: string | null;
}

interface Policy {
  id: string;
  productType: string;
  status: string;
  riceVariety?: string | null;
  insuredAreaHectares: number;
  sumInsured: number;
  premiumAmount: number;
  startDate?: string | null;
  endDate?: string | null;
  provider?: { name: string } | null;
  farm?: { farmCode: string } | null;
  claims: Claim[];
}

function ClaimTimeline({ claim }: { claim: Claim }) {
  const { t } = useI18n();
  const status = claim.status;
  const steps = [
    { key: 'SUBMITTED', label: t('claimSubmitted'), reached: true },
    {
      key: 'INSPECTING',
      label: t('claimInspecting'),
      reached: ['INSPECTING', 'APPROVED', 'REJECTED', 'PAID'].includes(status),
    },
    {
      key: 'DECISION',
      label: status === 'REJECTED' ? t('claimRejected') : t('claimApproved'),
      reached: ['APPROVED', 'REJECTED', 'PAID'].includes(status),
    },
    { key: 'PAID', label: t('claimPaid'), reached: status === 'PAID' },
  ];
  return (
    <View style={styles.timeline}>
      {steps.map((step, index) => (
        <View key={step.key} style={styles.timelineStep}>
          <View style={[styles.dot, step.reached && styles.dotOn]} />
          {index < steps.length - 1 && <View style={[styles.line, step.reached && styles.lineOn]} />}
          <Text style={[styles.timelineLabel, step.reached && styles.timelineLabelOn]}>{step.label}</Text>
        </View>
      ))}
      {!!claim.inspectionNotes && (
        <Text style={styles.note}>{t('inspectionNotes')}: {claim.inspectionNotes}</Text>
      )}
    </View>
  );
}

export default function InsuranceScreen() {
  const { t } = useI18n();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimOpen, setClaimOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    policyId: '',
    incidentDate: new Date().toISOString().slice(0, 10),
    incidentType: '',
    description: '',
    claimedAmount: '',
  });

  const activePolicies = useMemo(
    () => policies.filter((p) => p.status === 'ACTIVE'),
    [policies],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await insuranceApi.myPolicies();
      setPolicies(res.data || []);
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const submitClaim = async () => {
    if (!form.policyId || !form.incidentType.trim() || !form.claimedAmount) {
      Alert.alert(t('insurance'), t('claimFormIncomplete'));
      return;
    }
    setSaving(true);
    try {
      await insuranceApi.createClaim({
        policyId: form.policyId,
        incidentDate: new Date(form.incidentDate).toISOString(),
        incidentType: form.incidentType.trim(),
        description: form.description.trim() || undefined,
        claimedAmount: Number(form.claimedAmount),
      });
      setClaimOpen(false);
      setForm({
        policyId: '',
        incidentDate: new Date().toISOString().slice(0, 10),
        incidentType: '',
        description: '',
        claimedAmount: '',
      });
      Alert.alert(t('insurance'), t('claimFiled'));
      await load();
    } catch (error: any) {
      const message = error?.response?.data?.message;
      Alert.alert(
        t('insurance'),
        Array.isArray(message) ? message.join('\n') : message || t('claimFileFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('insurance') }} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.intro}>{t('insuranceIntro')}</Text>
            {activePolicies.length > 0 && (
              <TouchableOpacity style={styles.claimBtn} onPress={() => setClaimOpen(true)}>
                <HugeiconsIcon icon={Add01Icon} size={16} color="#fff" strokeWidth={2} />
                <Text style={styles.claimBtnText}>{t('fileClaim')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {policies.length === 0 ? (
            <View style={styles.empty}>
              <HugeiconsIcon icon={Shield01Icon} size={40} color="#D1D5DB" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noInsurancePolicies')}</Text>
            </View>
          ) : (
            policies.map((policy) => (
              <View key={policy.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>
                    {policy.productType.replace(/_/g, ' ')}
                  </Text>
                  <View style={[styles.badge, policy.status === 'ACTIVE' ? styles.badgeGreen : styles.badgeGray]}>
                    <Text style={styles.badgeText}>{policy.status}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {policy.provider?.name || t('insurer')}
                  {policy.farm?.farmCode ? ` · ${policy.farm.farmCode}` : ''}
                  {policy.riceVariety ? ` · ${policy.riceVariety}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {t('sumInsured')}: TZS {Math.round(policy.sumInsured).toLocaleString()} · {t('premium')}: TZS {Math.round(policy.premiumAmount).toLocaleString()}
                </Text>
                <Text style={styles.meta}>
                  {t('insuredArea')}: {policy.insuredAreaHectares} ha
                </Text>

                {policy.claims?.length ? (
                  <View style={styles.claimsBlock}>
                    <Text style={styles.claimsTitle}>{t('claimsHistory')}</Text>
                    {policy.claims.map((claim) => (
                      <View key={claim.id} style={styles.claimCard}>
                        <View style={styles.cardTop}>
                          <Text style={styles.claimTitle}>{claim.incidentType}</Text>
                          <Text style={styles.claimAmount}>TZS {Math.round(claim.claimedAmount).toLocaleString()}</Text>
                        </View>
                        {!!claim.description && <Text style={styles.meta}>{claim.description}</Text>}
                        <ClaimTimeline claim={claim} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noClaims}>{t('noClaimsYet')}</Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={claimOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setClaimOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{t('fileClaim')}</Text>
            <Text style={styles.label}>{t('policy')}</Text>
            <View style={styles.selectWrap}>
              {activePolicies.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.selectOption, form.policyId === p.id && styles.selectOptionOn]}
                  onPress={() => setForm((c) => ({ ...c, policyId: p.id }))}
                >
                  <Text style={styles.selectText}>
                    {p.productType.replace(/_/g, ' ')} · {p.provider?.name || t('insurer')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('incidentDate')}</Text>
            <TextInput
              style={styles.input}
              value={form.incidentDate}
              onChangeText={(value) => setForm((c) => ({ ...c, incidentDate: value }))}
              placeholder="YYYY-MM-DD"
            />
            <Text style={styles.label}>{t('incidentType')}</Text>
            <TextInput
              style={styles.input}
              value={form.incidentType}
              onChangeText={(value) => setForm((c) => ({ ...c, incidentType: value }))}
              placeholder={t('incidentTypePlaceholder')}
            />
            <Text style={styles.label}>{t('notesLabel')}</Text>
            <TextInput
              style={[styles.input, styles.multi]}
              multiline
              value={form.description}
              onChangeText={(value) => setForm((c) => ({ ...c, description: value }))}
            />
            <Text style={styles.label}>{t('claimedAmount')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={form.claimedAmount}
              onChangeText={(value) => setForm((c) => ({ ...c, claimedAmount: value }))}
            />
            <TouchableOpacity style={styles.submit} disabled={saving} onPress={submitClaim}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('submitClaim')}</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { marginBottom: 14, gap: 10 },
  intro: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  claimBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#065F46', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  claimBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827', flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeGreen: { backgroundColor: '#D1FAE5' },
  badgeGray: { backgroundColor: '#E5E7EB' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#065F46' },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 4, lineHeight: 17 },
  claimsBlock: { marginTop: 12, gap: 8 },
  claimsTitle: { fontSize: 13, fontWeight: '800', color: '#065F46' },
  claimCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  claimTitle: { fontSize: 13, fontWeight: '700', color: '#111827', flex: 1 },
  claimAmount: { fontSize: 12, fontWeight: '800', color: '#047857' },
  noClaims: { marginTop: 10, fontSize: 12, color: '#9CA3AF' },
  timeline: { marginTop: 10, gap: 6 },
  timelineStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  dotOn: { backgroundColor: '#10B981' },
  line: { display: 'none' },
  lineOn: {},
  timelineLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  timelineLabelOn: { color: '#047857' },
  note: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '88%' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827', marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '800', color: '#374151', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 12, color: '#111827' },
  multi: { minHeight: 72, textAlignVertical: 'top' },
  selectWrap: { gap: 6 },
  selectOption: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, backgroundColor: '#F9FAFB' },
  selectOptionOn: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  selectText: { fontSize: 13, color: '#111827', fontWeight: '600' },
  submit: { marginTop: 16, backgroundColor: '#065F46', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8 },
  submitText: { color: '#fff', fontWeight: '900' },
});


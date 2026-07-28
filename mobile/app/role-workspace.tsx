import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Alert02Icon, ArrowRight01Icon, ClipboardIcon, MapsSearchIcon, Plant01Icon, TaskDaily01Icon, UserGroupIcon } from '@hugeicons/core-free-icons';
import { workspaceApi } from '../src/lib/data';

type Props = { role: string };

const COPY: Record<string, { title: string; subtitle: string; primary: string; route: string; icon: any }> = {
  FIELD_OFFICER: { title: 'Field Officer Workspace', subtitle: 'Verify renters, capture field evidence, and complete assigned work.', primary: 'Open field surveys', route: '/field-survey', icon: MapsSearchIcon },
  MAMCOS_SECRETARY: { title: 'AMCOS Officer Workspace', subtitle: 'Manage your AMCOS registry, renter assignments, and operational exceptions.', primary: 'Manage farms', route: '/farms', icon: ClipboardIcon },
  ADMIN: { title: 'Management Workspace', subtitle: 'Use the MAYODE web dashboard for complete administration and reporting.', primary: 'Open web dashboard', route: '/profile', icon: UserGroupIcon },
  SUPER_ADMIN: { title: 'Management Workspace', subtitle: 'Use the MAYODE web dashboard for complete administration and reporting.', primary: 'Open web dashboard', route: '/profile', icon: UserGroupIcon },
};

export default function RoleWorkspaceDashboard({ role }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const copy = COPY[role] ?? COPY.FIELD_OFFICER;
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setContext((await workspaceApi.context()).data); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const metrics = context?.metrics ?? {};
  const queue = context?.workQueue ?? [];

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}><HugeiconsIcon icon={copy.icon} size={28} color="#fff" strokeWidth={1.8} /></View>
        <View style={{ flex: 1 }}><Text style={styles.title}>{copy.title}</Text><Text style={styles.subtitle}>{copy.subtitle}</Text></View>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#059669" /> : <>
        <Text style={styles.section}>Today’s priorities</Text>
        <View style={styles.metrics}>
          {Object.entries(metrics).map(([key, value]) => <View style={styles.metric} key={key}><Text style={styles.metricValue}>{String(value)}</Text><Text style={styles.metricLabel}>{label(key)}</Text></View>)}
        </View>
        {queue.length > 0 && <>
          <Text style={styles.section}>Verification queue</Text>
          {queue.slice(0, 5).map((item: any) => <TouchableOpacity key={item.id} style={styles.queue} onPress={() => router.push({
            pathname: '/lease-verify',
            params: {
              leaseId: item.id,
              farmCode: item.farm?.farmCode || item.farm?.name || '',
              seasonName: item.farmingSeason?.name || '',
              renterName: item.renterFarmer ? `${item.renterFarmer.firstName} ${item.renterFarmer.lastName}` : (item.renterName || item.renterPhone || ''),
            },
          })}>
            <HugeiconsIcon icon={TaskDaily01Icon} size={20} color="#047857" strokeWidth={2} />
            <View style={{ flex: 1 }}><Text style={styles.queueTitle}>{item.farm?.name || item.farm?.farmCode || 'Farm verification'}</Text><Text style={styles.queueSub}>{item.renterFarmer ? `${item.renterFarmer.firstName} ${item.renterFarmer.lastName}` : 'Renter confirmation accepted'}</Text></View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} color="#6B7280" strokeWidth={2} />
          </TouchableOpacity>)}
        </>}
        {role === 'MAMCOS_SECRETARY' && <View style={styles.note}><HugeiconsIcon icon={Alert02Icon} size={20} color="#B45309" strokeWidth={2} /><Text style={styles.noteText}>Your workspace is restricted to your assigned AMCOS.</Text></View>}
        {role === 'MAMCOS_SECRETARY' && (
          <TouchableOpacity style={styles.secondary} onPress={() => router.push('/officer-new')}>
            <HugeiconsIcon icon={UserGroupIcon} size={19} color="#065F46" strokeWidth={2} />
            <Text style={styles.secondaryText}>Create Field Officer</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.primary} onPress={() => router.push(copy.route as any)}><HugeiconsIcon icon={Plant01Icon} size={19} color="#fff" strokeWidth={2} /><Text style={styles.primaryText}>{copy.primary}</Text></TouchableOpacity>
      </>}
    </ScrollView>
  );
}

function label(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F4F6', paddingHorizontal: 20 },
  hero: { backgroundColor: '#065F46', borderRadius: 22, padding: 20, flexDirection: 'row', gap: 14, alignItems: 'center' },
  heroIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 21, fontWeight: '800' }, subtitle: { color: '#D1FAE5', fontSize: 13, lineHeight: 19, marginTop: 5 },
  section: { color: '#111827', fontSize: 17, fontWeight: '800', marginTop: 26, marginBottom: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { backgroundColor: '#fff', borderRadius: 14, padding: 14, minWidth: '47%', flexGrow: 1 },
  metricValue: { color: '#047857', fontSize: 25, fontWeight: '800' }, metricLabel: { color: '#6B7280', fontSize: 12, marginTop: 4 },
  queue: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 }, queueTitle: { color: '#111827', fontSize: 14, fontWeight: '700' }, queueSub: { color: '#6B7280', fontSize: 12, marginTop: 3 },
  note: { marginTop: 18, backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }, noteText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 18 },
  primary: { backgroundColor: '#059669', borderRadius: 14, padding: 16, marginTop: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#065F46', borderRadius: 14, padding: 15, marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, secondaryText: { color: '#065F46', fontSize: 14, fontWeight: '800' },
});

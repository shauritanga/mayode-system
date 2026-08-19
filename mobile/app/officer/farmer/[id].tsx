import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { CheckmarkCircle02Icon, Cancel01Icon, Location01Icon, TaskDaily01Icon } from '@hugeicons/core-free-icons';
import { farmersApi, farmsApi, officerVisitsApi } from '../../../src/lib/data';
import { useI18n } from '../../../src/i18n';

export default function OfficerFarmerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [farmer, setFarmer] = useState<any>(null);
  const [farms, setFarms] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [farmerRes, farmsRes, visitsRes] = await Promise.all([
        farmersApi.getOne(id!),
        farmsApi.getByFarmerId(id!),
        officerVisitsApi.forFarmer(id!),
      ]);
      setFarmer(farmerRes.data);
      setFarms(farmsRes.data?.data ?? farmsRes.data ?? []);
      setVisits(visitsRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doVerify = async () => {
    setActing(true);
    try {
      await farmersApi.verify(id!, {});
      await load();
    } catch (e: any) {
      Alert.alert(t('myFarmers'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: t('myFarmers') }} />
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: farmer ? `${farmer.firstName} ${farmer.lastName}` : t('myFarmers') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <Text style={styles.name}>{farmer?.firstName} {farmer?.lastName}</Text>
          <Text style={styles.sub}>{farmer?.controlNumber}</Text>
          <Text style={styles.sub}>{farmer?.user?.phone}</Text>
          {!!farmer?.village && <Text style={styles.sub}>{farmer.village}, {farmer.ward}</Text>}
          <View style={[styles.badge, farmer?.verificationStatus === 'VERIFIED' ? styles.badgeGreen : styles.badgeGold]}>
            <Text style={[styles.badgeText, farmer?.verificationStatus === 'VERIFIED' ? styles.badgeTextGreen : styles.badgeTextGold]}>
              {farmer?.verificationStatus}
            </Text>
          </View>
          {farmer?.verificationStatus === 'PENDING' && (
            <TouchableOpacity style={styles.verifyBtn} onPress={doVerify} disabled={acting}>
              {acting ? <ActivityIndicator size="small" color="#fff" /> : (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="#fff" strokeWidth={2} />
              )}
              <Text style={styles.verifyBtnText}>{t('verified')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push({
            pathname: '/officer/visit-new',
            params: { farmerId: id, farmerName: `${farmer?.firstName ?? ''} ${farmer?.lastName ?? ''}`.trim() },
          })}
        >
          <HugeiconsIcon icon={Location01Icon} size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.primaryBtnText}>{t('logVisit')}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{t('farms')}</Text>
        {farms.length === 0 ? (
          <Text style={styles.emptyText}>{t('noFarmersFound')}</Text>
        ) : farms.map((farm: any) => (
          <View key={farm.id} style={styles.row}>
            <TouchableOpacity onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })}>
              <Text style={styles.rowTitle}>{farm.farmCode}</Text>
              <Text style={styles.rowSub}>{farm.socialHectares} ha · {t('gradeValue', { grade: farm.grade })}</Text>
            </TouchableOpacity>
            <View style={styles.farmActions}>
              <TouchableOpacity
                style={styles.farmActionBtn}
                onPress={() => router.push({
                  pathname: '/officer/visit-new',
                  params: {
                    farmerId: id,
                    farmerName: `${farmer?.firstName ?? ''} ${farmer?.lastName ?? ''}`.trim(),
                    farmId: farm.id,
                  },
                })}
              >
                <Text style={styles.farmActionText}>{t('logVisit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.farmActionBtn, styles.farmActionSecondary]}
                onPress={() => router.push({
                  pathname: '/crop-cycles/[farmId]',
                  params: { farmId: farm.id, farmCode: farm.farmCode },
                })}
              >
                <Text style={[styles.farmActionText, styles.farmActionSecondaryText]}>{t('seasonRecords')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>{t('visitHistory')}</Text>
        {visits.length === 0 ? (
          <Text style={styles.emptyText}>{t('noVisitsYet')}</Text>
        ) : visits.map((v: any) => (
          <View key={v.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <HugeiconsIcon icon={TaskDaily01Icon} size={16} color="#047857" strokeWidth={2} />
              <Text style={styles.rowTitle}>{v.purpose.replace(/_/g, ' ')}</Text>
            </View>
            <Text style={styles.rowSub}>{t('visitedOn', { date: new Date(v.visitedAt).toLocaleDateString() })}</Text>
            {!!v.notes && <Text style={styles.rowSub}>{v.notes}</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, marginTop: 10 },
  badgeGreen: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  badgeGold: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextGreen: { color: '#10B981' },
  badgeTextGold: { color: '#F59E0B' },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#065F46', borderRadius: 14, paddingVertical: 15, marginBottom: 20 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10, marginTop: 4 },
  emptyText: { fontSize: 13, color: '#9CA3AF', marginBottom: 16 },
  row: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  farmActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  farmActionBtn: {
    flex: 1,
    backgroundColor: '#065F46',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  farmActionSecondary: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  farmActionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  farmActionSecondaryText: { color: '#065F46' },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  rowSub: { fontSize: 12, color: '#6B7280', marginTop: 3 },
});

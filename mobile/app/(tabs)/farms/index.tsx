import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Add01Icon, Location01Icon, Tree02Icon } from '@hugeicons/core-free-icons';
import { farmsApi } from '../../../src/lib/data';
import { useAuthStore } from '../../../src/store/auth.store';
import { StatusBar } from 'expo-status-bar';
import { useI18n } from '../../../src/i18n';

interface Farm {
  id: string;
  farmCode: string;
  socialHectares: number;
  actualAcres?: number;
  grade: string;
  hasIrrigation: boolean;
  isLeased: boolean;
  isVerified: boolean;
  boundaryCoordinates?: object;
  centerLatitude?: number;
  centerLongitude?: number;
  farmer?: { firstName: string; lastName: string };
  mamcos?: { name: string };
}

export default function FarmsIndex() {
  const router = useRouter();
  const { farmerId } = useAuthStore();
  const { t } = useI18n();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFarms = async () => {
    setLoading(true);
    try {
      const res = farmerId ? await farmsApi.getByFarmerId(farmerId) : await farmsApi.getAll();
      setFarms(res.data?.data || res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchFarms(); }, [farmerId]));

  const gradeColors: Record<string, { bg: string; text: string }> = {
    A: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' },
    B: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
    C: { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B' },
  };

  return (
    <View style={styles.container}>
    <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFarms} tintColor="#10B981" />}
      >
        {farms.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <HugeiconsIcon icon={Tree02Icon} size={56} color="#D1FAE5" strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>{t('noFarmsYetTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('tapPlusRegisterFarm')}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/farm-register')}>
              <Text style={styles.emptyBtnText}>{t('registerFirstFarm')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          farms.map((farm) => {
            const grade = gradeColors[farm.grade] || gradeColors.B;
            const hasGPS = !!farm.centerLatitude && !!farm.centerLongitude;
            return (
              <TouchableOpacity
                key={farm.id}
                style={styles.farmCard}
                onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })}
                activeOpacity={0.8}
              >
                <View style={styles.farmHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.farmCode}>{farm.farmCode}</Text>
                    {farm.farmer && (
                      <Text style={styles.farmerName}>{farm.farmer.firstName} {farm.farmer.lastName}</Text>
                    )}
                    {farm.mamcos && (
                      <Text style={styles.mamcosName}>📍 {farm.mamcos.name}</Text>
                    )}
                  </View>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: grade.bg }]}>
                      <Text style={[styles.badgeText, { color: grade.text }]}>{t('gradeValue', { grade: farm.grade })}</Text>
                    </View>
                    <View style={[styles.badge, farm.isVerified ? styles.badgeGreen : styles.badgeGold]}>
                      <Text style={[styles.badgeText, farm.isVerified ? styles.badgeTextGreen : styles.badgeTextGold]}>
                        {farm.isVerified ? t('verified') : t('pending')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('socialHectares')}</Text>
                    <Text style={styles.detailValue}>{farm.socialHectares} ha</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('actualAcres')}</Text>
                    <Text style={styles.detailValue}>{farm.actualAcres ? `${farm.actualAcres} ac` : '—'}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('irrigation')}</Text>
                    <Text style={[styles.detailValue, { color: farm.hasIrrigation ? '#10B981' : '#9CA3AF' }]}>
                      {farm.hasIrrigation ? t('yesMark') : t('noMark')}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('gpsBoundary')}</Text>
                    <Text style={[styles.detailValue, { color: hasGPS ? '#10B981' : '#9CA3AF' }]}>
                      {hasGPS ? t('mappedPin') : t('notMappedWarn')}
                    </Text>
                  </View>
                </View>

                {!hasGPS && (
                  <TouchableOpacity
                    style={styles.gpsPrompt}
                    onPress={() => router.push({ pathname: '/boundary', params: { id: farm.id } })}
                  >
                    <HugeiconsIcon icon={Location01Icon} size={16} color="#3B82F6" strokeWidth={2} />
                    <Text style={styles.gpsPromptText}>{t('tapWalkGps')}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Floating action button — register a farm */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => router.push('/farm-register')}
      >
        <HugeiconsIcon icon={Add01Icon} size={28} color="#fff" strokeWidth={2.2} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  scrollContent: { padding: 16, paddingBottom: 100 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyBtn: {
    backgroundColor: '#10B981', paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  farmCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  farmHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  farmCode: { fontSize: 18, fontWeight: '800', color: '#10B981' },
  farmerName: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 2 },
  mamcosName: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badgeRow: { flexDirection: 'column', alignItems: 'flex-end', gap: 6 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  badgeGreen: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  badgeGold: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextGreen: { color: '#10B981' },
  badgeTextGold: { color: '#F59E0B' },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailItem: {
    width: '48%', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  detailLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 3 },
  detailValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  gpsPrompt: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 6,
  },
  gpsPromptText: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },
});

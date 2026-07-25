import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { marketplaceApi } from '../../src/lib/data';
import { useAuthStore } from '../../src/store/auth.store';
import { useI18n } from '../../src/i18n';

export default function MarketplaceTab() {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [tab, setTab] = useState<'land' | 'tractors'>('land');
  const [listings, setListings] = useState<any[]>([]);
  const [tractors, setTractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMarketplace = async () => {
    setLoading(true);
    try {
      const [landRes, tractorRes] = await Promise.allSettled([
        marketplaceApi.getLandListings(),
        marketplaceApi.getTractors(),
      ]);

      if (landRes.status === 'fulfilled') setListings(landRes.value.data || []);
      if (tractorRes.status === 'fulfilled') setTractors(tractorRes.value.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketplace();
  }, []);

  const handleBookTractor = async (tractorId: string) => {
    if (!user) {
      Alert.alert(t('authRequired'), t('tractorAuthRequired'));
      return;
    }

    try {
      await marketplaceApi.bookTractor({
        tractorId,
        farmerId: user.id,
        hectares: 2.0,
        terrainGrade: 'B',
        commissionRate: 0.05,
        scheduledDate: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
      });
      Alert.alert(t('bookingConfirmed'), t('tractorBooked'));
      fetchMarketplace();
    } catch (e: any) {
      Alert.alert(t('bookingFailed'), e.response?.data?.message || t('bookingFailedMessage'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'land' && styles.tabBtnActive]}
          onPress={() => setTab('land')}
        >
          <Text style={[styles.tabText, tab === 'land' && styles.tabTextActive]}>{t('landListings')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'tractors' && styles.tabBtnActive]}
          onPress={() => setTab('tractors')}
        >
          <Text style={[styles.tabText, tab === 'tractors' && styles.tabTextActive]}>{t('tractors')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchMarketplace} tintColor="#10B981" />}
      >
        {tab === 'land' ? (
          listings.length === 0 && !loading ? (
            <Text style={styles.emptyText}>{t('noLandListings')}</Text>
          ) : (
            listings.map((l) => (
              <View key={l.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.farmCode}>{l.farm?.farmCode || t('farm')}</Text>
                    <Text style={styles.subText}>{l.farm?.socialHectares || '—'} ha · {t('gradeValue', { grade: l.farm?.grade || 'A' })}</Text>
                  </View>
                  <View style={[styles.badge, styles.badgeGold]}>
                    <Text style={styles.badgeTextGold}>{l.dealType}</Text>
                  </View>
                </View>

                <View style={styles.priceBox}>
                  <Text style={styles.priceLabel}>{t('askingPrice')}</Text>
                  <Text style={styles.priceValue}>{Number(l.askingPrice).toLocaleString()} TZS</Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.ownerText}>👤 {l.owner?.firstName} {l.owner?.lastName}</Text>
                  <Text style={styles.statusText}>{l.leaseStatus}</Text>
                </View>
              </View>
            ))
          )
        ) : (
          tractors.length === 0 && !loading ? (
            <Text style={styles.emptyText}>{t('noTractors')}</Text>
          ) : (
            tractors.map((tractor) => (
              <View key={tractor.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.tractorModel}>{tractor.model || t('tractors')}</Text>
                    <Text style={styles.regNo}>{tractor.registrationNo}</Text>
                  </View>
                  <View style={[styles.badge, tractor.isAvailable ? styles.badgeGreen : styles.badgeRed]}>
                    <Text style={[styles.badgeText, tractor.isAvailable ? styles.badgeTextGreen : styles.badgeTextRed]}>
                      {tractor.isAvailable ? t('available') : t('booked')}
                    </Text>
                  </View>
                </View>

                <View style={styles.tractorDetails}>
                  <Text style={styles.tractorDetailText}>📍 {tractor.location || t('locationUnknown')}</Text>
                  <Text style={styles.tractorDetailText}>⚡ {tractor.horsePower || '—'} HP</Text>
                  <Text style={styles.tractorPriceText}>{tractor.pricePerHectare ? `${Number(tractor.pricePerHectare).toLocaleString()} TZS/ha` : '—'}</Text>
                </View>

                {tractor.isAvailable && (
                  <TouchableOpacity style={styles.bookBtn} onPress={() => handleBookTractor(tractor.id)}>
                    <Text style={styles.bookBtnText}>{t('bookTractorService')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingTop: -50,
    paddingBottom: -24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#10B981',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 20,
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 15,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  farmCode: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  subText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  tractorModel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  regNo: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 2,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeGreen: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' },
  badgeGold: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' },
  badgeRed: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextGreen: { color: '#10B981' },
  badgeTextGold: { color: '#F59E0B' },
  badgeTextRed: { color: '#F87171' },
  priceBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  priceLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10B981',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 14,
  },
  ownerText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  statusText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  tractorDetails: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  tractorDetailText: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 4,
  },
  tractorPriceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 6,
  },
  bookBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bookBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

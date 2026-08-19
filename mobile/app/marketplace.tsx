import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { marketplaceApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';
import { LandListingCard } from '../src/components/marketplace/LandListingCard';
import { TractorCard } from '../src/components/marketplace/TractorCard';

/** M-LAX marketplace — opened from the drawer like Finances / Leases (stack + back). */
export default function MarketplaceScreen() {
  const { user, farmerId } = useAuthStore();
  const router = useRouter();
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

  useFocusEffect(useCallback(() => { fetchMarketplace(); }, []));

  const handleBookTractor = async (tractorId: string) => {
    if (!user || !farmerId) {
      Alert.alert(t('authRequired'), t('tractorAuthRequired'));
      return;
    }

    try {
      await marketplaceApi.bookTractor({
        tractorId,
        farmerId,
        hectares: 2.0,
        terrainGrade: 'B',
        commissionRate: 0.1,
        scheduledDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      });
      Alert.alert(t('bookingConfirmed'), t('tractorBooked'));
      fetchMarketplace();
    } catch (e: any) {
      Alert.alert(t('bookingFailed'), e.response?.data?.message || t('bookingFailedMessage'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('marketplace'),
          headerStyle: { backgroundColor: '#065F46' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800' },
        }}
      />

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
              <LandListingCard key={l.id} listing={l} onPress={() => router.push(`/land-listing/${l.id}` as any)} />
            ))
          )
        ) : (
          tractors.length === 0 && !loading ? (
            <Text style={styles.emptyText}>{t('noTractors')}</Text>
          ) : (
            tractors.map((tractor) => (
              <TractorCard key={tractor.id} tractor={tractor} onBook={() => handleBookTractor(tractor.id)} />
            ))
          )
        )}

        {tab === 'land' && farmerId && (
          <TouchableOpacity style={styles.fabBtn} onPress={() => router.push('/land-listing-new' as any)}>
            <Text style={styles.fabBtnText}>{t('mlaxCreateListing')}</Text>
          </TouchableOpacity>
        )}
        {tab === 'land' && user?.role && ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY'].includes(user.role) && (
          <TouchableOpacity style={[styles.fabBtn, styles.fabBtnSecondary]} onPress={() => router.push('/agent-list-farm' as any)}>
            <Text style={styles.fabBtnText}>{t('mlaxAgentListFarm')}</Text>
          </TouchableOpacity>
        )}
        {tab === 'tractors' && (
          <TouchableOpacity style={styles.fabBtn} onPress={() => router.push('/my-tractors' as any)}>
            <Text style={styles.fabBtnText}>{t('mlaxMyTractors')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
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
  fabBtn: {
    backgroundColor: '#065F46',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  fabBtnSecondary: {
    backgroundColor: '#374151',
  },
  fabBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});

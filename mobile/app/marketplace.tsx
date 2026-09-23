import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { marketplaceApi, farmsApi, farmersApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';
import { LandListingCard } from '../src/components/marketplace/LandListingCard';
import { TractorCard } from '../src/components/marketplace/TractorCard';

export default function MarketplaceScreen() {
  const { user, farmerId } = useAuthStore();
  const router = useRouter();
  const { t } = useI18n();

  const [tab, setTab] = useState<'land' | 'tractors' | 'bookings'>('land');
  const [listings, setListings] = useState<any[]>([]);
  const [tractors, setTractors] = useState<any[]>([]);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking Modal State
  const [bookingTractor, setBookingTractor] = useState<any | null>(null);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [hectares, setHectares] = useState<string>('1.0');
  const [daysAhead, setDaysAhead] = useState<number>(3);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchMarketplace = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        marketplaceApi.getLandListings(),
        marketplaceApi.getTractors(),
      ];
      if (user) {
        promises.push(marketplaceApi.getMyTractorBookings());
        promises.push(farmerId ? farmsApi.getByFarmerId(farmerId) : farmersApi.me().then((res) => farmsApi.getByFarmerId(res.data.id)));
      }

      const results = await Promise.allSettled(promises);

      if (results[0].status === 'fulfilled') setListings(results[0].value.data || []);
      if (results[1].status === 'fulfilled') setTractors(results[1].value.data || []);
      if (results[2] && results[2].status === 'fulfilled') setMyBookings(results[2].value.data || []);
      if (results[3] && results[3].status === 'fulfilled') {
        const farmList = results[3].value.data || [];
        setFarms(farmList);
        if (farmList.length > 0 && !selectedFarmId) {
          setSelectedFarmId(farmList[0].id);
          if (farmList[0].socialHectares) {
            setHectares(String(farmList[0].socialHectares));
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchMarketplace(); }, [user, farmerId]));

  const handleOpenBookingModal = (tractor: any) => {
    if (!user || !farmerId) {
      Alert.alert(t('authRequired'), t('tractorAuthRequired'));
      return;
    }
    setBookingTractor(tractor);
  };

  const handleMyTractorsPress = async () => {
    try {
      const res = await marketplaceApi.getMyTractorOwner();
      if (res?.data?.id) {
        router.push({ pathname: '/my-tractors', params: { ownerId: res.data.id } } as any);
      } else {
        router.push('/tractor-register' as any);
      }
    } catch {
      router.push('/tractor-register' as any);
    }
  };

  const submitBooking = async () => {
    if (!bookingTractor || !farmerId) return;

    const numHectares = parseFloat(hectares);
    if (isNaN(numHectares) || numHectares <= 0) {
      Alert.alert(t('bookingFailed'), 'Please enter a valid hectare size.');
      return;
    }

    const selectedFarm = farms.find((f) => f.id === selectedFarmId);
    const terrainGrade = selectedFarm?.grade || 'B';
    const scheduledDate = new Date(Date.now() + 86400000 * daysAhead).toISOString();

    setBookingSubmitting(true);
    try {
      await marketplaceApi.bookTractor({
        tractorId: bookingTractor.id,
        farmerId,
        farmId: selectedFarmId || undefined,
        hectares: numHectares,
        terrainGrade,
        scheduledDate,
      });

      Alert.alert(t('bookingConfirmed'), t('tractorBookingSuccess'));
      setBookingTractor(null);
      await fetchMarketplace();
      setTab('bookings');
    } catch (e: any) {
      Alert.alert(t('bookingFailed'), e?.response?.data?.message || t('bookingFailedMessage'));
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    Alert.alert(t('cancelBooking'), 'Are you sure you want to cancel this booking request?', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cancelBooking'),
        style: 'destructive',
        onPress: async () => {
          setCancellingId(bookingId);
          try {
            await marketplaceApi.cancelTractorBooking(bookingId);
            Alert.alert(t('cancelBooking'), t('bookingCancelled'));
            fetchMarketplace();
          } catch (e: any) {
            Alert.alert(t('bookingFailed'), e?.response?.data?.message || 'Failed to cancel');
          } finally {
            setCancellingId(null);
          }
        },
      },
    ]);
  };

  // Pricing calculations for modal
  const selectedFarm = farms.find((f) => f.id === selectedFarmId);
  const currentGrade = selectedFarm?.grade || 'B';
  const gradeMultiplier = currentGrade === 'C' ? 1.3 : currentGrade === 'B' ? 1.15 : 1.0;
  const numHectares = parseFloat(hectares) || 0;
  const baseRate = bookingTractor?.pricePerHectare || 50000;
  const totalCost = Math.round(baseRate * numHectares * gradeMultiplier);

  const getStatusBadge = (status: string) => {
    let bg = '#FEF3C7';
    let text = '#92400E';
    if (status === 'CONFIRMED') {
      bg = '#DBEAFE';
      text = '#1E40AF';
    } else if (status === 'COMPLETED') {
      bg = '#D1FAE5';
      text = '#065F46';
    } else if (status === 'CANCELLED') {
      bg = '#FEE2E2';
      text = '#991B1B';
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor: bg }]}>
        <Text style={[styles.statusBadgeText, { color: text }]}>{status}</Text>
      </View>
    );
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
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'bookings' && styles.tabBtnActive]}
          onPress={() => setTab('bookings')}
        >
          <Text style={[styles.tabText, tab === 'bookings' && styles.tabTextActive]}>
            {t('myTractorBookings')} ({myBookings.length})
          </Text>
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
        ) : tab === 'tractors' ? (
          tractors.length === 0 && !loading ? (
            <Text style={styles.emptyText}>{t('noTractors')}</Text>
          ) : (
            tractors.map((tractor) => (
              <TractorCard key={tractor.id} tractor={tractor} onBook={() => handleOpenBookingModal(tractor)} />
            ))
          )
        ) : (
          myBookings.length === 0 && !loading ? (
            <Text style={styles.emptyText}>{t('noTractorBookingsYet')}</Text>
          ) : (
            myBookings.map((b) => (
              <View key={b.id} style={styles.bookingCard}>
                <View style={styles.bookingTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bookingTractorName}>
                      {b.tractor?.model || 'Tractor'} · {b.tractor?.registrationNo}
                    </Text>
                    <Text style={styles.bookingDate}>
                      {new Date(b.scheduledDate).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  {getStatusBadge(b.status)}
                </View>

                <View style={styles.bookingDetailsBox}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Farm:</Text>
                    <Text style={styles.detailVal}>{b.farm?.farmCode || b.farm?.name || 'Assigned Farm'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('hectaresToTill')}:</Text>
                    <Text style={styles.detailVal}>{b.hectares} ha (Grade {b.terrainGrade})</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('estimatedCost')}:</Text>
                    <Text style={[styles.detailVal, { color: '#059669', fontWeight: '800' }]}>
                      TZS {Math.round(b.totalPrice).toLocaleString()}
                    </Text>
                  </View>
                </View>

                {b.status === 'PENDING' && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => handleCancelBooking(b.id)}
                    disabled={cancellingId === b.id}
                  >
                    {cancellingId === b.id ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <Text style={styles.cancelBtnText}>{t('cancelBooking')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
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
          <TouchableOpacity style={styles.fabBtn} onPress={handleMyTractorsPress}>
            <Text style={styles.fabBtnText}>{t('mlaxMyTractors')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Booking Modal */}
      {bookingTractor && (
        <Modal
          visible={!!bookingTractor}
          transparent
          animationType="slide"
          onRequestClose={() => setBookingTractor(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('bookTractorModalTitle')}</Text>
                <TouchableOpacity onPress={() => setBookingTractor(null)}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSub}>
                {bookingTractor.model} · {bookingTractor.registrationNo} (TZS {Number(baseRate).toLocaleString()}/ha)
              </Text>

              {/* Select Farm */}
              <Text style={styles.fieldLabel}>{t('selectFarm')}</Text>
              {farms.length === 0 ? (
                <Text style={styles.warnText}>{t('noFarmsAvailableForBooking')}</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {farms.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.farmChip, selectedFarmId === f.id && styles.farmChipActive]}
                      onPress={() => {
                        setSelectedFarmId(f.id);
                        if (f.socialHectares) setHectares(String(f.socialHectares));
                      }}
                    >
                      <Text style={[styles.farmChipText, selectedFarmId === f.id && styles.farmChipTextActive]}>
                        {f.farmCode || f.name || 'Plot'} (Grade {f.grade || 'B'})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Hectares */}
              <Text style={styles.fieldLabel}>{t('hectaresToTill')}</Text>
              <TextInput
                style={styles.input}
                value={hectares}
                onChangeText={setHectares}
                keyboardType="numeric"
                placeholder="1.0"
              />

              {/* Service Date (Days ahead) */}
              <Text style={styles.fieldLabel}>{t('bookingDate')}</Text>
              <View style={styles.daysRow}>
                {[1, 2, 3, 5, 7].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayChip, daysAhead === d && styles.dayChipActive]}
                    onPress={() => setDaysAhead(d)}
                  >
                    <Text style={[styles.dayChipText, daysAhead === d && styles.dayChipTextActive]}>
                      +{d} {d === 1 ? 'day' : 'days'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Calculation Preview */}
              <View style={styles.calcBox}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>{t('terrainGrade')}:</Text>
                  <Text style={styles.calcVal}>Grade {currentGrade} ({gradeMultiplier}x)</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>{t('estimatedCost')}:</Text>
                  <Text style={[styles.calcVal, { color: '#059669', fontSize: 16, fontWeight: '800' }]}>
                    TZS {totalCost.toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.calcNote}>{t('platformCommissionNote')}</Text>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitBtn, bookingSubmitting && { opacity: 0.6 }]}
                onPress={submitBooking}
                disabled={bookingSubmitting}
              >
                {bookingSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>{t('bookNow')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#10B981',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
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
    marginTop: 12,
  },
  fabBtnSecondary: {
    backgroundColor: '#374151',
  },
  fabBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bookingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  bookingTractorName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  bookingDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  bookingDetailsBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  detailVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalCloseText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#9CA3AF',
    padding: 4,
  },
  modalSub: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 10,
    marginBottom: 6,
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  farmChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  farmChipActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#059669',
  },
  farmChipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  farmChipTextActive: {
    color: '#065F46',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dayChipActive: {
    backgroundColor: '#065F46',
    borderColor: '#065F46',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  dayChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calcBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calcLabel: {
    fontSize: 13,
    color: '#065F46',
  },
  calcVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  calcNote: {
    fontSize: 11,
    color: '#047857',
    marginTop: 6,
    fontStyle: 'italic',
  },
  submitBtn: {
    backgroundColor: '#065F46',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  warnText: {
    fontSize: 12,
    color: '#DC2626',
    marginBottom: 6,
  },
});

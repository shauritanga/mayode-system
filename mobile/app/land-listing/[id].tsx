import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { marketplaceApi } from '../../src/lib/data';
import { API_BASE_URL } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/auth.store';
import { useI18n } from '../../src/i18n';

export default function LandListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { farmerId, user } = useAuthStore();

  const [listing, setListing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPhone, setDepositPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [protection, setProtection] = useState<{ mayodeProtected: boolean; note: string } | null>(null);

  const [offers, setOffers] = useState<any[]>([]);
  const [newOfferAmount, setNewOfferAmount] = useState('');
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});

  const [rentSchedule, setRentSchedule] = useState<any | null>(null);
  const [improvementDesc, setImprovementDesc] = useState('');
  const [improvementAmount, setImprovementAmount] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await marketplaceApi.getLandListing(id);
      setListing(res.data);
      if (!depositAmount && res.data?.askingPrice) setDepositAmount(String(res.data.askingPrice));

      marketplaceApi.getProtectionStatus(id).then((r: any) => setProtection(r.data)).catch(() => setProtection(null));

      if (res.data?.leaseStatus === 'DRAFT') {
        marketplaceApi.getOffers(id).then((r: any) => setOffers(r.data ?? [])).catch(() => setOffers([]));
      }
      if (res.data?.isMultiYear && res.data?.leaseStatus === 'ACTIVE') {
        marketplaceApi.getRentSchedule(id).then((r: any) => setRentSchedule(r.data)).catch(() => setRentSchedule(null));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwner = !!farmerId && listing?.ownerId === farmerId;
  const isRenter = !!farmerId && listing?.renterId === farmerId;
  const isStaff = user?.role && ['SUPER_ADMIN', 'ADMIN', 'MAMCOS_SECRETARY', 'FIELD_OFFICER'].includes(user.role);

  const deposit = async () => {
    if (!farmerId) return;
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) {
      Alert.alert(t('mlaxDeposit'), t('mlaxDepositAmount'));
      return;
    }
    setBusy(true);
    try {
      const res = await marketplaceApi.depositEscrow(id, {
        renterId: farmerId,
        amount,
        phoneNumber: depositPhone.trim() || undefined,
        mpesaRef: `MANUAL-${Date.now()}`,
      });
      Alert.alert(t('mlaxDeposit'), res.data?.message || t('mlaxDepositSuccess'));
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('mlaxDeposit'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    setBusy(true);
    try {
      await marketplaceApi.releaseEscrow(id);
      Alert.alert(t('mlaxRelease'), t('mlaxReleaseSuccess'));
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('mlaxRelease'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const submitOffer = async () => {
    if (!farmerId) return;
    const offerAmount = Number(newOfferAmount);
    if (!offerAmount || offerAmount <= 0) return;
    setBusy(true);
    try {
      await marketplaceApi.submitOffer(id, { farmerId, offerAmount });
      setNewOfferAmount('');
      load();
    } catch (e: any) {
      Alert.alert(t('mlaxMakeOffer'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const respondToOffer = async (offerId: string, action: 'accept' | 'reject' | 'counter') => {
    if (!farmerId) return;
    const counterAmount = action === 'counter' ? Number(counterAmounts[offerId]) : undefined;
    if (action === 'counter' && !counterAmount) return;
    setBusy(true);
    try {
      await marketplaceApi.respondToOffer(id, offerId, { ownerId: farmerId, action, counterAmount });
      load();
    } catch (e: any) {
      Alert.alert(t('mlaxMakeOffer'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const respondToCounter = async (offerId: string, accept: boolean) => {
    if (!farmerId) return;
    setBusy(true);
    try {
      await marketplaceApi.respondToCounter(id, offerId, { farmerId, accept });
      load();
    } catch (e: any) {
      Alert.alert(t('mlaxMakeOffer'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const payInstallment = async () => {
    if (!farmerId) return;
    setBusy(true);
    try {
      const res = await marketplaceApi.payInstallment(id, { renterId: farmerId });
      Alert.alert(t('mlaxPayInstallment'), t('mlaxInstallmentPaid', { amount: String(res.data?.amountDue ?? '') }));
      load();
    } catch (e: any) {
      Alert.alert(t('mlaxPayInstallment'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const logImprovement = async () => {
    if (!farmerId) return;
    const amountTzs = Number(improvementAmount);
    if (!improvementDesc.trim() || !amountTzs) return;
    setBusy(true);
    try {
      await marketplaceApi.logImprovement(id, { renterId: farmerId, description: improvementDesc.trim(), amountTzs });
      setImprovementDesc('');
      setImprovementAmount('');
      Alert.alert(t('mlaxLogImprovement'), t('mlaxImprovementLogged'));
    } catch (e: any) {
      Alert.alert(t('mlaxLogImprovement'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const openAgreement = () => {
    if (!listing?.agreementPdfUrl) return;
    const url = listing.agreementPdfUrl.startsWith('http') ? listing.agreementPdfUrl : `${API_BASE_URL.replace('/api/v1', '')}${listing.agreementPdfUrl}`;
    Linking.openURL(url);
  };

  if (loading && !listing) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: t('mlaxListingDetail') }} />
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      </SafeAreaView>
    );
  }
  if (!listing) return null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: listing.farm?.farmCode || t('mlaxListingDetail') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.farmCode}>{listing.farm?.farmCode}</Text>
          <Text style={styles.subText}>{listing.dealType} · {listing.leaseStatus}</Text>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>{t('askingPrice')}</Text>
            <Text style={styles.priceValue}>{Number(listing.askingPrice).toLocaleString()} TZS</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('mlaxDealType')}</Text>
            <Text style={styles.detailValue}>{listing.dealType}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('mlaxLeaseDuration')}</Text>
            <Text style={styles.detailValue}>{listing.leaseDurationMonths} mo</Text>
          </View>
          {listing.owner && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('farm')}</Text>
              <Text style={styles.detailValue}>{listing.owner.firstName} {listing.owner.lastName}</Text>
            </View>
          )}
          {protection?.mayodeProtected && (
            <View style={styles.protectedBadge}>
              <Text style={styles.protectedBadgeText}>{t('mlaxProtected')}</Text>
            </View>
          )}
        </View>

        {listing.leaseStatus === 'DRAFT' && !isOwner && farmerId && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t('mlaxDepositAmount')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={depositAmount}
              onChangeText={setDepositAmount}
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.fieldLabel}>{t('mlaxDepositPhone')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              value={depositPhone}
              onChangeText={setDepositPhone}
              placeholder="0768680433"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity style={[styles.actionBtn, busy && { opacity: 0.6 }]} onPress={deposit} disabled={busy}>
              <Text style={styles.actionBtnText}>{t('mlaxDepositSubmit')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {listing.leaseStatus === 'DRAFT' && !isOwner && farmerId && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t('mlaxMakeOffer')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={newOfferAmount}
              onChangeText={setNewOfferAmount}
              placeholder="1800000"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity style={[styles.actionBtn, busy && { opacity: 0.6 }]} onPress={submitOffer} disabled={busy}>
              <Text style={styles.actionBtnText}>{t('mlaxSubmitOffer')}</Text>
            </TouchableOpacity>
            {offers.filter((o) => o.farmerId === farmerId && o.status === 'COUNTERED').map((o) => (
              <View key={o.id} style={styles.offerRow}>
                <Text style={styles.offerText}>{t('mlaxCounterReceived', { amount: Number(o.counterAmount).toLocaleString() })}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => respondToCounter(o.id, true)}><Text style={styles.smallBtnText}>{t('accept')}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtnSecondary} onPress={() => respondToCounter(o.id, false)}><Text style={styles.smallBtnSecondaryText}>{t('decline')}</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {listing.leaseStatus === 'DRAFT' && isOwner && offers.filter((o) => o.status === 'PENDING').length > 0 && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t('mlaxOffersReceived')}</Text>
            {offers.filter((o) => o.status === 'PENDING').map((o) => (
              <View key={o.id} style={styles.offerRow}>
                <Text style={styles.offerText}>{Number(o.offerAmount).toLocaleString()} TZS</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => respondToOffer(o.id, 'accept')}><Text style={styles.smallBtnText}>{t('accept')}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtnSecondary} onPress={() => respondToOffer(o.id, 'reject')}><Text style={styles.smallBtnSecondaryText}>{t('decline')}</Text></TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  keyboardType="numeric"
                  placeholder={t('mlaxCounterAmount')}
                  placeholderTextColor="#9CA3AF"
                  value={counterAmounts[o.id] ?? ''}
                  onChangeText={(v) => setCounterAmounts((c) => ({ ...c, [o.id]: v }))}
                />
                <TouchableOpacity style={styles.smallBtnSecondary} onPress={() => respondToOffer(o.id, 'counter')}>
                  <Text style={styles.smallBtnSecondaryText}>{t('mlaxSendCounter')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {listing.leaseStatus === 'PENDING_VERIFICATION' && isStaff && (
          <View style={styles.card}>
            <TouchableOpacity style={[styles.actionBtn, busy && { opacity: 0.6 }]} onPress={release} disabled={busy}>
              <Text style={styles.actionBtnText}>{t('mlaxRelease')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {listing.leaseStatus === 'ACTIVE' && (
          <View style={styles.card}>
            {listing.agreementPdfUrl && (
              <TouchableOpacity style={styles.linkBtn} onPress={openAgreement}>
                <Text style={styles.linkBtnText}>{t('mlaxViewAgreement')}</Text>
              </TouchableOpacity>
            )}
            {isRenter && (
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => router.push({ pathname: '/sub-lease-request', params: { listingId: id, renterId: farmerId } } as any)}
              >
                <Text style={styles.linkBtnText}>{t('mlaxRequestSubLease')}</Text>
              </TouchableOpacity>
            )}
            {isOwner && (
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => router.push({ pathname: '/ownership-transfer', params: { listingId: id, ownerId: farmerId } } as any)}
              >
                <Text style={styles.linkBtnText}>{t('mlaxTransferOwnership')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {listing.leaseStatus === 'ACTIVE' && listing.isMultiYear && rentSchedule && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t('mlaxRentSchedule')}</Text>
            {(rentSchedule.years ?? []).map((y: any) => (
              <View key={y.year} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('mlaxYear', { year: String(y.year) })}</Text>
                <Text style={styles.detailValue}>{Number(y.amount).toLocaleString()} TZS {y.paid ? '✓' : ''}</Text>
              </View>
            ))}
            {isRenter && listing.paymentPlan === 'ANNUAL' && rentSchedule.lastInstallmentYear < (rentSchedule.years?.length ?? 0) && (
              <TouchableOpacity style={[styles.actionBtn, busy && { opacity: 0.6 }]} onPress={payInstallment} disabled={busy}>
                <Text style={styles.actionBtnText}>{t('mlaxPayInstallment')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {listing.leaseStatus === 'ACTIVE' && listing.isMultiYear && isRenter && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t('mlaxLogImprovement')}</Text>
            <TextInput
              style={styles.input}
              value={improvementDesc}
              onChangeText={setImprovementDesc}
              placeholder={t('mlaxImprovementDescPlaceholder')}
              placeholderTextColor="#9CA3AF"
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              keyboardType="numeric"
              value={improvementAmount}
              onChangeText={setImprovementAmount}
              placeholder="300000"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity style={[styles.actionBtn, busy && { opacity: 0.6 }]} onPress={logImprovement} disabled={busy}>
              <Text style={styles.actionBtnText}>{t('mlaxLogImprovementSubmit')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmCode: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  subText: { fontSize: 13, color: '#6B7280', marginTop: 2, marginBottom: 12 },
  priceBox: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  priceLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 2 },
  priceValue: { fontSize: 22, fontWeight: '800', color: '#10B981' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  detailLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  detailValue: { fontSize: 13, color: '#111827', fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  actionBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  linkBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F0FDF4', marginBottom: 10, borderWidth: 1, borderColor: '#A7F3D0' },
  linkBtnText: { color: '#065F46', fontWeight: '700', fontSize: 14 },
  protectedBadge: { marginTop: 12, backgroundColor: '#ECFDF5', borderRadius: 10, borderWidth: 1, borderColor: '#A7F3D0', paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' },
  protectedBadgeText: { color: '#065F46', fontWeight: '700', fontSize: 11 },
  offerRow: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10, marginTop: 10 },
  offerText: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 6 },
  smallBtn: { backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  smallBtnSecondary: { borderWidth: 1, borderColor: '#EF4444', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, marginTop: 6 },
  smallBtnSecondaryText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
});

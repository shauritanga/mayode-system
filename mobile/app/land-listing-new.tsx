import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { farmsApi, marketplaceApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

const DEAL_TYPES = ['STANDARD', 'FLASH_DEAL', 'RELATIONSHIP'] as const;

export default function LandListingNew() {
  const router = useRouter();
  const { t } = useI18n();
  const farmerId = useAuthStore((s) => s.farmerId);

  const [farms, setFarms] = useState<any[]>([]);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [selectedFarm, setSelectedFarm] = useState<any | null>(null);

  const [askingPrice, setAskingPrice] = useState('');
  const [dealType, setDealType] = useState<(typeof DEAL_TYPES)[number]>('STANDARD');
  const [leaseDurationMonths, setLeaseDurationMonths] = useState('6');
  const [isFlashDeal, setIsFlashDeal] = useState(false);
  const [autoDropPrice, setAutoDropPrice] = useState('');
  const [autoDropDays, setAutoDropDays] = useState('7');
  const [suggested, setSuggested] = useState<{ suggestedPrice: number; marketGauge: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadFarms = useCallback(async () => {
    if (!farmerId) { setLoadingFarms(false); return; }
    setLoadingFarms(true);
    try {
      const res = await farmsApi.getByFarmerId(farmerId);
      const eligible = (res.data ?? []).filter(
        (f: any) => f.isVerified && !f.isLeased && (!f.leaseLockedUntil || new Date(f.leaseLockedUntil) < new Date()),
      );
      setFarms(eligible);
      if (eligible.length === 1) setSelectedFarm(eligible[0]);
    } finally {
      setLoadingFarms(false);
    }
  }, [farmerId]);

  useEffect(() => { loadFarms(); }, [loadFarms]);

  useEffect(() => {
    if (!selectedFarm) { setSuggested(null); return; }
    const price = askingPrice ? Number(askingPrice) : undefined;
    marketplaceApi.getSuggestedPrice(selectedFarm.id, price)
      .then((res) => setSuggested(res.data))
      .catch(() => setSuggested(null));
  }, [selectedFarm, askingPrice]);

  const submit = async () => {
    if (!farmerId || !selectedFarm) {
      Alert.alert(t('mlaxCreateListing'), t('mlaxSelectFarm'));
      return;
    }
    const price = Number(askingPrice);
    if (!price || price <= 0) {
      Alert.alert(t('mlaxCreateListing'), t('mlaxAskingPrice'));
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.createLandListing({
        farmId: selectedFarm.id,
        ownerId: farmerId,
        askingPrice: price,
        dealType,
        commissionRate: dealType === 'FLASH_DEAL' ? 0.14 : dealType === 'RELATIONSHIP' ? 0.05 : 0.1,
        leaseDurationMonths: Number(leaseDurationMonths) || 6,
        isFlashDeal,
        autoDropPrice: isFlashDeal && autoDropPrice ? Number(autoDropPrice) : undefined,
        autoDropDays: isFlashDeal && autoDropDays ? Number(autoDropDays) : undefined,
      });
      Alert.alert(t('mlaxCreateListing'), t('mlaxListingCreated'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('mlaxCreateListing'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('mlaxCreateListing') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('mlaxSelectFarm')}</Text>
          {loadingFarms ? (
            <ActivityIndicator color="#10B981" style={{ marginTop: 8 }} />
          ) : farms.length === 0 ? (
            <Text style={styles.hint}>{t('mlaxNoFarmsToList')}</Text>
          ) : (
            <View style={styles.chipRow}>
              {farms.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.chip, selectedFarm?.id === f.id && styles.chipActive]}
                  onPress={() => setSelectedFarm(f)}
                >
                  <Text style={[styles.chipText, selectedFarm?.id === f.id && styles.chipTextActive]}>{f.farmCode}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {selectedFarm && (
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t('mlaxAskingPrice')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={askingPrice}
              onChangeText={setAskingPrice}
              placeholder="2000000"
              placeholderTextColor="#9CA3AF"
            />
            {suggested && (
              <Text style={[
                styles.gaugeText,
                suggested.marketGauge === 'above' ? styles.gaugeRed : styles.gaugeGreen,
              ]}>
                {t('mlaxSuggestedPrice')}: {suggested.suggestedPrice.toLocaleString()} TZS — {t(`mlaxMarketGauge${suggested.marketGauge[0].toUpperCase()}${suggested.marketGauge.slice(1)}` as any)}
              </Text>
            )}

            <Text style={styles.fieldLabel}>{t('mlaxDealType')}</Text>
            <View style={styles.chipRow}>
              {DEAL_TYPES.map((dt) => (
                <TouchableOpacity
                  key={dt}
                  style={[styles.chip, dealType === dt && styles.chipActive]}
                  onPress={() => setDealType(dt)}
                >
                  <Text style={[styles.chipText, dealType === dt && styles.chipTextActive]}>{dt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t('mlaxLeaseDuration')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={leaseDurationMonths}
              onChangeText={setLeaseDurationMonths}
              placeholder="6"
              placeholderTextColor="#9CA3AF"
            />

            <TouchableOpacity style={styles.toggleRow} onPress={() => setIsFlashDeal(!isFlashDeal)}>
              <View style={[styles.checkbox, isFlashDeal && styles.checkboxActive]} />
              <Text style={styles.toggleLabel}>{t('mlaxFlashDeal')}</Text>
            </TouchableOpacity>

            {isFlashDeal && (
              <>
                <Text style={styles.fieldLabel}>{t('mlaxAutoDropPrice')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={autoDropPrice}
                  onChangeText={setAutoDropPrice}
                  placeholder="1500000"
                  placeholderTextColor="#9CA3AF"
                />
                <Text style={styles.fieldLabel}>{t('mlaxAutoDropDays')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={autoDropDays}
                  onChangeText={setAutoDropDays}
                  placeholder="7"
                  placeholderTextColor="#9CA3AF"
                />
              </>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, (submitting || !selectedFarm) && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting || !selectedFarm}
        >
          <Text style={styles.submitText}>{t('mlaxCreateListing')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 8 },
  hint: { fontSize: 13, color: '#6B7280' },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  gaugeText: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  gaugeGreen: { color: '#10B981' },
  gaugeRed: { color: '#EF4444' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB' },
  checkboxActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  toggleLabel: { fontSize: 14, color: '#111827', fontWeight: '600' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

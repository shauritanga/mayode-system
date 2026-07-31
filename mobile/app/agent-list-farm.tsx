import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { farmersApi, farmsApi, marketplaceApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

const DEAL_TYPES = ['STANDARD', 'FLASH_DEAL'] as const;

/**
 * "3-Click Listing" / Agent Model: a desk officer lists a farm on behalf of a
 * farmer who doesn't want to deal with an app themselves — the farmer just
 * shows up with their control number and ID; the officer does the rest.
 * Step 1: find the farmer. Step 2: pick their farm. Step 3: price + submit.
 */
export default function AgentListFarm() {
  const router = useRouter();
  const { t } = useI18n();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [controlNumber, setControlNumber] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [farmer, setFarmer] = useState<any | null>(null);

  const [farms, setFarms] = useState<any[]>([]);
  const [loadingFarms, setLoadingFarms] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<any | null>(null);

  const [askingPrice, setAskingPrice] = useState('');
  const [dealType, setDealType] = useState<(typeof DEAL_TYPES)[number]>('STANDARD');
  const [submitting, setSubmitting] = useState(false);

  const findFarmer = async () => {
    if (!controlNumber.trim()) return;
    setLookingUp(true);
    try {
      const res = await farmersApi.getByControlNumber(controlNumber.trim().toUpperCase());
      setFarmer(res.data);
      setLoadingFarms(true);
      const farmsRes = await farmsApi.getByFarmerId(res.data.id);
      const eligible = (farmsRes.data ?? []).filter(
        (f: any) => f.isVerified && !f.isLeased && (!f.leaseLockedUntil || new Date(f.leaseLockedUntil) < new Date()),
      );
      setFarms(eligible);
      setStep(2);
    } catch (e: any) {
      Alert.alert(t('mlaxAgentListFarm'), e?.response?.data?.message || t('mlaxAgentFarmerNotFound'));
    } finally {
      setLookingUp(false);
      setLoadingFarms(false);
    }
  };

  const submit = async () => {
    if (!farmer || !selectedFarm) return;
    const price = Number(askingPrice);
    if (!price || price <= 0) {
      Alert.alert(t('mlaxAgentListFarm'), t('mlaxAskingPrice'));
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.createLandListing({
        farmId: selectedFarm.id,
        ownerId: farmer.id,
        askingPrice: price,
        dealType,
        leaseDurationMonths: 6,
        isFlashDeal: dealType === 'FLASH_DEAL',
      });
      Alert.alert(t('mlaxAgentListFarm'), t('mlaxListingCreated'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('mlaxAgentListFarm'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('mlaxAgentListFarm') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.stepIndicator}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
          ))}
        </View>

        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.hint}>{t('mlaxAgentStep1Hint')}</Text>
            <Text style={styles.fieldLabel}>{t('controlNumber')}</Text>
            <TextInput
              style={styles.input}
              value={controlNumber}
              onChangeText={setControlNumber}
              placeholder="MYD-00001"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
            />
            <TouchableOpacity style={[styles.submitBtn, lookingUp && { opacity: 0.6 }]} onPress={findFarmer} disabled={lookingUp}>
              {lookingUp ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('mlaxAgentFindFarmer')}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && farmer && (
          <View style={styles.card}>
            <Text style={styles.farmerName}>{farmer.firstName} {farmer.lastName} ({farmer.controlNumber})</Text>
            <Text style={styles.hint}>{t('mlaxAgentStep2Hint')}</Text>
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
                    onPress={() => { setSelectedFarm(f); setStep(3); }}
                  >
                    <Text style={[styles.chipText, selectedFarm?.id === f.id && styles.chipTextActive]}>{f.farmCode}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {step === 3 && selectedFarm && (
          <View style={styles.card}>
            <Text style={styles.farmerName}>{selectedFarm.farmCode}</Text>
            <Text style={styles.fieldLabel}>{t('mlaxAskingPrice')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={askingPrice}
              onChangeText={setAskingPrice}
              placeholder="2000000"
              placeholderTextColor="#9CA3AF"
            />
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
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('mlaxAgentSubmit')}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  stepIndicator: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D1D5DB' },
  stepDotActive: { backgroundColor: '#10B981' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  hint: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginBottom: 12 },
  farmerName: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 14 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

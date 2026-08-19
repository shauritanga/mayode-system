import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Calendar01Icon } from '@hugeicons/core-free-icons';
import { financeApi, buyersApi } from '../src/lib/data';
import { SearchableSelect } from '../src/components/SearchableSelect';
import { useI18n } from '../src/i18n';

const REVENUE_TYPES = [
  { key: 'FAIRTRADE_SALE', labelKey: 'revenueFairtrade', icon: '🌍' },
  { key: 'CONVENTIONAL_SALE', labelKey: 'revenueConventional', icon: '🌾' },
] as const;

const REVENUE_TYPE_KEYS = REVENUE_TYPES.map((r) => r.key);
const NO_BUYER = '__none__';

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Record a harvest sale (owner comment: farmers should be able to self-report their own sales). */
export default function RevenueNew() {
  const { cropCycleId, farmCode, season } = useLocalSearchParams<{ cropCycleId: string; farmCode?: string; season?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (!cropCycleId) {
      router.replace({ pathname: '/activity-select-cycle', params: { purpose: 'sale' } });
    }
  }, [cropCycleId, router]);

  const formatRevenueType = (key: string) => {
    const r = REVENUE_TYPES.find((x) => x.key === key);
    return r ? `${r.icon}  ${t(r.labelKey)}` : key;
  };

  const [revenueType, setRevenueType] = useState<string | null>(null);
  const [quantityKg, setQuantityKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [totalRevenue, setTotalRevenue] = useState('');
  const [totalEdited, setTotalEdited] = useState(false);
  const [fairtradePremium, setFairtradePremium] = useState('');
  const [buyerChoice, setBuyerChoice] = useState<string | null>(null);
  const [buyerNames, setBuyerNames] = useState<string[]>([]);
  const [buyersByName, setBuyersByName] = useState<Record<string, string>>({});
  const [date, setDate] = useState(toDateInput(new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    buyersApi
      .list()
      .then((res) => {
        const list = res.data || [];
        const byName: Record<string, string> = {};
        const names: string[] = [];
        for (const b of list) {
          const label = b.isCertified ? `${b.name} ★` : b.name;
          names.push(label);
          byName[label] = b.id;
        }
        setBuyerNames(names);
        setBuyersByName(byName);
      })
      .catch(() => {
        setBuyerNames([]);
        setBuyersByName({});
      });
  }, []);

  // Auto-compute total from quantity × price, unless the user edited the total directly.
  useEffect(() => {
    if (totalEdited) return;
    const q = Number(quantityKg);
    const p = Number(pricePerKg);
    if (quantityKg && pricePerKg && !Number.isNaN(q) && !Number.isNaN(p)) {
      setTotalRevenue(String(q * p));
    }
  }, [quantityKg, pricePerKg, totalEdited]);

  const onPickDate = (event: any, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (event.type === 'dismissed' || !selected) return;
    setDate(toDateInput(selected));
  };

  const submit = async () => {
    if (!revenueType || !quantityKg.trim() || !pricePerKg.trim() || !totalRevenue.trim()) {
      Alert.alert(t('recordSale'), t('fillSaleFields'));
      return;
    }
    setSubmitting(true);
    try {
      const buyerId =
        buyerChoice && buyerChoice !== NO_BUYER && buyersByName[buyerChoice]
          ? buyersByName[buyerChoice]
          : undefined;
      await financeApi.addRevenue({
        cropCycleId: cropCycleId!,
        revenueType,
        quantityKg: Number(quantityKg),
        pricePerKg: Number(pricePerKg),
        totalRevenue: Number(totalRevenue),
        fairtradePremium: fairtradePremium ? Number(fairtradePremium) : undefined,
        buyerId,
        saleDate: date,
      });
      Alert.alert(t('recordSale'), t('saleRecorded'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('recordSale'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('recordSale') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {(!!farmCode || !!season) && <Text style={styles.contextLabel}>{[farmCode, season].filter(Boolean).join(' · ')}</Text>}

        <View style={styles.card}>
          <SearchableSelect
            label={t('revenueType')}
            value={revenueType}
            placeholder={t('selectSaleType')}
            options={REVENUE_TYPE_KEYS}
            onSelect={setRevenueType}
            searchable={false}
            formatLabel={formatRevenueType}
          />

          <Field label={t('quantitySoldKg')} value={quantityKg} onChangeText={setQuantityKg} keyboardType="decimal-pad" />
          <Field label={t('pricePerKg')} value={pricePerKg} onChangeText={setPricePerKg} keyboardType="decimal-pad" />
          <Field
            label={t('totalRevenueLabel')}
            value={totalRevenue}
            onChangeText={(v: string) => { setTotalEdited(true); setTotalRevenue(v); }}
            keyboardType="decimal-pad"
          />
          <Field label={t('fairtradePremiumLabel')} value={fairtradePremium} onChangeText={setFairtradePremium} keyboardType="decimal-pad" />

          {buyerNames.length > 0 && (
            <SearchableSelect
              label={t('buyerOptional')}
              value={buyerChoice === NO_BUYER ? t('buyerNotListed') : buyerChoice}
              placeholder={t('selectBuyer')}
              options={[t('buyerNotListed'), ...buyerNames]}
              onSelect={(name) => {
                setBuyerChoice(name === t('buyerNotListed') ? NO_BUYER : name);
              }}
            />
          )}

          <Text style={styles.fieldLabel}>{t('saleDate')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
            <HugeiconsIcon icon={Calendar01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{date}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={new Date(date)}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onPickDate}
            />
          )}
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('recordSale')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#9CA3AF" {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  contextLabel: { fontSize: 13, color: '#6B7280', marginBottom: 12, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 12 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: '#111827' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

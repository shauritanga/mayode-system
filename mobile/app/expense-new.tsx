import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Calendar01Icon, Camera01Icon } from '@hugeicons/core-free-icons';
import { financeApi, suppliersApi, uploadsApi, resolveMediaUrl } from '../src/lib/data';
import { SearchableSelect } from '../src/components/SearchableSelect';
import { useI18n } from '../src/i18n';


const CATEGORIES = [
  { key: 'SEEDS', labelKey: 'costSeeds', icon: '🌱' },
  { key: 'FERTILIZER', labelKey: 'costFertilizer', icon: '🧪' },
  { key: 'PESTICIDE', labelKey: 'costPesticide', icon: '🐛' },
  { key: 'HERBICIDE', labelKey: 'costHerbicide', icon: '🌿' },
  { key: 'LABOR', labelKey: 'costLabor', icon: '👷' },
  { key: 'TILLAGE', labelKey: 'costTillage', icon: '🚜' },
  { key: 'IRRIGATION', labelKey: 'costIrrigation', icon: '💧' },
  { key: 'TRANSPORT', labelKey: 'costTransport', icon: '🚚' },
  { key: 'MISCELLANEOUS', labelKey: 'costMiscellaneous', icon: '💵' },
] as const;

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Record an expense (owner comment: "record expenses" — a free feature). */
export default function ExpenseNew() {
  const { cropCycleId, farmCode, season } = useLocalSearchParams<{ cropCycleId: string; farmCode?: string; season?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (!cropCycleId) {
      router.replace({ pathname: '/activity-select-cycle', params: { purpose: 'expense' } });
    }
  }, [cropCycleId, router]);

  const formatCategory = (key: string) => {
    const c = CATEGORIES.find((x) => x.key === key);
    return c ? `${c.icon}  ${t(c.labelKey)}` : key;
  };

  const [category, setCategory] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [totalEdited, setTotalEdited] = useState(false);
  const OTHER_SUPPLIER = '__other__';
  const [supplierChoice, setSupplierChoice] = useState<string | null>(null);
  const [supplierNames, setSupplierNames] = useState<string[]>([]);
  const [suppliersByName, setSuppliersByName] = useState<Record<string, string>>({});
  const [supplierOther, setSupplierOther] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    suppliersApi
      .getAll()
      .then((res) => {
        const list = (res.data || []).filter((s: any) => s.isActive !== false);
        const byName: Record<string, string> = {};
        const names: string[] = [];
        for (const s of list) {
          names.push(s.name);
          byName[s.name] = s.id;
        }
        setSupplierNames(names);
        setSuppliersByName(byName);
      })
      .catch(() => {
        setSupplierNames([]);
        setSuppliersByName({});
      });
  }, []);

  // Auto-compute total from quantity × unit price, unless the user typed a total directly.
  useEffect(() => {
    if (totalEdited) return;
    const q = Number(quantity);
    const p = Number(unitPrice);
    if (quantity && unitPrice && !Number.isNaN(q) && !Number.isNaN(p)) {
      setTotalCost(String(q * p));
    }
  }, [quantity, unitPrice, totalEdited]);

  const onPickDate = (event: any, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (event.type === 'dismissed' || !selected) return;
    setDate(toDateInput(selected));
  };

  const addReceipt = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingReceipt(true);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `receipt-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      setReceiptUrl(up.data.url);
    } finally {
      setUploadingReceipt(false);
    }
  };

  const submit = async () => {
    if (!category || !itemName.trim() || !totalCost.trim()) {
      Alert.alert(t('addExpense'), t('fillExpenseFields'));
      return;
    }
    setSubmitting(true);
    try {
      const linkedId =
        supplierChoice && supplierChoice !== OTHER_SUPPLIER
          ? suppliersByName[supplierChoice]
          : undefined;
      await financeApi.addCost({
        cropCycleId: cropCycleId!,
        category,
        itemName: itemName.trim(),
        quantity: quantity ? Number(quantity) : undefined,
        unit: unit.trim() || undefined,
        unitPrice: unitPrice ? Number(unitPrice) : undefined,
        totalCost: Number(totalCost),
        supplierId: linkedId,
        supplier: linkedId
          ? supplierChoice || undefined
          : supplierOther.trim() || undefined,
        receiptUrl: receiptUrl || undefined,
        dateIncurred: date,
      });
      Alert.alert(t('addExpense'), t('expenseRecorded'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('addExpense'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('addExpense') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {(!!farmCode || !!season) && <Text style={styles.contextLabel}>{[farmCode, season].filter(Boolean).join(' · ')}</Text>}

        <View style={styles.card}>
          <SearchableSelect
            label={t('expenseCategory')}
            value={category}
            placeholder={t('selectExpenseCategory')}
            options={CATEGORY_KEYS}
            onSelect={setCategory}
            searchable={false}
            formatLabel={formatCategory}
          />

          <Field label={t('itemName')} value={itemName} onChangeText={setItemName} />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label={t('quantityLabel')} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('unitLabel')} value={unit} onChangeText={setUnit} placeholder="kg, bags…" />
            </View>
          </View>

          <Field label={t('unitPriceLabel')} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" />
          <Field
            label={t('totalCostLabel')}
            value={totalCost}
            onChangeText={(v: string) => { setTotalEdited(true); setTotalCost(v); }}
            keyboardType="decimal-pad"
          />

          {supplierNames.length > 0 ? (
            <>
              <SearchableSelect
                label={t('supplierLabel')}
                value={supplierChoice === OTHER_SUPPLIER ? t('supplierOther') : supplierChoice}
                placeholder={t('selectSupplier')}
                options={[...supplierNames, t('supplierOther')]}
                onSelect={(name) => {
                  if (name === t('supplierOther')) {
                    setSupplierChoice(OTHER_SUPPLIER);
                  } else {
                    setSupplierChoice(name);
                    setSupplierOther('');
                  }
                }}
              />
              {supplierChoice === OTHER_SUPPLIER && (
                <Field
                  label={t('supplierOther')}
                  value={supplierOther}
                  onChangeText={setSupplierOther}
                />
              )}
            </>
          ) : (
            <Field label={t('supplierLabel')} value={supplierOther} onChangeText={setSupplierOther} />
          )}

          <Text style={styles.fieldLabel}>{t('dateIncurred')}</Text>
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

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('addReceiptPhoto')}</Text>
          {receiptUrl ? (
            <Image source={{ uri: resolveMediaUrl(receiptUrl) ?? receiptUrl }} style={styles.photoPreview} />
          ) : (
            <TouchableOpacity style={styles.secondaryBtn} onPress={addReceipt} disabled={uploadingReceipt}>
              {uploadingReceipt ? <ActivityIndicator size="small" color="#10B981" /> : (
                <><HugeiconsIcon icon={Camera01Icon} size={16} color="#10B981" strokeWidth={2} />
                <Text style={styles.secondaryBtnText}>{t('addReceiptPhoto')}</Text></>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('addExpense')}</Text>
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
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: '#111827' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 13, color: '#111827' },
  photoPreview: { width: 96, height: 96, borderRadius: 12 },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

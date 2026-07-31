import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { marketplaceApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

export default function SubLeaseRequest() {
  const { listingId, renterId } = useLocalSearchParams<{ listingId: string; renterId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [newAskingPrice, setNewAskingPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await marketplaceApi.requestSubLease(listingId, {
        renterId,
        newAskingPrice: newAskingPrice ? Number(newAskingPrice) : undefined,
      });
      Alert.alert(t('mlaxSubLeaseRequest'), t('mlaxSubLeaseSent'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('mlaxSubLeaseRequest'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('mlaxSubLeaseRequest') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.hint}>{t('mlaxSubLeaseHint')}</Text>
          <Text style={styles.fieldLabel}>{t('mlaxSubLeaseNewPrice')}</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={newAskingPrice}
            onChangeText={setNewAskingPrice}
            placeholder="1900000"
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('mlaxSubLeaseSubmit')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  hint: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

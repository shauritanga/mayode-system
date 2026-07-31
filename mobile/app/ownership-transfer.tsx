import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { marketplaceApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

export default function OwnershipTransfer() {
  const { listingId, ownerId } = useLocalSearchParams<{ listingId: string; ownerId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!newOwnerPhone.trim()) {
      Alert.alert(t('mlaxTransferOwnership'), t('mlaxTransferPhone'));
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.transferOwnership(listingId, {
        currentOwnerId: ownerId,
        newOwnerPhone: newOwnerPhone.trim(),
        reason: reason.trim() || undefined,
      });
      Alert.alert(t('mlaxTransferOwnership'), t('mlaxTransferSent'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('mlaxTransferOwnership'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('mlaxTransferOwnership') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('mlaxTransferPhone')}</Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            value={newOwnerPhone}
            onChangeText={setNewOwnerPhone}
            placeholder="0768680433"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.fieldLabel}>{t('mlaxTransferReason')}</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={reason}
            onChangeText={setReason}
            multiline
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('mlaxTransferSubmit')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

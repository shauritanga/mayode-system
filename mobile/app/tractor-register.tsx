import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { marketplaceApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

export default function TractorRegister() {
  const router = useRouter();
  const { t } = useI18n();

  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [location, setLocation] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [model, setModel] = useState('');
  const [horsePower, setHorsePower] = useState('');
  const [pricePerHectare, setPricePerHectare] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!ownerName.trim() || !ownerPhone.trim() || !registrationNo.trim()) {
      Alert.alert(t('mlaxRegisterTractor'), t('mlaxTractorFillRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const ownerRes = await marketplaceApi.createTractorOwner({
        name: ownerName.trim(),
        phone: ownerPhone.trim(),
        location: location.trim() || undefined,
      });
      const ownerId = ownerRes.data.id;
      await marketplaceApi.createTractor({
        ownerId,
        registrationNo: registrationNo.trim(),
        model: model.trim() || undefined,
        horsePower: horsePower ? Number(horsePower) : undefined,
        pricePerHectare: pricePerHectare ? Number(pricePerHectare) : undefined,
        location: location.trim() || undefined,
      });
      Alert.alert(t('mlaxRegisterTractor'), t('mlaxTractorRegistered'), [
        { text: 'OK', onPress: () => router.replace({ pathname: '/my-tractors', params: { ownerId } } as any) },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('mlaxRegisterTractor'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('mlaxRegisterTractor') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('mlaxTractorOwnerSection')}</Text>
          <Field label={t('mlaxTractorOwnerName')} value={ownerName} onChangeText={setOwnerName} />
          <Field label={t('mlaxTractorOwnerPhone')} value={ownerPhone} onChangeText={setOwnerPhone} keyboardType="phone-pad" placeholder="0768680433" />
          <Field label={t('locationUnknown')} value={location} onChangeText={setLocation} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('mlaxTractorSection')}</Text>
          <Field label={t('mlaxTractorRegNo')} value={registrationNo} onChangeText={setRegistrationNo} placeholder="T123ABC" />
          <Field label={t('mlaxTractorModel')} value={model} onChangeText={setModel} />
          <Field label={t('mlaxTractorHp')} value={horsePower} onChangeText={setHorsePower} keyboardType="numeric" />
          <Field label={t('mlaxTractorPrice')} value={pricePerHectare} onChangeText={setPricePerHectare} keyboardType="numeric" placeholder="60000" />
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('mlaxRegisterTractor')}</Text>
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
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

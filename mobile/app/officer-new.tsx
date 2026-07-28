import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { authApi } from '../src/lib/data';
import { PasswordInput } from '../src/components/PasswordInput';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

export default function OfficerNewScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuthStore();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [assignedArea, setAssignedArea] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!firstName || !lastName || !phone || !password) {
      Alert.alert(t('validationError'), t('phonePasswordRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await authApi.createFieldOfficer({ firstName, lastName, phone, password, assignedArea: assignedArea || undefined });
      Alert.alert(t('createFieldOfficer'), t('officerCreated'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('createFieldOfficer'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || user.role !== 'MAMCOS_SECRETARY') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: t('createFieldOfficer') }} />
        <View style={styles.center}><Text style={styles.staffOnly}>{t('staffOnlyFeature')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('createFieldOfficer') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Field label={t('firstNameForm')} value={firstName} onChangeText={setFirstName} />
          <Field label={t('lastNameForm')} value={lastName} onChangeText={setLastName} />
          <Field label={t('phoneNumber')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+255755123456" />
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.fieldLabel}>{t('password')}</Text>
            <PasswordInput boxStyle={styles.input} value={password} onChangeText={setPassword} />
          </View>
          <Field label={t('assignedAreaLabel')} value={assignedArea} onChangeText={setAssignedArea} />
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('createFieldOfficer')}</Text>}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  staffOnly: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

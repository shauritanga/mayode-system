import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { usersApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { Language, useI18n } from '../src/i18n';

export default function EditStaffProfile() {
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const { language, setLanguage, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    language: language as Language,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const res = await usersApi.getMe(user.id);
      const data = res.data;
      setForm({
        firstName: data.firstName ?? user.firstName ?? '',
        lastName: data.lastName ?? user.lastName ?? '',
        email: data.email ?? '',
        phone: data.phone ?? user.phone ?? '',
        language: (data.language === 'en' || data.language === 'sw' ? data.language : language) as Language,
      });
    } catch {
      setForm({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.email ?? '',
        phone: user.phone ?? '',
        language,
      });
    } finally {
      setLoading(false);
    }
  }, [user, language]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!user?.id) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      Alert.alert(t('saveFailed'), t('allFieldsRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await usersApi.updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        language: form.language,
      });
      const data = res.data;
      updateUser({
        firstName: data.firstName ?? form.firstName.trim(),
        lastName: data.lastName ?? form.lastName.trim(),
        email: data.email ?? (form.email.trim() || undefined),
        phone: data.phone ?? form.phone.trim(),
        profilePhotoUrl: data.profilePhotoUrl ?? user.profilePhotoUrl,
      });
      if (form.language !== language) {
        setLanguage(form.language);
      }
      Alert.alert(t('saved'), t('profileUpdated'), [{ text: t('ok'), onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('saveFailed'), Array.isArray(msg) ? msg.join('\n') : msg || e?.message || t('couldNotSaveProfile'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: t('editProfile') }} />
        <ActivityIndicator color="#10B981" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('editProfile') }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>{t('staffProfileHint')}</Text>

          <Field label={t('firstNameForm')} value={form.firstName} onChangeText={(v) => set('firstName', v)} />
          <Field label={t('lastNameForm')} value={form.lastName} onChangeText={(v) => set('lastName', v)} />
          <Field
            label={t('email')}
            value={form.email}
            onChangeText={(v) => set('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field label={t('phoneNumber')} value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />

          <Text style={styles.label}>{t('language')}</Text>
          <View style={styles.languageRow}>
            {(['en', 'sw'] as Language[]).map((code) => {
              const on = form.language === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.languageBtn, on && styles.languageBtnOn]}
                  onPress={() => set('language', code)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.languageBtnText, on && styles.languageBtnTextOn]}>
                    {code === 'en' ? t('english') : t('swahili')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('saveProfile')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  content: { padding: 16, paddingBottom: 32 },
  hint: { fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 18 },
  fieldWrap: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  languageRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  languageBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  languageBtnOn: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  languageBtnText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  languageBtnTextOn: { color: '#065F46' },
  saveBtn: {
    backgroundColor: '#065F46',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

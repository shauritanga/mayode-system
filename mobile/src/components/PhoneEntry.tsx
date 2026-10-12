import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { authApi } from '../lib/data';
import { getApiErrorMessage } from '../lib/api-error';
import { normalizePhone } from '../lib/phone';
import { useI18n } from '../i18n';

/** Phone-number screen shared by the two paths: log in to an existing account, or create a new one. */
export default function PhoneEntry({ mode }: { mode: 'login' | 'register' }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  // Keep the focused field above the keyboard (Android edge-to-edge safe).
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  const handleSendCode = async () => {
    if (!phone.trim()) {
      Alert.alert(t('validationError'), t('otpPhoneRequired'));
      return;
    }
    setLoading(true);
    try {
      const normalized = normalizePhone(phone);
      const res = await authApi.requestOtp(normalized, mode);
      router.push({
        pathname: '/verify',
        params: { phone: normalized, resendIn: String(res.data?.resendInSeconds ?? 60), mode },
      });
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'PHONE_NOT_REGISTERED') {
        Alert.alert(t('authNotRegisteredTitle'), t('authNotRegisteredMessage'), [
          { text: t('authTryAnother'), style: 'cancel' },
          { text: t('authTabRegister'), onPress: () => router.replace('/signup') },
        ]);
        return;
      }
      if (code === 'PHONE_ALREADY_REGISTERED') {
        Alert.alert(t('authAlreadyRegisteredTitle'), t('authAlreadyRegisteredMessage'), [
          { text: t('authTryAnother'), style: 'cancel' },
          { text: t('authTabLogin'), onPress: () => router.replace('/login') },
        ]);
        return;
      }
      Alert.alert(t('otpSendFailed'), getApiErrorMessage(err, t('otpSendFailedMessage')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Section */}
          <View style={styles.headerContainer}>
            <Image source={require('../../assets/mayode.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.appTitle}>MAYODE GROUP</Text>
            <Text style={styles.appSubtitle}>MAYOData Platform & M-LAX Mobile</Text>
          </View>

          {/* Card Section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{mode === 'login' ? t('authLoginTitle') : t('authRegisterTitle')}</Text>
            <Text style={styles.cardSubtitle}>{mode === 'login' ? t('authLoginSubtitle') : t('authRegisterSubtitle')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('phoneNumber')}</Text>
              <TextInput
                style={styles.input}
                placeholder="+255755123456"
                placeholderTextColor="#6B7280"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                autoCapitalize="none"
                autoComplete="tel"
                textContentType="telephoneNumber"
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSendCode}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('otpSendCode')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.toggleFooter} onPress={() => router.replace(mode === 'login' ? '/signup' : '/login')} disabled={loading}>
              <Text style={styles.toggleFooterText}>{mode === 'login' ? t('authNoAccountLink') : t('authHaveAccountLink')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>{t('allRightsReserved', { year: new Date().getFullYear() })}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 72,
    height: 72,
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  appSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#111827',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    marginTop: 20,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  toggleFooter: {
    marginTop: 24,
    alignItems: 'center',
  },
  toggleFooterText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 32,
    textAlign: 'center',
  },
});

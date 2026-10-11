import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authApi } from '../src/lib/data';
import { getApiErrorMessage } from '../src/lib/api-error';
import { startSession } from '../src/lib/session';
import { useOtpAutofill } from '../src/lib/otp-autofill';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

const CODE_LENGTH = 6;

/** Screen 2 of sign-in: the 6-digit code that was texted to the number from screen 1. */
export default function VerifyRoute() {
  const { phone = '', resendIn = '60' } = useLocalSearchParams<{ phone?: string; resendIn?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(Number(resendIn) || 60);
  const submitting = useRef(false);
  const { setAuth, setFarmerId } = useAuthStore();
  const { t } = useI18n();
  const router = useRouter();
  const autoRead = useOtpAutofill(CODE_LENGTH);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const verify = useCallback(async (value: string) => {
    if (submitting.current) return;
    if (value.length !== CODE_LENGTH) {
      Alert.alert(t('validationError'), t('otpCodeRequired'));
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(phone, value);
      if (res.data?.needsRegistration) {
        router.replace({ pathname: '/register', params: { phone, registrationToken: res.data.registrationToken } });
        return;
      }
      const ok = await startSession(res.data, { setAuth, setFarmerId });
      if (!ok) {
        Alert.alert(t('mobileAccessDeniedTitle'), t('mobileAccessDeniedMessage'));
        return;
      }
      router.replace('/(drawer)/(tabs)');
    } catch (err: unknown) {
      setCode('');
      Alert.alert(t('otpWrongCode'), getApiErrorMessage(err, t('otpWrongCodeMessage')));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [phone, router, setAuth, setFarmerId, t]);

  const onChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) verify(digits);
  };

  // The code read from the SMS (Android, after the user allows it) fills the field and submits.
  useEffect(() => {
    if (autoRead && autoRead.length === CODE_LENGTH) onChange(autoRead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead]);

  const resend = async () => {
    try {
      const res = await authApi.requestOtp(phone);
      setSeconds(res.data?.resendInSeconds ?? 60);
      setCode('');
    } catch (err: unknown) {
      Alert.alert(t('otpSendFailed'), getApiErrorMessage(err, t('otpSendFailedMessage')));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.headerContainer}>
            <Image source={require('../assets/mayode.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.appTitle}>MAYODE GROUP</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('otpCodeTitle')}</Text>
            <Text style={styles.cardSubtitle}>{t('otpCodeSentTo', { phone })}</Text>

            <Text style={styles.label}>{t('otpCodeLabel')}</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={onChange}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              placeholder="••••••"
              placeholderTextColor="#9CA3AF"
              autoFocus
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              editable={!loading}
            />
            <Text style={styles.hint}>{t('otpAutoReadHint')}</Text>

            <TouchableOpacity style={[styles.button, (loading || code.length !== CODE_LENGTH) && styles.buttonDisabled]} onPress={() => verify(code)} disabled={loading || code.length !== CODE_LENGTH}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('otpVerify')}</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.link} onPress={resend} disabled={seconds > 0}>
              <Text style={[styles.linkText, seconds > 0 && { color: '#9CA3AF' }]}>
                {seconds > 0 ? t('otpResendIn', { seconds }) : t('otpResend')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={() => router.replace('/login')}>
              <Text style={styles.linkText}>{t('otpChangeNumber')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  headerContainer: { alignItems: 'center', marginBottom: 32 },
  logoImage: { width: 72, height: 72, marginBottom: 16 },
  appTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  codeInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingVertical: 14, color: '#111827', fontSize: 26, fontWeight: '700', letterSpacing: 10, textAlign: 'center' },
  hint: { marginTop: 12, fontSize: 12, color: '#6B7280', textAlign: 'center' },
  button: { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  link: { marginTop: 18, alignItems: 'center' },
  linkText: { color: '#10B981', fontSize: 14, fontWeight: '600' },
});

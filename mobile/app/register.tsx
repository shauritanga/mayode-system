import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Keyboard, Platform, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { authApi, farmersApi } from '../src/lib/data';
import { getApiErrorMessage } from '../src/lib/api-error';
import { normalizePhone } from '../src/lib/phone';
import { useAuthStore } from '../src/store/auth.store';
import { PasswordInput } from '../src/components/PasswordInput';
import { useI18n } from '../src/i18n';

export default function RegisterRoute() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [dataShareConsent, setDataShareConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setAuth, setFarmerId } = useAuthStore();
  const { t } = useI18n();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  // When the keyboard opens (after it has fully settled), scroll the form up so
  // the focused field sits above the keyboard. Needed on Android edge-to-edge,
  // where the window no longer resizes automatically.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  const handleRegister = async () => {
    if (!firstName || !lastName || !phone || !password) {
      Alert.alert(t('validationError'), t('allFieldsRequired'));
      return;
    }
    if (!dataShareConsent) {
      Alert.alert('Data sharing consent', 'Please confirm your consent before creating your account. You can withdraw it later from your profile.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.register({
        phone: normalizePhone(phone),
        password,
        firstName,
        lastName,
        role: 'FARMER',
        dataShareConsent,
      });
      const { accessToken, refreshToken, user } = res.data;
      setAuth(user, accessToken, refreshToken);

      // Resolve farmer profile id via /farmers/me (control-number lookup is staff-only → 403 for FARMER).
      try {
        const f = await farmersApi.me();
        setFarmerId(f.data?.id ?? null);
      } catch {
        setFarmerId(null);
      }
      Alert.alert(t('success'), t('farmerCreated'));
      router.replace('/(drawer)/(tabs)');
    } catch (err: unknown) {
      Alert.alert(t('registrationFailed'), getApiErrorMessage(err, t('registrationFailedMessage')));
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
            <Image source={require('../assets/mayode.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.appTitle}>MAYODE GROUP</Text>
            <Text style={styles.appSubtitle}>{t('farmerRegistrationPortal')}</Text>
          </View>

          {/* Card Section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('createFarmerAccount')}</Text>
            <Text style={styles.cardSubtitle}>{t('registerSubtitle')}</Text>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 12 }]}>
                <Text style={styles.label}>{t('firstName')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="John"
                  placeholderTextColor="#6B7280"
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>{t('lastName')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Doe"
                  placeholderTextColor="#6B7280"
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
            </View>

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
              />
            </View>

            <View style={styles.consentRow}>
              <Switch value={dataShareConsent} onValueChange={setDataShareConsent} trackColor={{ true: '#10B981' }} />
              <TouchableOpacity style={styles.consentCopy} onPress={() => setDataShareConsent((value) => !value)} activeOpacity={0.8}>
                <Text style={styles.consentTitle}>Data-sharing consent</Text>
                <Text style={styles.consentText}>I agree that MAYODE may share my credit-readiness data with approved financial providers. You can withdraw this in your profile at any time.</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('password')}</Text>
              <PasswordInput
                boxStyle={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#6B7280"
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('signUp')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.toggleFooter} onPress={() => router.replace('/login')}>
              <Text style={styles.toggleFooterText}>{t('alreadyHaveAccount')}</Text>
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
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#F0FDF9', borderWidth: 1, borderColor: '#A7F3D0', marginBottom: 4 },
  consentCopy: { flex: 1 },
  consentTitle: { fontSize: 13, fontWeight: '700', color: '#065F46', marginBottom: 3 },
  consentText: { fontSize: 12, color: '#374151', lineHeight: 17 },
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

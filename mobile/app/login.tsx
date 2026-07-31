import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { authApi, farmersApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { PasswordInput } from '../src/components/PasswordInput';
import { useI18n } from '../src/i18n';

export default function LoginRoute() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth, setFarmerId } = useAuthStore();
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

  const handleLogin = async () => {
    if (!phone || !password) {
      Alert.alert(t('validationError'), t('phonePasswordRequired'));
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login(phone, password);
      const { accessToken, refreshToken, user } = res.data;
      setAuth(user, accessToken, refreshToken);

      // Resolve the farmer profile id so farm/plot creation can reference it.
      if (user.role === 'FARMER' && user.controlNumber) {
        try {
          const f = await farmersApi.getByControlNumber(user.controlNumber);
          setFarmerId(f.data?.id ?? null);
        } catch {
          setFarmerId(null);
        }
      }
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert(t('loginFailed'), err.response?.data?.message || t('loginFailedMessage'));
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
            <Text style={styles.appSubtitle}>MAYOData Platform & M-LAX Mobile</Text>
          </View>

          {/* Card Section */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('farmerOfficerPortal')}</Text>
            <Text style={styles.cardSubtitle}>{t('signInSubtitle')}</Text>

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
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('signIn')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.toggleFooter} onPress={() => router.replace('/register')}>
              <Text style={styles.toggleFooterText}>{t('noAccountRegister')}</Text>
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

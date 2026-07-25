import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useI18n } from '../src/i18n';

export default function SplashRoute() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/onboarding');
    }, 2500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>M</Text>
        </View>
        <Text style={styles.appTitle}>MAYODE GROUP</Text>
        <Text style={styles.appSubtitle}>{t('splashSubtitle')}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('splashFooter')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#10B981',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 90,
    height: 90,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 10,
  },
  logoText: {
    fontSize: 44,
    fontWeight: '900',
    color: '#10B981',
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 8,
  },
  appSubtitle: {
    fontSize: 16,
    color: '#ECFDF5',
    fontWeight: '600',
    opacity: 0.9,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#D1FAE5',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

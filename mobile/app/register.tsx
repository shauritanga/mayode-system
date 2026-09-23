import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useI18n } from '../src/i18n';

// Self-registration is closed: every platform account is created by an
// admin (see POST /auth/register, now SUPER_ADMIN/ADMIN only). This route
// stays mounted so old links land on an explanation instead of a blank
// screen, and directs the user back to sign-in.
export default function RegisterRoute() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Image source={require('../assets/mayode.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.appTitle}>MAYODE GROUP</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('adminCreatedAccountsTitle')}</Text>
          <Text style={styles.cardSubtitle}>{t('adminCreatedAccountsBody')}</Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.buttonText}>{t('signIn')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>{t('allRightsReserved', { year: new Date().getFullYear() })}</Text>
      </ScrollView>
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
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 32,
    textAlign: 'center',
  },
});

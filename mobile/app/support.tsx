import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Mail01Icon } from '@hugeicons/core-free-icons';
import { useI18n } from '../src/i18n';

const SUPPORT_EMAIL = 'support@mayodegroup.com';

export default function SupportScreen() {
  const { t } = useI18n();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('helpSupport') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('supportTitle')}</Text>
          <Text style={styles.body}>{t('supportMessage')}</Text>
          <TouchableOpacity
            style={styles.mailBtn}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            <HugeiconsIcon icon={Mail01Icon} size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.mailBtnText}>{t('contactSupport')}</Text>
          </TouchableOpacity>
          <Text style={styles.emailText}>{SUPPORT_EMAIL}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('faqTitle')}</Text>
          <Text style={styles.question}>{t('faqFarmRegistrationQuestion')}</Text>
          <Text style={styles.answer}>{t('faqFarmRegistrationAnswer')}</Text>
          <Text style={styles.question}>{t('faqAnalyticsQuestion')}</Text>
          <Text style={styles.answer}>{t('faqAnalyticsAnswer')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  title: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 8 },
  body: { fontSize: 14, color: '#4B5563', lineHeight: 21 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 12 },
  question: { fontSize: 14, fontWeight: '800', color: '#065F46', marginTop: 10 },
  answer: { fontSize: 13, color: '#4B5563', lineHeight: 20, marginTop: 4 },
  mailBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 12, marginTop: 14,
  },
  mailBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  emailText: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 8 },
});

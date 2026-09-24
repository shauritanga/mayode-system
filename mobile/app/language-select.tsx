import React, { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowRight01Icon, CheckmarkCircle02Icon, LanguageCircleIcon } from '@hugeicons/core-free-icons';
import { Language, useI18n } from '../src/i18n';
import { useAuthStore } from '../src/store/auth.store';

const choices: { code: Language; label: string; native: string }[] = [
  { code: 'sw', label: 'Kiswahili', native: 'Kiswahili' },
  { code: 'en', label: 'English', native: 'English' },
];

export default function LanguageSelectRoute() {
  const router = useRouter();
  const { language, setLanguage, t } = useI18n();
  const setOnboarded = useAuthStore((state) => state.setOnboarded);
  const [selected, setSelected] = useState<Language>(language);

  const continueToLogin = () => {
    setLanguage(selected);
    setOnboarded();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <HugeiconsIcon icon={LanguageCircleIcon} size={48} color="#087F5B" strokeWidth={1.6} />
        </View>
        <Text style={styles.eyebrow}>MAYODE GROUP</Text>
        <Text style={styles.title}>{t('chooseLanguage')}</Text>
        <Text style={styles.subtitle}>{t('chooseLanguageSwahili')}</Text>
        <Text style={styles.helper}>{t('languageHelper')}</Text>

        <View style={styles.options}>
          {choices.map((choice) => {
            const active = selected === choice.code;
            return (
              <Pressable
                key={choice.code}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setSelected(choice.code)}
                style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.optionPressed]}
              >
                <View>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{choice.code === 'en' ? t('english') : t('swahili')}</Text>
                  <Text style={[styles.optionNative, active && styles.optionNativeActive]}>{choice.native}</Text>
                </View>
                <HugeiconsIcon icon={active ? CheckmarkCircle02Icon : LanguageCircleIcon} size={28} color={active ? '#087F5B' : '#9CA3AF'} strokeWidth={1.8} />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.footer}>
        <Pressable onPress={continueToLogin} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{t('onboardingContinue')}</Text>
          <HugeiconsIcon icon={ArrowRight01Icon} size={22} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FFFC' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D1FAE5', alignSelf: 'center', marginBottom: 28 },
  eyebrow: { textAlign: 'center', color: '#087F5B', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 18 },
  title: { textAlign: 'center', color: '#064E3B', fontSize: 30, fontWeight: '800', lineHeight: 38 },
  subtitle: { textAlign: 'center', color: '#286550', fontSize: 20, fontWeight: '600', marginTop: 8 },
  helper: { textAlign: 'center', color: '#6B7280', fontSize: 14, lineHeight: 21, marginTop: 18, marginHorizontal: 12 },
  options: { gap: 12, marginTop: 32 },
  option: { minHeight: 76, borderRadius: 18, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionActive: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  optionPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  optionLabel: { color: '#374151', fontSize: 17, fontWeight: '700' },
  optionLabelActive: { color: '#065F46' },
  optionNative: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
  optionNativeActive: { color: '#286550' },
  footer: { paddingHorizontal: 28, paddingBottom: 18 },
  button: { minHeight: 56, borderRadius: 28, backgroundColor: '#087F5B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

const { width } = Dimensions.get('window');

export default function OnboardingRoute() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setOnboarded } = useAuthStore();
  const { t } = useI18n();
  const router = useRouter();
  const onboardingData = [
    { icon: '🌾', title: t('onboardingTitle1'), description: t('onboardingDesc1') },
    { icon: '🚜', title: t('onboardingTitle2'), description: t('onboardingDesc2') },
    { icon: '📊', title: t('onboardingTitle3'), description: t('onboardingDesc3') },
  ];

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    setOnboarded();
    router.replace('/login');
  };

  const currentSlide = onboardingData[currentIndex];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Top Bar with Skip */}
      <View style={styles.header}>
        {currentIndex < onboardingData.length - 1 ? (
          <TouchableOpacity onPress={handleComplete} style={styles.skipButton}>
            <Text style={styles.skipText}>{t('skip')}</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>{currentSlide.icon}</Text>
        </View>
        <Text style={styles.titleText}>{currentSlide.title}</Text>
        <Text style={styles.descText}>{currentSlide.description}</Text>
      </View>

      {/* Footer Navigation */}
      <View style={styles.footer}>
        {/* Pagination Dots */}
        <View style={styles.pagination}>
          {onboardingData.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === currentIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          {currentIndex > 0 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setCurrentIndex(currentIndex - 1)}
            >
              <Text style={styles.backButtonText}>{t('back')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextButton, currentIndex === 0 && { flex: 1 }]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>
              {currentIndex === onboardingData.length - 1 ? t('getStarted') : t('next')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 12,
    height: 50,
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 36,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  iconText: {
    fontSize: 56,
  },
  titleText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  descText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#10B981',
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#E5E7EB',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginRight: 12,
  },
  backButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '700',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

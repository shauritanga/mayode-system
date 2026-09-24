import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowRight01Icon, Plant01Icon, TractorIcon, ChartIncreaseIcon } from '@hugeicons/core-free-icons';
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useI18n } from '../src/i18n';

// Safina's three-page composition and motion, using MAYODE's brand and content.
const slides = [
  { title: 'onboardingTitle1', description: 'onboardingDesc1', icon: Plant01Icon, background: '#087F5B', foreground: '#FFFFFF' },
  { title: 'onboardingTitle2', description: 'onboardingDesc2', icon: TractorIcon, background: '#064E3B', foreground: '#FFFFFF' },
  { title: 'onboardingTitle3', description: 'onboardingDesc3', icon: ChartIncreaseIcon, background: '#D1FAE5', foreground: '#064E3B' },
] as const;
const easing = Easing.inOut(Easing.cubic);
const particles = [
  { top: 20, left: 40, size: 12, opacity: 0.4, offset: -20 },
  { top: 50, right: 30, size: 8, opacity: 0.3, offset: -15 },
  { bottom: 30, left: 60, size: 10, opacity: 0.35, offset: 15 },
  { bottom: 60, right: 50, size: 6, opacity: 0.25, offset: 10 },
];

function Particle({ index, active, reduced, color }: { index: number; active: boolean; reduced: boolean; color: string }) {
  const { size, opacity, offset, ...position } = particles[index];
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = reduced ? 1 : active ? withDelay(300 + index * 100, withTiming(1, { duration: 1800 })) : 0;
  }, [active, reduced, index, progress]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value * opacity, transform: [{ translateY: offset * (1 - progress.value) }] }));
  return <Animated.View style={[styles.particle, position, { width: size, height: size, backgroundColor: color }, style]} />;
}

function Page({ index, active, width, compact, reduced }: { index: number; active: boolean; width: number; compact: boolean; reduced: boolean }) {
  const { t } = useI18n();
  const page = slides[index];
  const light = index === 2;
  const ringSize = Math.min(compact ? 220 : 280, width - 64);
  const iconScale = useSharedValue(0.5);
  const ringScale = useSharedValue(0.8);
  const titleProgress = useSharedValue(0);
  const descriptionProgress = useSharedValue(0);
  useEffect(() => {
    iconScale.value = reduced ? 1 : active ? withSpring(1, { damping: 10, stiffness: 130 }) : 0.5;
    ringScale.value = reduced ? 1 : withTiming(active ? 1 : 0.8, { duration: 800, easing: Easing.out(Easing.cubic) });
    titleProgress.value = reduced ? 1 : active ? withDelay(100, withTiming(1, { duration: 400 })) : 0;
    descriptionProgress.value = reduced ? 1 : active ? withDelay(200, withTiming(1, { duration: 400 })) : 0;
  }, [active, reduced, iconScale, ringScale, titleProgress, descriptionProgress]);
  const iconStyle = useAnimatedStyle(() => ({ opacity: (iconScale.value - 0.5) * 2, transform: [{ scale: iconScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }] }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleProgress.value, transform: [{ translateY: (1 - titleProgress.value) * 24 }] }));
  const descriptionStyle = useAnimatedStyle(() => ({ opacity: descriptionProgress.value, transform: [{ translateY: (1 - descriptionProgress.value) * 20 }] }));

  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}
      accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      <View style={[styles.illustrationArea, { minHeight: ringSize + 24 }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[styles.ring, { width: ringSize, height: ringSize, backgroundColor: light ? '#064E3B08' : '#FFFFFF0D', borderColor: light ? '#064E3B18' : '#FFFFFF1A' }, ringStyle]} />
          <Animated.View style={[styles.ring, { width: ringSize * 0.79, height: ringSize * 0.79, backgroundColor: light ? '#064E3B0D' : '#FFFFFF14', borderColor: light ? '#064E3B22' : '#FFFFFF26' }, ringStyle]} />
          <Animated.View style={[styles.iconCircle, { width: ringSize * 0.64, height: ringSize * 0.64, backgroundColor: light ? '#FFFFFF80' : '#FFFFFF33' }, iconStyle]}>
            <HugeiconsIcon icon={page.icon} size={compact ? 64 : 80} color={page.foreground} strokeWidth={1.5} />
          </Animated.View>
          {particles.map((_, particleIndex) => <Particle key={particleIndex} index={particleIndex} active={active} reduced={reduced} color={page.foreground} />)}
        </View>
      </View>
      <Animated.View style={[styles.copy, titleStyle]}>
        <Text accessibilityRole="header" style={[styles.title, { color: page.foreground, fontSize: compact ? 28 : 32 }]}>{t(page.title)}</Text>
      </Animated.View>
      <Animated.View style={[styles.copy, descriptionStyle]}>
        <Text style={[styles.description, { color: light ? '#286550' : '#FFFFFFCC' }]}>{t(page.description)}</Text>
      </Animated.View>
    </ScrollView>
  );
}

function Indicator({ active, reduced, color }: { active: boolean; reduced: boolean; color: string }) {
  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 32 : 8, { duration: reduced ? 0 : 300, easing }),
    opacity: withTiming(active ? 1 : 0.4, { duration: reduced ? 0 : 300 }),
  }), [active, reduced]);
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

export default function OnboardingRoute() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const pager = useRef<ScrollView>(null);
  const navigating = useRef(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const backgroundProgress = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const { t } = useI18n();
  const router = useRouter();
  const last = currentIndex === slides.length - 1;
  const foreground = slides[currentIndex].foreground;

  useEffect(() => {
    backgroundProgress.value = withTiming(currentIndex, { duration: reduced ? 0 : 500, easing });
    buttonScale.value = last && !reduced ? withRepeat(withTiming(1.05, { duration: 300 }), 2, true) : 1;
  }, [currentIndex, last, reduced, backgroundProgress, buttonScale]);

  // Preserve the visible page if screen dimensions change.
  const currentPage = useRef(currentIndex);
  currentPage.current = currentIndex;
  useEffect(() => { pager.current?.scrollTo({ x: currentPage.current * width, animated: false }); }, [width]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentIndex === 0) return false;
      pager.current?.scrollTo({ x: (currentIndex - 1) * width, animated: !reduced });
      setCurrentIndex(currentIndex - 1);
      return true;
    });
    return () => subscription.remove();
  }, [currentIndex, width, reduced]);

  const backgroundStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(backgroundProgress.value, [0, 1, 2], slides.map((slide) => slide.background)) }));
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));
  const complete = () => {
    if (navigating.current) return;
    navigating.current = true;
    router.replace('/language-select');
  };
  const next = () => {
    if (last) return complete();
    const index = currentIndex + 1;
    pager.current?.scrollTo({ x: index * width, animated: !reduced });
    setCurrentIndex(index);
  };

  return (
    <Animated.View style={[styles.container, backgroundStyle]}>
      <StatusBar style={last ? 'dark' : 'light'} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={complete} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.skipText, { color: foreground }]}>{t('skip')}</Text>
        </Pressable>
      </View>
      <ScrollView ref={pager} horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false}
        style={styles.pager} onMomentumScrollEnd={(event) => setCurrentIndex(Math.max(0, Math.min(2, Math.round(event.nativeEvent.contentOffset.x / width))))}>
        {slides.map((slide, index) => <Page key={slide.title} index={index} active={index === currentIndex} width={width} compact={height < 740} reduced={reduced} />)}
      </ScrollView>
      <LinearGradient colors={['transparent', '#00000030']} style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <View style={styles.indicators} accessible accessibilityLabel={`${currentIndex + 1} / ${slides.length}`}>
          {slides.map((slide, index) => <Indicator key={slide.title} active={index === currentIndex} reduced={reduced} color={foreground} />)}
        </View>
        <Animated.View style={[styles.buttonWrapper, buttonStyle]}>
          <Pressable onPress={next} accessibilityRole="button" style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}>
            <Text style={styles.buttonText}>{last ? t('getStarted') : t('onboardingContinue')}</Text>
            <HugeiconsIcon icon={ArrowRight01Icon} size={22} color="#064E3B" strokeWidth={2} />
          </Pressable>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'flex-end', paddingHorizontal: 24 },
  skip: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 16, fontWeight: '500' },
  pager: { flex: 1 },
  page: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24 },
  illustrationArea: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', paddingVertical: 12 },
  ring: { position: 'absolute', borderRadius: 200, borderWidth: 1 },
  iconCircle: { borderRadius: 100, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.1, shadowRadius: 30, shadowOffset: { width: 0, height: 10 } },
  particle: { position: 'absolute', borderRadius: 20 },
  copy: { width: '100%', maxWidth: 440 },
  title: { fontWeight: '700', textAlign: 'center', lineHeight: 38, marginTop: 24 },
  description: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 24 },
  footer: { paddingHorizontal: 24, paddingTop: 12, alignItems: 'center', gap: 32 },
  indicators: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 8 },
  dot: { height: 8, borderRadius: 4 },
  buttonWrapper: { width: '100%', maxWidth: 480 },
  button: { minHeight: 56, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 28, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 18, fontWeight: '600', color: '#064E3B' },
});

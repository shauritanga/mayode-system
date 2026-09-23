import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  CloudOffIcon,
  CloudSavingDone01Icon,
  AlertCircleIcon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons';
import { useSyncStatus } from '../services/sync-queue';
import { useI18n } from '../i18n';

export function SyncStatusBanner() {
  const router = useRouter();
  const { t } = useI18n();
  const { isConnected, isSyncing, pendingCount, errorCount } = useSyncStatus();

  // If connected, not syncing, no errors, and no pending items, stay hidden
  if (isConnected && !isSyncing && pendingCount === 0 && errorCount === 0) {
    return null;
  }

  const handlePress = () => {
    router.push('/sync-center' as any);
  };

  if (!isConnected) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.bannerOffline]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.leftRow}>
          <HugeiconsIcon icon={CloudOffIcon} size={16} color="#B45309" strokeWidth={2} />
          <Text style={[styles.text, styles.textOffline]}>
            {t('offlineBannerText')}
            {pendingCount > 0 ? ` · ${pendingCount} ${t('pendingSyncCount')}` : ''}
          </Text>
        </View>
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#B45309" strokeWidth={2} />
      </TouchableOpacity>
    );
  }

  if (isSyncing) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.bannerSyncing]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.leftRow}>
          <ActivityIndicator size="small" color="#0369A1" />
          <Text style={[styles.text, styles.textSyncing]}>
            {t('syncingBannerText')} ({pendingCount} remaining)
          </Text>
        </View>
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#0369A1" strokeWidth={2} />
      </TouchableOpacity>
    );
  }

  if (errorCount > 0) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.bannerError]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.leftRow}>
          <HugeiconsIcon icon={AlertCircleIcon} size={16} color="#DC2626" strokeWidth={2} />
          <Text style={[styles.text, styles.textError]}>
            {errorCount} {t('syncErrorBannerText')}
          </Text>
        </View>
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#DC2626" strokeWidth={2} />
      </TouchableOpacity>
    );
  }

  if (pendingCount > 0) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.bannerPending]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.leftRow}>
          <HugeiconsIcon icon={CloudSavingDone01Icon} size={16} color="#047857" strokeWidth={2} />
          <Text style={[styles.text, styles.textPending]}>
            {pendingCount} {t('pendingSyncCount')}
          </Text>
        </View>
        <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#047857" strokeWidth={2} />
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  bannerOffline: {
    backgroundColor: '#FEF3C7',
    borderBottomColor: '#FDE68A',
  },
  textOffline: {
    color: '#92400E',
  },
  bannerSyncing: {
    backgroundColor: '#E0F2FE',
    borderBottomColor: '#BAE6FD',
  },
  textSyncing: {
    color: '#0369A1',
  },
  bannerError: {
    backgroundColor: '#FEE2E2',
    borderBottomColor: '#FECACA',
  },
  textError: {
    color: '#991B1B',
  },
  bannerPending: {
    backgroundColor: '#D1FAE5',
    borderBottomColor: '#A7F3D0',
  },
  textPending: {
    color: '#065F46',
  },
});

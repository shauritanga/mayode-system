import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  CloudSavingDone01Icon,
  CloudOffIcon,
  AlertCircleIcon,
  Delete02Icon,
  RefreshIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import { useSyncStatus, PendingMutation } from '../src/services/sync-queue';
import { useI18n } from '../src/i18n';

export default function SyncCenterScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const {
    isConnected,
    isSyncing,
    pendingCount,
    lastSyncedAt,
    errorCount,
    pendingList,
    flush,
    retryItem,
    discardItem,
    clearAll,
  } = useSyncStatus();

  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleSyncNow = async () => {
    if (!isConnected) {
      Alert.alert(t('syncCenter'), t('syncRequiresConnection'));
      return;
    }
    await flush();
  };

  const handleRetryItem = async (id: string) => {
    setRetryingId(id);
    try {
      await retryItem(id);
    } finally {
      setRetryingId(null);
    }
  };

  const handleDiscardItem = (id: string) => {
    Alert.alert(t('discardMutationTitle'), t('discardMutationConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('discard'),
        style: 'destructive',
        onPress: () => discardItem(id),
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert(t('clearAllQueueTitle'), t('clearAllQueueConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('discardAll'),
        style: 'destructive',
        onPress: () => clearAll(),
      },
    ]);
  };

  const getActionName = (item: PendingMutation) => {
    const url = item.url;
    if (url.includes('/field-surveys')) return t('syncActionSurvey');
    if (url.includes('/activity')) return t('syncActionActivity');
    if (url.startsWith('/farms')) return t('syncActionFarm');
    if (url.startsWith('/crop-cycles')) return t('syncActionCycle');
    return `${item.method} ${url}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('syncCenter'),
          headerStyle: { backgroundColor: '#065F46' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800' },
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.statusTitle}>
              {isConnected ? t('networkOnline') : t('networkOffline')}
            </Text>
          </View>

          <Text style={styles.lastSyncText}>
            {lastSyncedAt
              ? `${t('lastSynced')}: ${new Date(lastSyncedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: 'numeric',
                  month: 'short',
                })}`
              : t('notYetSynced')}
          </Text>

          <TouchableOpacity
            style={[
              styles.syncNowBtn,
              (!isConnected || isSyncing) && styles.syncNowBtnDisabled,
            ]}
            onPress={handleSyncNow}
            disabled={!isConnected || isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <HugeiconsIcon icon={RefreshIcon} size={18} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.syncNowBtnText}>
              {isSyncing ? t('syncingChanges') : t('syncNow')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{pendingCount}</Text>
            <Text style={styles.statLabel}>{t('pendingSyncCount')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, errorCount > 0 && { color: '#DC2626' }]}>
              {errorCount}
            </Text>
            <Text style={styles.statLabel}>{t('syncErrors')}</Text>
          </View>
        </View>

        {/* Section Title */}
        <View style={styles.queueHeaderRow}>
          <Text style={styles.sectionHeading}>{t('queuedChanges')}</Text>
          {pendingCount > 0 && (
            <TouchableOpacity onPress={handleClearAll}>
              <Text style={styles.clearAllText}>{t('clearQueue')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Queue Items List */}
        {pendingList.length === 0 ? (
          <View style={styles.emptyCard}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={36} color="#10B981" />
            <Text style={styles.emptyTitle}>{t('allChangesSynced')}</Text>
            <Text style={styles.emptySub}>{t('allChangesSyncedDesc')}</Text>
          </View>
        ) : (
          pendingList.map((item) => {
            const hasError = item.attempts > 0;
            const isRetrying = retryingId === item.id;

            return (
              <View
                key={item.id}
                style={[styles.itemCard, hasError && styles.itemCardError]}
              >
                <View style={styles.itemTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{getActionName(item)}</Text>
                    <Text style={styles.itemDate}>
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {item.attempts > 0 ? ` · ${item.attempts} attempts` : ''}
                    </Text>
                  </View>

                  <View style={styles.methodBadge}>
                    <Text style={styles.methodText}>{item.method}</Text>
                  </View>
                </View>

                {item.lastError && (
                  <View style={styles.errorBox}>
                    <HugeiconsIcon icon={AlertCircleIcon} size={14} color="#DC2626" />
                    <Text style={styles.errorText} numberOfLines={2}>
                      {item.lastError}
                    </Text>
                  </View>
                )}

                <View style={styles.itemActionRow}>
                  <TouchableOpacity
                    style={styles.discardBtn}
                    onPress={() => handleDiscardItem(item.id)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} color="#6B7280" />
                    <Text style={styles.discardBtnText}>{t('discard')}</Text>
                  </TouchableOpacity>

                  {isConnected && (
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => handleRetryItem(item.id)}
                      disabled={isRetrying}
                    >
                      {isRetrying ? (
                        <ActivityIndicator size="small" color="#059669" />
                      ) : (
                        <HugeiconsIcon icon={RefreshIcon} size={14} color="#059669" />
                      )}
                      <Text style={styles.retryBtnText}>{t('retry')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}

        {/* Offline Guidance Box */}
        <View style={styles.infoBox}>
          <HugeiconsIcon icon={InformationCircleIcon} size={18} color="#065F46" />
          <Text style={styles.infoText}>{t('offlineSyncHelpText')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  lastSyncText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  syncNowBtn: {
    backgroundColor: '#065F46',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncNowBtnDisabled: {
    opacity: 0.5,
  },
  syncNowBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statNum: {
    fontSize: 24,
    fontWeight: '800',
    color: '#065F46',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemCardError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  itemDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  methodBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  methodText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4B5563',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  errorText: {
    fontSize: 11,
    color: '#991B1B',
    flex: 1,
  },
  itemActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  discardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  discardBtnText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  retryBtnText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#065F46',
    flex: 1,
    lineHeight: 18,
  },
});

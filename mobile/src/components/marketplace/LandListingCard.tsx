import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useI18n } from '../../i18n';

interface LandListingCardProps {
  listing: any;
  onPress: () => void;
}

export function LandListingCard({ listing: l, onPress }: LandListingCardProps) {
  const { t } = useI18n();
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.farmCode}>{l.farm?.farmCode || t('farm')}</Text>
          <Text style={styles.subText}>{l.farm?.socialHectares || '—'} ha · {t('gradeValue', { grade: l.farm?.grade || 'A' })}</Text>
        </View>
        <View style={[styles.badge, l.isFlashDeal ? styles.badgeRed : styles.badgeGold]}>
          <Text style={l.isFlashDeal ? styles.badgeTextRed : styles.badgeTextGold}>{l.dealType}</Text>
        </View>
      </View>

      <View style={styles.priceBox}>
        <Text style={styles.priceLabel}>{t('askingPrice')}</Text>
        <Text style={styles.priceValue}>{Number(l.askingPrice).toLocaleString()} TZS</Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.ownerText}>👤 {l.owner?.firstName} {l.owner?.lastName}</Text>
        <Text style={styles.statusText}>{l.leaseStatus}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  farmCode: { fontSize: 18, fontWeight: '800', color: '#111827' },
  subText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  badgeGold: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' },
  badgeRed: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' },
  badgeTextGold: { color: '#F59E0B', fontSize: 12, fontWeight: '700' },
  badgeTextRed: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  priceBox: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  priceLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 2 },
  priceValue: { fontSize: 22, fontWeight: '800', color: '#10B981' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 14 },
  ownerText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  statusText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useI18n } from '../../i18n';

interface TractorCardProps {
  tractor: any;
  onBook: () => void;
}

export function TractorCard({ tractor, onBook }: TractorCardProps) {
  const { t } = useI18n();
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.tractorModel}>{tractor.model || t('tractors')}</Text>
          <Text style={styles.regNo}>{tractor.registrationNo}</Text>
        </View>
        <View style={[styles.badge, tractor.isAvailable ? styles.badgeGreen : styles.badgeRed]}>
          <Text style={[styles.badgeText, tractor.isAvailable ? styles.badgeTextGreen : styles.badgeTextRed]}>
            {tractor.isAvailable ? t('available') : t('booked')}
          </Text>
        </View>
      </View>

      <View style={styles.tractorDetails}>
        <Text style={styles.tractorDetailText}>📍 {tractor.location || t('locationUnknown')}</Text>
        <Text style={styles.tractorDetailText}>⚡ {tractor.horsePower || '—'} HP</Text>
        <Text style={styles.tractorPriceText}>{tractor.pricePerHectare ? `${Number(tractor.pricePerHectare).toLocaleString()} TZS/ha` : '—'}</Text>
      </View>

      {tractor.isAvailable && (
        <TouchableOpacity style={styles.bookBtn} onPress={onBook}>
          <Text style={styles.bookBtnText}>{t('bookTractorService')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  tractorModel: { fontSize: 18, fontWeight: '800', color: '#111827' },
  regNo: { fontSize: 13, color: '#10B981', fontWeight: '700', marginTop: 2 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  badgeGreen: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' },
  badgeRed: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextGreen: { color: '#10B981' },
  badgeTextRed: { color: '#F87171' },
  tractorDetails: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  tractorDetailText: { fontSize: 13, color: '#374151', marginBottom: 4 },
  tractorPriceText: { fontSize: 16, fontWeight: '800', color: '#10B981', marginTop: 6 },
  bookBtn: { backgroundColor: '#10B981', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  bookBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});

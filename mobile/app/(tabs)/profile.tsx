import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { QuestionIcon, Logout01Icon, ArrowRight01Icon, Edit02Icon, File01Icon, StarIcon, Agreement01Icon, SecurityCheckIcon, GiftIcon } from '@hugeicons/core-free-icons';
import { useAuthStore } from '../../src/store/auth.store';
import { authApi, farmersApi } from '../../src/lib/data';
import { StatusBar } from 'expo-status-bar';
import { Language, useI18n } from '../../src/i18n';

export default function ProfileTab() {
  const { user, farmerId, clearAuth } = useAuthStore();
  const { language, setLanguage, t } = useI18n();
  const router = useRouter();
  const [farmer, setFarmer] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!farmerId) return;
        try {
          const res = await farmersApi.getOne(farmerId);
          if (active) setFarmer(res.data);
        } catch {
          /* keep whatever we have */
        }
      })();
      return () => {
        active = false;
      };
    }, [farmerId]),
  );

  const status = farmer?.verificationStatus || 'PENDING';
  const verify = ({
    VERIFIED: { label: t('verified'), color: '#10B981' },
    PENDING: { label: t('pending'), color: '#F59E0B' },
    REJECTED: { label: t('rejected'), color: '#EF4444' },
    SUSPENDED: { label: t('suspended'), color: '#EF4444' },
  } as Record<string, { label: string; color: string }>)[status] || { label: t('pending'), color: '#F59E0B' };
  const docCount = farmer?.documents?.length ?? 0;

  const handleLogout = () => {
    Alert.alert(t('signOut'), t('signOutQuestion'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        style: 'destructive',
        onPress: async () => {
          try {
            await authApi.logout();
          } catch (e) {
            console.error(e);
          } finally {
            clearAuth();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Avatar Section */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatarBox}>
            <Text style={styles.avatarText}>{user?.firstName?.[0] || 'M'}</Text>
          </View>
          <View style={styles.userNameRow}>
            <Text style={styles.userName}>{user?.firstName ? `${user.firstName} ${user.lastName || ''}` : t('farmerAccount')}</Text>
            {status === 'VERIFIED' && <Text style={styles.verifiedBadge}>✓</Text>}
          </View>
          <Text style={styles.userPhone}>{user?.phone || '+255 ••• ••• •••'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user?.role || 'FARMER'}</Text>
          </View>
        </View>

        {/* Profile Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('accountDetails')}</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('firstName')}</Text>
            <Text style={styles.detailValue}>{user?.firstName || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('lastName')}</Text>
            <Text style={styles.detailValue}>{user?.lastName || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('phoneNumber')}</Text>
            <Text style={styles.detailValue}>{user?.phone || '—'}</Text>
          </View>
          {!!farmer?.controlNumber && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('controlNumber')}</Text>
              <Text style={styles.detailValue}>{farmer.controlNumber}</Text>
            </View>
          )}
          {!!(farmer?.village || farmer?.region) && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('location')}</Text>
              <Text style={styles.detailValue}>
                {[farmer?.village, farmer?.district, farmer?.region].filter(Boolean).join(', ') || '—'}
              </Text>
            </View>
          )}
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>{t('verificationStatus')}</Text>
            <Text style={[styles.verifiedText, { color: verify.color }]}>{verify.label}</Text>
          </View>
          {/* Identity verification CTA — hidden once verified */}
          {status !== 'VERIFIED' && (
            <TouchableOpacity style={styles.verifyCta} onPress={() => router.push('/identity')}>
              <HugeiconsIcon icon={SecurityCheckIcon} size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.verifyCtaText}>
                {status === 'PENDING' ? t('verificationPending') : status === 'REJECTED' ? t('resubmit') : t('verifyIdentity')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Profile actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('myProfile')}</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/edit-profile')}>
            <View style={styles.menuItemLeft}>
              <HugeiconsIcon icon={Edit02Icon} size={22} color="#10B981" />
              <Text style={styles.menuItemText}>{t('editProfile')}</Text>
            </View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => router.push('/edit-profile')}>
            <View style={styles.menuItemLeft}>
              <HugeiconsIcon icon={File01Icon} size={22} color="#3B82F6" />
              <Text style={styles.menuItemText}>{t('myDocuments')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.docCount}>{docCount}</Text>
              <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#9CA3AF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Membership & farming */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('membership')}</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/membership')}>
            <View style={styles.menuItemLeft}>
              <HugeiconsIcon icon={StarIcon} size={22} color="#F59E0B" />
              <Text style={styles.menuItemText}>{t('membershipPlans')}</Text>
            </View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/leases')}>
            <View style={styles.menuItemLeft}>
              <HugeiconsIcon icon={Agreement01Icon} size={22} color="#10B981" />
              <Text style={styles.menuItemText}>{t('myLeases')}</Text>
            </View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => router.push('/rewards')}>
            <View style={styles.menuItemLeft}>
              <HugeiconsIcon icon={GiftIcon} size={22} color="#F59E0B" />
              <Text style={styles.menuItemText}>{t('myRewards')}</Text>
            </View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Action Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('systemSettings')}</Text>
          <View style={styles.languageRow}>
            <Text style={styles.menuItemText}>{t('language')}</Text>
            <View style={styles.languageToggle}>
              {(['en', 'sw'] as Language[]).map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.languageButton, language === code && styles.languageButtonActive]}
                  onPress={() => setLanguage(code)}
                >
                  <Text style={[styles.languageButtonText, language === code && styles.languageButtonTextActive]}>
                    {code === 'en' ? t('english') : t('swahili')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/support')}>
            <View style={styles.menuItemLeft}>
              <HugeiconsIcon icon={QuestionIcon} size={22} color="#6B7280" />
              <Text style={styles.menuItemText}>{t('helpSupport')}</Text>
            </View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleLogout}>
            <View style={styles.menuItemLeft}>
              <HugeiconsIcon icon={Logout01Icon} size={22} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>{t('signOut')}</Text>
            </View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>MAYODE Group App v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingTop: -46,
    paddingBottom: -24,
  },
  scrollContent: {
    padding: 20,
  },
  avatarContainer: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarBox: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  verifiedBadge: { color: '#10B981', fontSize: 18, fontWeight: '900' },
  userPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  roleBadge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
  },
  roleBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  languageRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  languageToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginTop: 10,
  },
  languageButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  languageButtonActive: {
    backgroundColor: '#10B981',
  },
  languageButtonText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '700',
  },
  languageButtonTextActive: {
    color: '#FFFFFF',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  verifiedText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '700',
  },
  verifyCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#065F46', paddingVertical: 12, borderRadius: 12, marginTop: 14,
  },
  verifyCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  docCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 14,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 12,
    marginBottom: 24,
  },
});

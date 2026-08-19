import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  Drawer,
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  UserCircleIcon,
  Edit02Icon,
  Plant01Icon,
  Wallet01Icon,
  Calendar01Icon,
  StarIcon,
  Agreement01Icon,
  GiftIcon,
  QuestionIcon,
  Logout01Icon,
  ShoppingCart02Icon,
  TaskDaily01Icon,
  CoinsDollarIcon,
  Package01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons';
import { useAuthStore } from '../../src/store/auth.store';
import { authApi } from '../../src/lib/data';
import { useI18n } from '../../src/i18n';

type DrawerNavItem = {
  key: string;
  label: string;
  icon: any;
  color: string;
  onPress: () => void;
};

function FarmerDrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { t } = useI18n();

  const name = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : t('farmerAccount');
  const initial = (user?.firstName?.[0] || 'M').toUpperCase();

  const go = (href: string) => {
    props.navigation.closeDrawer();
    router.push(href as never);
  };

  const goSelectCycle = (purpose: 'activity' | 'expense' | 'sale') => {
    props.navigation.closeDrawer();
    router.push({ pathname: '/activity-select-cycle', params: { purpose } });
  };

  const handleLogout = () => {
    Alert.alert(t('signOut'), t('signOutQuestion'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOut'),
        style: 'destructive',
        onPress: async () => {
          props.navigation.closeDrawer();
          try {
            await authApi.logout();
          } catch {
            /* still clear local session */
          } finally {
            clearAuth();
          }
        },
      },
    ]);
  };

  const items: DrawerNavItem[] = [
    { key: 'profile', label: t('myProfile'), icon: UserCircleIcon, color: '#065F46', onPress: () => go('/profile') },
    { key: 'edit-profile', label: t('editProfile'), icon: Edit02Icon, color: '#10B981', onPress: () => go('/edit-profile') },
    { key: 'farms', label: t('farms'), icon: Plant01Icon, color: '#059669', onPress: () => go('/farms') },
    { key: 'log-activity', label: t('logActivity'), icon: TaskDaily01Icon, color: '#065F46', onPress: () => goSelectCycle('activity') },
    { key: 'add-expense', label: t('addExpense'), icon: Wallet01Icon, color: '#0F766E', onPress: () => goSelectCycle('expense') },
    { key: 'record-sale', label: t('recordSale'), icon: CoinsDollarIcon, color: '#047857', onPress: () => goSelectCycle('sale') },
    { key: 'marketplace', label: t('marketplace'), icon: ShoppingCart02Icon, color: '#059669', onPress: () => go('/marketplace') },
    { key: 'finances', label: t('finances'), icon: Wallet01Icon, color: '#0F766E', onPress: () => go('/finances') },
    { key: 'insurance', label: t('insurance'), icon: Shield01Icon, color: '#047857', onPress: () => go('/insurance') },
    { key: 'inventory', label: t('warehouseStock'), icon: Package01Icon, color: '#0F766E', onPress: () => go('/inventory') },
    { key: 'calendar', label: t('calendar'), icon: Calendar01Icon, color: '#047857', onPress: () => go('/calendar') },
    { key: 'membership', label: t('membershipPlans'), icon: StarIcon, color: '#D97706', onPress: () => go('/membership') },
    { key: 'leases', label: t('myLeases'), icon: Agreement01Icon, color: '#10B981', onPress: () => go('/leases') },
    { key: 'rewards', label: t('myRewards'), icon: GiftIcon, color: '#F59E0B', onPress: () => go('/rewards') },
    { key: 'votes', label: 'Member voting', icon: Agreement01Icon, color: '#3B82F6', onPress: () => go('/votes') },
    { key: 'support', label: t('helpSupport'), icon: QuestionIcon, color: '#6B7280', onPress: () => go('/support') },
  ];

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.phone} numberOfLines={1}>{user?.phone || '—'}</Text>
        </View>
      </View>

      {items.map((item) => (
        <DrawerItem
          key={item.key}
          label={item.label}
          onPress={item.onPress}
          icon={() => (
            <View style={[styles.itemIcon, { backgroundColor: `${item.color}18` }]}>
              <HugeiconsIcon icon={item.icon} size={18} color={item.color} strokeWidth={2} />
            </View>
          )}
          labelStyle={styles.itemLabel}
          style={styles.item}
        />
      ))}

      <DrawerItem
        label={t('signOut')}
        onPress={handleLogout}
        icon={() => (
          <View style={[styles.itemIcon, { backgroundColor: '#FEE2E2' }]}>
            <HugeiconsIcon icon={Logout01Icon} size={18} color="#EF4444" strokeWidth={2} />
          </View>
        )}
        labelStyle={[styles.itemLabel, { color: '#EF4444' }]}
        style={styles.item}
      />

      <Text style={styles.footer}>MAYODE Group App v1.0.0</Text>
    </DrawerContentScrollView>
  );
}

export default function DrawerLayout() {
  const role = useAuthStore((state) => state.user?.role);
  const isFarmer = !role || role === 'FARMER';

  return (
    <Drawer
      drawerContent={(props) => (isFarmer ? <FarmerDrawerContent {...props} /> : null)}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        swipeEnabled: isFarmer,
        overlayColor: 'rgba(17,24,39,0.45)',
        drawerStyle: { width: 300 },
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          drawerItemStyle: { display: 'none' },
          title: 'Home',
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#065F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  name: { color: '#111827', fontSize: 16, fontWeight: '800' },
  phone: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  item: { borderRadius: 12, marginHorizontal: 8 },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { fontSize: 15, fontWeight: '600', color: '#111827', marginLeft: -8 },
  footer: { textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 16 },
});

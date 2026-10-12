import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  Wallet01Icon,
  Calendar01Icon,
  ShoppingCart02Icon,
  TaskDaily01Icon,
  MapsSearchIcon,
  CoinsDollarIcon,
  Package01Icon,
  Shield01Icon,
  CloudSavingDone01Icon,
} from '@hugeicons/core-free-icons';
import { useAuthStore } from '../../src/store/auth.store';
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
  const { user } = useAuthStore();
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

  const items: DrawerNavItem[] = [
    { key: 'log-activity', label: t('logActivity'), icon: TaskDaily01Icon, color: '#065F46', onPress: () => goSelectCycle('activity') },
    { key: 'add-expense', label: t('addExpense'), icon: Wallet01Icon, color: '#0F766E', onPress: () => goSelectCycle('expense') },
    { key: 'record-sale', label: t('recordSale'), icon: CoinsDollarIcon, color: '#047857', onPress: () => goSelectCycle('sale') },
    { key: 'marketplace', label: t('marketplace'), icon: ShoppingCart02Icon, color: '#059669', onPress: () => go('/marketplace') },
    { key: 'finances', label: t('finances'), icon: Wallet01Icon, color: '#0F766E', onPress: () => go('/finances') },
    { key: 'payments', label: t('paymentsHistory'), icon: CoinsDollarIcon, color: '#10B981', onPress: () => go('/payments') },
    { key: 'insurance', label: t('insurance'), icon: Shield01Icon, color: '#047857', onPress: () => go('/insurance') },
    { key: 'inventory', label: t('warehouseStock'), icon: Package01Icon, color: '#0F766E', onPress: () => go('/inventory') },
    { key: 'calendar', label: t('calendar'), icon: Calendar01Icon, color: '#047857', onPress: () => go('/calendar') },
    { key: 'sync', label: t('syncCenter'), icon: CloudSavingDone01Icon, color: '#059669', onPress: () => go('/sync-center') },
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

      <Text style={styles.footer}>{t('appVersion', { version: '1.0.0' })}</Text>
    </DrawerContentScrollView>
  );
}

function OfficerDrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useI18n();

  const name = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : t('farmerOfficerPortal');
  const initial = (user?.firstName?.[0] || 'O').toUpperCase();

  const go = (href: string) => {
    props.navigation.closeDrawer();
    router.push(href as never);
  };

  const items: DrawerNavItem[] = [
    { key: 'field-survey', label: t('fieldSurvey'), icon: MapsSearchIcon, color: '#065F46', onPress: () => go('/field-survey') },
    { key: 'sync', label: t('syncCenter'), icon: CloudSavingDone01Icon, color: '#059669', onPress: () => go('/sync-center') },
  ];

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
    >
      <TouchableOpacity style={styles.header} onPress={() => go('/profile')} activeOpacity={0.85}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.phone} numberOfLines={1}>{user?.phone || '—'}</Text>
        </View>
      </TouchableOpacity>

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

      <Text style={styles.footer}>{t('appVersion', { version: '1.0.0' })}</Text>
    </DrawerContentScrollView>
  );
}

export default function DrawerLayout() {
  const { t } = useI18n();
  const role = useAuthStore((state) => state.user?.role);
  const isFarmer = !role || role === 'FARMER';
  const isFieldOfficer = role === 'FIELD_OFFICER';

  return (
    <Drawer
      drawerContent={(props) => (isFarmer ? <FarmerDrawerContent {...props} /> : <OfficerDrawerContent {...props} />)}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        swipeEnabled: !isFieldOfficer,
        overlayColor: 'rgba(17,24,39,0.45)',
        drawerStyle: { width: 300 },
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          drawerItemStyle: { display: 'none' },
          title: t('navHome'),
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

import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Menu01Icon } from '@hugeicons/core-free-icons';
import { useAuthStore } from '../store/auth.store';
import { useI18n } from '../i18n';

type Props = {
  /** Light icons for green app bars. */
  light?: boolean;
};

/** Opens the farmer drawer from any tab screen. */
export function DrawerMenuButton({ light = true }: Props) {
  const { t } = useI18n();
  const role = useAuthStore((s) => s.user?.role);
  const drawerNavigation = useNavigation('/(drawer)');

  if (role && role !== 'FARMER') return null;

  return (
    <TouchableOpacity
      style={[styles.btn, light ? styles.btnLight : styles.btnDark]}
      onPress={() => {
        (drawerNavigation as { openDrawer?: () => void }).openDrawer?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('moreOptions')}
      hitSlop={8}
    >
      <HugeiconsIcon
        icon={Menu01Icon}
        size={22}
        color={light ? '#FFFFFF' : '#111827'}
        strokeWidth={2}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 8,
    borderRadius: 10,
    marginRight: 4,
  },
  btnLight: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  btnDark: {
    backgroundColor: '#F3F4F6',
  },
});

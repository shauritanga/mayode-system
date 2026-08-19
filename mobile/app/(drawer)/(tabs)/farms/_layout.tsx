import React from 'react';
import { Stack } from 'expo-router';
import { useI18n } from '../../../../src/i18n';
import { DrawerMenuButton } from '../../../../src/components/DrawerMenuButton';

/**
 * Stack navigator for the Farms tab — it only holds the list. Detail, register,
 * add-plot and boundary are root-level routes (pushed over the tabs) so they get
 * a consistent back button regardless of where they were opened from.
 */
export default function FarmsLayout() {
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#065F46' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '800' },
        headerLeft: () => <DrawerMenuButton light />,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('farms') }} />
    </Stack>
  );
}

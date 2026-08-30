import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadsApi, usersApi } from '../lib/data';
import { useAuthStore } from '../store/auth.store';
import { useI18n } from '../i18n';

export function useProfilePhotoUpload() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = async () => {
    if (!user?.id) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('permissionNeeded'), t('allowPhotoAccess'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `profile-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      const res = await usersApi.updateProfile({ profilePhotoUrl: up.data.url });
      updateUser({
        profilePhotoUrl: res.data?.profilePhotoUrl ?? up.data.url,
        firstName: res.data?.firstName ?? user.firstName,
        lastName: res.data?.lastName ?? user.lastName,
      });
      Alert.alert(t('myProfile'), t('profilePhotoUpdated'));
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('uploadFailed'), Array.isArray(msg) ? msg.join('\n') : msg || e?.message || t('couldNotAttachDocument'));
    } finally {
      setUploading(false);
    }
  };

  return {
    photoUrl: user?.profilePhotoUrl,
    uploading,
    pickAndUpload,
    displayName: user?.firstName || user?.phone,
  };
}

export async function refreshUserProfile(userId: string) {
  const res = await usersApi.getMe(userId);
  const data = res.data;
  useAuthStore.getState().updateUser({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    profilePhotoUrl: data.profilePhotoUrl,
  });
}

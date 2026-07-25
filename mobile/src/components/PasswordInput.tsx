import React, { useState } from 'react';
import {
  View, TextInput, TouchableOpacity, StyleSheet,
  TextInputProps, StyleProp, ViewStyle,
} from 'react-native';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { useI18n } from '../i18n';

interface PasswordInputProps extends TextInputProps {
  /** Style for the surrounding box (border, background, padding) — pass the
   *  screen's existing text-input style so it matches the other fields. */
  boxStyle?: StyleProp<ViewStyle>;
}

/** Password field with a show/hide (eye) toggle. */
export function PasswordInput({ boxStyle, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  return (
    <View style={[boxStyle, styles.row]}>
      <TextInput
        {...rest}
        style={styles.input}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('hidePassword') : t('showPassword')}
      >
        <HugeiconsIcon
          icon={visible ? ViewOffSlashIcon : ViewIcon}
          size={20}
          color="#6B7280"
          strokeWidth={1.8}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, padding: 0, fontSize: 15, color: '#111827', marginRight: 10 },
});

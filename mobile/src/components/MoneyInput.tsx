import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { groupDigits, plainDigits } from '../lib/format';

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  /** The plain number as text, no commas (what the form keeps and sends). */
  value: string | number | null | undefined;
  /** Called with the plain number as text, no commas. */
  onChangeText: (value: string) => void;
};

/**
 * A text box for amounts of money that shows thousands separators while you type (1,250,000) and hands the plain
 * number (1250000) back to the screen, so nothing downstream changes. Use it wherever the screen asks for shillings.
 */
export default function MoneyInput({ value, onChangeText, keyboardType = 'numeric', ...rest }: Props) {
  return (
    <TextInput
      {...rest}
      keyboardType={keyboardType}
      value={groupDigits(value == null ? '' : String(value))}
      onChangeText={(text) => onChangeText(plainDigits(text))}
    />
  );
}

/** A TextInput that becomes a MoneyInput when `money` is set: lets a screen's own Field wrapper support both. */
export function MoneyAware({ money, ...props }: TextInputProps & { money?: boolean }) {
  if (!money) return <TextInput {...props} />;
  return <MoneyInput {...(props as Props)} value={props.value} onChangeText={props.onChangeText ?? (() => undefined)} />;
}

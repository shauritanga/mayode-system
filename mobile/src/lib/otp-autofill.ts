import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Android: the system asks the user to allow reading the single verification SMS, then the code
 * fills in. iOS fills it from the keyboard (textContentType="oneTimeCode"). If the native module is
 * missing (Expo Go, or a build made before it was added) this quietly does nothing, so typing the
 * code by hand always works.
 */
type Hook = (length?: number) => string;
let useConsent: Hook | null = null;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    useConsent = require('@eabdullazyanov/react-native-sms-user-consent').useSmsUserConsent as Hook;
  } catch {
    useConsent = null;
  }
}
const none: Hook = () => '';

/** Returns the code read from the SMS, or '' until one arrives. */
export function useOtpAutofill(length = 6): string {
  const hook = useConsent ?? none;
  const code = hook(length);
  const [last, setLast] = useState('');
  useEffect(() => { if (code) setLast(code); }, [code]);
  return last;
}

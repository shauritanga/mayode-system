/**
 * NestJS ValidationPipe often returns `message` as string[].
 * React Native Alert.alert requires a string — arrays crash with
 * "cannot be cast from ReadableNativeArray to String".
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const data = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data;
  const message = data?.message;

  if (Array.isArray(message)) {
    return message.filter(Boolean).map(String).join('\n') || fallback;
  }
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  const plain = (error as { message?: unknown })?.message;
  if (typeof plain === 'string' && plain.trim() && plain !== 'Network Error') {
    return plain;
  }

  return fallback;
}

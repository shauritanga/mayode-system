import { useCallback, useMemo, useState } from 'react';
import { irrigationApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useApi, useCan, type SchemeLite } from './ui';

/** The scheme the irrigation screens are looking at: the user's list of schemes, the remembered choice, and the context the screens read. */
export function useSchemeScope() {
  const can = useCan();
  const user = useAuthStore((s) => s.user);
  const schemes = useApi<SchemeLite[]>(() => irrigationApi.schemes(), []);
  const [chosenId, setChosenId] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('irrigation.schemeId') ?? '' : ''));
  const list = schemes.data ?? [];
  const schemeId = list.find((x) => x.id === chosenId)?.id ?? list[0]?.id ?? '';
  const setSchemeId = useCallback((value: string) => {
    setChosenId(value);
    if (typeof window !== 'undefined') localStorage.setItem('irrigation.schemeId', value);
  }, []);
  const context = useMemo(() => ({
    schemes: schemes.data ?? [], schemeId, setSchemeId, loading: schemes.loading, reloadSchemes: schemes.reload, can,
  }), [schemes.data, schemes.loading, schemes.reload, schemeId, setSchemeId, can]);
  // An AMCOS user only ever sees their own AMCOS's schemes, so naming it on every option is noise.
  const showAmcos = user?.role === 'SUPER_ADMIN' || !user?.mamcosId;
  return { can, schemes, list, schemeId, setSchemeId, context, showAmcos };
}

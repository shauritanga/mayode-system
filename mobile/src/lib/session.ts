import { farmersApi } from './data';
import { isMobileAllowedRole } from './mobile-roles';

type AuthData = {
  accessToken: string;
  refreshToken: string;
  user: { role?: string } & Record<string, unknown>;
};
type Actions = {
  setAuth: (user: never, accessToken: string, refreshToken: string) => void;
  setFarmerId: (id: string | null) => void;
};

/**
 * Finish a sign-in (code verified or sign-up done): refuse web-only roles, store the session and
 * resolve the farmer profile id. Returns false when the account may not use the mobile app.
 */
export async function startSession(data: AuthData, actions: Actions): Promise<boolean> {
  const { accessToken, refreshToken, user } = data;
  if (!isMobileAllowedRole(user?.role)) return false;
  actions.setAuth(user as never, accessToken, refreshToken);
  if (user.role === 'FARMER') {
    try {
      const f = await farmersApi.me();
      actions.setFarmerId(f.data?.id ?? null);
    } catch {
      actions.setFarmerId(null);
    }
  } else {
    actions.setFarmerId(null);
  }
  return true;
}

const BUILT_IN: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  FIELD_OFFICER: 'Field officer',
  MAMCOS_SECRETARY: 'AMCOS leader',
  FARMER: 'Farmer',
  AUDITOR: 'Auditor',
  BUYER: 'Buyer',
  FINANCIAL_PROVIDER: 'Financial provider',
  CUSTOM: 'Staff',
};

/** What to call someone's role on screen: the name of the role they were given (e.g. "Cooperative Admin"), else a readable account type. */
export function roleLabel(user?: { role?: string | null; customRoleName?: string | null } | null): string {
  if (!user) return '';
  return user.customRoleName || (user.role ? BUILT_IN[user.role] ?? user.role : '');
}

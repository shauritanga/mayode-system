import { generateTemporaryPassword, redactPassword, welcomeSms } from './officer-credentials';

describe('officer credentials', () => {
  it('generates 10-character passwords with a letter and a digit, avoiding look-alikes', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/[A-Za-z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).not.toMatch(/[01OlI]/);
    }
    expect(new Set(Array.from({ length: 50 }, generateTemporaryPassword)).size).toBe(50);
  });

  it('writes the welcome message in Swahili by default and English on request', () => {
    const base = { firstName: 'Asha', phone: '+255700000001', password: 'Abcd2345Ef', portalUrl: 'https://x.test' };
    const sw = welcomeSms(base);
    expect(sw).toContain('Karibu MAYODE, Asha');
    expect(sw).toContain('+255700000001 / Abcd2345Ef');
    expect(sw).toContain('https://x.test');
    const en = welcomeSms({ ...base, language: 'en', appUrl: 'https://app.test' });
    expect(en).toContain('Welcome to MAYODE, Asha');
    expect(en).toContain('https://app.test');
  });

  it('omits links that are not configured and marks re-issued details', () => {
    const msg = welcomeSms({ firstName: 'Asha', phone: '+255700000001', password: 'Abcd2345Ef', language: 'en', reissued: true });
    expect(msg).not.toContain('http');
    expect(msg).toContain('were reset');
  });

  it('hides the password in the logged copy', () => {
    const msg = welcomeSms({ firstName: 'A', phone: '+255700000001', password: 'Abcd2345Ef' });
    expect(redactPassword(msg, 'Abcd2345Ef')).not.toContain('Abcd2345Ef');
  });
});

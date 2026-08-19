import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ClickPesaService } from './clickpesa.service';

describe('ClickPesaService', () => {
  const CHECKSUM_KEY = 'test-checksum-key';

  function makeService(
    env: Record<string, string | undefined>,
  ): ClickPesaService {
    const config = {
      get: (k: string) => env[k],
    } as unknown as ConfigService;
    return new ClickPesaService(config);
  }

  describe('generateChecksum', () => {
    const svc = makeService({ CLICKPESA_CHECKSUM_KEY: CHECKSUM_KEY });

    it('is HMAC-SHA256 over canonicalized (recursively key-sorted) compact JSON', () => {
      const payload = {
        currency: 'TZS',
        amount: '15000',
        orderReference: 'MYDABC123',
        phoneNumber: '255712345678',
      };
      // Independent expectation: sort keys alphabetically at every level.
      const canonical = {
        amount: '15000',
        currency: 'TZS',
        orderReference: 'MYDABC123',
        phoneNumber: '255712345678',
      };
      const expected = createHmac('sha256', CHECKSUM_KEY)
        .update(JSON.stringify(canonical))
        .digest('hex');

      expect(svc.generateChecksum(payload)).toBe(expected);
    });

    it('produces a 64-char hex digest', () => {
      const checksum = svc.generateChecksum({ amount: '100', currency: 'TZS' });
      expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is stable regardless of input key order', () => {
      const a = svc.generateChecksum({
        amount: '100',
        currency: 'TZS',
        orderReference: 'X',
      });
      const b = svc.generateChecksum({
        orderReference: 'X',
        currency: 'TZS',
        amount: '100',
      });
      expect(a).toBe(b);
    });

    it('excludes checksum and checksumMethod fields', () => {
      const withoutMeta = svc.generateChecksum({
        amount: '100',
        currency: 'TZS',
      });
      const withMeta = svc.generateChecksum({
        amount: '100',
        currency: 'TZS',
        checksum: 'ignore-me',
        checksumMethod: 'HMAC-SHA256',
      });
      expect(withMeta).toBe(withoutMeta);
    });

    it('sorts nested object keys too', () => {
      const payload = {
        amount: '100',
        customer: { phone: '255700000000', name: 'John Doe' },
      };
      const canonical = {
        amount: '100',
        customer: { name: 'John Doe', phone: '255700000000' },
      };
      const expected = createHmac('sha256', CHECKSUM_KEY)
        .update(JSON.stringify(canonical))
        .digest('hex');
      expect(svc.generateChecksum(payload)).toBe(expected);
    });

    it('returns undefined when no checksum key is configured', () => {
      const noKey = makeService({});
      expect(noKey.generateChecksum({ amount: '100' })).toBeUndefined();
    });
  });

  describe('isConfigured', () => {
    it('is false without client-id/api-key (manual-approval fallback)', () => {
      expect(makeService({}).isConfigured()).toBe(false);
    });
    it('is true when both credentials are present', () => {
      expect(
        makeService({
          CLICKPESA_CLIENT_ID: 'c',
          CLICKPESA_API_KEY: 'k',
        }).isConfigured(),
      ).toBe(true);
    });
  });

  describe('normalizePhone', () => {
    it('normalizes Tanzanian numbers to 2557XXXXXXXX (no plus)', () => {
      expect(ClickPesaService.normalizePhone('+255712345678')).toBe(
        '255712345678',
      );
      expect(ClickPesaService.normalizePhone('0712345678')).toBe(
        '255712345678',
      );
      expect(ClickPesaService.normalizePhone('712345678')).toBe('255712345678');
      expect(ClickPesaService.normalizePhone('255712345678')).toBe(
        '255712345678',
      );
    });
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { createHmac } from 'crypto';
import { canonicalJson, verifySignature } from './billing.service';
import { centroidOf } from './farm-tasks.service';
import { OPS_ROLE_TEMPLATES } from './ops-roles';

describe('payment callback signatures', () => {
  it('canonicalises key order so the same payload always signs the same', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  it('accepts only a correct signature', () => {
    const body = { reference: 'R1', amount: 1000, event: 'payment.confirmed' };
    const good = createHmac('sha256', 's3cret').update(canonicalJson({ amount: 1000, event: 'payment.confirmed', reference: 'R1' })).digest('hex');
    expect(verifySignature('s3cret', body, good)).toBe(true);
    expect(verifySignature('s3cret', body, good.toUpperCase())).toBe(true);
    expect(verifySignature('other', body, good)).toBe(false);
    expect(verifySignature('s3cret', { ...body, amount: 1 }, good)).toBe(false);
    expect(verifySignature('s3cret', body, undefined)).toBe(false);
    expect(verifySignature('s3cret', body, 'abc')).toBe(false);
  });
});

describe('boundary centre', () => {
  it('averages GeoJSON-style and lat/lng points, and gives nothing when there are none', () => {
    const poly = centroidOf({ type: 'Polygon', coordinates: [[[34, -8], [34.002, -8], [34.002, -8.002], [34, -8.002]]] });
    expect(poly?.lon).toBeCloseTo(34.001, 6);
    expect(poly?.lat).toBeCloseTo(-8.001, 6);
    const p = centroidOf([{ lat: -8, lng: 34 }, { lat: -8.2, lng: 34.2 }]);
    expect(p?.lat).toBeCloseTo(-8.1);
    expect(p?.lon).toBeCloseTo(34.1);
    expect(centroidOf(null)).toBeNull();
    expect(centroidOf([])).toBeNull();
  });
});

describe('operations roles', () => {
  const migration = readFileSync(join(__dirname, '../../prisma/migrations/20261028090000_mayode_operations/migration.sql'), 'utf8');
  const seeded = new Set([...migration.matchAll(/VALUES \(gen_random_uuid\(\)::text, '([a-z_]+)'/g)].map((m) => m[1]));

  it('only grant resources that exist (the ops ones are created by the migration)', () => {
    const existing = new Set(['farmers', 'farms', 'plots', 'crop_cycles', 'warehouses', 'workspace', 'reports']);
    for (const t of OPS_ROLE_TEMPLATES) for (const key of Object.keys(t.grants)) expect(seeded.has(key) || existing.has(key)).toBe(true);
  });

  it('keeps duties apart', () => {
    const grants = (name: string) => OPS_ROLE_TEMPLATES.find((t) => t.name === name)!.grants;
    expect(grants('Sales Officer').ops_payments).toBeUndefined();
    expect(grants('Sales Officer').ops_review).toBeUndefined();
    expect(grants('Warehouse Officer').ops_payments).toBeUndefined();
    expect(grants('Field Worker')).toEqual({ ops_field_work: ['VIEW', 'CREATE', 'EDIT'] });
    expect(grants('Field Worker').ops_farm_review).toBeUndefined();
    expect(grants('Accounts Officer').ops_payments).toContain('EDIT');
    expect(grants('Accounts Officer').ops_payments).not.toContain('DELETE'); // override is for management only
    expect(grants('Management').ops_payments).toContain('DELETE');
  });
});

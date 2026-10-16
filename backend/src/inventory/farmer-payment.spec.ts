import { deliveryValue, paymentStatusFor } from './farmer-payment';

describe('farmer payment for rice deliveries', () => {
  it('values a delivery only once a price is set', () => {
    expect(deliveryValue(450.5, 1800)).toBe(810900);
    expect(deliveryValue(450.5, null)).toBeNull();
  });
  it('moves from unpaid to partial to paid', () => {
    expect(paymentStatusFor(1000, 0)).toBe('UNPAID');
    expect(paymentStatusFor(1000, 400)).toBe('PARTIAL');
    expect(paymentStatusFor(1000, 1000)).toBe('PAID');
    expect(paymentStatusFor(1000, 1200)).toBe('PAID');
  });
  it('treats money paid before a price is set as partial', () => {
    expect(paymentStatusFor(null, 300)).toBe('PARTIAL');
  });
});

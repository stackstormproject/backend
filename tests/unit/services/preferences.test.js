const {
  DEFAULTS,
  withDefaults,
  validateChanges,
  updatePreferences,
  wants,
} = require('../../../src/services/preferences.service');

// Refs #189 (FR-010)
describe('preferences service', () => {
  it('should fill unsaved preferences with defaults and drop unknown keys', () => {
    expect(withDefaults(null)).toEqual(DEFAULTS);
    expect(withDefaults({ newsletter: true, old_key: 1 })).toEqual({
      ...DEFAULTS,
      newsletter: true,
    });
  });

  it('should accept valid changes and tidy the size', () => {
    expect(
      validateChanges({
        sale_alerts: false,
        preferred_payment: 'cod',
        preferred_size: ' M ',
      })
    ).toEqual({ sale_alerts: false, preferred_payment: 'cod', preferred_size: 'M' });
    expect(validateChanges({ preferred_size: '' })).toEqual({ preferred_size: null });
    expect(validateChanges({ preferred_size: null })).toEqual({ preferred_size: null });
  });

  it('should list every problem', () => {
    expect.assertions(2);
    try {
      validateChanges({
        newsletter: 'yes',
        preferred_payment: 'cheque',
        preferred_size: 'x'.repeat(21),
        colour: 'red',
      });
    } catch (error) {
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details.map((d) => d.field)).toEqual([
        'newsletter',
        'preferred_payment',
        'preferred_size',
        'colour',
      ]);
    }
  });

  it.each([[null], [[1]], ['text']])('should refuse %p as preferences', (value) => {
    expect(() => validateChanges(value)).toThrow('Send the preferences as an object');
  });

  it('should merge and save, and answer whether a customer wants a message', async () => {
    const customer = { preferences: { newsletter: true }, update: jest.fn() };

    const saved = await updatePreferences(customer, { sale_alerts: false });

    expect(saved).toMatchObject({
      newsletter: true,
      sale_alerts: false,
      order_updates_email: true,
    });
    expect(customer.update).toHaveBeenCalledWith({ preferences: saved });
    expect(wants({ preferences: saved }, 'sale_alerts')).toBe(false);
    expect(wants(null, 'order_updates_email')).toBe(true);
  });
});

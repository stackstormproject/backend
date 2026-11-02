const { formatLKR, PAID_STATUSES } = require('../../../src/services/analytics.service');

describe('analyticsService', () => {
  it('should format rupees with two decimals', () => {
    expect(formatLKR(145000)).toBe('LKR 145,000.00');
    expect(formatLKR('abc')).toBe('LKR 0.00');
  });

  it('should count only paid statuses as revenue', () => {
    expect(PAID_STATUSES).toEqual(['confirmed', 'processing', 'shipped', 'delivered']);
  });
});

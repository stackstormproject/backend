const { isOriginAllowed } = require('../../../src/config/cors');

// Refs #122: sockets reuse the HTTP CORS allow-list instead of accepting any origin.
describe('isOriginAllowed', () => {
  it('should allow same-origin requests and the configured storefront', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
  });

  it('should reject an unknown site', () => {
    expect(isOriginAllowed('https://evil.example')).toBe(false);
  });
});

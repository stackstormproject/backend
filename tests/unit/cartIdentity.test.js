const { resolveCartIdentity } = require('../../src/middleware/cartIdentity');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('resolveCartIdentity', () => {
  it('should use customerId given an authenticated customer', () => {
    const req = { user: { id: 7 }, get: jest.fn() };
    const next = jest.fn();

    resolveCartIdentity(req, mockRes(), next);

    expect(req.cartOwner).toEqual({ customerId: 7 });
    expect(next).toHaveBeenCalled();
  });

  it('should use sessionToken given a valid X-Session-Token header', () => {
    const req = { get: jest.fn().mockReturnValue('guest_abcdef1234567890') };
    const next = jest.fn();

    resolveCartIdentity(req, mockRes(), next);

    expect(req.cartOwner).toEqual({ sessionToken: 'guest_abcdef1234567890' });
    expect(next).toHaveBeenCalled();
  });

  it('should return 400 CART_IDENTITY_REQUIRED given no identity', () => {
    const req = { get: jest.fn().mockReturnValue(undefined) };
    const res = mockRes();

    resolveCartIdentity(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'CART_IDENTITY_REQUIRED' })
    );
  });

  it('should return 400 given a malformed session token', () => {
    const req = { get: jest.fn().mockReturnValue("x'; DROP TABLE carts;--") };
    const res = mockRes();

    resolveCartIdentity(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should ignore an admin token and require a session token', () => {
    const req = { user: { id: 1, role: 'admin' }, get: jest.fn().mockReturnValue(undefined) };
    const res = mockRes();

    resolveCartIdentity(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
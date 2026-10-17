const asyncHandler = require('../../src/utils/asyncHandler');

describe('asyncHandler', () => {
  it('should call the handler with req, res, and next', async () => {
    const req = {};
    const res = {};
    const next = jest.fn();
    const handler = jest.fn().mockResolvedValue('success');

    const wrappedHandler = asyncHandler(handler);
    await wrappedHandler(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass rejected promises to next', async () => {
    const error = new Error('Test error');
    const next = jest.fn();
    const handler = jest.fn().mockRejectedValue(error);

    await asyncHandler(handler)({}, {}, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should pass synchronous errors to next', async () => {
    const error = new Error('Synchronous error');
    const next = jest.fn();
    const handler = jest.fn().mockImplementation(() => {
      throw error;
    });

    await asyncHandler(handler)({}, {}, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

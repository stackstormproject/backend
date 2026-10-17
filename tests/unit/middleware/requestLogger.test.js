const requestLogger = require('../../../src/middleware/requestLogger');
const logger = require('../../../src/config/logger');

jest.mock('../../../src/config/logger');

function runRequest(req) {
  const handlers = {};
  const res = {
    statusCode: 200,
    on: (event, callback) => {
      handlers[event] = callback;
    },
  };
  const next = jest.fn();
  requestLogger(req, res, next);
  handlers.finish();
  return next;
}

describe('requestLogger', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should log the path without the query string given a finished request', () => {
    const req = { method: 'GET', originalUrl: '/api/health?token=abc', user: null };

    const next = runRequest(req);

    expect(next).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'HTTP request',
      expect.objectContaining({ path: '/api/health', status: 200 })
    );
  });

  it('should include the user id given an authenticated request', () => {
    const req = { method: 'GET', originalUrl: '/api/profile', user: { userId: 7 } };

    runRequest(req);

    expect(logger.info).toHaveBeenCalledWith(
      'HTTP request',
      expect.objectContaining({ userId: 7 })
    );
  });
});
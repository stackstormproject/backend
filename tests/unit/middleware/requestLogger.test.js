const requestLogger = require('../../../src/middleware/requestLogger');
const logger = require('../../../src/config/logger');
jest.mock('../../../src/config/logger');
describe('requestLogger', () => {
it('should log the path without the query string given a finished request', 
() => {
const handlers = {};
const req = { method: 'GET', originalUrl: '/api/health?token=abc', user: 
null };
const res = { statusCode: 200, on: (event, callback) => { handlers[event] 
= callback; } };
const next = jest.fn();
requestLogger(req, res, next);
handlers.finish();
expect(next).toHaveBeenCalled();
expect(logger.info).toHaveBeenCalledWith(
'HTTP request',
expect.objectContaining({ path: '/api/health', status: 200 })
);
});
});
const { successResponse, errorResponse } = require('../../../src/utils/responseFormatter');

describe('responseFormatter', () => {
  let res;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('successResponse', () => {
    it('should format default success response with 200 status', () => {
      successResponse(res, { foo: 'bar' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { foo: 'bar' },
        message: 'Success',
        errors: [],
      });
    });

    it('should support custom status code and custom message', () => {
      successResponse(res, { id: 1 }, 'Created successfully', 201);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 1 },
        message: 'Created successfully',
        errors: [],
      });
    });
  });

  describe('errorResponse', () => {
    it('should format default error response with 500 status', () => {
      errorResponse(res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        data: null,
        message: 'An error occurred',
        errors: [],
      });
    });

    it('should wrap single error string into an array and accept custom status code', () => {
      errorResponse(res, 'Validation failed', 'Invalid field', 400);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        data: null,
        message: 'Validation failed',
        errors: ['Invalid field'],
      });
    });
  });
});

jest.mock('../../../src/services/reservation.service', () => ({
  releaseCustomerActiveReservations: jest.fn(),
  reserveStock: jest.fn(),
  releaseReservation: jest.fn(),
}));

const service = require('../../../src/services/reservation.service');
const { reserve, release } = require('../../../src/controllers/reservation.controller');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('reservation controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should release earlier holds then reserve given a valid request', async () => {
    service.reserveStock.mockResolvedValue({ reservation_id: 'res_1', expires_in: 900 });
    const req = { user: { id: '7' }, body: { items: [{ variant_id: 1, quantity: 1 }] } };
    const res = mockRes();

    await reserve(req, res, jest.fn());

    expect(service.releaseCustomerActiveReservations).toHaveBeenCalledWith(7);
    expect(service.reserveStock).toHaveBeenCalledWith({ customerId: 7, items: req.body.items });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should pass service errors to next', async () => {
    const err = new Error('boom');
    service.reserveStock.mockRejectedValue(err);
    const next = jest.fn();

    await reserve({ user: { id: 7 }, body: { items: [] } }, mockRes(), next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('should return 409 given the reservation is no longer active', async () => {
    service.releaseReservation.mockResolvedValue(false);
    const res = mockRes();

    await release({ user: { id: 7 }, params: { id: 'res_1' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('should release given an active reservation owned by the caller', async () => {
    service.releaseReservation.mockResolvedValue(true);
    const res = mockRes();

    await release({ user: { id: 7 }, params: { id: 'res_1' } }, res, jest.fn());

    expect(service.releaseReservation).toHaveBeenCalledWith('res_1', { customerId: 7 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should pass errors such as 403 to next on release', async () => {
    const err = new Error('forbidden');
    service.releaseReservation.mockRejectedValue(err);
    const next = jest.fn();

    await release({ user: { id: 7 }, params: { id: 'res_1' } }, mockRes(), next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

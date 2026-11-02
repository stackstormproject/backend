const {
  startReservationExpiryJob,
  stopReservationExpiryJob,
  runExpirySweep,
} = require('../../../src/jobs/reservationExpiry.job');
const reservationService = require('../../../src/services/reservation.service');

jest.mock('../../../src/services/reservation.service', () => ({
  releaseExpiredReservations: jest.fn(),
}));

describe('reservationExpiry.job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    stopReservationExpiryJob();
    jest.useRealTimers();
  });

  it('should start and schedule periodic execution', () => {
    reservationService.releaseExpiredReservations.mockResolvedValue(0);
    startReservationExpiryJob(1000);

    jest.advanceTimersByTime(1000);
    expect(reservationService.releaseExpiredReservations).toHaveBeenCalled();
  });

  it('should stop timer and cease execution when stopReservationExpiryJob is called', () => {
    reservationService.releaseExpiredReservations.mockResolvedValue(0);
    startReservationExpiryJob(1000);
    stopReservationExpiryJob();

    jest.advanceTimersByTime(2000);
    expect(reservationService.releaseExpiredReservations).not.toHaveBeenCalled();
  });

  it('should run expiry sweep and release batches', async () => {
    reservationService.releaseExpiredReservations.mockResolvedValueOnce(5);
    const total = await runExpirySweep();
    expect(total).toBe(5);
    expect(reservationService.releaseExpiredReservations).toHaveBeenCalledTimes(1);
  });
});

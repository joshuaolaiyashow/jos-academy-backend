import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  const fetchMock = jest.fn();
  let service: CurrencyService;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    service = new CurrencyService();
  });

  it('pins naira at ₦1,000 per dollar without calling the rates API', async () => {
    await expect(service.getLocalCurrency('Africa/Lagos')).resolves.toEqual({
      currency: 'NGN',
      usdRate: 1000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the market rate for other currencies and caches it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', rates: { GBP: 0.8 } }),
    });

    await expect(service.getLocalCurrency('Europe/London')).resolves.toEqual({
      currency: 'GBP',
      usdRate: 0.8,
    });
    await service.getLocalCurrency('Europe/London');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to USD for an unknown time zone or when rates are down', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const usd = { currency: 'USD', usdRate: 1 };

    await expect(service.getLocalCurrency('Nowhere/Land')).resolves.toEqual(usd);
    await expect(service.getLocalCurrency('Europe/London')).resolves.toEqual(usd);
    await expect(service.getLocalCurrency('America/New_York')).resolves.toEqual(usd);
  });
});

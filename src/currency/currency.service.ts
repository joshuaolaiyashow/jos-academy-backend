import { Injectable, Logger } from '@nestjs/common';
import { getCountryForTimezone } from 'countries-and-timezones';
import countryToCurrency from 'country-to-currency';
import { getErrorMessage } from '../utils';

export const BASE_CURRENCY = 'USD';
/** Naira follows the pricing formula (₦1,000 = 1 credit = $1), not the market rate. */
export const PINNED_USD_RATES: Record<string, number> = { NGN: 1000 };

const RATES_URL = `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`;
const RATES_TTL_MS = 24 * 60 * 60 * 1000;
const RATES_TIMEOUT_MS = 5000;

type UsdRates = Record<string, number>;

export interface LocalCurrency {
  currency: string;
  /** Units of `currency` per 1 USD. Display only: checkout always charges USD. */
  usdRate: number;
}

const USD_ONLY: LocalCurrency = { currency: BASE_CURRENCY, usdRate: 1 };

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private cachedRates: { rates: UsdRates; fetchedAt: number } | null = null;

  /** Falls back to USD for an unknown time zone or a currency with no rate. */
  async getLocalCurrency(timeZone: string): Promise<LocalCurrency> {
    const countryCode = getCountryForTimezone(timeZone)?.id;
    const currency = (countryToCurrency as Record<string, string>)[
      countryCode ?? ''
    ];
    if (!currency || currency === BASE_CURRENCY) return USD_ONLY;

    const usdRate =
      PINNED_USD_RATES[currency] ?? (await this.getMarketRates())[currency];
    return usdRate ? { currency, usdRate } : USD_ONLY;
  }

  private async getMarketRates(): Promise<UsdRates> {
    if (
      this.cachedRates &&
      Date.now() - this.cachedRates.fetchedAt < RATES_TTL_MS
    ) {
      return this.cachedRates.rates;
    }

    try {
      const response = await fetch(RATES_URL, {
        signal: AbortSignal.timeout(RATES_TIMEOUT_MS),
      });
      const body = (await response.json()) as {
        result?: string;
        rates?: UsdRates;
      };
      if (!response.ok || body.result !== 'success' || !body.rates) {
        throw new Error(`Exchange-rate API responded ${response.status}`);
      }
      this.cachedRates = { rates: body.rates, fetchedAt: Date.now() };
      return body.rates;
    } catch (error: unknown) {
      this.logger.error(
        `Exchange rates unavailable: ${getErrorMessage(error)}`,
      );
      // Yesterday's rates beat none; with no rates at all, prices show in USD only.
      return this.cachedRates?.rates ?? {};
    }
  }
}

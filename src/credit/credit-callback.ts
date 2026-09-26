/** Where the buyer's browser lands after Paystack; the page reads `payment` to show the outcome. */
const CREDITS_PAGE_PATH = '/profile/credits';

export type PaymentOutcome = 'success' | 'failed';

export const paymentResultUrl = (outcome: PaymentOutcome): string => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  return `${appUrl}${CREDITS_PAGE_PATH}?payment=${outcome}`;
};

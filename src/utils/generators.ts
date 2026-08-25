import { randomInt, randomBytes } from 'crypto';

/**
 * Generates a cryptographically secure numeric OTP (One-Time Password).
 * @param length Length of the OTP (default is 6 digits)
 * @returns OTP string, e.g. "492018"
 */
export function generateOtp(length: number = 6): string {
  if (length <= 0) {
    throw new Error('OTP length must be greater than 0');
  }

  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return randomInt(min, max + 1).toString();
}

/**
 * Generates a cryptographically secure alphanumeric referral code.
 * @param length Length of the random alphanumeric characters (default is 8)
 * @param prefix Optional prefix to prepend to the code (e.g. "JOS")
 * @returns Referral code string, e.g. "JOS-X8F9K2M1" or "X8F9K2M1"
 */
export function generateReferralCode(length: number = 8, prefix: string = ''): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(length);
  let randomStr = '';

  for (let i = 0; i < length; i++) {
    randomStr += chars[bytes[i] % chars.length];
  }

  return prefix ? `${prefix.toUpperCase()}-${randomStr}` : randomStr;
}

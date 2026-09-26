import { createHmac, timingSafeEqual } from 'crypto';

export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';
const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verifies a Stripe-style "t=<unixSeconds>,v1=<hex>" HMAC-SHA256 signature over the
 * raw request body. Rejects a bad signature or a timestamp outside the replay window.
 * Must run on the untouched raw bytes — a re-serialized parsed body breaks the signature.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader
    .split(',')
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex > 0) {
        acc[part.slice(0, separatorIndex).trim()] = part
          .slice(separatorIndex + 1)
          .trim();
      }
      return acc;
    }, {});

  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS)
    return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature, 'hex');

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

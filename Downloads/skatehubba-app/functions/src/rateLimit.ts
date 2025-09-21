import { HttpsError } from 'firebase-functions/v2/https';
import { admin, db } from './firebase';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

const rateLimitCollection = db.collection('rateLimits');

const identifierPattern = /[^a-zA-Z0-9_-]/g;

function sanitizeIdentifier(identifier: string): string {
  return identifier.replace(identifierPattern, '-');
}

async function consumeBucket(key: string, config: RateLimitConfig, now: admin.firestore.Timestamp) {
  const docRef = rateLimitCollection.doc(key);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const windowStart = now.toMillis() - config.windowMs;

    if (snap.exists) {
      const data = snap.data() as { count?: number; windowStart?: admin.firestore.Timestamp };
      const count = typeof data.count === 'number' ? data.count : 0;
      const startTs = data.windowStart ?? now;
      if (startTs.toMillis() > windowStart) {
        if (count >= config.max) {
          throw new HttpsError('resource-exhausted', 'Too many requests. Please slow down.');
        }
        tx.update(docRef, {
          count: count + 1,
        });
        return;
      }
    }

    tx.set(docRef, {
      count: 1,
      windowStart: now,
    });
  });
}

export async function enforceRateLimit(
  functionName: string,
  identifiers: Array<string | null | undefined>,
  config: RateLimitConfig,
  now: admin.firestore.Timestamp,
) {
  const validIdentifiers = identifiers
    .filter((value): value is string => Boolean(value && value.trim().length))
    .map((value) => sanitizeIdentifier(value));

  if (!validIdentifiers.length) {
    throw new HttpsError('invalid-argument', 'Missing identifier for rate limit enforcement.');
  }

  const uniqueKeys = Array.from(new Set(validIdentifiers));
  for (const identifier of uniqueKeys) {
    const key = `${functionName}_${identifier}`;
    await consumeBucket(key, config, now);
  }
}

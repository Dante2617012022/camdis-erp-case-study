import { createHash } from 'node:crypto';

// Policy-neutral contracts shared only by modules with identical behavior.
// Actor subjects are returned unchanged; trimming is only a validity check.
export function validateActorSubject(value) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > 255) {
    throw new Error('Authenticated actor subject is invalid');
  }
  return value;
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function toSafeInteger(value, fieldName) {
  const valid = (typeof value === 'number' && Number.isInteger(value))
    || (typeof value === 'string' && /^-?\d+$/.test(value));
  if (!valid) throw new Error(`Invalid integer returned for ${fieldName}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Unsafe integer returned for ${fieldName}`);
  return parsed;
}

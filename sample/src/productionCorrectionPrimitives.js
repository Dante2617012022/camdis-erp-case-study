import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISIBLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;

function throwDomainError(errorFactory, fallbackMessage) {
  if (typeof errorFactory !== 'function') throw new Error(fallbackMessage);
  const error = errorFactory();
  if (!(error instanceof Error)) throw new Error(fallbackMessage);
  throw error;
}

export function validateProductionCorrectionActor(value) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > 255) {
    throw new Error('Authenticated actor subject is invalid');
  }
  return value;
}

export function normalizeProductionCorrectionRoles(value) {
  if (!Array.isArray(value) || value.some((role) => typeof role !== 'string')) {
    throw new Error('Authenticated actor roles are invalid');
  }
  return Object.freeze([...new Set(value)]);
}

export function normalizeProductionCorrectionDate(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp returned for ${fieldName}`);
  return date;
}

export function toProductionCorrectionSafeInteger(value, fieldName) {
  const validNumber = typeof value === 'number' && Number.isInteger(value);
  const validString = typeof value === 'string' && /^-?\d+$/.test(value);
  if (!validNumber && !validString) throw new Error(`Invalid integer returned for ${fieldName}`);
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Unsafe integer returned for ${fieldName}`);
  return parsed;
}

export function normalizeProductionCorrectionUuid(value, errorFactory) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throwDomainError(errorFactory, 'Invalid production correction UUID');
  }
  return value.toLowerCase();
}

export function validateProductionCorrectionIdempotencyKey(value, maxLength, errorFactory) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) {
    throw new Error('Production correction idempotency limit is invalid');
  }
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > maxLength
    || !VISIBLE_ASCII_PATTERN.test(value)
  ) {
    throwDomainError(errorFactory, 'Invalid production correction idempotency key');
  }
  return value;
}

export function hashProductionCorrectionSha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

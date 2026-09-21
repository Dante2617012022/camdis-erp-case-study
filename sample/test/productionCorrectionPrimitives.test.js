import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashProductionCorrectionSha256,
  normalizeProductionCorrectionDate,
  normalizeProductionCorrectionRoles,
  normalizeProductionCorrectionUuid,
  toProductionCorrectionSafeInteger,
  validateProductionCorrectionActor,
  validateProductionCorrectionIdempotencyKey
} from '../src/productionCorrectionPrimitives.js';

class DomainError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

test('correction actor validation preserves authenticated-subject contract', () => {
  assert.equal(validateProductionCorrectionActor('operator-123'), 'operator-123');
  assert.throws(() => validateProductionCorrectionActor(''), /Authenticated actor subject is invalid/);
  assert.throws(() => validateProductionCorrectionActor(' '.repeat(2)), /Authenticated actor subject is invalid/);
  assert.throws(() => validateProductionCorrectionActor('x'.repeat(256)), /Authenticated actor subject is invalid/);
});

test('correction roles normalize duplicates without promoting legacy roles', () => {
  const roles = normalizeProductionCorrectionRoles(['SAMPLE_OPERATOR', 'SAMPLE_OPERATOR', 'ADMIN']);
  assert.deepEqual(roles, ['SAMPLE_OPERATOR', 'ADMIN']);
  assert.equal(Object.isFrozen(roles), true);
  assert.throws(() => normalizeProductionCorrectionRoles('SAMPLE_OPERATOR'), /Authenticated actor roles are invalid/);
  assert.throws(() => normalizeProductionCorrectionRoles(['SAMPLE_OPERATOR', 1]), /Authenticated actor roles are invalid/);
});

test('correction timestamps normalize Date and ISO input while invalid values fail closed', () => {
  const source = new Date('2026-08-20T00:00:00.000Z');
  assert.equal(normalizeProductionCorrectionDate(source, 'recorded_at'), source);
  assert.equal(
    normalizeProductionCorrectionDate('2026-08-20T00:00:00.000Z', 'recorded_at').toISOString(),
    '2026-08-20T00:00:00.000Z'
  );
  assert.throws(
    () => normalizeProductionCorrectionDate('not-a-date', 'recorded_at'),
    /Invalid timestamp returned for recorded_at/
  );
});

test('correction safe integer accepts exact database integers and rejects unsafe values', () => {
  assert.equal(toProductionCorrectionSafeInteger(42, 'quantity_g'), 42);
  assert.equal(toProductionCorrectionSafeInteger('-42', 'quantity_g'), -42);
  assert.equal(toProductionCorrectionSafeInteger('0', 'quantity_g'), 0);
  assert.throws(() => toProductionCorrectionSafeInteger('1.5', 'quantity_g'), /Invalid integer returned for quantity_g/);
  assert.throws(
    () => toProductionCorrectionSafeInteger(String(Number.MAX_SAFE_INTEGER + 1), 'quantity_g'),
    /Unsafe integer returned for quantity_g/
  );
});

test('correction UUID normalization lowercases valid identifiers and delegates domain errors', () => {
  assert.equal(
    normalizeProductionCorrectionUuid(
      'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',
      () => new DomainError('invalid_domain_uuid')
    ),
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  );

  assert.throws(
    () => normalizeProductionCorrectionUuid('not-a-uuid', () => new DomainError('invalid_domain_uuid')),
    (error) => error instanceof DomainError && error.code === 'invalid_domain_uuid'
  );
});

test('correction idempotency key remains bounded visible ASCII and delegates domain errors', () => {
  assert.equal(
    validateProductionCorrectionIdempotencyKey('void-001', 200, () => new DomainError('invalid_idempotency_key')),
    'void-001'
  );
  for (const value of ['', 'contains space', 'x'.repeat(201)]) {
    assert.throws(
      () => validateProductionCorrectionIdempotencyKey(
        value,
        200,
        () => new DomainError('invalid_idempotency_key')
      ),
      (error) => error instanceof DomainError && error.code === 'invalid_idempotency_key'
    );
  }
  assert.throws(
    () => validateProductionCorrectionIdempotencyKey('valid', 0, () => new DomainError('unused')),
    /Production correction idempotency limit is invalid/
  );
});

test('correction SHA-256 helper preserves exact lowercase hex digest', () => {
  assert.equal(
    hashProductionCorrectionSha256('camdis'),
    'ddd190bdd4ceca3a40fb9d1680be82d488fd164516051875462fa6f14d30971e'
  );
});

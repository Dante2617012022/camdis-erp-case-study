import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePurchaseReceiptInput,
  PurchaseReceiptError,
  validateIdempotencyKey
} from '../src/purchaseReceipts.js';

const TA_ID = '10000000-0000-4000-8000-000000000001';
const LOT_ID = '30000000-0000-4000-8000-000000000001';

test('receipt input rejects quantity above JavaScript safe integer range', () => {
  assert.throws(
    () => normalizePurchaseReceiptInput({
      lines: [{ materialId: TA_ID, quantityG: Number.MAX_SAFE_INTEGER + 1 }]
    }),
    (error) => error instanceof PurchaseReceiptError
      && error.statusCode === 400
      && error.code === 'invalid_quantity'
  );
});

test('receipt input rejects production journey binding because stock reception is independent', () => {
  assert.throws(
    () => normalizePurchaseReceiptInput({
      productionLotId: LOT_ID,
      lines: [{ materialId: TA_ID, quantityG: 500 }]
    }),
    (error) => error instanceof PurchaseReceiptError
      && error.statusCode === 400
      && error.code === 'invalid_request'
  );
});

test('Idempotency-Key validation enforces bounded visible ASCII without exposing the value', () => {
  assert.equal(validateIdempotencyKey('receipt-2026-08-12-001'), 'receipt-2026-08-12-001');

  assert.throws(
    () => validateIdempotencyKey('x'.repeat(201)),
    (error) => error instanceof PurchaseReceiptError
      && error.statusCode === 400
      && error.code === 'invalid_idempotency_key'
  );
});

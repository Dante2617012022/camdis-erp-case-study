import { sha256 } from './apiPrimitives.js';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export class PurchaseReceiptError extends Error {
  constructor(statusCode, code) {
    super(code);
    this.name = 'PurchaseReceiptError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizeOptionalText(value, maxLength, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new PurchaseReceiptError(400, 'invalid_request');
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new PurchaseReceiptError(400, `invalid_${fieldName}`);
  }
  return normalized;
}

function normalizeOptionalUuid(value, fieldName) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new PurchaseReceiptError(400, `invalid_${fieldName}`);
  }
  return value.toLowerCase();
}

function normalizeOptionalBrand(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new PurchaseReceiptError(400, 'invalid_brand');
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 100) {
    throw new PurchaseReceiptError(400, 'invalid_brand');
  }
  return normalized;
}

function normalizeOptionalPrice(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PurchaseReceiptError(400, 'invalid_total_price');
  }
  return value;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) {
    throw new PurchaseReceiptError(400, 'invalid_lines');
  }

  const seen = new Set();
  const normalized = lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      throw new PurchaseReceiptError(400, 'invalid_line');
    }

    const allowedKeys = new Set(['materialId', 'quantityG', 'brand', 'totalPriceMinor']);
    if (Object.keys(line).some((key) => !allowedKeys.has(key))) {
      throw new PurchaseReceiptError(400, 'invalid_line');
    }

    const materialId = typeof line.materialId === 'string' ? line.materialId.toLowerCase() : '';
    if (!UUID_PATTERN.test(materialId)) {
      throw new PurchaseReceiptError(400, 'invalid_material_id');
    }

    if (!Number.isSafeInteger(line.quantityG) || line.quantityG <= 0) {
      throw new PurchaseReceiptError(400, 'invalid_quantity');
    }

    if (seen.has(materialId)) {
      throw new PurchaseReceiptError(400, 'duplicate_material');
    }
    seen.add(materialId);

    const totalPriceMinor = normalizeOptionalPrice(line.totalPriceMinor);
    const brand = normalizeOptionalBrand(line.brand);
    if (brand !== null && totalPriceMinor === null) {
      throw new PurchaseReceiptError(400, 'brand_requires_pricing');
    }

    const result = { materialId, quantityG: line.quantityG };
    if (totalPriceMinor !== null) result.totalPriceMinor = totalPriceMinor;
    if (brand !== null) result.brand = brand;
    return Object.freeze(result);
  });

  const pricedCount = normalized.filter((line) => line.totalPriceMinor !== undefined).length;
  if (pricedCount !== 0 && pricedCount !== normalized.length) {
    throw new PurchaseReceiptError(400, 'partial_purchase_pricing');
  }

  return Object.freeze(normalized.sort((a, b) => a.materialId.localeCompare(b.materialId)));
}

export function normalizePurchaseReceiptInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PurchaseReceiptError(400, 'invalid_request');
  }

  const allowedKeys = new Set(['supplierId', 'supplierReference', 'notes', 'lines']);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new PurchaseReceiptError(400, 'invalid_request');
  }

  const lines = normalizeLines(input.lines);
  const supplierId = normalizeOptionalUuid(input.supplierId, 'supplier_id');
  const hasPricing = lines.some((line) => line.totalPriceMinor !== undefined);
  if (hasPricing && supplierId === null) {
    throw new PurchaseReceiptError(400, 'supplier_required_for_pricing');
  }

  const normalized = {
    supplierReference: normalizeOptionalText(input.supplierReference, 200, 'supplier_reference'),
    notes: normalizeOptionalText(input.notes, 2000, 'notes'),
    lines
  };
  if (supplierId !== null) normalized.supplierId = supplierId;
  return Object.freeze(normalized);
}

export function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new PurchaseReceiptError(400, 'invalid_idempotency_key');
  }
  return value;
}

export function buildRequestFingerprint(normalizedInput) {
  return sha256(JSON.stringify(normalizedInput));
}

function toSafeInteger(value, fieldName) {
  const validNumber = typeof value === 'number' && Number.isInteger(value);
  const validString = typeof value === 'string' && /^-?\d+$/.test(value);
  if (!validNumber && !validString) {
    const error = new Error(`Invalid integer returned for ${fieldName}`);
    error.code = 'INVALID_INTEGER_FROM_DATABASE';
    throw error;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    const error = new Error(`Unsafe integer returned for ${fieldName}`);
    error.code = 'UNSAFE_INTEGER_FROM_DATABASE';
    throw error;
  }
  return parsed;
}

export function calculatePurchaseUnitPricePerKgMinor(totalPriceMinor, quantityG) {
  const total = BigInt(totalPriceMinor);
  const quantity = BigInt(quantityG);
  if (total <= 0n || quantity <= 0n) throw new Error('Price and quantity must be positive');
  const rounded = ((total * 1000n) + (quantity / 2n)) / quantity;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    const error = new Error('Calculated unit price exceeds safe integer range');
    error.code = 'UNSAFE_INTEGER_FROM_DATABASE';
    throw error;
  }
  return Number(rounded);
}

function mapReceiptRow(row, lines, replayed) {
  const mappedLines = lines.map((line) => {
    const mapped = {
      id: line.id,
      materialId: line.material_id,
      quantityG: toSafeInteger(line.quantity_g, 'quantity_g'),
      movementId: line.movement_id
    };
    if (line.total_price_minor !== undefined && line.total_price_minor !== null) {
      const totalPriceMinor = toSafeInteger(line.total_price_minor, 'total_price_minor');
      mapped.totalPriceMinor = totalPriceMinor;
      mapped.unitPricePerKgMinor = calculatePurchaseUnitPricePerKgMinor(totalPriceMinor, mapped.quantityG);
    }
    if (line.brand !== undefined && line.brand !== null) mapped.brand = line.brand;
    return mapped;
  });

  const result = {
    id: row.id,
    receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at,
    supplierReference: row.supplier_reference,
    notes: row.notes,
    lines: mappedLines,
    replayed
  };
  if (row.supplier_id) result.supplierId = row.supplier_id;
  if (mappedLines.some((line) => line.totalPriceMinor !== undefined)) {
    result.currencyCode = row.currency_code ?? 'ARS';
  }
  return result;
}

async function loadReceiptLines(client, receiptId) {
  const { rows } = await client.query(
    `
      SELECT
        line.id::text AS id,
        line.material_id::text AS material_id,
        line.quantity_g::text AS quantity_g,
        line.brand,
        line.total_price_minor::text AS total_price_minor,
        movement.id::text AS movement_id
      FROM purchase_receipt_lines AS line
      INNER JOIN inventory_movements AS movement
        ON movement.source_receipt_line_id = line.id
      WHERE line.receipt_id = $1::uuid
      ORDER BY line.material_id ASC
    `,
    [receiptId]
  );
  return rows;
}

async function resolveMaterials(client, lines) {
  const materialIds = lines.map((line) => line.materialId);
  const { rows } = await client.query(
    `
      SELECT id::text AS id, code, brand_policy
      FROM materials
      WHERE id = ANY($1::uuid[])
        AND active = true
    `,
    [materialIds]
  );

  const available = new Map(rows.map((row) => [row.id, row]));
  if (materialIds.some((id) => !available.has(id))) {
    throw new PurchaseReceiptError(422, 'material_unavailable');
  }
  return available;
}

function validateCommercialEvidence(lines, materialsById) {
  if (!lines.some((line) => line.totalPriceMinor !== undefined)) return;
  for (const line of lines) {
    const material = materialsById.get(line.materialId);
    const policy = material?.brand_policy;
    if (!['NONE', 'OPTIONAL', 'REQUIRED'].includes(policy)) {
      throw new Error('Material brand policy is unavailable');
    }
    if (policy === 'REQUIRED' && !line.brand) {
      throw new PurchaseReceiptError(422, 'brand_required');
    }
    if (policy === 'NONE' && line.brand) {
      throw new PurchaseReceiptError(422, 'brand_not_allowed');
    }
  }
}

async function resolveSupplier(client, supplierId) {
  if (!supplierId) return null;
  const { rows } = await client.query(`
    SELECT id::text AS id
    FROM suppliers
    WHERE id = $1::uuid
      AND active = true
    LIMIT 1
  `, [supplierId]);
  if (rows.length !== 1) throw new PurchaseReceiptError(422, 'supplier_unavailable');
  return rows[0].id;
}

async function resolveRawStock(client) {
  const { rows } = await client.query(
    `
      SELECT id::text AS id
      FROM inventory_locations
      WHERE code = 'RAW_STOCK'
        AND active = true
      LIMIT 1
    `
  );

  if (rows.length !== 1) {
    const error = new Error('RAW_STOCK location is unavailable');
    error.code = 'RAW_STOCK_UNAVAILABLE';
    throw error;
  }
  return rows[0].id;
}

export async function createPurchaseReceipt(db, { actorSubject, idempotencyKey, input }) {
  if (typeof actorSubject !== 'string' || actorSubject.trim() === '') {
    throw new Error('Authenticated actor subject is required');
  }

  const normalizedInput = normalizePurchaseReceiptInput(input);
  const validKey = validateIdempotencyKey(idempotencyKey);
  const idempotencyKeyHash = sha256(validKey);
  const requestFingerprint = buildRequestFingerprint(normalizedInput);
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const supplierId = normalizedInput.supplierId ?? null;
    let inserted;
    try {
      inserted = supplierId
        ? await client.query(
        `
          INSERT INTO purchase_receipts (
            received_at,
            received_by_subject,
            supplier_reference,
            notes,
            idempotency_key_hash,
            request_fingerprint,
            supplier_id,
            currency_code
          )
          VALUES (now(), $1, $2, $3, $4, $5, $6::uuid, 'ARS')
          ON CONFLICT (received_by_subject, idempotency_key_hash)
            WHERE idempotency_key_hash IS NOT NULL
          DO NOTHING
          RETURNING
            id::text AS id,
            received_at,
            supplier_reference,
            notes,
            request_fingerprint,
            supplier_id::text AS supplier_id,
            currency_code
        `,
        [
          actorSubject,
          normalizedInput.supplierReference,
          normalizedInput.notes,
          idempotencyKeyHash,
          requestFingerprint,
          supplierId
        ]
      )
      : await client.query(
        `
          INSERT INTO purchase_receipts (
            received_at,
            received_by_subject,
            supplier_reference,
            notes,
            idempotency_key_hash,
            request_fingerprint
          )
          VALUES (now(), $1, $2, $3, $4, $5)
          ON CONFLICT (received_by_subject, idempotency_key_hash)
            WHERE idempotency_key_hash IS NOT NULL
          DO NOTHING
          RETURNING
            id::text AS id,
            received_at,
            supplier_reference,
            notes,
            request_fingerprint
        `,
        [
          actorSubject,
          normalizedInput.supplierReference,
          normalizedInput.notes,
          idempotencyKeyHash,
          requestFingerprint
        ]
      );
    } catch (error) {
      if (supplierId && error?.code === '23503') {
        throw new PurchaseReceiptError(422, 'supplier_unavailable');
      }
      throw error;
    }

    if (inserted.rows.length === 0) {
      const existing = await client.query(
        `
          SELECT
            id::text AS id,
            received_at,
            supplier_reference,
            notes,
            request_fingerprint,
            supplier_id::text AS supplier_id,
            currency_code
          FROM purchase_receipts
          WHERE received_by_subject = $1
            AND idempotency_key_hash = $2
          FOR UPDATE
        `,
        [actorSubject, idempotencyKeyHash]
      );

      if (existing.rows.length !== 1) {
        const error = new Error('Idempotency conflict row was not found');
        error.code = 'IDEMPOTENCY_ROW_MISSING';
        throw error;
      }

      if (existing.rows[0].request_fingerprint !== requestFingerprint) {
        throw new PurchaseReceiptError(409, 'idempotency_conflict');
      }

      const lines = await loadReceiptLines(client, existing.rows[0].id);
      await client.query('COMMIT');
      return mapReceiptRow(existing.rows[0], lines, true);
    }

    const materialsById = await resolveMaterials(client, normalizedInput.lines);
    validateCommercialEvidence(normalizedInput.lines, materialsById);
    await resolveSupplier(client, supplierId);
    const rawStockId = await resolveRawStock(client);
    const createdLines = [];

    for (const line of normalizedInput.lines) {
      const lineResult = line.totalPriceMinor !== undefined
        ? await client.query(
          `
            INSERT INTO purchase_receipt_lines (
              receipt_id,
              material_id,
              quantity_g,
              brand,
              total_price_minor
            )
            VALUES ($1::uuid, $2::uuid, $3::bigint, $4, $5::bigint)
            RETURNING
              id::text AS id,
              material_id::text AS material_id,
              quantity_g::text AS quantity_g,
              brand,
              total_price_minor::text AS total_price_minor
          `,
          [inserted.rows[0].id, line.materialId, line.quantityG, line.brand ?? null, line.totalPriceMinor]
        )
        : await client.query(
          `
            INSERT INTO purchase_receipt_lines (
              receipt_id,
              material_id,
              quantity_g
            )
            VALUES ($1::uuid, $2::uuid, $3::bigint)
            RETURNING id::text AS id, material_id::text AS material_id, quantity_g::text AS quantity_g
          `,
          [inserted.rows[0].id, line.materialId, line.quantityG]
        );

      const movementResult = await client.query(
        `
          INSERT INTO inventory_movements (
            movement_type,
            material_id,
            quantity_g,
            to_location_id,
            source_receipt_line_id,
            actor_subject,
            occurred_at
          )
          VALUES ('RECEIPT', $1::uuid, $2::bigint, $3::uuid, $4::uuid, $5, now())
          RETURNING id::text AS id
        `,
        [line.materialId, line.quantityG, rawStockId, lineResult.rows[0].id, actorSubject]
      );

      createdLines.push({
        ...lineResult.rows[0],
        movement_id: movementResult.rows[0].id
      });
    }

    await client.query('COMMIT');
    return mapReceiptRow(inserted.rows[0], createdLines, false);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure; rollback errors are not safe client details.
    }
    throw error;
  } finally {
    client.release();
  }
}

export const PURCHASE_RECEIPT_LIMITS = Object.freeze({
  maxLines: 50,
  maxSupplierReferenceLength: 200,
  maxNotesLength: 2000,
  maxIdempotencyKeyLength: 200,
  maxQuantityG: MAX_SAFE_INTEGER,
  maxTotalPriceMinor: MAX_SAFE_INTEGER,
  maxBrandLength: 100
});

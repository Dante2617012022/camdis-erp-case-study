-- Esquema sintético para esta muestra. No es una migración del ERP.
CREATE TABLE materials (id uuid PRIMARY KEY, code text NOT NULL, brand_policy text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE suppliers (id uuid PRIMARY KEY, active boolean NOT NULL DEFAULT true);
CREATE TABLE inventory_locations (id uuid PRIMARY KEY, code text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true);
CREATE TABLE purchase_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), received_at timestamptz NOT NULL,
 received_by_subject text NOT NULL, supplier_reference text, notes text,
 idempotency_key_hash text, request_fingerprint text NOT NULL,
 supplier_id uuid REFERENCES suppliers, currency_code text
);
CREATE UNIQUE INDEX receipt_idempotency ON purchase_receipts (received_by_subject, idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;
CREATE TABLE purchase_receipt_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL REFERENCES purchase_receipts,
 material_id uuid NOT NULL REFERENCES materials, quantity_g bigint NOT NULL CHECK(quantity_g>0),
 brand text, total_price_minor bigint CHECK(total_price_minor>0)
);
CREATE TABLE inventory_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movement_type text NOT NULL,
 material_id uuid NOT NULL REFERENCES materials, quantity_g bigint NOT NULL CHECK(quantity_g>0),
 to_location_id uuid NOT NULL REFERENCES inventory_locations,
 source_receipt_line_id uuid NOT NULL UNIQUE REFERENCES purchase_receipt_lines,
 actor_subject text NOT NULL, occurred_at timestamptz NOT NULL
);
INSERT INTO materials VALUES ('10000000-0000-4000-8000-000000000001','SAMPLE_A','NONE',true),('10000000-0000-4000-8000-000000000002','SAMPLE_B','NONE',true);
INSERT INTO inventory_locations VALUES ('20000000-0000-4000-8000-000000000001','RAW_STOCK',true);

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createPurchaseReceipt } from '../src/purchaseReceipts.js';

// Each run owns a new schema. No existing tables are reset or reused.
const schema = `sample_${randomUUID().replaceAll('-', '')}`;
if (!process.env.SAMPLE_DATABASE_URL) throw new Error('SAMPLE_DATABASE_URL must point to a disposable local PostgreSQL database');
const url = new URL(process.env.SAMPLE_DATABASE_URL);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.pathname !== '/erp_sample') {
  throw new Error('Only a local disposable database named erp_sample is accepted');
}
const bootstrap = new pg.Pool({connectionString:url.href});
const pool = new pg.Pool({connectionString:url.href, max:10, options:`-c search_path=${schema} -c statement_timeout=10000`});
const material='10000000-0000-4000-8000-000000000001';
const input=(quantityG=500)=>({lines:[{materialId:material,quantityG}]});
const call=(key,qty=500,actor='sample-alice',db=pool)=>createPurchaseReceipt(db,{actorSubject:actor,idempotencyKey:key,input:input(qty)});
const counts=async()=> (await pool.query(`SELECT (SELECT count(*)::int FROM purchase_receipts) receipts, (SELECT count(*)::int FROM purchase_receipt_lines) lines, (SELECT count(*)::int FROM inventory_movements) movements`)).rows[0];

test('PostgreSQL transaction and concurrency evidence', {timeout:60000}, async t=>{
  try {
    await bootstrap.query(`CREATE SCHEMA ${schema}`);
    await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
    await t.test('eight concurrent retries produce one receipt and one movement',async()=>{
      const results=await Promise.all(Array.from({length:8},()=>call('sample-concurrent')));
      assert.equal(new Set(results.map(x=>x.id)).size,1);
      assert.equal(results.filter(x=>!x.replayed).length,1);
      assert.equal(results.filter(x=>x.replayed).length,7);
      assert.deepEqual(await counts(),{receipts:1,lines:1,movements:1});
      assert.equal((await pool.query('SELECT sum(quantity_g)::int AS total FROM inventory_movements')).rows[0].total,500);
    });
    await t.test('same key with changed content conflicts without additional writes',async()=>{
      const before=await counts();
      await assert.rejects(call('sample-concurrent',501),e=>e.statusCode===409 && e.code==='idempotency_conflict');
      assert.deepEqual(await counts(),before);
    });
    await t.test('idempotency scope separates authenticated actors',async()=>{
      const result=await call('sample-concurrent',500,'sample-bob');
      assert.equal(result.replayed,false);
      assert.deepEqual(await counts(),{receipts:2,lines:2,movements:2});
    });
    await t.test('SQL failure after line insertion rolls back receipt and line; retry succeeds',async()=>{
      const before=await counts(); let injected=false;
      const failingDb={async connect(){
        const client=await pool.connect();
        return {release:()=>client.release(),query:(sql,args)=>{
          if (sql.includes('INSERT INTO inventory_movements')) {injected=true; return client.query('SELECT 1 / 0');}
          return client.query(sql,args);
        }};
      }};
      await assert.rejects(call('sample-rollback',500,'sample-alice',failingDb),e=>e.code==='22012');
      assert.equal(injected,true);
      assert.deepEqual(await counts(),before);
      assert.equal((await call('sample-rollback')).replayed,false);
      assert.deepEqual(await counts(),{receipts:3,lines:3,movements:3});
    });
    await t.test('invalid material rolls back the provisional receipt',async()=>{
      const before=await counts();
      await assert.rejects(createPurchaseReceipt(pool,{actorSubject:'sample-alice',idempotencyKey:'sample-unavailable',input:{lines:[{materialId:'99999999-0000-4000-8000-000000000001',quantityG:1}]}}),e=>e.code==='material_unavailable');
      assert.deepEqual(await counts(),before);
    });
  } finally {
    await pool.end();
    try { await bootstrap.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await bootstrap.end(); }
  }
});

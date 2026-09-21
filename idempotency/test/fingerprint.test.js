import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequestFingerprint,normalizePurchaseReceiptInput,createPurchaseReceipt} from '../src/purchaseReceipts.js';
const a={materialId:'10000000-0000-4000-8000-000000000001',quantityG:500};
const b={materialId:'10000000-0000-4000-8000-000000000002',quantityG:100};
const hash=x=>buildRequestFingerprint(normalizePurchaseReceiptInput(x));
test('canonical line order produces the same fingerprint',()=>assert.equal(hash({lines:[a,b]}),hash({lines:[b,a]})));
test('quantity changes change the fingerprint',()=>assert.notEqual(hash({lines:[a]}),hash({lines:[{...a,quantityG:501}]})));
test('client cannot inject actor identity into input',async()=>{
 let connected=false;
 await assert.rejects(createPurchaseReceipt({connect(){connected=true;}},{actorSubject:'sample-alice',idempotencyKey:'sample-key',input:{actorSubject:'sample-admin',lines:[a]}}),e=>e.code==='invalid_request');
 assert.equal(connected,false);
});

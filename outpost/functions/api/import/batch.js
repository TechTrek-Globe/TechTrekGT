import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeSaleMetrics } from '../../utils/auction.js';
import { normalizeSaleInput, upsertSale } from '../../utils/sales.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  DEFAULT_EST_SHIPPING_COST,
  DEFAULT_TARGET_MARGIN_PCT,
  CHUNK_SIZE
} from '../../utils/constants.js';
import { generateSku } from '../utils/sku.js';

const MAX_RECORDS_PER_COLLECTION = 500;

function validatePayload(body) {
  const errors = [];
  const { strategy, invoices, items, sales, comps } = body;
  const invList = invoices || [];
  const itemList = items || [];
  const saleList = sales || [];
  const compList = comps || [];

  if (strategy === 'replace' && !body.confirmReplace)
    errors.push('confirmReplace: true is required for replace strategy');

  if (invList.length > MAX_RECORDS_PER_COLLECTION)
    errors.push('invoices: exceeds maximum of ' + MAX_RECORDS_PER_COLLECTION + ' (received ' + invList.length + ')');
  if (itemList.length > MAX_RECORDS_PER_COLLECTION)
    errors.push('items: exceeds maximum of ' + MAX_RECORDS_PER_COLLECTION + ' (received ' + itemList.length + ')');
  if (saleList.length > MAX_RECORDS_PER_COLLECTION)
    errors.push('sales: exceeds maximum of ' + MAX_RECORDS_PER_COLLECTION + ' (received ' + saleList.length + ')');
  if (compList.length > MAX_RECORDS_PER_COLLECTION)
    errors.push('comps: exceeds maximum of ' + MAX_RECORDS_PER_COLLECTION + ' (received ' + compList.length + ')');

  if (strategy === 'replace' && itemList.length === 0)
    errors.push('items: replace strategy requires at least one item');

  for (let i = 0; i < invList.length; i++) {
    const inv = invList[i];
    if (inv.base_total !== undefined && (typeof inv.base_total !== 'number' || inv.base_total < 0))
      errors.push('invoices[' + i + ']: base_total must be a non-negative number');
    if (inv.discount !== undefined && (typeof inv.discount !== 'number' || inv.discount < 0))
      errors.push('invoices[' + i + ']: discount must be a non-negative number');
    if (inv.shipping !== undefined && (typeof inv.shipping !== 'number' || inv.shipping < 0))
      errors.push('invoices[' + i + ']: shipping must be a non-negative number');
    if (inv.tax !== undefined && (typeof inv.tax !== 'number' || inv.tax < 0))
      errors.push('invoices[' + i + ']: tax must be a non-negative number');
  }

  for (let i = 0; i < itemList.length; i++) {
    const it = itemList[i];
    if (!it.item_name && !it.title)
      errors.push('items[' + i + ']: item_name is required');
    if (it.unit_price !== undefined && (typeof it.unit_price !== 'number' || it.unit_price < 0))
      errors.push('items[' + i + ']: unit_price must be a non-negative number');
    if (it.true_total_cost !== undefined && (typeof it.true_total_cost !== 'number' || it.true_total_cost < 0))
      errors.push('items[' + i + ']: true_total_cost must be a non-negative number');
  }

  for (let i = 0; i < saleList.length; i++) {
    const s = saleList[i];
    if (s.gross_sale_price !== undefined && (typeof s.gross_sale_price !== 'number' || s.gross_sale_price < 0))
      errors.push('sales[' + i + ']: gross_sale_price must be a non-negative number');
    if (s.net_profit !== undefined && typeof s.net_profit !== 'number')
      errors.push('sales[' + i + ']: net_profit must be a number');
  }

  for (let i = 0; i < compList.length; i++) {
    const c = compList[i];
    for (const key of ['comp_1', 'comp_2', 'comp_3']) {
      if (c[key] !== undefined && c[key] !== null && (typeof c[key] !== 'number' || c[key] < 0))
        errors.push('comps[' + i + ']: ' + key + ' must be a non-negative number');
    }
  }

  return errors;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);
    const body = await request.json().catch(() => ({}));
    const { strategy = 'append', invoices = [], items = [], sales = [], comps = [] } = body;

    const validationErrors = validatePayload(body);
    if (validationErrors.length > 0) {
      const c = validationErrors.length;
      const d = c <= 20 ? validationErrors : [...validationErrors.slice(0,20),'... and '+(c-20)+' more errors'];
      return err(JSON.stringify({message:c+' validation error(s)',errors:d}), 400);
    }

    const importBatchId = crypto.randomUUID();
    const seenSkus = new Set();
    const skuMap = new Map();
    const itemsNeedingSkus = [];
    const itemDateMap = new Map();
    for (let i=0;i<items.length;i++) {
      const it=items[i];
      let s=(it.sku&&String(it.sku).trim())?String(it.sku).trim():null;
      if(!s){itemsNeedingSkus.push(i);itemDateMap.set(i,it.date_acquired||new Date().toISOString().split('T')[0]);}
      else {seenSkus.add(s);skuMap.set(i,s);}
    }
    if(itemsNeedingSkus.length>0) {
      const existingSkus=new Set(seenSkus);
      const ud=[...new Set(itemsNeedingSkus.map(i=>itemDateMap.get(i)))];
      for(const d of ud){const sku=generateSku(new Date(d));
        if(!existingSkus.has(sku)){try{const r=await env.DB.prepare('SELECT 1 FROM auction_items WHERE user_id=? AND sku=? LIMIT 1').bind(userId,sku).first();if(r)existingSkus.add(sku);}catch(_){}}
      }
      for(const idx of itemsNeedingSkus){
        let sku=generateSku(new Date(itemDateMap.get(idx)));let a=0;
        while(existingSkus.has(sku)&&a<5){sku=generateSku(new Date(itemDateMap.get(idx)));a++;}
        if(existingSkus.has(sku))sku=generateSku(new Date(itemDateMap.get(idx))) + '-' + Math.random().toString(36).substring(2,6).toUpperCase();
        existingSkus.add(sku);seenSkus.add(sku);skuMap.set(idx,sku);
      }
    }

    const statements=[];
    const invoiceMap=new Map();
    const itemMap=new Map();

    for(const inv of invoices){
      const invId=inv.id||'inv-'+crypto.randomUUID();
      const ref=String(inv.invoice_ref||'Default').trim();
      invoiceMap.set(ref,invId);
      statements.push(env.DB.prepare(`INSERT INTO auction_invoices (id,user_id,invoice_ref,description,base_total,discount,shipping,tax,date_acquired,created_at,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),?) ON CONFLICT(id) DO UPDATE SET invoice_ref=excluded.invoice_ref,description=excluded.description,base_total=excluded.base_total,discount=excluded.discount,shipping=excluded.shipping,tax=excluded.tax,date_acquired=excluded.date_acquired,import_batch_id=excluded.import_batch_id`).bind(invId,userId,ref,inv.description||null,Number(inv.base_total)||0,Number(inv.discount)||0,Number(inv.shipping)||0,Number(inv.tax)||0,inv.date_acquired||null,importBatchId));
    }

    for(let i=0;i<items.length;i++){
      const it=items[i];const itemId=it.id||'item-'+crypto.randomUUID();
      const itemSku=skuMap.get(i)||null;
      if(it.item_name)itemMap.set(it.item_name,itemId);
      itemMap.set(itemId,itemId);
      let invId=it.invoice_id;const invRef=it.invoice_ref?String(it.invoice_ref).trim():null;
      if(!invId&&invRef&&invoiceMap.has(invRef))invId=invoiceMap.get(invRef);
      if(!invId){invId='inv-'+crypto.randomUUID();invoiceMap.set(invRef||'Imported',invId);
        statements.push(env.DB.prepare(`INSERT INTO auction_invoices (id,user_id,invoice_ref,description,base_total,date_acquired,import_batch_id) VALUES (?,?,?,'Imported batch',?,?,?)`).bind(invId,userId,invRef||'Imported',Number(it.unit_price)||0,it.date_acquired||null,importBatchId));
      }
      const up=Number(it.unit_price)||0;const bt=Number(it.item_base_total||up);const tc=Number(it.true_total_cost||bt);
      statements.push(env.DB.prepare(`INSERT INTO auction_items (id,user_id,invoice_id,item_name,category,unit_price,item_base_total,proration_weight,prorated_discount,prorated_shipping,prorated_tax,true_total_cost,status,platform,platform_fee_pct,platform_flat_fee,est_shipping_cost,boost_pct,min_sell_price,suggested_list_price,current_list_price,actual_sell_price,target_margin_pct,date_acquired,notes,sku,quantity,created_at,updated_at,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),?) ON CONFLICT(id) DO UPDATE SET item_name=excluded.item_name,unit_price=excluded.unit_price,true_total_cost=excluded.true_total_cost,status=excluded.status,updated_at=datetime('now'),import_batch_id=excluded.import_batch_id`).bind(itemId,userId,invId,it.item_name||it.title||'Unknown','Memorabilia',up,bt,1,0,0,0,tc,it.status||'Available',it.platform||'eBay',Number(it.platform_fee_pct)||DEFAULT_PLATFORM_FEE_PCT,Number(it.platform_flat_fee)||DEFAULT_PLATFORM_FLAT_FEE,Number(it.est_shipping_cost)||DEFAULT_EST_SHIPPING_COST,Number(it.boost_pct)||0,Number(it.min_sell_price)||0,Number(it.suggested_list_price)||0,it.current_list_price!==undefined?Number(it.current_list_price):null,it.actual_sell_price!==undefined?Number(it.actual_sell_price):null,Number(it.target_margin_pct)||DEFAULT_TARGET_MARGIN_PCT,it.date_acquired||null,it.notes||null,itemSku,Number(it.quantity)||1,importBatchId));
    }

    for(const sale of sales){
      let itemId=sale.item_id;
      if(!itemId&&sale.item_name&&itemMap.has(sale.item_name))itemId=itemMap.get(sale.item_name);
      if(!itemId)continue;
      const saleId=sale.id||'sale-'+crypto.randomUUID();
      const gross=Number(sale.gross_sale_price)||0;const bs=Number(sale.buyer_shipping_paid)||0;const as=Number(sale.actual_shipping_cost)||0;const fp=Number(sale.platform_fee_pct)||DEFAULT_PLATFORM_FEE_PCT;const ff=Number(sale.platform_flat_fee)||DEFAULT_PLATFORM_FLAT_FEE;const pr=Number(sale.payment_processing_amt)||0;const pl=Number(sale.promoted_listing_fee)||0;const tc=Number(sale.true_total_cost)||0;
      const m=computeSaleMetrics({gross_sale_price:gross,buyer_shipping_paid:bs,actual_shipping_cost:as,platform_fee_pct:fp,platform_flat_fee:ff,payment_processing_amt:pr,promoted_listing_fee:pl,true_total_cost:tc});
      statements.push(env.DB.prepare(`INSERT INTO auction_sales (id,user_id,item_id,sale_date,platform,buyer_handle,gross_sale_price,buyer_shipping_paid,actual_shipping_cost,platform_fee_pct,platform_flat_fee,platform_fees_amt,payment_processing_amt,promoted_listing_fee,net_proceeds,true_total_cost,net_profit,roi_pct,days_to_sell,created_at,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?) ON CONFLICT(id) DO UPDATE SET sale_date=excluded.sale_date,gross_sale_price=excluded.gross_sale_price,net_proceeds=excluded.net_proceeds,net_profit=excluded.net_profit,roi_pct=excluded.roi_pct,import_batch_id=excluded.import_batch_id`).bind(saleId,userId,itemId,sale.sale_date||new Date().toISOString().split('T')[0],sale.platform||'eBay',sale.buyer_handle||null,gross,bs,as,fp,ff,m.platform_fees_amt,pr,pl,m.net_proceeds,tc,m.net_profit,m.roi_pct,sale.days_to_sell!==undefined?Number(sale.days_to_sell):null,importBatchId));
      statements.push(env.DB.prepare(`UPDATE auction_items SET status='Sold',date_sold=?,actual_sell_price=?,updated_at=datetime('now') WHERE id=? AND user_id=?`).bind(sale.sale_date||new Date().toISOString().split('T')[0],gross,itemId,userId));
    }

    for(const comp of comps){
      let itemId=comp.item_id;
      if(!itemId&&comp.item_name&&itemMap.has(comp.item_name))itemId=itemMap.get(comp.item_name);
      if(!itemId)continue;
      const compId=comp.id||'comp-'+crypto.randomUUID();
      const c1=comp.comp_1!==undefined&&comp.comp_1!==null?Number(comp.comp_1):null;const c2=comp.comp_2!==undefined&&comp.comp_2!==null?Number(comp.comp_2):null;const c3=comp.comp_3!==undefined&&comp.comp_3!==null?Number(comp.comp_3):null;
      const valid=[c1,c2,c3].filter(v=>v!==null&&!isNaN(v)&&v>0);const ma=valid.length>0?valid.reduce((a,b)=>a+b,0)/valid.length:null;
      statements.push(env.DB.prepare(`INSERT INTO auction_comps (id,item_id,user_id,comp_1,comp_2,comp_3,manual_avg,live_avg,ebay_search_url,recommended_list_price,updated_at,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),?) ON CONFLICT(id) DO UPDATE SET comp_1=excluded.comp_1,comp_2=excluded.comp_2,comp_3=excluded.comp_3,manual_avg=excluded.manual_avg,recommended_list_price=excluded.recommended_list_price,updated_at=datetime('now'),import_batch_id=excluded.import_batch_id`).bind(compId,itemId,userId,c1,c2,c3,ma,comp.live_avg!==undefined&&comp.live_avg!==null?Number(comp.live_avg):null,comp.ebay_search_url||null,comp.recommended_list_price!==undefined?Number(comp.recommended_list_price):ma,importBatchId));
    }

    if(statements.length===0)return ok({success:true,imported:{invoices:0,items:0,sales:0,comps:0}});

    try{for(let i=0;i<statements.length;i+=CHUNK_SIZE)await env.DB.batch(statements.slice(i,i+CHUNK_SIZE));}
    catch(e){console.error('[batch] insert error:', e); await cleanupBatch(env.DB,importBatchId,userId);return err('Batch insert failed. No existing data was modified.',500);}

    try{
      const c=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM auction_invoices WHERE import_batch_id=?) AS ic,(SELECT COUNT(*) FROM auction_items WHERE import_batch_id=?) AS itc,(SELECT COUNT(*) FROM auction_sales WHERE import_batch_id=?) AS sc,(SELECT COUNT(*) FROM auction_comps WHERE import_batch_id=?) AS cc').bind(importBatchId,importBatchId,importBatchId,importBatchId).first();
      if(Number(c?.ic||0)<invoices.length||Number(c?.itc||0)<items.length||Number(c?.sc||0)<sales.length||Number(c?.cc||0)<comps.length){
        await cleanupBatch(env.DB,importBatchId,userId);return err('Verification failed: incomplete insert. No existing data modified.',500);
      }
    }catch(e){console.error('[batch] verification error:', e); await cleanupBatch(env.DB,importBatchId,userId);return err('Verification failed: incomplete insert. No existing data modified.',500);}

    if(strategy==='replace'){
      try{await env.DB.batch([env.DB.prepare('DELETE FROM auction_sales WHERE user_id=? AND (import_batch_id IS NULL OR import_batch_id!=?)').bind(userId,importBatchId),env.DB.prepare('DELETE FROM auction_comps WHERE user_id=? AND (import_batch_id IS NULL OR import_batch_id!=?)').bind(userId,importBatchId),env.DB.prepare('DELETE FROM auction_items WHERE user_id=? AND (import_batch_id IS NULL OR import_batch_id!=?)').bind(userId,importBatchId),env.DB.prepare('DELETE FROM auction_invoices WHERE user_id=? AND (import_batch_id IS NULL OR import_batch_id!=?)').bind(userId,importBatchId)]);}
      catch(e){console.error('[batch] post-insert delete failed:', e); await cleanupBatch(env.DB,importBatchId,userId); return err('Batch replace failed during old records purge. Database rolled back.', 500);}
    }

    return ok({success:true,imported:{invoices:invoices.length,items:items.length,sales:sales.length,comps:comps.length}});
  });
}

async function cleanupBatch(db,batchId,userId){
  try{
    const stmts = [
      db.prepare('DELETE FROM auction_comps WHERE import_batch_id=?').bind(batchId),
      db.prepare('DELETE FROM auction_sales WHERE import_batch_id=?').bind(batchId),
      db.prepare('DELETE FROM auction_items WHERE import_batch_id=?').bind(batchId),
      db.prepare('DELETE FROM auction_invoices WHERE import_batch_id=?').bind(batchId)
    ];
    if (userId) {
      stmts.push(
        db.prepare("UPDATE auction_items SET status='Available', date_sold=NULL, actual_sell_price=NULL, updated_at=datetime('now') WHERE user_id=? AND status='Sold' AND id NOT IN (SELECT item_id FROM auction_sales WHERE user_id=? AND item_id IS NOT NULL)").bind(userId, userId)
      );
    }
    await db.batch(stmts);
  }
  catch(_){}
}

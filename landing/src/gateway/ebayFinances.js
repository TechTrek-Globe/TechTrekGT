import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';
import { getEbayUserToken } from './ebayOAuth.js';
import { getEbayEndpoints } from './ebay.js';

/**
 * GET /api/ebay/finances?order_id=<ebayOrderId>
 *
 * Proxies the eBay Sell Finances API for a specific order.
 * Returns a normalized fee breakdown for use by the Outpost reconciliation handler.
 *
 * Requires: user-level eBay OAuth token (sell.finances scope)
 * Required bindings: DB (for user token lookup)
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    const { userId } = await requireGatewayAuth(request, env);

    const url = new URL(request.url);
    const orderId = (url.searchParams.get('order_id') || '').trim();
    if (!orderId) return err('order_id query param is required', 400);

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, userId);
    } catch (e) {
      return err(`eBay auth: ${e.message}`, 401);
    }

    const { isSandbox } = getEbayEndpoints(env);
    const base = isSandbox ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com';
    const financesUrl = `${base}/sell/finances/v1/transaction?filter=orderId:{${encodeURIComponent(orderId)}}&limit=100`;

    const res = await fetch(financesUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 403 likely means sell.finances scope not yet approved
      if (res.status === 403) {
        return err('eBay Finances API access not approved. Apply for sell.finances scope at developer.ebay.com.', 403);
      }
      return err(`eBay Finances API error (${res.status}): ${text.slice(0, 200)}`, res.status);
    }

    const data = await res.json();
    const transactions = data.transactions || [];

    // Aggregate fee amounts by type
    let finalValueFee = 0;
    let promotedListingFee = 0;
    let shippingLabelCost = 0;
    let paymentProcessingFee = 0;
    let regulatoryFee = 0;
    let promotedListingRate = null;
    let promotedListingActive = false;
    let grossSaleAmount = 0;

    for (const txn of transactions) {
      const type = (txn.transactionType || '').toUpperCase();
      const amount = Math.abs(parseFloat(txn.amount?.value || '0'));

      if (type === 'SALE') {
        const basis = parseFloat(txn.totalFeeBasisAmount?.value || txn.orderLineItems?.[0]?.feeBasisAmount?.value || txn.amount?.value || '0');
        if (basis > 0) grossSaleAmount = basis;

        const orderLineItems = txn.orderLineItems || [];
        for (const oli of orderLineItems) {
          if (oli.promotedListingRate) {
            promotedListingRate = parseFloat(oli.promotedListingRate);
            promotedListingActive = true;
          }
          const mpFees = oli.marketplaceFees || [];
          for (const mf of mpFees) {
            const fType = (mf.feeType || '').toUpperCase();
            const fAmount = Math.abs(parseFloat(mf.amount?.value || '0'));
            if (fType.includes('FINAL_VALUE')) {
              finalValueFee += fAmount;
            } else if (fType.includes('AD_FEE') || fType.includes('PROMOTED')) {
              promotedListingFee += fAmount;
              promotedListingActive = true;
            } else if (fType.includes('REGULATORY')) {
              regulatoryFee += fAmount;
            } else {
              paymentProcessingFee += fAmount;
            }
          }
        }

        if (finalValueFee === 0 && txn.totalFeeAmount?.value) {
          finalValueFee = Math.abs(parseFloat(txn.totalFeeAmount.value));
        }
      } else if (type === 'SHIPPING_LABEL') {
        shippingLabelCost += amount;
      } else if (type === 'NON_SALE_CHARGE') {
        const feeType = (txn.feeType || txn.orderLineItems?.[0]?.feeType || '').toUpperCase();
        if (feeType.includes('FINAL_VALUE')) {
          finalValueFee += amount;
        } else if (feeType.includes('AD_FEE') || feeType.includes('PROMOTED')) {
          promotedListingFee += amount;
          promotedListingActive = true;
          if (txn.orderLineItems?.[0]?.promotedListingRate) {
            promotedListingRate = parseFloat(txn.orderLineItems[0].promotedListingRate);
          }
        } else if (feeType.includes('REGULATORY')) {
          regulatoryFee += amount;
        } else {
          paymentProcessingFee += amount;
        }
      }
    }

    const totalEbayFees = finalValueFee + promotedListingFee + shippingLabelCost + paymentProcessingFee + regulatoryFee;

    return ok({
      order_id: orderId,
      gross_sale_amount: parseFloat(grossSaleAmount.toFixed(2)),
      final_value_fee: parseFloat(finalValueFee.toFixed(2)),
      promoted_listing_fee: parseFloat(promotedListingFee.toFixed(2)),
      shipping_label_cost: parseFloat(shippingLabelCost.toFixed(2)),
      payment_processing_fee: parseFloat(paymentProcessingFee.toFixed(2)),
      regulatory_fee: parseFloat(regulatoryFee.toFixed(2)),
      total_ebay_fees: parseFloat(totalEbayFees.toFixed(2)),
      promoted_listing_rate: promotedListingRate,
      promoted_listing_active: promotedListingActive,
      transaction_count: transactions.length,
      raw: transactions
    });
  });
}

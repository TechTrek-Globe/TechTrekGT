const fs = require('fs');
const xmlText = fs.readFileSync('debug_getitem.xml', 'utf8');

let isFreeShipping = false;
let buyerShippingCost = 0;

const freeShippingMatch = xmlText.match(/<FreeShipping[^>]*>(.*?)<\/FreeShipping>/i);
if (freeShippingMatch && freeShippingMatch[1].trim().toLowerCase() === 'true') {
  isFreeShipping = true;
}

const shippingCostMatch = xmlText.match(/<ShippingServiceCost[^>]*>([0-9.]+)<\/ShippingServiceCost>/i) ||
                          xmlText.match(/<ShippingCost[^>]*>([0-9.]+)<\/ShippingCost>/i) ||
                          xmlText.match(/<FlatShippingRate[^>]*>([0-9.]+)<\/FlatShippingRate>/i);
if (shippingCostMatch) {
  const parsedCost = parseFloat(shippingCostMatch[1]);
  if (parsedCost > 0) {
    buyerShippingCost = parsedCost;
    isFreeShipping = false;
  } else if (parsedCost === 0) {
    isFreeShipping = true;
  }
}

const profileNameMatch = xmlText.match(/<ShippingProfileName[^>]*>(.*?)<\/ShippingProfileName>/i) ||
                         xmlText.match(/<SellerShippingProfile[^>]*>[\s\S]*?<ShippingProfileName[^>]*>(.*?)<\/ShippingProfileName>/i);
if (profileNameMatch) {
  const pName = profileNameMatch[1].trim();
  if (pName.toLowerCase().includes('free')) {
    isFreeShipping = true;
    buyerShippingCost = 0;
  } else {
    const dollarMatch = pName.match(/\$([0-9]+(?:\.[0-9]{2})?)/) || pName.match(/(?:^|\s)([0-9]+(?:\.[0-9]{2}))(?:\s|$)/);
    if (dollarMatch) {
      const val = parseFloat(dollarMatch[1]);
      if (val > 0) {
        buyerShippingCost = val;
        isFreeShipping = false;
      }
    }
  }
}

console.log({ buyerShippingCost, isFreeShipping });

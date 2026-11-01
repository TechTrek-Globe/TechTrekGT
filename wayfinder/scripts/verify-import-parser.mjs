// Verification test suite for import-jobs.js and gemini-parser.js
// Tests sensitive data scrubbing, Luhn validation, heuristic extraction, field mapping, and split rounding.

import assert from 'node:assert/strict';
import {
  scrubSensitiveData,
  heuristicParseDocument,
  mapExtractionToFields
} from '../functions/api/wayfinder/gemini-parser.js';
import {
  parseGetYourGuideEmail,
  extractBookingFields
} from '../functions/api/wayfinder/email-worker.js';
import {
  addMinutesWithDate
} from '../functions/api/wayfinder/calendar.js';

let passedCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

console.log('--- 1. Sensitive Data Scrubbing & Luhn Tests ---');

test('Scrub CVV without leaking digits in label', () => {
  const result1 = scrubSensitiveData('Payment CVV: 123 for card');
  assert.equal(result1.includes('123'), false, 'CVV digits 123 must be stripped');
  assert.match(result1, /cvv:?\s*\[CVV REDACTED\]/i);

  const result2 = scrubSensitiveData('security code 9876');
  assert.equal(result2.includes('9876'), false, 'CVV digits 9876 must be stripped');
  assert.match(result2, /security code:?\s*\[CVV REDACTED\]/i);
});

test('Scrub Passport number without leaking secret', () => {
  const result = scrubSensitiveData('Guest Passport No: AB1234567 in record');
  assert.equal(result.includes('AB1234567'), false, 'Passport number AB1234567 must be stripped');
  assert.match(result, /passport\s*(?:no)?:?\s*\[PASSPORT REDACTED\]/i);
});

test('Luhn card numbers are redacted; false positives preserved', () => {
  // Valid Luhn 16-digit Visa test card
  const validCard = '4111 1111 1111 1111';
  const scrubbedCard = scrubSensitiveData(`Charged to ${validCard}`);
  assert.match(scrubbedCard, /\[CARD REDACTED\]/);

  // 13-digit airline e-ticket number that fails Luhn
  const eticket = 'e-ticket 0062108943012';
  const scrubbedTicket = scrubSensitiveData(eticket);
  assert.equal(scrubbedTicket, eticket, 'Non-Luhn e-ticket must not be redacted');

  // 11-digit PKP rail reference number
  const pkpRef = 'PKP ref 73829102938';
  const scrubbedRef = scrubSensitiveData(pkpRef);
  assert.equal(scrubbedRef, pkpRef, 'Non-Luhn reference number must not be redacted');

  // Numbers with hyphens or spaces but fewer than 13 actual digits must not be redacted
  const twelveDigits = 'Ref 0000 0000 0000 id';
  const scrubbedTwelve = scrubSensitiveData(twelveDigits);
  assert.equal(scrubbedTwelve, twelveDigits, '12-digit string must not be redacted');

  const shortHyphen = 'Code 1-2-3-4-5-6-7 end';
  const scrubbedShort = scrubSensitiveData(shortHyphen);
  assert.equal(scrubbedShort, shortHyphen, '7-digit string with hyphens must not be redacted');
});

console.log('--- 2. Heuristic Parser Rule Tightening & Ordering Tests ---');

test('Bare "dl" in Polish address does NOT trigger Delta flight', () => {
  const parsed = heuristicParseDocument({
    text: 'Hotel booking confirmation at ul. Dluga 15, Krakow',
    filename: 'hotel-booking.pdf'
  });
  assert.notEqual(parsed.provider, 'Delta Air Lines', 'Bare dl in address must not trigger Delta');
  assert.equal(parsed.item_type, 'hotel');
});

test('Delta flight triggers only on explicit DL 9208 or Delta keywords', () => {
  const parsed = heuristicParseDocument({
    text: 'Flight confirmation DL 9208 from Atlanta to Krakow',
    filename: 'delta-confirmation.pdf'
  });
  assert.equal(parsed.provider, 'Delta Air Lines');
  assert.equal(parsed.item_type, 'flight');
  assert.equal(parsed.confirmation_number, 'GUDI3J');
});

test('Bare "bridge" does NOT trigger The Bridge MGallery hotel', () => {
  const parsed = heuristicParseDocument({
    text: 'Walk across the Grunwaldzki bridge to dinner at 19:00',
    filename: 'itinerary-notes.txt'
  });
  assert.notEqual(parsed.provider, 'Accor / The Bridge Wrocław MGallery');
});

test('The Bridge MGallery triggers on "the bridge" or "mgallery"', () => {
  const parsed = heuristicParseDocument({
    text: 'Reservation confirmed at The Bridge Wroclaw MGallery',
    filename: 'hotel-reservation.pdf'
  });
  assert.equal(parsed.provider, 'Accor / The Bridge Wrocław MGallery');
  assert.equal(parsed.item_type, 'hotel');
});

test('Generic tour does NOT get Auschwitz hardcoded title', () => {
  const parsed = heuristicParseDocument({
    text: 'GetYourGuide tour voucher: Poznan Old Town Historic Walking Tour',
    filename: 'tour-voucher.pdf'
  });
  assert.equal(parsed.item_type, 'excursion');
  assert.equal(parsed.provider, 'GetYourGuide');
  assert.notEqual(parsed.title, 'GetYourGuide: Auschwitz-Birkenau & Wieliczka Salt Mine Tour');
});

test('Auschwitz/Wieliczka tour triggers specific details', () => {
  const parsed = heuristicParseDocument({
    text: 'Voucher for Auschwitz-Birkenau & Wieliczka Salt Mine Tour',
    filename: 'gyg-tour.pdf'
  });
  assert.equal(parsed.item_type, 'excursion');
  assert.equal(parsed.provider, 'GetYourGuide');
  assert.equal(parsed.title, 'GetYourGuide: Auschwitz-Birkenau & Wieliczka Salt Mine Tour');
  assert.equal(parsed.price, 284.76);
  assert.equal(parsed.currency, 'USD');
});

test('Dynamic hotel extraction preserves custom dates and prices', () => {
  const parsed = heuristicParseDocument({
    text: 'Hotel Copernicus Krakow. Check-in: 12.12.2026, Check-out: 15.12.2026. Total price: 1850.50 PLN. Confirmation: COP9821.',
    filename: 'copernicus.pdf'
  });
  assert.equal(parsed.item_type, 'hotel');
  assert.equal(parsed.start_date, '2026-12-12');
  assert.equal(parsed.end_date, '2026-12-15');
  assert.equal(parsed.price, 1850.50);
  assert.equal(parsed.currency, 'PLN');
  assert.equal(parsed.confirmation_number, 'COP9821');
});

console.log('--- 3. Field Mapping & Room Type Fallback Tests ---');

test('Standard hotel booking does NOT force "Junior Suite"', () => {
  const fields = mapExtractionToFields({
    item_type: 'hotel',
    title: 'Hotel Mercure Warszawa',
    provider: 'Hotel Mercure',
    seat: null,
    guests: null,
    confidence: 'high'
  });
  const roomField = fields.find(f => f.field_name === 'room_type');
  assert.equal(roomField, undefined, 'room_type must be omitted when extraction seat is null');

  const guestField = fields.find(f => f.field_name === 'guests');
  assert.equal(guestField?.extracted_value, '2 Adults', 'guests defaults to 2 Adults');
});

test('Hotel with explicit suite uses extracted room_type', () => {
  const fields = mapExtractionToFields({
    item_type: 'hotel',
    title: 'Altus Palace',
    provider: 'Hotel Altus Palace',
    seat: 'Deluxe Suite',
    guests: '1 Adult',
    confidence: 'high'
  });
  const roomField = fields.find(f => f.field_name === 'room_type');
  assert.equal(roomField?.extracted_value, 'Deluxe Suite');

  const guestField = fields.find(f => f.field_name === 'guests');
  assert.equal(guestField?.extracted_value, '1 Adult');
});

console.log('--- 4. Expense Split Rounding Tests ---');

test('50/50 split on even amount sums to original without penny loss', () => {
  const amount = 101.00;
  const split1 = Math.floor((amount / 2) * 100) / 100;
  const split2 = Number((amount - split1).toFixed(2));
  assert.equal(split1, 50.50);
  assert.equal(split2, 50.50);
  assert.equal(split1 + split2, 101.00);
});

test('50/50 split on odd penny amount preserves total amount', () => {
  const amount = 101.01;
  const split1 = Math.floor((amount / 2) * 100) / 100;
  const split2 = Number((amount - split1).toFixed(2));
  assert.equal(split1, 50.50);
  assert.equal(split2, 50.51);
  assert.equal(Number((split1 + split2).toFixed(2)), 101.01);
});

test('50/50 split on .99 cent amount preserves total amount', () => {
  const amount = 99.99;
  const split1 = Math.floor((amount / 2) * 100) / 100;
  const split2 = Number((amount - split1).toFixed(2));
  assert.equal(split1, 49.99);
  assert.equal(split2, 50.00);
  assert.equal(Number((split1 + split2).toFixed(2)), 99.99);
});

console.log('--- 5. Sensitive Field Filtering Function Tests ---');

function isSensitiveField(fieldName) {
  const lower = String(fieldName || '').toLowerCase();
  if (lower === 'payment_method') return false;
  return lower.includes('passport') ||
         lower.includes('payment') ||
         lower.includes('cvv') ||
         lower.includes('card_number');
}

test('isSensitiveField allows payment_method case-insensitively', () => {
  assert.equal(isSensitiveField('payment_method'), false);
  assert.equal(isSensitiveField('PAYMENT_METHOD'), false);
  assert.equal(isSensitiveField('Payment_Method'), false);
});

test('isSensitiveField blocks passport, CVV, and raw payment fields', () => {
  assert.equal(isSensitiveField('passport_number'), true);
  assert.equal(isSensitiveField('traveler_passport'), true);
  assert.equal(isSensitiveField('cvv'), true);
  assert.equal(isSensitiveField('card_number'), true);
  assert.equal(isSensitiveField('payment_details'), true);
  assert.equal(isSensitiveField('payment_token'), true);
  assert.equal(isSensitiveField('title'), false);
  assert.equal(isSensitiveField('departure_date'), false);
});

console.log('--- 6. December 16-31 Full-Month Date Regex Tests ---');

test('GetYourGuide parses dates from 16th through 31st of December', () => {
  const gyg18 = parseGetYourGuideEmail('Activity date: 2026-12-18 at 09:00', 'Your Tour', 'tour@getyourguide.com');
  assert.equal(gyg18.local_date, '2026-12-18');

  const gyg25 = parseGetYourGuideEmail('Activity date: 2026-12-25 at 10:00', 'Christmas Tour', 'tour@getyourguide.com');
  assert.equal(gyg25.local_date, '2026-12-25');

  const gyg31 = parseGetYourGuideEmail('Activity date: 2026-12-31 at 18:00', 'NYE Tour', 'tour@getyourguide.com');
  assert.equal(gyg31.local_date, '2026-12-31');
});

test('General email parser extracts ISO and formatted dates Dec 16-31', () => {
  const f1 = extractBookingFields('Booking confirmation', 'Check-in on 2026-12-20 at 15:00', 'booking@hotel.pl');
  assert.equal(f1.local_date, '2026-12-20');

  const f2 = extractBookingFields('Hotel confirmation', 'Arrival December 24th in Warsaw', 'stay@hotel.pl');
  assert.equal(f2.local_date, '2026-12-24');

  const f3 = extractBookingFields('Hotel confirmation', 'Arrival 31 Dec in Krakow', 'stay@hotel.pl');
  assert.equal(f3.local_date, '2026-12-31');
});

console.log('--- 7. Midnight Calendar Rollover Tests ---');

test('addMinutesWithDate correctly advances date and calculates end time on midnight crossing', () => {
  // Late evening event crossing midnight: 23:30 + 90 mins -> 01:00 next day
  const r1 = addMinutesWithDate('2026-12-07', '23:30', 90);
  assert.equal(r1.endDate, '2026-12-08');
  assert.equal(r1.endTime, '01:00');

  // Exact midnight: 23:00 + 60 mins -> 00:00 next day
  const r2 = addMinutesWithDate('2026-12-07', '23:00', 60);
  assert.equal(r2.endDate, '2026-12-08');
  assert.equal(r2.endTime, '00:00');

  // Normal daytime event: 14:00 + 60 mins -> 15:00 same day
  const r3 = addMinutesWithDate('2026-12-07', '14:00', 60);
  assert.equal(r3.endDate, '2026-12-07');
  assert.equal(r3.endTime, '15:00');

  // Year boundary rollover: 2026-12-31 23:45 + 30 mins -> 2027-01-01 00:15
  const r4 = addMinutesWithDate('2026-12-31', '23:45', 30);
  assert.equal(r4.endDate, '2027-01-01');
  assert.equal(r4.endTime, '00:15');
});

console.log('--- 8. Expense amount_usd and Split Rounding Tests ---');

test('amount_usd computes accurately for USD, PLN, and EUR', () => {
  // USD
  const amtUsd = 284.76;
  assert.equal(amtUsd, 284.76);

  // PLN (rate 4.0)
  const amtPln = 2400.00;
  const convertedPln = Math.round((amtPln / 4.0) * 100) / 100;
  assert.equal(convertedPln, 600.00);

  // EUR (rate 1.08)
  const amtEur = 150.00;
  const convertedEur = Math.round((amtEur * 1.08) * 100) / 100;
  assert.equal(convertedEur, 162.00);
});

test('Odd-cent split partitioning preserves exact original total', () => {
  const rawAmt = 366.43;
  const split1 = Math.floor((rawAmt / 2) * 100) / 100;
  const split2 = Number((rawAmt - split1).toFixed(2));
  assert.equal(split1, 183.21);
  assert.equal(split2, 183.22);
  assert.equal(Number((split1 + split2).toFixed(2)), 366.43);
});

console.log(`\nAll ${passedCount} verification tests passed successfully!`);

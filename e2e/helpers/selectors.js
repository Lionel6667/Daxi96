/**
 * Selectors aligned to live vubez2.html (read Sep 2026).
 * Prefer stable ids; keep text/role fallbacks for i18n.
 *
 * Real DOM:
 *   pickup:  #destinationAddress (name=daxi_pickup_address) → syncs to #pickupHidden
 *   dropoff: #destinationAddressArrival → syncs to #destinationHidden
 *   GPS:     #myPositionBtn.daxi-row-action
 *   sheet:   #daxi-sheet-order-slot (NOT #daxi-sheet-slot)
 *   submit:  #orderTaxiBtn → POST /htmx/client/order/create/
 *   tabs:    #daxiSwitchForm / #daxiSwitchOrder
 */

module.exports = {
  sheetTabNewTrip: /Nouveau trajet|Nouvo vwayaj|New trip/i,
  sheetTabMyRide: /Ma course|Kou mwen|My (ride|trip)/i,

  pickupInput: '#destinationAddress',
  dropoffInput: '#destinationAddressArrival',
  pickupHidden: '#pickupHidden',
  destinationHidden: '#destinationHidden',
  pickupLatHidden: '#pickupLatHidden',
  pickupLngHidden: '#pickupLngHidden',
  destLatHidden: '#destLatHidden',
  destLngHidden: '#destLngHidden',
  guestIdHidden: '#guestIdHidden',
  orderTaxiBtn: '#orderTaxiBtn',
  myPositionBtn: '#myPositionBtn',

  pickupInputCandidates: [
    '#destinationAddress',
    'input[name="daxi_pickup_address"]',
    'input[name="pickup"]',
  ],

  dropoffInputCandidates: [
    '#destinationAddressArrival',
    'input[name="daxi_destination_address"]',
    '#dropoffAddress',
    'input[name="destination"]',
  ],

  gpsActionClass: '.daxi-row-action',
  gpsButton: '#myPositionBtn',

  /** Product sheet order slot (vubez2.html id="daxi-sheet-order-slot"). */
  sheetSlot:
    '#daxi-sheet-order-slot, #daxi-sheet-slot, .daxi-sheet-slot, [data-daxi-sheet-slot]',
  orderPills: '#daxi-order-pills',
  sheetTabNewTripId: '#daxiSwitchForm',
  sheetTabMyRideId: '#daxiSwitchOrder',

  phoneModalText: /WhatsApp|telefon|téléphone|phone|nimewo/i,
  priceModalText: /pri|prix|price|HTG|goud/i,
  payModalText: /peye|payer|payment|MonCash|cash/i,

  relocatePromptText: /Écart de position|ekat pozisyon|relocalis|relocate|meeting/i,

  createOrderPath: /\/htmx\/client\/order\/create\/?/,
  ordersSheetPath: /\/htmx\/client\/orders\/sheet\/?/,

  /**
   * DOM markers that `_daxiSheetSlotHasCheckoutFlow` actually inspects
   * (static/js/vubez2/vubez2-inline-04.js).
   */
  checkoutGuardSelectors:
    '#guest-phone-card, #pending-coords-card, #price-proposal-card, #payment-selection-wrap, .daxi-pay-wrap, [data-daxi-checkout-flow="1"]',
};

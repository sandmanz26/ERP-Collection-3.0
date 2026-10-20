// Mock client for the external "Decor Inventory System" (spec §8).
// Simulates a REST API with latency and its own persistence, so the EO system can only talk to it
// through these async functions — exactly like the real integration would.
//
// Real-world mapping (suggested):
//   GET  /api/items                         -> listItems()
//   GET  /api/items/:id/availability?date=  -> checkAvailability(itemId, date)
//   POST /api/reservations                  -> reserve({ eventId, eventName, date, items })
//   PATCH /api/reservations/:id             -> updateReservation(id, items)
//   DELETE /api/reservations/:id            -> cancelReservation(id)
//   GET  /api/reservations?eventId=         -> getReservations(eventId)
//   GET  /api/reservations/:id/return-report -> getReturnReport(id)

const KEY = 'eo-decor-inventory-v1';
const LATENCY = 250;

const SEED_ITEMS = [
  { id: 'dec_1', sku: 'CH-CHIAV-GLD', name: 'Chiavari Chair — Gold', category: 'Furniture', qtyTotal: 400, unitCost: 2.5, rentalPrice: 9, swatch: '#c9a227', replacementCost: 85 },
  { id: 'dec_2', sku: 'CH-GHOST-CLR', name: 'Ghost Chair — Clear', category: 'Furniture', qtyTotal: 250, unitCost: 3, rentalPrice: 11, swatch: '#dfe7ee', replacementCost: 120 },
  { id: 'dec_3', sku: 'TB-RND-60', name: 'Round Table 60"', category: 'Furniture', qtyTotal: 60, unitCost: 6, rentalPrice: 22, swatch: '#8b6f4e', replacementCost: 210 },
  { id: 'dec_4', sku: 'TB-FARM-8', name: 'Farm Table 8ft', category: 'Furniture', qtyTotal: 30, unitCost: 15, rentalPrice: 65, swatch: '#6b4f2e', replacementCost: 640 },
  { id: 'dec_5', sku: 'LN-IVORY-120', name: 'Ivory Linen 120" Round', category: 'Linen', qtyTotal: 120, unitCost: 4, rentalPrice: 18, swatch: '#f4ecd8', replacementCost: 60 },
  { id: 'dec_6', sku: 'LN-SAGE-RUN', name: 'Sage Chiffon Runner', category: 'Linen', qtyTotal: 80, unitCost: 2, rentalPrice: 8, swatch: '#9caf88', replacementCost: 25 },
  { id: 'dec_7', sku: 'CD-TAPER-BRS', name: 'Brass Taper Candelabra', category: 'Tabletop', qtyTotal: 90, unitCost: 3, rentalPrice: 14, swatch: '#b08d57', replacementCost: 95 },
  { id: 'dec_8', sku: 'GL-CRYS-GBLT', name: 'Crystal Goblet', category: 'Tabletop', qtyTotal: 600, unitCost: 0.4, rentalPrice: 1.8, swatch: '#e8f1f8', replacementCost: 14 },
  { id: 'dec_9', sku: 'AR-ROUND-MOON', name: 'Moongate Ceremony Arch', category: 'Structures', qtyTotal: 3, unitCost: 60, rentalPrice: 450, swatch: '#a3a3a3', replacementCost: 2400 },
  { id: 'dec_10', sku: 'BK-FLWR-WALL', name: 'Flower Wall Backdrop 8x8', category: 'Structures', qtyTotal: 4, unitCost: 80, rentalPrice: 600, swatch: '#e6a1b5', replacementCost: 3200 },
  { id: 'dec_11', sku: 'LT-FESTOON-50', name: 'Festoon Lights 50ft', category: 'Lighting', qtyTotal: 40, unitCost: 5, rentalPrice: 35, swatch: '#ffd56b', replacementCost: 140 },
  { id: 'dec_12', sku: 'LT-UPL-RGB', name: 'RGB Uplight', category: 'Lighting', qtyTotal: 70, unitCost: 4, rentalPrice: 28, swatch: '#7b61ff', replacementCost: 180 },
  { id: 'dec_13', sku: 'ST-STAGE-4x8', name: 'Stage Deck 4x8', category: 'Staging', qtyTotal: 24, unitCost: 12, rentalPrice: 75, swatch: '#3d3d3d', replacementCost: 900 },
  { id: 'dec_14', sku: 'SG-WELC-ACR', name: 'Acrylic Welcome Sign', category: 'Signage', qtyTotal: 10, unitCost: 8, rentalPrice: 95, swatch: '#cfe8ff', replacementCost: 260 },
  { id: 'dec_15', sku: 'LG-VELVET-SOFA', name: 'Velvet Lounge Sofa', category: 'Lounge', qtyTotal: 8, unitCost: 40, rentalPrice: 280, swatch: '#2f4f6f', replacementCost: 2800 },
];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { items: SEED_ITEMS, reservations: [] };
}

function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch { /* ignore */ }
}

const delay = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), LATENCY));

export function resetDecorDb(seedReservations = []) {
  save({ items: SEED_ITEMS, reservations: seedReservations });
}

/** Synchronous read for initial render & selectors (in a real system this would be a cached query). */
export function decorSnapshot() {
  return load();
}

export async function listItems() {
  return delay(load().items);
}

function reservedQty(db, itemId, date, excludeResId) {
  return db.reservations
    .filter((r) => r.date === date && r.status !== 'cancelled' && r.id !== excludeResId)
    .reduce((acc, r) => acc + (r.items.find((i) => i.itemId === itemId)?.qty || 0), 0);
}

export async function checkAvailability(itemId, date) {
  const db = load();
  const item = db.items.find((i) => i.id === itemId);
  return delay({ itemId, date, total: item.qtyTotal, reserved: reservedQty(db, itemId, date), available: item.qtyTotal - reservedQty(db, itemId, date) });
}

export async function reserve({ eventId, eventName, date, items }) {
  const db = load();
  const shortages = items
    .map((i) => {
      const item = db.items.find((x) => x.id === i.itemId);
      const avail = item.qtyTotal - reservedQty(db, i.itemId, date);
      return avail < i.qty ? `${item.name}: requested ${i.qty}, available ${avail}` : null;
    })
    .filter(Boolean);
  if (shortages.length) return Promise.reject(new Error(`Insufficient stock — ${shortages.join('; ')}`));
  const existing = db.reservations.find((r) => r.eventId === eventId && r.status !== 'cancelled');
  if (existing) {
    // merge quantities
    items.forEach((i) => {
      const line = existing.items.find((x) => x.itemId === i.itemId);
      if (line) line.qty += i.qty;
      else existing.items.push({ ...i });
    });
    existing.items = existing.items.filter((i) => i.qty > 0);
    existing.date = date;
    save(db);
    return delay(existing);
  }
  const res = { id: `res_${Date.now().toString(36)}`, eventId, eventName, date, items: items.map((i) => ({ ...i })), status: 'reserved', createdAt: new Date().toISOString() };
  db.reservations.push(res);
  save(db);
  return delay(res);
}

export async function moveReservationDate(eventId, newDate) {
  const db = load();
  db.reservations.filter((r) => r.eventId === eventId && r.status !== 'cancelled').forEach((r) => (r.date = newDate));
  save(db);
  return delay(true);
}

export async function cancelReservation(eventId) {
  const db = load();
  db.reservations.filter((r) => r.eventId === eventId).forEach((r) => (r.status = 'cancelled'));
  save(db);
  return delay(true);
}

export async function getReservations(eventId) {
  return delay(load().reservations.filter((r) => r.eventId === eventId));
}

/** Simulate post-event return check; deterministic damage pattern for the demo. */
export async function markReturned(eventId) {
  const db = load();
  const res = db.reservations.find((r) => r.eventId === eventId && r.status !== 'cancelled');
  if (!res) return Promise.reject(new Error('No reservation for event'));
  res.status = 'returned';
  res.returnedAt = new Date().toISOString();
  res.returnReport = res.items.map((line, idx) => {
    const item = db.items.find((i) => i.id === line.itemId);
    const damaged = idx === 0 ? Math.min(2, line.qty) : 0;
    const lost = idx === 1 ? Math.min(1, line.qty) : 0;
    return {
      itemId: line.itemId,
      name: item.name,
      qtyOut: line.qty,
      qtyReturned: line.qty - lost,
      damaged,
      lost,
      charge: (damaged * item.replacementCost * 0.5) + (lost * item.replacementCost),
    };
  });
  save(db);
  return delay(res);
}

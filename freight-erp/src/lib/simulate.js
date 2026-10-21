// Simulators for the outside world (customers, carriers, document senders).
// Used by the seed and by the "simulate" buttons in the UI, since there is no backend.
import { portByCode, COMMODITIES, CHARGE_CODES, MODES } from './reference.js';
import { DAY, isoDate, round2 } from './util.js';

const GROUP = { ID: 'ASIA', SG: 'ASIA', CN: 'ASIA', HK: 'ASIA', KR: 'ASIA', VN: 'ASIA', TH: 'ASIA', MY: 'ASIA', JP: 'ASIA', IN: 'MEI', AE: 'MEI', DE: 'EU', NL: 'EU', BE: 'EU', GB: 'EU', US: 'US', AU: 'OC' };
const FCL_BASE = { 'ASIA-ASIA': 520, 'ASIA-EU': 1850, 'EU-ASIA': 900, 'ASIA-US': 2350, 'US-ASIA': 1100, 'EU-US': 1650, 'US-EU': 1250, 'EU-MEI': 1150, 'ASIA-MEI': 780, 'ASIA-OC': 1050, 'US-OC': 1900, 'EU-EU': 900 };
const TRANSIT = { 'ASIA-ASIA': 6, 'ASIA-EU': 32, 'EU-ASIA': 30, 'ASIA-US': 18, 'US-ASIA': 20, 'EU-US': 12, 'US-EU': 12, 'EU-MEI': 19, 'ASIA-MEI': 14, 'ASIA-OC': 13, 'US-OC': 21, 'EU-EU': 2 };
const lane = (o, d) => `${GROUP[portByCode[o]?.country] || 'ASIA'}-${GROUP[portByCode[d]?.country] || 'EU'}`;

export const FX = { USD: 1, EUR: 0.92 };

const SUPPLIERS = ['Ningbo Hengda Industrial Co.', 'Shenzhen Brightway Electronics Ltd', 'Saigon Textile JSC', 'Busan Precision Parts Co.', 'Siam Rubber Industries', 'Klang Furniture Sdn Bhd', 'Mumbai Agro Exports Pvt Ltd', 'Hamburg Maschinenbau GmbH', 'Rotterdam Fresh Trading BV', 'Pacific Home Goods Inc.', 'Gulf Trading LLC', 'Sydney Wholesale Pty Ltd'];
export const VESSELS = ['MAERSK EINDHOVEN', 'MSC GULSUN', 'CMA CGM JACQUES SAADE', 'HMM ALGECIRAS', 'EVER ACE', 'ONE INNOVATION', 'COSCO SHIPPING UNIVERSE', 'HAPAG BERLIN EXPRESS'];

/** Truth data for a new RFQ on one of the tenant's lanes. */
export function makeShipmentTruth(rng, laneDef, now) {
  const [origin, destination, mode] = laneDef;
  const commodity = rng.pick(COMMODITIES);
  const base = { mode, origin, destination, commodity, incoterm: rng.pick(['FOB', 'FOB', 'EXW', 'CIF', 'DAP', 'FCA', 'DDP']), hazardous: commodity.includes('Chemicals') ? false : rng.chance(0.05) };
  const ready = isoDate(now + rng.int(5, 30) * DAY);
  if (mode === 'SEA_FCL') {
    const containerType = rng.pick(['20GP', '40GP', '40HC', '40HC']);
    const containerCount = rng.pick([1, 1, 1, 2, 2, 3, 4]);
    const per = containerType.startsWith('20') ? rng.int(9000, 18000) : rng.int(12000, 24000);
    return { ...base, containerType, containerCount, weightKg: per * containerCount, volumeCbm: (containerType.startsWith('20') ? 28 : 62) * containerCount, packages: rng.int(10, 40) * containerCount, cargoReadyDate: ready };
  }
  if (mode === 'SEA_LCL') return { ...base, containerType: null, containerCount: null, weightKg: rng.int(800, 6500), volumeCbm: rng.int(3, 18), packages: rng.int(3, 14), cargoReadyDate: ready };
  if (mode === 'AIR') return { ...base, incoterm: rng.pick(['FCA', 'EXW', 'CPT', 'DAP']), containerType: null, containerCount: null, weightKg: rng.int(180, 2400), volumeCbm: round2(rng.range(1, 9)), packages: rng.int(2, 18), cargoReadyDate: ready };
  return { ...base, containerType: null, containerCount: null, weightKg: rng.int(6000, 22000), volumeCbm: rng.int(20, 80), packages: rng.int(10, 33), cargoReadyDate: ready };
}

const fmtDate = (isoD, style) => {
  const d = new Date(`${isoD}T00:00:00Z`);
  const mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  if (style === 'dmy') return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  if (style === 'short') return `${d.getUTCDate()} ${mon}`;
  return `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}`;
};
const pn = (code) => portByCode[code]?.name || code;
const cargoLine = (t) => (t.mode === 'SEA_FCL' ? `${t.containerCount}x${t.containerType}` : t.mode === 'AIR' ? 'air shipment' : t.mode === 'ROAD' ? 'FTL truck' : 'LCL');

/**
 * Render the raw customer message for a channel. `omit` drops fields to create realistic gaps.
 * @returns {{subject, raw}} raw = {from, body} | {fileName, text} | {fileName, rows}
 */
export function renderRfq(channel, t, customer, rng, omit = []) {
  const has = (k) => !omit.includes(k);
  const w = t.weightKg >= 10000 && rng.chance(0.4) ? `${round2(t.weightKg / 1000)} tons` : `${t.weightKg.toLocaleString('en-US')} kg`;
  if (channel === 'whatsapp') {
    const parts = [`Hi ${rng.pick(['team', 'bro', 'pak', 'all'])}, pls quote ${cargoLine(t)} ${pn(t.origin)} to ${pn(t.destination)}`];
    if (has('commodity')) parts.push(`${t.commodity.toLowerCase()}`);
    if (has('weightKg')) parts.push(`approx ${w}`);
    if (t.mode !== 'SEA_FCL' && has('volumeCbm')) parts.push(`${t.volumeCbm} cbm`);
    if (has('incoterm')) parts.push(`term ${t.incoterm}`);
    if (has('cargoReadyDate')) parts.push(`cargo ready ${fmtDate(t.cargoReadyDate, 'short')}`);
    return { subject: `WhatsApp from ${customer.contact}`, raw: { from: customer.whatsapp, body: `${parts.join(', ')}. ${rng.pick(['tq', 'thanks!', 'urgent pls 🙏', 'need by today'])}` } };
  }
  if (channel === 'excel') {
    const row = { Origin: pn(t.origin), Destination: pn(t.destination), Mode: MODES[t.mode].label };
    if (t.containerType) row.Equipment = `${t.containerCount}x${t.containerType}`;
    if (has('commodity')) row.Commodity = t.commodity;
    if (has('weightKg')) row['Gross weight'] = `${t.weightKg} kg`;
    if (has('volumeCbm')) row.Volume = `${t.volumeCbm} cbm`;
    row.Packages = `${t.packages} pallets`;
    if (has('incoterm')) row.Incoterm = t.incoterm;
    if (has('cargoReadyDate')) row['Cargo ready'] = t.cargoReadyDate;
    return { subject: `Tender sheet — ${customer.name}`, raw: { fileName: `${customer.short}_rate_request_${t.cargoReadyDate.slice(5, 7)}.xlsx`, rows: [row] } };
  }
  if (channel === 'pdf') {
    const lines = [
      `REQUEST FOR QUOTATION — ${customer.name.toUpperCase()}`,
      `Port of loading: ${pn(t.origin)}`,
      `Port of discharge: ${pn(t.destination)}`,
      t.containerType ? `Equipment: ${t.containerCount} x ${t.containerType}` : `Service: ${MODES[t.mode].label}`,
      has('commodity') ? `Commodity: ${t.commodity}` : 'Commodity: see attached PO',
      has('weightKg') ? `Gross weight: ${w}` : null,
      has('volumeCbm') ? `Measurement: ${t.volumeCbm} cbm` : null,
      `Packing: ${t.packages} pallets`,
      has('incoterm') ? `Incoterms 2020: ${t.incoterm}` : null,
      has('cargoReadyDate') ? `Cargo ready date: ${fmtDate(t.cargoReadyDate, 'dmy')}` : null,
      t.hazardous ? 'DG cargo: UN1993 class 3' : 'Non-DG general cargo',
    ].filter(Boolean);
    return { subject: `RFQ PDF from ${customer.name}`, raw: { fileName: `RFQ_${customer.short}_${Math.floor(rng() * 9000 + 1000)}.pdf`, pages: 1, text: lines.join('\n') } };
  }
  const body = [
    `Dear ${rng.pick(['team', 'Sir/Madam', 'all'])},`,
    '',
    `Please quote your best rate for ${cargoLine(t)} from ${pn(t.origin)} to ${pn(t.destination)}.`,
    has('commodity') ? `Commodity: ${t.commodity}${t.hazardous ? ' (DG, UN1993 class 3)' : ', non-DG'}` : '',
    has('weightKg') ? `Gross weight ${w}${t.mode !== 'SEA_FCL' && has('volumeCbm') ? `, ${t.volumeCbm} cbm` : ''}, ${t.packages} pallets.` : `${t.packages} pallets.`,
    has('incoterm') ? `Terms: ${t.incoterm}.` : '',
    has('cargoReadyDate') ? `Cargo ready ${fmtDate(t.cargoReadyDate, 'long')}.` : 'Cargo ready date to be advised.',
    '',
    'Please include transit time and free time at destination.',
    '',
    `Best regards,\n${customer.contact}\n${customer.name}`,
  ].filter((l) => l !== '').join('\n');
  const subject = `RFQ: ${cargoLine(t)} ${pn(t.origin)} - ${pn(t.destination)}`;
  return { subject, raw: { from: customer.email, body } };
}

/** Text the extractor reads for a raw RFQ. */
export const rawText = (raw) => (raw.rows ? raw.rows : raw.text || raw.body || '');

/** Carrier/agent rate reply (buy rates). */
export function makeReply(rng, data, partner, currency, now) {
  const fx = FX[currency] || 1;
  const k = lane(data.origin, data.destination);
  const factor = rng.range(0.86, 1.18) * (partner.priceFactor || 1);
  const count = data.containerCount || 1;
  const charges = [];
  const add = (code, amount) => charges.push({ code, desc: CHARGE_CODES[code], amount: round2(amount * fx) });
  if (data.mode === 'SEA_FCL') {
    const per = (FCL_BASE[k] || 1400) * (String(data.containerType).startsWith('20') ? 0.62 : 1) * factor;
    add('FRT', Math.round(per) * count);
    add('BAF', Math.round(rng.range(110, 210)) * count);
    add('THO', 125 * count);
    add('THD', 145 * count);
    add('DOC', 45);
  } else if (data.mode === 'SEA_LCL') {
    const cbm = Math.max(1, data.volumeCbm || 1);
    add('FRT', Math.round(rng.range(38, 72) * factor) * cbm);
    add('THO', 14 * cbm);
    add('THD', 18 * cbm);
    add('DOC', 40);
    add('HDL', 35);
  } else if (data.mode === 'AIR') {
    const chargeable = Math.max(data.weightKg || 100, Math.round((data.volumeCbm || 0) * 167));
    add('AFR', round2(rng.range(2.4, 5.6) * factor * chargeable));
    add('FSC', round2(0.85 * chargeable));
    add('SSC', round2(0.16 * chargeable));
    add('DOC', 35);
    add('HDL', 55);
  } else {
    add('RFR', Math.round(rng.range(900, 1900) * factor));
    add('DOC', 30);
  }
  if (rng.chance(0.25)) add('CUS', 85);
  const total = round2(charges.reduce((a, c) => a + c.amount, 0));
  const baseTransit = data.mode === 'AIR' ? 3 : data.mode === 'ROAD' ? 2 : TRANSIT[k] || 20;
  const transitDays = Math.max(1, baseTransit + rng.int(-3, 6) + (partner.transitAdj || 0));
  const validUntil = isoDate(now + rng.int(10, 30) * DAY);
  const routing = data.mode === 'SEA_FCL' || data.mode === 'SEA_LCL' ? (rng.chance(0.5) ? 'Direct' : `via ${rng.pick(['Singapore', 'Port Klang', 'Busan', 'Colombo', 'Algeciras'])}`) : data.mode === 'AIR' ? rng.pick(['Direct flight', 'via HKG', 'via DXB']) : 'Direct';
  const rawText = `Dear partner,\nOur offer ${data.origin}-${data.destination}: ${charges.map((c) => `${c.code} ${currency} ${c.amount}`).join(', ')}. T/T ${transitDays} days ${routing.toLowerCase()}, free time ${data.mode.startsWith('SEA') ? '14 days' : 'n/a'}. Valid until ${validUntil}.\nRgds, ${partner.name}`;
  return { currency, charges, total, transitDays, validUntil, routing, freeTime: data.mode.startsWith('SEA') ? 14 : 0, rawText, parseConfidence: round2(rng.range(0.86, 0.99)) };
}

export const counterparty = (rng) => rng.pick(SUPPLIERS);

/** Extracted fields for a shipping document; `discrepancy` injects a realistic mismatch. */
export function makeDocFields(rng, type, s, discrepancy) {
  const f = {
    shipper: s.shipper,
    consignee: s.consignee,
    origin: s.origin,
    destination: s.destination,
    commodity: s.commodity,
    packages: s.packages,
    weightKg: s.weightKg,
    volumeCbm: s.volumeCbm,
    incoterm: s.incoterm,
    containerNo: s.containerNo,
    vessel: s.vessel,
    invoiceValue: Math.round((s.weightKg || 1000) * rng.range(2, 9)),
  };
  // Harmless formatting variations the validator must tolerate.
  if (rng.chance(0.5) && f.consignee) f.consignee = f.consignee.toUpperCase();
  if (rng.chance(0.3) && f.shipper) f.shipper = f.shipper.replace(/\.$/, '') + (/(Ltd|Co\.?|GmbH|Inc\.?)$/.test(f.shipper) ? '' : ' Ltd');
  if (discrepancy) {
    const options = {
      CI: ['packages', 'consignee', 'incoterm'],
      PL: ['weightKg', 'packages', 'volumeCbm'],
      BL: ['containerNo', 'weightKg', 'consignee', 'destination', 'vessel'],
    }[type];
    const key = rng.pick(options);
    if (key === 'weightKg') f.weightKg = Math.round(s.weightKg * rng.pick([0.94, 1.04, 1.08]));
    if (key === 'packages') f.packages = s.packages + rng.pick([-2, 1, 3]);
    if (key === 'volumeCbm') f.volumeCbm = round2((s.volumeCbm || 1) * 1.12);
    if (key === 'consignee') f.consignee = rng.pick(['Global Import Partners BV', 'Eastline Trading Pte Ltd', 'Northstar Retail LLC']);
    if (key === 'incoterm') f.incoterm = s.incoterm === 'FOB' ? 'CIF' : 'FOB';
    if (key === 'destination') f.destination = s.destination === 'NLRTM' ? 'BEANR' : s.destination === 'USLAX' ? 'USSAV' : 'SGSIN';
    if (key === 'vessel') f.vessel = rng.pick(VESSELS.filter((v) => v !== s.vessel));
    if (key === 'containerNo' && s.containerNo) f.containerNo = s.containerNo.slice(0, 4) + s.containerNo.slice(4).split('').reverse().join('');
  }
  return f;
}

/** Carrier invoice lines; variant: 'exact' | 'small' | 'over' | 'extra'. */
export function makeApLines(rng, expected, variant) {
  const lines = expected.map((l) => ({ code: l.code, desc: l.desc, amount: l.amount }));
  if (variant === 'small' && lines[0]) lines[0].amount = round2(lines[0].amount * 1.01);
  if (variant === 'over') {
    const target = lines.find((l) => ['BAF', 'FSC', 'THD'].includes(l.code)) || lines[0];
    target.amount = round2(target.amount * rng.pick([1.25, 1.4, 1.6]));
  }
  if (variant === 'extra') {
    const code = rng.pick(['DEM', 'STO']);
    lines.push({ code, desc: CHARGE_CODES[code], amount: rng.int(3, 9) * 95 });
  }
  return lines;
}

export const containerNo = (rng, scac) => `${(scac || 'MSKU').slice(0, 3)}U${rng.int(1000000, 9999999)}`;

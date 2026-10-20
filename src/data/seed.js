// Mock data builder. All dates are relative to "today" so the demo always looks current.
import { addDays, todayISO, weekday } from '../lib/dates.js';
import { calcProposal } from '../lib/pricing.js';
import { generatePaymentSchedule, renderTemplate } from '../lib/contracts.js';
import { generateTasks } from '../lib/tasks.js';
import { round2 } from '../lib/money.js';
import {
  COMPANY, FX_RATES_TO_USD, JURISDICTIONS, CATALOG, PAYMENT_SCHEDULES, CANCELLATION_POLICIES, CONTRACT_TEMPLATES,
  EVENT_TYPES, LEAD_SOURCES, EMAIL_TEMPLATES, AUTOMATIONS, ACCOUNT_MAPPING,
} from './config.js';

let n = 0;
const id = (p) => `${p}_${(++n).toString(36).padStart(3, '0')}`;

function saturdayNear(today, days) {
  let d = addDays(today, days);
  while (weekday(d) !== 6) d = addDays(d, 1);
  return d;
}

function line(catalogId, overrides = {}) {
  const c = CATALOG.find((x) => x.id === catalogId);
  return { id: id('ln'), catalogId, name: c.name, category: c.category, pricing: c.pricing, unitPrice: c.unitPrice ?? 0, unitCost: c.unitCost ?? 0, qty: c.qty ?? 1, pct: c.pct ?? 0, costPct: c.costPct ?? 0, isServiceFee: !!c.isServiceFee, taxable: true, optional: false, selected: true, decorItemId: c.decorItemId ?? null, ...overrides };
}

function ts(today, daysOffset, hh = '10:00') {
  return new Date(`${addDays(today, daysOffset)}T${hh}:00`).toISOString();
}

const FIRST = ['Liam', 'Olivia', 'Noah', 'Emma', 'Oliver', 'Ava', 'Elijah', 'Sophia', 'James', 'Isabella', 'William', 'Mia', 'Benjamin', 'Charlotte', 'Lucas', 'Amelia', 'Henry', 'Harper', 'Theodore', 'Evelyn', 'Jack', 'Abigail', 'Levi', 'Ella', 'Mateo', 'Grace', 'Leo', 'Chloe', 'Ezra', 'Nora'];
const LAST = ['Smith', 'Johnson', 'Brown', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson', 'Anderson', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Young'];
const MEALS = ['Beef tenderloin', 'Sea bass', 'Wild mushroom risotto (V)'];
const DIETS = ['', '', '', '', 'Gluten-free', 'Nut allergy', 'Vegan', 'Shellfish allergy', 'Dairy-free'];

function buildHouseholds({ count, categories, subEventIds, rsvpMix = 0.75, today, withTables = [], seed = 1 }) {
  const households = [];
  let k = seed;
  for (let i = 0; i < count; i++) {
    const last = LAST[(i + seed) % LAST.length];
    const size = 1 + ((i * 7 + seed) % 3); // 1..3
    const cat = categories[i % categories.length];
    const invited = cat === 'Friends' ? subEventIds.slice(1) : subEventIds;
    const guests = [];
    for (let g = 0; g < size; g++) {
      k += 1;
      const isChild = size === 3 && g === 2;
      const responded = (i * 13 + g * 5) % 100 < rsvpMix * 100;
      const declined = responded && (i + g) % 9 === 0;
      const rsvp = {};
      invited.forEach((s) => (rsvp[s] = responded ? (declined ? 'no' : 'yes') : 'pending'));
      guests.push({
        id: id('g'),
        name: `${FIRST[(k * 3) % FIRST.length]} ${last}`,
        isChild,
        isPlusOne: false,
        meal: responded && !declined ? MEALS[k % MEALS.length] : '',
        dietary: DIETS[k % DIETS.length],
        accessibility: k % 17 === 0 ? 'Wheelchair access' : '',
        rsvp,
        tableId: responded && !declined && withTables.length ? withTables[(i) % withTables.length] : null,
        checkedIn: false,
      });
    }
    households.push({
      id: id('hh'),
      name: `The ${last} ${size > 1 ? 'Family' : ''}`.trim(),
      code: `${last.slice(0, 3).toUpperCase()}${(1000 + i * 37 + seed).toString().slice(-4)}`,
      category: cat,
      email: `${last.toLowerCase()}${i}@example.com`,
      invitedSubEventIds: invited,
      plusOnesAllowed: i % 5 === 0 ? 1 : 0,
      guests,
      respondedAt: guests.some((g) => Object.values(g.rsvp).some((r) => r !== 'pending')) ? ts(today, -((i % 20) + 1)) : null,
    });
  }
  return households;
}

function buildAttendees({ count, subEventIds, today, company }) {
  const cats = ['Attendee', 'Attendee', 'Attendee', 'VIP', 'Speaker', 'Sponsor'];
  return Array.from({ length: count }, (_, i) => {
    const name = `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
    const responded = i % 6 !== 0;
    const rsvp = {};
    subEventIds.forEach((s, si) => (rsvp[s] = responded ? (si === 3 && i % 4 === 0 ? 'no' : 'yes') : 'pending'));
    return {
      id: id('hh'),
      name,
      code: `REG${(5000 + i * 11).toString()}`,
      category: cats[i % cats.length],
      email: `${name.toLowerCase().replace(' ', '.')}@${company}`,
      invitedSubEventIds: subEventIds,
      plusOnesAllowed: 0,
      company: i % 5 === 0 ? 'Partner Co.' : company,
      guests: [{ id: id('g'), name, isChild: false, isPlusOne: false, meal: responded ? MEALS[i % 3] : '', dietary: DIETS[i % DIETS.length], accessibility: i % 23 === 0 ? 'Hearing loop' : '', rsvp, tableId: null, checkedIn: false }],
      respondedAt: responded ? ts(today, -(i % 15) - 1) : null,
    };
  });
}

function makeProposal({ version, status, lines, guestCount, jurisdictionId, currency, createdAt, validUntil, changeSummary, moodboard = [] }) {
  return { id: id('prop'), version, status, lines, guestCount, jurisdictionId, currency, createdAt, validUntil, changeSummary, moodboard, notes: '', acceptedAt: status === 'accepted' ? createdAt : null };
}

function makeContract({ ev, client, proposal, totals, signDate, signers, today, fullySigned = true }) {
  const et = EVENT_TYPES.find((t) => t.id === ev.eventTypeId);
  const ps = PAYMENT_SCHEDULES.find((p) => p.id === et.paymentScheduleId);
  const cp = CANCELLATION_POLICIES.find((p) => p.id === et.cancellationPolicyId);
  const schedule = generatePaymentSchedule({ total: totals.total, eventDate: ev.date, signDate, template: ps, idFn: id });
  const body = renderTemplate(CONTRACT_TEMPLATES[0].body, {
    sign_date: signDate,
    company_name: COMPANY.name,
    client_name: client.name,
    event_name: ev.name,
    event_date: ev.date,
    venue: ev.venue.name,
    guest_count: proposal.guestCount,
    total: totals.total.toFixed(2),
    currency: proposal.currency,
    proposal_version: `v${proposal.version}`,
    payment_schedule: schedule.map((s) => `   - ${s.label}: ${s.amount.toFixed(2)} due ${s.dueDate}`).join('\n'),
    cancellation_table: cp.rows.map((r) => `   - ${r.minDaysBefore}+ days before: ${r.forfeitPct}%`).join('\n'),
    postponement: cp.postponement,
    force_majeure: cp.forceMajeure,
    late_fee_pct: 1.5,
  });
  return {
    contract: {
      id: id('ctr'),
      templateId: 'ct_standard',
      proposalId: proposal.id,
      status: fullySigned ? 'signed' : 'sent',
      body,
      total: totals.total,
      originalTotal: totals.total,
      currency: proposal.currency,
      paymentScheduleId: ps.id,
      cancellationPolicyId: cp.id,
      lateFeePct: 1.5,
      signers: signers.map((s, i) => ({ id: id('sig'), ...s, signedAt: fullySigned || i === 0 ? new Date(`${signDate}T1${i}:00:00`).toISOString() : null, ip: fullySigned || i === 0 ? `73.21.4.${10 + i}` : null })),
      sentAt: new Date(`${signDate}T09:00:00`).toISOString(),
      signedAt: fullySigned ? new Date(`${signDate}T12:00:00`).toISOString() : null,
      immutable: fullySigned,
    },
    schedule,
  };
}

let invCounter = 1000;
function invoiceFor(item, ev, today, { paid = false, payerId = null, method = 'card', fx = 1 }) {
  invCounter += 1;
  const inv = {
    id: id('inv'),
    number: `INV-${invCounter}`,
    eventId: ev.id,
    kind: item.source === 'change_order' ? 'change_order' : 'installment',
    label: item.label,
    scheduleItemId: item.id,
    coId: item.coId ?? null,
    payerId,
    amount: item.amount,
    currency: ev.currency,
    fxRateToUSD: fx,
    issuedAt: addDays(item.dueDate, -14) < today ? addDays(item.dueDate, -14) : today,
    dueDate: item.dueDate,
    status: paid ? 'paid' : 'sent',
    lateFeeApplied: 0,
  };
  const payments = paid
    ? [{ id: id('pmt'), invoiceId: inv.id, eventId: ev.id, amount: item.amount, method, at: new Date(`${item.dueDate}T15:00:00`).toISOString(), ref: `pi_mock_${Math.random().toString(36).slice(2, 10)}`, payerId }]
    : [];
  item.status = paid ? 'paid' : 'invoiced';
  item.invoiceId = inv.id;
  return { inv, payments };
}

function emptyEventParts() {
  return {
    subEvents: [], proposals: [], contract: null, paymentSchedule: [], invoices: [], payments: [], creditNotes: [], gratuities: [],
    tasks: [], forms: [], design: { palette: [], notes: '', references: [], decorItemIds: [] }, documents: [], decisions: [], messages: [],
    rfqs: [], vendorBookings: [], households: [], tables: [], seatingRules: [], changeOrders: [],
    ros: { status: 'draft', version: 1, items: [], history: [] }, shifts: [], incidents: [], decorRequests: [], decorReturn: null,
    closing: { venueDepositReturned: false, surveySent: false, survey: null, reviewRequested: false, vendorRatingsDone: false, damageBilled: false },
    payers: [], clientBudget: {}, finalHeadcount: null, cancellation: null, postponements: [], interactions: [], accountingSync: [], approvals: [],
    positions: [], workers: [], production: { accessWindows: [], resources: [] }, sitePlan: { rooms: [] },
  };
}

function formsFor(et, answered = false) {
  const FIELDS = {
    'Music preferences': [{ key: 'first_dance', label: 'First dance song' }, { key: 'do_not_play', label: 'Do-not-play list' }, { key: 'genres', label: 'Preferred genres' }],
    'Family photo list': [{ key: 'groups', label: 'Photo groupings (one per line)', type: 'textarea' }],
    'Emergency contacts': [{ key: 'name', label: 'Contact name' }, { key: 'phone', label: 'Phone' }],
    'Accessibility needs': [{ key: 'needs', label: 'Accessibility needs', type: 'textarea' }],
    'Speaker requirements': [{ key: 'speakers', label: 'Speakers & AV needs', type: 'textarea' }],
    'Brand guidelines upload': [{ key: 'link', label: 'Link to brand guidelines' }],
    'VIP list': [{ key: 'vips', label: 'VIP names', type: 'textarea' }],
    'Dietary & accessibility': [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    'Travel details': [{ key: 'notes', label: 'Arrival/departure info', type: 'textarea' }],
  };
  return et.forms.map((name, i) => ({
    id: id('form'),
    name,
    fields: FIELDS[name] ?? [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    answers: answered && i < 2 ? { first_dance: 'At Last — Etta James', do_not_play: 'Macarena, Chicken Dance', genres: 'Motown, 80s, Indie', groups: 'Couple + both parents\nCouple + siblings\nGrandparents', speakers: 'CEO keynote: lapel mic + clicker' } : {},
    submittedAt: answered && i < 2 ? new Date().toISOString() : null,
  }));
}

export function buildSeed() {
  n = 0;
  invCounter = 1000;
  const today = todayISO();

  // ---------- Users ----------
  const users = [
    { id: 'u_admin', name: 'Olivia Hart', role: 'admin', email: 'olivia@lumiere.events' },
    { id: 'u_sales', name: 'Marcus Reed', role: 'sales', email: 'marcus@lumiere.events' },
    { id: 'u_sales2', name: 'Sofia Lind', role: 'sales', email: 'sofia@lumiere.events' },
    { id: 'u_planner', name: 'Ava Chen', role: 'planner', email: 'ava@lumiere.events' },
    { id: 'u_planner2', name: 'Lucas Moreau', role: 'planner', email: 'lucas@lumiere.events' },
    { id: 'u_prod', name: 'Diego Santos', role: 'production', email: 'diego@lumiere.events' },
    { id: 'u_fin', name: 'Hannah Kim', role: 'finance', email: 'hannah@lumiere.events' },
    { id: 'u_crew', name: 'Jamal Brooks', role: 'crew', email: 'jamal@lumiere.events', staffId: 'st_jamal' },
    { id: 'u_client1', name: 'Emily Carter', role: 'client', email: 'emily.carter@example.com', clientId: 'cl_carter', permissions: ['view_all', 'approve_costs', 'sign', 'pay', 'manage_guests', 'forms', 'message'] },
    { id: 'u_client2', name: 'Robert Carter (father)', role: 'client', email: 'robert.carter@example.com', clientId: 'cl_carter', permissions: ['pay', 'sign', 'message'], payerScope: ['Catering'] },
    { id: 'u_client3', name: 'Nina Patel (Acme EA)', role: 'client', email: 'nina@acmerobotics.com', clientId: 'cl_acme', permissions: ['manage_guests', 'forms', 'message'] },
    { id: 'u_client4', name: 'David Lee (Acme VP)', role: 'client', email: 'david.lee@acmerobotics.com', clientId: 'cl_acme', permissions: ['view_all', 'approve_costs', 'sign', 'pay', 'message', 'manage_guests', 'forms'] },
    { id: 'u_vendor1', name: 'Bloom & Vine (Florist)', role: 'vendor', email: 'hello@bloomvine.com', vendorId: 'vd_bloom' },
    { id: 'u_vendor2', name: 'SoundWave AV', role: 'vendor', email: 'ops@soundwave.av', vendorId: 'vd_soundwave' },
    { id: 'u_vendor3', name: 'StaffPro Events (agency)', role: 'vendor', email: 'booking@staffpro.events', vendorId: 'vd_staffpro' },
  ];

  // ---------- Clients ----------
  const clients = [
    { id: 'cl_carter', name: 'Emily Carter & James Walker', type: 'individual', email: 'emily.carter@example.com', phone: '+1 212 555 0101', country: 'US', decisionMakers: ['Emily Carter (bride)', 'James Walker (groom)', 'Robert & Linda Carter (parents, paying catering)'] },
    { id: 'cl_acme', name: 'Acme Robotics Inc.', type: 'company', email: 'events@acmerobotics.com', phone: '+1 310 555 0144', country: 'US', vatId: '', billingAddress: '1 Innovation Way, Los Angeles, CA', decisionMakers: ['David Lee (VP Marketing, approver)', 'Karen Wu (Procurement, PO)', 'Nina Patel (EA, logistics)'] },
    { id: 'cl_nordlicht', name: 'Nordlicht GmbH', type: 'company', email: 'events@nordlicht.de', phone: '+49 30 5550 1122', country: 'DE', vatId: 'DE298765432', billingAddress: 'Friedrichstraße 100, Berlin', decisionMakers: ['Anja Weber (Chief of Staff)', 'Procurement'] },
    { id: 'cl_laurent', name: 'Sophie Laurent & Marc Dubois', type: 'individual', email: 'sophie.laurent@example.fr', phone: '+33 6 55 12 34 56', country: 'FR', decisionMakers: ['Sophie Laurent', 'Marc Dubois'] },
    { id: 'cl_harper', name: 'Diane Harper', type: 'individual', email: 'diane.harper@example.com', phone: '+1 305 555 0199', country: 'US', decisionMakers: ['Diane Harper'] },
    { id: 'cl_brightwave', name: 'Brightwave Media Ltd', type: 'company', email: 'studio@brightwave.co.uk', phone: '+44 20 5555 0188', country: 'GB', vatId: 'GB123456789', decisionMakers: ['Tom Hughes (CMO)'] },
    { id: 'cl_nguyen', name: 'Kim Nguyen & Alex Rivera', type: 'individual', email: 'kim.nguyen@example.com', phone: '+1 512 555 0177', country: 'US', decisionMakers: ['Kim Nguyen', 'Alex Rivera'] },
    { id: 'cl_okafor', name: 'Grace Okafor', type: 'individual', email: 'grace.okafor@example.com', phone: '+1 917 555 0133', country: 'US', decisionMakers: ['Grace Okafor'] },
    { id: 'cl_stellar', name: 'Stellar Bank N.A.', type: 'company', email: 'events@stellarbank.com', phone: '+1 212 555 0190', country: 'US', decisionMakers: ['Patricia Gomez (Events Director)', 'Finance Committee'] },
    { id: 'cl_moss', name: 'Ethan Moss', type: 'individual', email: 'ethan.moss@example.com', phone: '+1 646 555 0111', country: 'US', decisionMakers: ['Ethan Moss'] },
    { id: 'cl_rossi', name: 'Giulia Rossi', type: 'individual', email: 'giulia.rossi@example.it', phone: '+39 02 5555 1234', country: 'IT', decisionMakers: ['Giulia Rossi'] },
  ];

  // ---------- Vendors ----------
  const vendors = [
    { id: 'vd_bloom', name: 'Bloom & Vine', category: 'Florist', regions: ['New York', 'New Jersey'], priceRange: '$$$', rating: 4.8, country: 'US', contact: 'Hannah Bloom', phone: '+1 212 555 0300', email: 'hello@bloomvine.com', coiExpiry: addDays(today, 18), licenses: [], w9: true, commissionPct: 0, notes: 'Signature garden style. Needs 4h setup.', performance: [] },
    { id: 'vd_gourmet', name: 'Gourmet Table Catering', category: 'Catering', regions: ['New York'], priceRange: '$$$', rating: 4.6, country: 'US', contact: 'Paolo Ricci', phone: '+1 212 555 0311', email: 'events@gourmettable.com', coiExpiry: addDays(today, 200), licenses: [{ name: 'NY Liquor License (caterer)', expiry: addDays(today, 150) }], w9: true, commissionPct: 0, notes: 'Min guarantee 120 guests on Saturdays.', performance: [] },
    { id: 'vd_lens', name: 'Lens & Light Studio', category: 'Photographer', regions: ['New York', 'Boston'], priceRange: '$$$', rating: 4.9, country: 'US', contact: 'Mia Torres', phone: '+1 917 555 0322', email: 'book@lenslight.com', coiExpiry: addDays(today, 90), licenses: [], w9: true, commissionPct: 10, notes: 'Pays 10% referral fee.', performance: [] },
    { id: 'vd_groove', name: 'Groove Collective (DJ/Band)', category: 'Band/DJ', regions: ['New York', 'Florida'], priceRange: '$$', rating: 4.5, country: 'US', contact: 'Andre Hill', phone: '+1 646 555 0333', email: 'andre@groove.live', coiExpiry: addDays(today, -5), licenses: [], w9: false, commissionPct: 5, notes: 'COI expired — chase renewal. W-9 missing.', performance: [] },
    { id: 'vd_soundwave', name: 'SoundWave AV', category: 'AV', regions: ['California', 'Nevada'], priceRange: '$$$', rating: 4.7, country: 'US', contact: 'Ken Ito', phone: '+1 310 555 0344', email: 'ops@soundwave.av', coiExpiry: addDays(today, 120), licenses: [], w9: true, commissionPct: 0, notes: 'Full LED walls; union labor in LA.', performance: [] },
    { id: 'vd_pacific', name: 'Pacific Hall Convention Center', category: 'Venue', regions: ['California'], priceRange: '$$$$', rating: 4.4, country: 'US', contact: 'Rachel Stone', phone: '+1 310 555 0355', email: 'sales@pacifichall.com', coiExpiry: addDays(today, 300), licenses: [], w9: true, commissionPct: 8, notes: 'Curfew 23:00. F&B minimum applies.', performance: [] },
    { id: 'vd_harbor', name: 'Harbor Shuttles', category: 'Transportation', regions: ['New York', 'California'], priceRange: '$$', rating: 4.2, country: 'US', contact: 'Sam Patel', phone: '+1 718 555 0366', email: 'dispatch@harborshuttles.com', coiExpiry: addDays(today, 25), licenses: [{ name: 'DOT Operating Authority', expiry: addDays(today, 400) }], w9: true, commissionPct: 0, notes: '', performance: [] },
    { id: 'vd_mixology', name: 'Mixology Bar Co.', category: 'Bartending', regions: ['New York', 'Florida'], priceRange: '$$', rating: 4.3, country: 'US', contact: 'Lena Ford', phone: '+1 305 555 0377', email: 'lena@mixology.co', coiExpiry: addDays(today, 60), licenses: [{ name: 'Alcohol server permit (TIPS)', expiry: addDays(today, 12) }], w9: true, commissionPct: 0, notes: 'TIPS certification renewal due.', performance: [] },
    { id: 'vd_chateau', name: 'Château de la Lune', category: 'Venue', regions: ['Provence', 'Côte d’Azur'], priceRange: '$$$$', rating: 4.9, country: 'FR', contact: 'Claire Martin', phone: '+33 4 55 55 12 12', email: 'events@chateaulune.fr', coiExpiry: addDays(today, 365), licenses: [], w9: false, commissionPct: 10, notes: 'Exclusive-use weekends. EU vendor — no W-9 needed.', performance: [] },
    { id: 'vd_paris', name: 'Maison Traiteur Paris', category: 'Catering', regions: ['Paris', 'Île-de-France'], priceRange: '$$$', rating: 4.7, country: 'FR', contact: 'Julien Bernard', phone: '+33 1 55 55 34 34', email: 'contact@maisontraiteur.fr', coiExpiry: addDays(today, 180), licenses: [], w9: false, commissionPct: 0, notes: '', performance: [] },
    { id: 'vd_london', name: 'Thames Production House', category: 'AV', regions: ['London'], priceRange: '$$$', rating: 4.6, country: 'GB', contact: 'Oliver Grant', phone: '+44 20 5555 0199', email: 'hello@thamesph.co.uk', coiExpiry: addDays(today, 140), licenses: [], w9: false, commissionPct: 0, notes: '', performance: [] },
    { id: 'vd_shield', name: 'Shield Event Security', category: 'Security', regions: ['New York', 'California'], priceRange: '$$', rating: 4.5, country: 'US', contact: 'Marcus Webb', phone: '+1 212 555 0410', email: 'dispatch@shieldevents.com', coiExpiry: addDays(today, 210), licenses: [{ name: 'NY Security Guard Company License', expiry: addDays(today, 300) }], w9: true, commissionPct: 0, notes: 'Licensed guards; 4h minimum call.', performance: [], staffingAgency: true },
    { id: 'vd_staffpro', name: 'StaffPro Events', category: 'Staffing agency', regions: ['New York', 'California', 'Florida'], priceRange: '$$', rating: 4.2, country: 'US', contact: 'Jenna Cole', phone: '+1 646 555 0420', email: 'booking@staffpro.events', coiExpiry: addDays(today, 150), licenses: [], w9: true, commissionPct: 0, notes: 'Registration, coat check, valet, brand ambassadors. Bills booked headcount.', performance: [], staffingAgency: true },
    { id: 'vd_miamiflor', name: 'Coral Petals Miami', category: 'Florist', regions: ['Florida'], priceRange: '$$', rating: 4.1, country: 'US', contact: 'Rosa Diaz', phone: '+1 305 555 0388', email: 'rosa@coralpetals.com', coiExpiry: addDays(today, 75), licenses: [], w9: true, commissionPct: 0, notes: '', performance: [] },
  ];

  // ---------- Staff ----------
  const staff = [
    { id: 'st_ava', userId: 'u_planner', name: 'Ava Chen', type: 'employee', skills: ['Lead planner', 'Weddings'], rate: 55, rateType: 'hourly', region: 'New York', laborRegion: 'US-NY', phone: '+1 212 555 0901' },
    { id: 'st_lucas', userId: 'u_planner2', name: 'Lucas Moreau', type: 'employee', skills: ['Lead planner', 'Corporate', 'French'], rate: 48, rateType: 'hourly', region: 'Paris', laborRegion: 'EU', phone: '+33 6 55 90 90 90' },
    { id: 'st_diego', userId: 'u_prod', name: 'Diego Santos', type: 'employee', skills: ['Production', 'Load-in', 'Rigging'], rate: 50, rateType: 'hourly', region: 'New York', laborRegion: 'US-NY', phone: '+1 212 555 0902' },
    { id: 'st_jamal', userId: 'u_crew', name: 'Jamal Brooks', type: 'freelancer', skills: ['Day-of coordinator'], rate: 450, rateType: 'event', region: 'New York', laborRegion: 'US-NY', phone: '+1 646 555 0903' },
    { id: 'st_priya', name: 'Priya Shah', type: 'freelancer', skills: ['Registration desk', 'Guest services'], rate: 32, rateType: 'hourly', region: 'Los Angeles', laborRegion: 'US-CA', phone: '+1 310 555 0904' },
    { id: 'st_tom', name: 'Tom Becker', type: 'freelancer', skills: ['Stagehand', 'Load-in'], rate: 30, rateType: 'hourly', region: 'Los Angeles', laborRegion: 'US-CA', phone: '+1 310 555 0905' },
    { id: 'st_maria', name: 'Maria Lopez', type: 'freelancer', skills: ['Florals assistant', 'Setup'], rate: 28, rateType: 'hourly', region: 'New York', laborRegion: 'US-NY', phone: '+1 917 555 0906' },
    { id: 'st_chloe', name: 'Chloé Petit', type: 'freelancer', skills: ['Coordinator', 'French', 'English'], rate: 35, rateType: 'hourly', region: 'Provence', laborRegion: 'EU', phone: '+33 6 55 11 22 33' },
    { id: 'st_sam', name: 'Sam O’Neil', type: 'employee', skills: ['Production assistant'], rate: 27, rateType: 'hourly', region: 'London', laborRegion: 'UK', phone: '+44 7700 555 012' },
    { id: 'st_rina', name: 'Rina Alvarez', type: 'freelancer', skills: ['Day-of coordinator', 'Spanish'], rate: 400, rateType: 'event', region: 'Miami', laborRegion: 'US-FL', phone: '+1 305 555 0907' },
  ];

  const settings = {
    company: COMPANY,
    fxRates: FX_RATES_TO_USD,
    jurisdictions: JURISDICTIONS,
    catalog: CATALOG,
    paymentSchedules: PAYMENT_SCHEDULES,
    cancellationPolicies: CANCELLATION_POLICIES,
    contractTemplates: CONTRACT_TEMPLATES,
    eventTypes: EVENT_TYPES,
    leadSources: LEAD_SOURCES,
    emailTemplates: EMAIL_TEMPLATES,
    automations: AUTOMATIONS,
    accountMapping: ACCOUNT_MAPPING,
    capacity: { default: 1, byWeekday: { 5: 2, 6: 2, 0: 1 }, plannerBased: true },
    holdExpiryDays: 7,
    holdReminderDays: 2,
    proposalValidityDays: 21,
    lateFeePct: 1.5,
    finalHeadcountDays: 14,
    rsvpDeadlineDays: 30,
    accountingProvider: 'quickbooks',
    counters: { invoice: 2000, changeOrder: 100, creditNote: 500 },
  };

  const events = [];
  const holds = [];
  const ctxTax = { jurisdictions: JURISDICTIONS, companyCountry: COMPANY.country };
  const totalsOf = (p, client) => calcProposal(p, { ...ctxTax, client, companyCountry: JURISDICTIONS.find((j) => j.id === p.jurisdictionId)?.region === 'US' ? COMPANY.country : COMPANY.euVatCountry });

  // ===== 1. Carter–Walker Wedding (planning, locked, rich data) =====
  {
    const date = saturdayNear(today, 75);
    const ev = { id: 'ev_carter', name: 'Carter–Walker Wedding', eventTypeId: 'wedding', segment: 'social', clientId: 'cl_carter', date, dateStatus: 'locked', stage: 'planning', source: 'The Knot', plannerId: 'u_planner', salesId: 'u_sales', guestCount: 150, budget: 120000, currency: 'USD', jurisdictionId: 'US-NY-NYC', probability: 100, createdAt: ts(today, -160), venue: { name: 'The Glasshouse Chelsea', address: '660 12th Ave, New York, NY 10019', parking: 'Valet at 12th Ave entrance; vendor loading dock on W 47th St', accessCode: 'Dock gate 4471#', emergencyContact: 'Venue manager: Carla — +1 212 555 0700', nearestHospital: 'Mount Sinai West — 1000 10th Ave (1.2 mi)', curfew: '00:00' }, ...emptyEventParts() };
    ev.subEvents = [
      { id: 'se_c1', name: 'Welcome Dinner', date: addDays(date, -1), venue: 'Rooftop Terrace', room: 'Terrace', start: '19:00', end: '22:00', guestCount: 60 },
      { id: 'se_c2', name: 'Ceremony', date, venue: 'The Glasshouse Chelsea', room: 'Garden Room', start: '16:00', end: '16:45', guestCount: 150 },
      { id: 'se_c3', name: 'Cocktail Hour', date, venue: 'The Glasshouse Chelsea', room: 'Gallery', start: '16:45', end: '18:00', guestCount: 150 },
      { id: 'se_c4', name: 'Reception', date, venue: 'The Glasshouse Chelsea', room: 'Grand Hall', start: '18:00', end: '23:30', guestCount: 150 },
      { id: 'se_c5', name: 'Farewell Brunch', date: addDays(date, 1), venue: 'Hotel Hugo', room: 'Bistro', start: '10:00', end: '12:30', guestCount: 50 },
    ];
    const baseLines = () => [
      line('svc_planning'), line('svc_design'), line('svc_catering'), line('svc_bar'), line('svc_cake'), line('svc_chairs'),
      line('svc_tables'), line('svc_linen'), line('svc_arch'), line('svc_florals'), line('svc_photo'), line('svc_band'),
      line('svc_photobooth', { optional: true, selected: true }), line('svc_sparkler', { optional: true, selected: false }), line('svc_gifts', { optional: true, selected: false }),
      line('svc_service'),
    ];
    const v1Lines = baseLines().map((l) => (l.catalogId === 'svc_band' ? { ...l, catalogId: 'svc_dj', name: 'DJ & MC', unitPrice: 2800, unitCost: 2000 } : l));
    const v1 = makeProposal({ version: 1, status: 'superseded', lines: v1Lines, guestCount: 140, jurisdictionId: 'US-NY-NYC', currency: 'USD', createdAt: ts(today, -150), validUntil: addDays(today, -129), changeSummary: 'Initial proposal' });
    const v2 = makeProposal({ version: 2, status: 'accepted', lines: baseLines(), guestCount: 150, jurisdictionId: 'US-NY-NYC', currency: 'USD', createdAt: ts(today, -140), validUntil: addDays(today, -119), changeSummary: 'Upgraded DJ → live band; guest count 140 → 150; photo booth selected', moodboard: ['dec_1', 'dec_5', 'dec_9', 'dec_7', 'dec_11'] });
    ev.proposals = [v1, v2];
    const client = clients[0];
    const totals = totalsOf(v2, client);
    const signDate = addDays(today, -135);
    const { contract, schedule } = makeContract({ ev, client, proposal: v2, totals, signDate, today, signers: [
      { name: 'Emily Carter', email: client.email, role: 'Client (bride)' },
      { name: 'James Walker', email: 'james.walker@example.com', role: 'Client (groom)' },
      { name: 'Robert Carter', email: 'robert.carter@example.com', role: 'Payer (father of bride)' },
    ] });
    ev.contract = contract;
    ev.payers = [
      { id: 'py_couple', name: 'Emily & James', userId: 'u_client1', categories: ['Planning', 'Decor', 'Florals', 'Photo/Video', 'Entertainment', 'Other', 'Fees'] },
      { id: 'py_parents', name: 'Robert & Linda Carter', userId: 'u_client2', categories: ['Catering'] },
    ];
    ev.paymentSchedule = schedule;
    // deposit paid; second (T-90) already past due -> invoiced, paid; final scheduled.
    const r1 = invoiceFor(schedule[0], ev, today, { paid: true, payerId: 'py_couple', method: 'card' });
    const r2 = invoiceFor(schedule[1], ev, today, { paid: false, payerId: 'py_parents' });
    ev.invoices = [r1.inv, r2.inv];
    ev.payments = [...r1.payments];
    ev.clientBudget = { Planning: 18000, Venue: 0, Catering: 36000, Decor: 9000, Florals: 9000, Entertainment: 11000, 'Photo/Video': 6000, Fees: 15000, Other: 2000 };
    ev.tasks = generateTasks(EVENT_TYPES[0].taskTemplate, date, id).map((t) => ({ ...t, status: t.dueDate < today ? 'done' : t.dueDate < addDays(today, 20) ? 'in_progress' : 'todo', assigneeId: t.assigneeType === 'client' ? 'u_client1' : 'st_ava' }));
    ev.tasks.push({ id: id('task'), title: 'Submit final floral recipe & delivery schedule', offsetDays: -21, dueDate: addDays(date, -21), fixedDue: false, assigneeType: 'vendor', assigneeId: 'vd_bloom', status: 'todo', priority: 'high', dependsOn: [], category: 'vendors' });
    ev.forms = formsFor(EVENT_TYPES[0], true);
    ev.design = { palette: ['#9CAF88', '#F4ECD8', '#C9A227', '#E6A1B5', '#2F4F6F'], notes: 'Romantic garden glasshouse: sage, ivory and gold with blush accents. Candlelight heavy.', references: ['Pinterest board: carter-walker-garden', 'Florals: loose garden roses, ranunculus, olive branches'], decorItemIds: ['dec_1', 'dec_5', 'dec_6', 'dec_7', 'dec_9', 'dec_11'] };
    ev.documents = [
      { id: id('doc'), name: 'Venue contract — Glasshouse.pdf', type: 'Vendor contract', uploadedBy: 'u_planner', at: ts(today, -120) },
      { id: id('doc'), name: 'Floor plan v3.pdf', type: 'Floor plan', uploadedBy: 'u_prod', at: ts(today, -20) },
      { id: id('doc'), name: 'Venue COI naming Lumière.pdf', type: 'Insurance certificate', uploadedBy: 'u_planner', at: ts(today, -30), expiresAt: addDays(date, 30) },
      { id: id('doc'), name: 'Reception menu final.pdf', type: 'Menu', uploadedBy: 'u_planner', at: ts(today, -10) },
    ];
    ev.decisions = [
      { id: id('dec'), decision: 'Upgrade entertainment from DJ to 8-piece live band (+$6,700)', decidedBy: 'Emily Carter & James Walker', approvedAt: ts(today, -140), recordedBy: 'u_sales', reference: 'Proposal v2' },
      { id: id('dec'), decision: 'Ceremony moved indoors to Garden Room (rain plan becomes main plan)', decidedBy: 'Emily Carter', approvedAt: ts(today, -40), recordedBy: 'u_planner', reference: 'Meeting notes' },
      { id: id('dec'), decision: 'Menu: Beef / Sea bass / Risotto, no fish starter', decidedBy: 'Emily Carter, Linda Carter', approvedAt: ts(today, -12), recordedBy: 'u_planner', reference: 'Tasting' },
    ];
    ev.messages = [
      { id: id('msg'), from: 'u_client1', text: 'Hi Ava! Can we add sparklers for the exit? What would it cost?', at: ts(today, -6, '20:15') },
      { id: id('msg'), from: 'u_planner', text: 'Absolutely — I have sent you a Change Order for the sparkler send-off ($900 + tax). You can approve it in the portal.', at: ts(today, -5, '09:30') },
      { id: id('msg'), from: 'u_client2', text: 'Robert here — I will settle the catering invoice this week.', at: ts(today, -2, '11:02') },
    ];
    ev.interactions = [
      { id: id('int'), type: 'email', at: ts(today, -165), by: 'u_sales', summary: 'Inquiry via The Knot — 140 guests, NYC, spring/fall' },
      { id: id('int'), type: 'call', at: ts(today, -162), by: 'u_sales', summary: 'Discovery call, budget ~$120k, parents contributing catering' },
      { id: id('int'), type: 'meeting', at: ts(today, -150), by: 'u_sales', summary: 'Venue walkthrough at Glasshouse' },
    ];
    ev.vendorBookings = [
      { id: id('vb'), vendorId: 'vd_gourmet', category: 'Catering', service: 'Dinner + bar for 150', qty: 1, cost: 19800, sellPrice: 30000, model: 'pass_through', markupPct: 0, minGuarantee: 120, contractedGuests: 150, commissionPct: 0, commissionStatus: 'n/a', status: 'confirmed', loadIn: `${date}T12:00`, loadOut: `${addDays(date, 1)}T00:45`, onsiteContact: 'Paolo — +1 212 555 0311', payments: [{ id: id('vp'), label: 'Deposit 50%', dueDate: addDays(today, -60), amount: 9900, status: 'paid', paidAt: ts(today, -60), proofRef: 'ACH-77812' }, { id: id('vp'), label: 'Balance', dueDate: addDays(date, -7), amount: 9900, status: 'scheduled' }], vendorInvoices: [], confirmedAt: ts(today, -100) },
      { id: id('vb'), vendorId: 'vd_bloom', category: 'Florals', service: 'Ceremony arch florals, 15 centrepieces, bridal party', qty: 1, cost: 5600, sellPrice: 8500, model: 'pass_through', markupPct: 0, commissionPct: 0, commissionStatus: 'n/a', status: 'confirmed', loadIn: `${date}T10:00`, loadOut: `${addDays(date, 1)}T00:45`, onsiteContact: 'Hannah — +1 212 555 0300', payments: [{ id: id('vp'), label: 'Deposit', dueDate: addDays(today, -50), amount: 2800, status: 'paid', paidAt: ts(today, -50), proofRef: 'ACH-78001' }, { id: id('vp'), label: 'Balance', dueDate: addDays(date, -3), amount: 2800, status: 'scheduled' }], vendorInvoices: [], confirmedAt: ts(today, -90) },
      { id: id('vb'), vendorId: 'vd_lens', category: 'Photo/Video', service: 'Photography 8h, 2 shooters', qty: 1, cost: 4500, sellPrice: 6000, model: 'direct', markupPct: 0, commissionPct: 10, commissionAmount: 450, commissionStatus: 'pending', status: 'confirmed', loadIn: `${date}T14:00`, loadOut: `${date}T22:00`, onsiteContact: 'Mia — +1 917 555 0322', payments: [], vendorInvoices: [], confirmedAt: ts(today, -110) },
      { id: id('vb'), vendorId: 'vd_groove', category: 'Entertainment', service: '8-piece band + DJ sets', qty: 1, cost: 7500, sellPrice: 9500, model: 'pass_through', markupPct: 0, commissionPct: 5, commissionAmount: 375, commissionStatus: 'pending', status: 'requested', loadIn: `${date}T14:00`, loadOut: `${addDays(date, 1)}T00:45`, onsiteContact: 'Andre — +1 646 555 0333', payments: [{ id: id('vp'), label: 'Deposit', dueDate: addDays(today, 5), amount: 3750, status: 'scheduled' }], vendorInvoices: [] },
    ];
    const tables = Array.from({ length: 15 }, (_, i) => ({ id: `tb_c${i + 1}`, name: i === 0 ? 'Head Table' : `Table ${i}`, capacity: i === 0 ? 12 : 10, shape: i === 0 ? 'rect' : 'round' }));
    ev.tables = tables;
    ev.households = buildHouseholds({ count: 68, categories: ['Bride family', 'Groom family', 'Friends', 'VIP'], subEventIds: ['se_c1', 'se_c2', 'se_c3', 'se_c4', 'se_c5'], today, withTables: tables.slice(1).map((t) => t.id), seed: 3 });
    const g0 = ev.households[0].guests[0];
    const g1 = ev.households[4].guests[0];
    ev.seatingRules = [{ id: id('rule'), guestA: g0.id, guestB: g1.id, type: 'apart', note: 'Divorced — do not seat together' }];
    g1.tableId = g0.tableId; // deliberate violation for demo
    ev.changeOrders = [
      { id: id('co'), number: 'CO-101', title: 'Add late-night snack station', description: 'Sliders & fries station at 22:00 for 150 guests', lines: [{ name: 'Late-night snacks', category: 'Catering', amount: 2250, cost: 1500 }], costImpact: 2250, costImpactCost: 1500, taxImpact: round2(2250 * 0.08875), vendorImpact: 'Gourmet Table: +1 station, +2 servers', decorImpact: [], timelineImpact: 'Add 22:00 snack service to run of show', guestCountDelta: 0, isException: false, status: 'approved', createdAt: ts(today, -30), createdBy: 'u_planner', approvals: [{ by: 'u_client1', name: 'Emily Carter', at: ts(today, -28), method: 'signature', ip: '73.21.4.10' }], invoiced: false, appliedAt: ts(today, -28) },
      { id: id('co'), number: 'CO-102', title: 'Sparkler send-off', description: 'Add sparkler send-off at 23:15 (venue approved)', lines: [{ name: 'Sparkler Send-off', category: 'Other', amount: 900, cost: 400 }], costImpact: 900, costImpactCost: 400, taxImpact: round2(900 * 0.08875), vendorImpact: 'None — in-house', decorImpact: [], timelineImpact: 'Add 23:15 exit cue', guestCountDelta: 0, isException: false, status: 'sent', createdAt: ts(today, -5), createdBy: 'u_planner', approvals: [], invoiced: false },
    ];
    // contract total reflects approved CO-101
    const co101 = ev.changeOrders[0];
    ev.contract.total = round2(ev.contract.total + co101.costImpact + co101.taxImpact);
    ev.paymentSchedule.push({ id: id('pay'), label: 'Change Order CO-101', pct: null, dueDate: addDays(today, 7), amount: round2(co101.costImpact + co101.taxImpact), status: 'scheduled', invoiceId: null, source: 'change_order', coId: co101.id });
    ev.ros = {
      status: 'shared',
      version: 2,
      history: [{ version: 1, status: 'draft', at: ts(today, -20), by: 'u_planner' }, { version: 2, status: 'shared', at: ts(today, -4), by: 'u_planner' }],
      items: [
        { id: id('ros'), subEventId: 'se_c2', track: 'production', start: '10:00', duration: 120, activity: 'Florist load-in & arch install', location: 'Garden Room', ownerStaffId: 'st_diego', vendorIds: ['vd_bloom'], cue: '', notes: 'Dock 4', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c2', track: 'production', start: '12:00', duration: 180, activity: 'Catering load-in & kitchen setup', location: 'Kitchen', ownerStaffId: 'st_diego', vendorIds: ['vd_gourmet'], cue: '', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c2', track: 'production', start: '14:30', duration: 45, activity: 'Band sound check', location: 'Grand Hall', ownerStaffId: 'st_diego', vendorIds: ['vd_groove'], cue: 'Sound check', notes: 'Must finish before guests at 15:30', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c2', track: 'guest', start: '15:30', duration: 30, activity: 'Guest arrival & seating', location: 'Garden Room', ownerStaffId: 'st_jamal', vendorIds: [], cue: 'Prelude strings playlist', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c2', track: 'guest', start: '16:00', duration: 5, activity: 'Processional', location: 'Garden Room', ownerStaffId: 'st_jamal', vendorIds: ['vd_groove', 'vd_lens'], cue: 'Music: Canon in D', notes: 'Flower girl first', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c2', track: 'guest', start: '16:05', duration: 30, activity: 'Ceremony', location: 'Garden Room', ownerStaffId: 'st_ava', vendorIds: ['vd_lens'], cue: 'Mic: officiant lapel', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c3', track: 'guest', start: '16:45', duration: 75, activity: 'Cocktail hour + family photos', location: 'Gallery', ownerStaffId: 'st_jamal', vendorIds: ['vd_gourmet', 'vd_lens'], cue: 'Jazz trio set', notes: 'Photo list in forms', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c4', track: 'guest', start: '18:00', duration: 10, activity: 'Grand entrance', location: 'Grand Hall', ownerStaffId: 'st_ava', vendorIds: ['vd_groove'], cue: 'MC intro + spotlight', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c4', track: 'guest', start: '18:10', duration: 5, activity: 'First dance', location: 'Grand Hall', ownerStaffId: 'st_ava', vendorIds: ['vd_groove', 'vd_lens'], cue: 'Song: At Last — Etta James; lights dim', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c4', track: 'guest', start: '18:20', duration: 90, activity: 'Dinner service', location: 'Grand Hall', ownerStaffId: 'st_jamal', vendorIds: ['vd_gourmet'], cue: 'Background playlist', notes: 'Dietary meals flagged on escort cards', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c4', track: 'guest', start: '19:50', duration: 20, activity: 'Toasts', location: 'Grand Hall', ownerStaffId: 'st_ava', vendorIds: ['vd_groove'], cue: 'Mic handheld x2', notes: 'Father of bride, best man, maid of honor', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c4', track: 'guest', start: '20:10', duration: 170, activity: 'Dancing', location: 'Grand Hall', ownerStaffId: 'st_jamal', vendorIds: ['vd_groove'], cue: 'Band sets', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_c4', track: 'production', start: '23:30', duration: 60, activity: 'Load-out (venue curfew 00:00 for amplified sound)', location: 'Dock', ownerStaffId: 'st_diego', vendorIds: ['vd_groove', 'vd_bloom', 'vd_gourmet'], cue: '', notes: 'All decor back to truck', liveStatus: 'pending' },
      ],
    };
    ev.shifts = [
      { id: id('sh'), staffId: 'st_ava', role: 'Lead planner', date, start: '09:00', end: '23:59', confirmed: true },
      { id: id('sh'), staffId: 'st_jamal', role: 'Day-of coordinator', date, start: '12:00', end: '23:59', confirmed: true },
      { id: id('sh'), staffId: 'st_diego', role: 'Production lead', date, start: '09:30', end: '23:59', confirmed: true },
      { id: id('sh'), staffId: 'st_maria', role: 'Florals assistant', date, start: '10:00', end: '18:00', confirmed: false },
    ];
    ev.decorRequests = [
      { itemId: 'dec_1', qty: 150 }, { itemId: 'dec_3', qty: 15 }, { itemId: 'dec_5', qty: 15 }, { itemId: 'dec_9', qty: 1 }, { itemId: 'dec_7', qty: 30 }, { itemId: 'dec_11', qty: 6 },
    ];
    ev.finalHeadcount = null;
    events.push(ev);
  }

  // ===== 2. Acme Robotics Summit (corporate conference, details locked) =====
  {
    const date = addDays(today, 40);
    const ev = { id: 'ev_acme', name: 'Acme Robotics Annual Summit', eventTypeId: 'conference', segment: 'corporate', clientId: 'cl_acme', date, dateStatus: 'locked', stage: 'details_locked', source: 'Referral', plannerId: 'u_planner', salesId: 'u_sales2', guestCount: 300, budget: 260000, currency: 'USD', jurisdictionId: 'US-CA-LA', probability: 100, poNumber: 'PO-ACME-88412', createdAt: ts(today, -200), venue: { name: 'Pacific Hall Convention Center', address: '1201 S Figueroa St, Los Angeles, CA 90015', parking: 'Structure P2 validated; trucks via Pico Blvd dock', accessCode: 'Dock badge pickup at security', emergencyContact: 'Rachel Stone — +1 310 555 0355', nearestHospital: 'Good Samaritan Hospital — 1225 Wilshire Blvd (1.4 mi)', curfew: '23:00' }, ...emptyEventParts() };
    ev.subEvents = [
      { id: 'se_a1', name: 'Registration', date, venue: 'Pacific Hall', room: 'Lobby', start: '07:30', end: '09:00', guestCount: 300 },
      { id: 'se_a2', name: 'Opening Keynote', date, venue: 'Pacific Hall', room: 'Hall A', start: '09:00', end: '10:30', guestCount: 300 },
      { id: 'se_a3', name: 'Breakout Sessions', date, venue: 'Pacific Hall', room: 'Rooms 201–206', start: '11:00', end: '16:30', guestCount: 280 },
      { id: 'se_a4', name: 'Gala Dinner', date, venue: 'Pacific Hall', room: 'Ballroom', start: '19:00', end: '22:30', guestCount: 260 },
    ];
    const lines = [line('svc_planning', { unitPrice: 22000, unitCost: 8000 }), line('svc_venue', { unitPrice: 42000, unitCost: 38000, vendorId: 'vd_pacific' }), line('svc_catering', { unitPrice: 120, unitCost: 82 }), line('svc_av', { unitPrice: 48000, unitCost: 34000 }), line('svc_stream'), line('svc_reg'), line('svc_transport'), line('svc_gifts', { optional: true, selected: true }), line('svc_photo', { optional: true, selected: false }), line('svc_mgmt')];
    const v1 = makeProposal({ version: 1, status: 'accepted', lines, guestCount: 300, jurisdictionId: 'US-CA-LA', currency: 'USD', createdAt: ts(today, -180), validUntil: addDays(today, -159), changeSummary: 'Initial proposal' });
    ev.proposals = [v1];
    const client = clients[1];
    const totals = totalsOf(v1, client);
    const signDate = addDays(today, -170);
    const { contract, schedule } = makeContract({ ev, client, proposal: v1, totals, signDate, today, signers: [{ name: 'David Lee', email: 'david.lee@acmerobotics.com', role: 'VP Marketing (approver)' }, { name: 'Karen Wu', email: 'karen.wu@acmerobotics.com', role: 'Procurement' }] });
    ev.contract = contract;
    ev.paymentSchedule = schedule;
    ev.payers = [{ id: 'py_acme', name: 'Acme Robotics AP', userId: 'u_client4', categories: [] }];
    const r1 = invoiceFor(schedule[0], ev, today, { paid: true, payerId: 'py_acme', method: 'ach' });
    ev.invoices = [r1.inv];
    ev.payments = r1.payments;
    ev.approvals = [
      { id: id('apr'), step: 'Budget owner', by: 'David Lee', at: ts(today, -172), status: 'approved' },
      { id: id('apr'), step: 'Procurement (PO issued)', by: 'Karen Wu', at: ts(today, -171), status: 'approved' },
      { id: id('apr'), step: 'Finance — balance invoice', by: 'Acme AP', at: null, status: 'pending' },
    ];
    ev.clientBudget = { Planning: 25000, Venue: 45000, Catering: 40000, AV: 60000, Registration: 5000, Transportation: 3000, Fees: 30000, Other: 12000 };
    ev.tasks = generateTasks(EVENT_TYPES[2].taskTemplate, date, id).map((t) => ({ ...t, status: t.dueDate < today ? 'done' : 'todo', assigneeId: t.assigneeType === 'client' ? 'u_client4' : 'st_ava' }));
    ev.forms = formsFor(EVENT_TYPES[2], true);
    ev.households = buildAttendees({ count: 48, subEventIds: ['se_a1', 'se_a2', 'se_a3', 'se_a4'], today, company: 'acmerobotics.com' });
    ev.finalHeadcount = 290;
    ev.vendorBookings = [
      { id: id('vb'), vendorId: 'vd_pacific', category: 'Venue', service: 'Hall A, Ballroom, 6 breakout rooms', qty: 1, cost: 38000, sellPrice: 42000, model: 'pass_through', markupPct: 10, minGuarantee: 250, contractedGuests: 300, commissionPct: 8, commissionAmount: 3040, commissionStatus: 'invoiced', status: 'confirmed', loadIn: `${addDays(date, -1)}T18:00`, loadOut: `${date}T23:00`, onsiteContact: 'Rachel — +1 310 555 0355', payments: [{ id: id('vp'), label: 'Deposit', dueDate: addDays(today, -150), amount: 19000, status: 'paid', paidAt: ts(today, -150), proofRef: 'WIRE-55120' }, { id: id('vp'), label: 'Balance', dueDate: addDays(date, -14), amount: 19000, status: 'scheduled' }], vendorInvoices: [], confirmedAt: ts(today, -160) },
      { id: id('vb'), vendorId: 'vd_soundwave', category: 'AV', service: 'LED wall, line array, 6 breakout AV kits, livestream', qty: 1, cost: 37100, sellPrice: 52800, model: 'pass_through', markupPct: 0, commissionPct: 0, commissionStatus: 'n/a', status: 'confirmed', loadIn: `${addDays(date, -1)}T20:00`, loadOut: `${date}T23:30`, onsiteContact: 'Ken — +1 310 555 0344', payments: [{ id: id('vp'), label: 'Deposit', dueDate: addDays(today, -40), amount: 18550, status: 'paid', paidAt: ts(today, -40), proofRef: 'ACH-80442' }, { id: id('vp'), label: 'Balance', dueDate: addDays(date, 15), amount: 18550, status: 'scheduled' }], vendorInvoices: [{ id: id('vi'), name: 'SW-2291 deposit.pdf', amount: 18550, at: ts(today, -42) }], confirmedAt: ts(today, -120) },
      { id: id('vb'), vendorId: 'vd_harbor', category: 'Transportation', service: 'Hotel shuttles x4, 07:00–23:30', qty: 1, cost: 1700, sellPrice: 2400, model: 'direct', markupPct: 0, commissionPct: 0, commissionStatus: 'n/a', status: 'confirmed', loadIn: `${date}T06:30`, loadOut: `${date}T23:30`, onsiteContact: 'Dispatch — +1 718 555 0366', payments: [], vendorInvoices: [] },
    ];
    ev.rfqs = [
      { id: id('rfq'), category: 'Photo/Video', description: 'Event photographer 07:30–22:30, same-day highlights edit', dueDate: addDays(today, 7), createdAt: ts(today, -6), vendorIds: ['vd_lens', 'vd_bloom'], responses: [{ vendorId: 'vd_lens', amount: 5800, notes: '2 shooters, 48h delivery', status: 'quoted', at: ts(today, -3) }], awardedVendorId: null },
    ];
    ev.ros = {
      status: 'final', version: 3,
      history: [{ version: 1, status: 'draft', at: ts(today, -40), by: 'u_planner' }, { version: 2, status: 'shared', at: ts(today, -15), by: 'u_planner' }, { version: 3, status: 'final', at: ts(today, -3), by: 'u_planner' }],
      items: [
        { id: id('ros'), subEventId: 'se_a1', track: 'production', start: '05:30', duration: 90, activity: 'Registration desk & badge printers setup', location: 'Lobby', ownerStaffId: 'st_priya', vendorIds: [], cue: '', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_a1', track: 'guest', start: '07:30', duration: 90, activity: 'Registration & breakfast', location: 'Lobby', ownerStaffId: 'st_priya', vendorIds: ['vd_pacific'], cue: 'Walk-in playlist', notes: 'QR scan check-in', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_a2', track: 'guest', start: '09:00', duration: 10, activity: 'Welcome & safety announcement', location: 'Hall A', ownerStaffId: 'st_ava', vendorIds: ['vd_soundwave'], cue: 'VOG + opener video', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_a2', track: 'guest', start: '09:10', duration: 50, activity: 'CEO keynote', location: 'Hall A', ownerStaffId: 'st_ava', vendorIds: ['vd_soundwave'], cue: 'Lapel mic 1, slides, livestream ON', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_a2', track: 'guest', start: '10:00', duration: 30, activity: 'Product demo', location: 'Hall A', ownerStaffId: 'st_tom', vendorIds: ['vd_soundwave'], cue: 'Robot cue — stage lift', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_a3', track: 'guest', start: '11:00', duration: 330, activity: 'Breakouts (6 tracks) + lunch 12:30', location: 'Rooms 201–206', ownerStaffId: 'st_priya', vendorIds: ['vd_soundwave', 'vd_pacific'], cue: '', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_a4', track: 'guest', start: '19:00', duration: 210, activity: 'Gala dinner & awards', location: 'Ballroom', ownerStaffId: 'st_ava', vendorIds: ['vd_pacific', 'vd_soundwave'], cue: 'Awards stingers', notes: '', liveStatus: 'pending' },
        { id: id('ros'), subEventId: 'se_a4', track: 'production', start: '22:30', duration: 60, activity: 'Load-out (curfew 23:00 public areas)', location: 'Dock', ownerStaffId: 'st_tom', vendorIds: ['vd_soundwave'], cue: '', notes: '', liveStatus: 'pending' },
      ],
    };
    ev.shifts = [
      { id: id('sh'), staffId: 'st_ava', role: 'Lead planner', date, start: '06:00', end: '23:00', confirmed: true },
      { id: id('sh'), staffId: 'st_priya', role: 'Registration lead', date, start: '05:30', end: '17:30', confirmed: true },
      { id: id('sh'), staffId: 'st_tom', role: 'Stagehand', date, start: '06:00', end: '23:30', confirmed: false },
    ];
    ev.changeOrders = [
      { id: id('co'), number: 'CO-103', title: 'Increase gala headcount +25', description: 'Add 25 partner guests to Gala Dinner after final guarantee', lines: [{ name: 'Catering +25 guests', category: 'Catering', amount: 3000, cost: 2050 }], costImpact: 3000, costImpactCost: 2050, taxImpact: 0, vendorImpact: 'Pacific Hall F&B: +25 covers (subject to kitchen approval)', decorImpact: [], timelineImpact: 'None', guestCountDelta: 25, isException: true, status: 'sent', createdAt: ts(today, -1), createdBy: 'u_planner', approvals: [], specialApproval: null, invoiced: false },
    ];
    ev.messages = [{ id: id('msg'), from: 'u_client3', text: 'Uploaded 12 more attendee registrations from our partner list.', at: ts(today, -1, '14:20') }];
    ev.decorRequests = [{ itemId: 'dec_13', qty: 12 }, { itemId: 'dec_12', qty: 40 }, { itemId: 'dec_14', qty: 4 }];
    events.push(ev);
  }

  // ===== 3. Nordlicht offsite Paris (negotiation, EUR, reverse charge) =====
  {
    const date = addDays(today, 120);
    const ev = { id: 'ev_nordlicht', name: 'Nordlicht Leadership Offsite — Paris', eventTypeId: 'offsite', segment: 'corporate', clientId: 'cl_nordlicht', date, dateStatus: 'hold', stage: 'negotiation', source: 'Email', plannerId: 'u_planner2', salesId: 'u_sales2', guestCount: 60, budget: 95000, currency: 'EUR', jurisdictionId: 'EU-FR', probability: 60, createdAt: ts(today, -25), venue: { name: 'Hôtel Particulier Montmartre', address: '23 Av. Junot, 75018 Paris', parking: 'Rue Caulaincourt public parking', accessCode: '', emergencyContact: '', nearestHospital: 'Hôpital Bichat (2.1 km)', curfew: '23:00' }, ...emptyEventParts() };
    ev.subEvents = [{ id: 'se_n1', name: 'Arrival & Welcome', date, venue: 'Hôtel Particulier', room: 'Salon', start: '15:00', end: '18:00', guestCount: 60 }, { id: 'se_n2', name: 'Workshops', date: addDays(date, 1), venue: 'Hôtel Particulier', room: 'Library', start: '09:00', end: '17:00', guestCount: 60 }, { id: 'se_n3', name: 'Team Dinner', date: addDays(date, 1), venue: 'Le Grand Véfour', room: 'Private room', start: '20:00', end: '23:00', guestCount: 60 }];
    const mk = (v, extra = {}) => [line('svc_planning', { unitPrice: 9000, unitCost: 3500 }), line('svc_venue', { unitPrice: 16000 + extra.venue, unitCost: 13500 }), line('svc_catering', { unitPrice: 160, unitCost: 112 }), line('svc_transport', { unitPrice: 2200, unitCost: 1500 }), line('svc_av', { unitPrice: 6500, unitCost: 4200 }), line('svc_gifts', { optional: true, selected: v > 1 }), line('svc_photo', { optional: true, selected: false, unitPrice: 3200, unitCost: 2300 }), line('svc_mgmt', { pct: v > 1 ? 12 : 15 })];
    ev.proposals = [
      makeProposal({ version: 1, status: 'superseded', lines: mk(1, { venue: 2000 }), guestCount: 60, jurisdictionId: 'EU-FR', currency: 'EUR', createdAt: ts(today, -20), validUntil: addDays(today, 1), changeSummary: 'Initial proposal' }),
      makeProposal({ version: 2, status: 'active', lines: mk(2, { venue: 0 }), guestCount: 60, jurisdictionId: 'EU-FR', currency: 'EUR', createdAt: ts(today, -4), validUntil: addDays(today, 17), changeSummary: 'Negotiated: venue -€2,000, management fee 15% → 12%, welcome bags included', moodboard: ['dec_15', 'dec_11'] }),
    ];
    ev.interactions = [
      { id: id('int'), type: 'email', at: ts(today, -25), by: 'u_sales2', summary: 'RFP received from Anja Weber' },
      { id: id('int'), type: 'meeting', at: ts(today, -18), by: 'u_planner2', summary: 'Video call — agenda & venue shortlist' },
      { id: id('int'), type: 'call', at: ts(today, -3), by: 'u_sales2', summary: 'Procurement asked for 10% discount; offered fee reduction' },
    ];
    ev.tasks = [];
    events.push(ev);
    holds.push({ id: id('hold'), eventId: ev.id, date, priority: 1, createdAt: ts(today, -5), expiresAt: addDays(today, 2), status: 'active' });
  }

  // ===== 4. Laurent wedding Provence (booked, deposit pending -> HOLD) =====
  {
    const date = saturdayNear(today, 200);
    const ev = { id: 'ev_laurent', name: 'Laurent–Dubois Wedding, Provence', eventTypeId: 'wedding', segment: 'social', clientId: 'cl_laurent', date, dateStatus: 'hold', stage: 'booked', source: 'Instagram', plannerId: 'u_planner2', salesId: 'u_sales2', guestCount: 110, budget: 140000, currency: 'EUR', jurisdictionId: 'EU-FR', probability: 95, createdAt: ts(today, -45), venue: { name: 'Château de la Lune', address: 'Route de Gordes, 84220 Gordes, France', parking: 'On-site parking for 60 cars; shuttles from Avignon', accessCode: 'Gate code 1789', emergencyContact: 'Claire Martin +33 4 55 55 12 12', nearestHospital: 'Centre Hospitalier de Cavaillon (18 km)', curfew: '01:00' }, ...emptyEventParts() };
    ev.subEvents = [{ id: 'se_l1', name: 'Welcome Apéro', date: addDays(date, -1), venue: 'Château de la Lune', room: 'Terrasse', start: '18:00', end: '21:00', guestCount: 90 }, { id: 'se_l2', name: 'Ceremony', date, venue: 'Château de la Lune', room: 'Lavender field', start: '16:30', end: '17:15', guestCount: 110 }, { id: 'se_l3', name: 'Reception', date, venue: 'Château de la Lune', room: 'Cour d’honneur', start: '18:00', end: '01:00', guestCount: 110 }];
    const lines = [line('svc_planning', { unitPrice: 14000, unitCost: 5000 }), line('svc_design'), line('svc_venue', { unitPrice: 22000, unitCost: 19800, vendorId: 'vd_chateau' }), line('svc_catering', { unitPrice: 170, unitCost: 120 }), line('svc_bar'), line('svc_florals', { unitPrice: 11000, unitCost: 7600 }), line('svc_photo'), line('svc_band'), line('svc_transport'), line('svc_service', { pct: 15 })];
    const v1 = makeProposal({ version: 1, status: 'accepted', lines, guestCount: 110, jurisdictionId: 'EU-FR', currency: 'EUR', createdAt: ts(today, -30), validUntil: addDays(today, -9), changeSummary: 'Initial proposal' });
    ev.proposals = [v1];
    const client = clients[3];
    const totals = totalsOf(v1, client);
    const signDate = addDays(today, -3);
    const { contract, schedule } = makeContract({ ev, client, proposal: v1, totals, signDate, today, signers: [{ name: 'Sophie Laurent', email: client.email, role: 'Client' }, { name: 'Marc Dubois', email: 'marc.dubois@example.fr', role: 'Client' }] });
    ev.contract = contract;
    ev.paymentSchedule = schedule;
    ev.payers = [{ id: 'py_laurent', name: 'Sophie & Marc', userId: null, categories: [] }];
    const r1 = invoiceFor(schedule[0], ev, today, { paid: false, payerId: 'py_laurent', fx: FX_RATES_TO_USD.EUR });
    ev.invoices = [r1.inv];
    ev.tasks = generateTasks(EVENT_TYPES[0].taskTemplate, date, id).map((t) => ({ ...t, status: t.dueDate < today ? 'done' : 'todo', assigneeId: t.assigneeType === 'client' ? null : 'st_lucas' }));
    ev.forms = formsFor(EVENT_TYPES[0], false);
    ev.interactions = [{ id: id('int'), type: 'note', at: ts(today, -3), by: 'u_sales2', summary: 'Contract signed — waiting on SEPA deposit to lock the date' }];
    events.push(ev);
    holds.push({ id: id('hold'), eventId: ev.id, date, priority: 1, createdAt: ts(today, -3), expiresAt: addDays(today, 4), status: 'active' });
  }

  // ===== 5. Harper 50th (post-event, past) =====
  {
    const date = addDays(today, -10);
    const ev = { id: 'ev_harper', name: 'Diane Harper’s 50th Birthday Gala', eventTypeId: 'birthday', segment: 'social', clientId: 'cl_harper', date, dateStatus: 'locked', stage: 'post_event', source: 'Referral', plannerId: 'u_planner', salesId: 'u_sales', guestCount: 80, budget: 45000, currency: 'USD', jurisdictionId: 'US-FL-MIA', probability: 100, createdAt: ts(today, -150), venue: { name: 'Villa Azure Miami Beach', address: '309 23rd St, Miami Beach, FL 33139', parking: 'Valet', accessCode: 'Service entrance on Liberty Ave', emergencyContact: 'Villa manager — +1 305 555 0800', nearestHospital: 'Mount Sinai Medical Center Miami Beach (1.5 mi)', curfew: '00:00' }, ...emptyEventParts() };
    ev.subEvents = [{ id: 'se_h1', name: 'Cocktail Reception', date, venue: 'Villa Azure', room: 'Pool deck', start: '19:00', end: '20:00', guestCount: 80 }, { id: 'se_h2', name: 'Dinner & Party', date, venue: 'Villa Azure', room: 'Garden', start: '20:00', end: '00:00', guestCount: 80 }];
    const lines = [line('svc_coord'), line('svc_design'), line('svc_catering', { unitPrice: 130, unitCost: 88 }), line('svc_bar'), line('svc_lighting'), line('svc_dj'), line('svc_photobooth', { optional: true, selected: true }), line('svc_service')];
    const v1 = makeProposal({ version: 1, status: 'accepted', lines, guestCount: 80, jurisdictionId: 'US-FL-MIA', currency: 'USD', createdAt: ts(today, -140), validUntil: addDays(today, -119), changeSummary: 'Initial proposal' });
    ev.proposals = [v1];
    const client = clients[4];
    const totals = totalsOf(v1, client);
    const signDate = addDays(today, -135);
    const { contract, schedule } = makeContract({ ev, client, proposal: v1, totals, signDate, today, signers: [{ name: 'Diane Harper', email: client.email, role: 'Client' }] });
    ev.contract = contract;
    ev.paymentSchedule = schedule;
    ev.payers = [{ id: 'py_harper', name: 'Diane Harper', userId: null, categories: [] }];
    const rs = schedule.map((s, i) => invoiceFor(s, ev, today, { paid: i < 2, payerId: 'py_harper', method: i === 0 ? 'card' : 'ach' }));
    ev.invoices = rs.map((r) => r.inv);
    ev.payments = rs.flatMap((r) => r.payments);
    ev.tasks = generateTasks(EVENT_TYPES[1].taskTemplate, date, id).map((t) => ({ ...t, status: t.offsetDays > 0 ? 'todo' : 'done', assigneeId: 'st_ava' }));
    ev.vendorBookings = [
      { id: id('vb'), vendorId: 'vd_miamiflor', category: 'Florals', service: 'Tropical centrepieces x8', qty: 1, cost: 2100, sellPrice: 3000, model: 'pass_through', markupPct: 0, commissionPct: 0, commissionStatus: 'n/a', status: 'confirmed', loadIn: `${date}T14:00`, loadOut: `${date}T23:59`, onsiteContact: 'Rosa', payments: [{ id: id('vp'), label: 'Full payment', dueDate: addDays(date, 5), amount: 2100, status: 'scheduled' }], vendorInvoices: [{ id: id('vi'), name: 'CP-1182.pdf', amount: 2100, at: ts(today, -8) }], confirmedAt: ts(today, -60) },
      { id: id('vb'), vendorId: 'vd_mixology', category: 'Catering', service: 'Bartenders x3, 5h', qty: 1, cost: 1350, sellPrice: 0, model: 'direct', markupPct: 0, commissionPct: 0, commissionStatus: 'n/a', status: 'confirmed', loadIn: `${date}T17:00`, loadOut: `${date}T23:59`, onsiteContact: 'Lena', payments: [], vendorInvoices: [], confirmedAt: ts(today, -50) },
    ];
    ev.households = buildHouseholds({ count: 14, categories: ['Family', 'Friends', 'VIP'], subEventIds: ['se_h1', 'se_h2'], rsvpMix: 1, today, seed: 7 });
    ev.households.forEach((h) => h.guests.forEach((g) => (g.checkedIn = Object.values(g.rsvp).includes('yes'))));
    ev.ros = { status: 'final', version: 2, history: [{ version: 2, status: 'final', at: ts(today, -14), by: 'u_planner' }], items: [
      { id: id('ros'), subEventId: 'se_h1', track: 'production', start: '14:00', duration: 180, activity: 'Decor & lighting install', location: 'Garden', ownerStaffId: 'st_rina', vendorIds: ['vd_miamiflor'], cue: '', notes: '', liveStatus: 'done', actualStart: '14:10' },
      { id: id('ros'), subEventId: 'se_h1', track: 'guest', start: '19:00', duration: 60, activity: 'Cocktails', location: 'Pool deck', ownerStaffId: 'st_rina', vendorIds: ['vd_mixology'], cue: 'Latin jazz', notes: '', liveStatus: 'done', actualStart: '19:05' },
      { id: id('ros'), subEventId: 'se_h2', track: 'guest', start: '20:15', duration: 90, activity: 'Dinner', location: 'Garden', ownerStaffId: 'st_rina', vendorIds: [], cue: '', notes: '', liveStatus: 'done', actualStart: '20:15', delayedBy: 15 },
      { id: id('ros'), subEventId: 'se_h2', track: 'guest', start: '21:45', duration: 15, activity: 'Surprise video & toast', location: 'Garden', ownerStaffId: 'st_rina', vendorIds: [], cue: 'Projector + mic', notes: '', liveStatus: 'done', actualStart: '21:50', delayedBy: 15 },
    ] };
    ev.incidents = [{ id: id('inc'), type: 'Damage', description: 'Guest knocked over 2 brass candelabras — bent arms.', at: ts(today, -10, '22:40'), by: 'st_rina', photo: null, severity: 'low' }];
    ev.shifts = [{ id: id('sh'), staffId: 'st_rina', role: 'Day-of coordinator', date, start: '13:00', end: '01:00', confirmed: true, clockIn: `${date}T13:05:00`, clockOut: `${date}T00:40:00`, clockLocation: '25.7990,-80.1300' }];
    ev.decorRequests = [{ itemId: 'dec_7', qty: 16 }, { itemId: 'dec_11', qty: 10 }, { itemId: 'dec_15', qty: 2 }];
    ev.gratuities = [{ id: id('tip'), to: 'Mixology Bar Co. (bartenders)', amount: 300, paidBy: 'Client', at: ts(today, -10) }];
    ev.messages = [{ id: id('msg'), from: 'u_planner', text: 'Thank you Diane — it was a magical night! Final invoice and a short survey are on their way.', at: ts(today, -9) }];
    events.push(ev);
  }

  // ===== 6. Brightwave launch London (archived, GBP) =====
  {
    const date = addDays(today, -60);
    const ev = { id: 'ev_brightwave', name: 'Brightwave “Lumen” Product Launch', eventTypeId: 'product_launch', segment: 'corporate', clientId: 'cl_brightwave', date, dateStatus: 'locked', stage: 'archived', source: 'Website form', plannerId: 'u_planner2', salesId: 'u_sales2', guestCount: 180, budget: 120000, currency: 'GBP', jurisdictionId: 'UK', probability: 100, poNumber: 'BW-PO-3301', createdAt: ts(today, -200), venue: { name: 'The Old Truman Brewery', address: '91 Brick Ln, London E1 6QL', parking: 'Loading bay on Dray Walk', accessCode: '', emergencyContact: 'Venue duty manager', nearestHospital: 'Royal London Hospital (1 km)', curfew: '23:00' }, ...emptyEventParts() };
    ev.subEvents = [{ id: 'se_b1', name: 'Press Preview', date, venue: 'Truman Brewery', room: 'Boiler House', start: '16:00', end: '18:00', guestCount: 40 }, { id: 'se_b2', name: 'Launch Show', date, venue: 'Truman Brewery', room: 'Boiler House', start: '19:00', end: '20:00', guestCount: 180 }, { id: 'se_b3', name: 'After Party', date, venue: 'Truman Brewery', room: 'Boiler House', start: '20:00', end: '23:00', guestCount: 180 }];
    const lines = [line('svc_planning', { unitPrice: 15000, unitCost: 6200 }), line('svc_venue', { unitPrice: 24000, unitCost: 21000 }), line('svc_av', { unitPrice: 32000, unitCost: 23000 }), line('svc_catering', { unitPrice: 85, unitCost: 58 }), line('svc_bar', { unitPrice: 40, unitCost: 25 }), line('svc_lighting'), line('svc_reg'), line('svc_mgmt', { pct: 12 })];
    const v1 = makeProposal({ version: 1, status: 'accepted', lines, guestCount: 180, jurisdictionId: 'UK', currency: 'GBP', createdAt: ts(today, -190), validUntil: addDays(today, -169), changeSummary: 'Initial proposal' });
    ev.proposals = [v1];
    const client = clients[5];
    const totals = totalsOf(v1, client);
    const signDate = addDays(today, -185);
    const { contract, schedule } = makeContract({ ev, client, proposal: v1, totals, signDate, today, signers: [{ name: 'Tom Hughes', email: 'tom@brightwave.co.uk', role: 'CMO' }] });
    ev.contract = contract;
    ev.paymentSchedule = schedule;
    ev.payers = [{ id: 'py_bw', name: 'Brightwave AP', userId: null, categories: [] }];
    const rs = schedule.map((s) => invoiceFor(s, ev, today, { paid: true, payerId: 'py_bw', method: 'wire', fx: FX_RATES_TO_USD.GBP }));
    ev.invoices = rs.map((r) => r.inv);
    ev.payments = rs.flatMap((r) => r.payments);
    ev.vendorBookings = [
      { id: id('vb'), vendorId: 'vd_london', category: 'AV', service: 'Full show production', qty: 1, cost: 24500, sellPrice: 32000, model: 'pass_through', markupPct: 0, commissionPct: 0, commissionStatus: 'n/a', status: 'confirmed', loadIn: `${date}T08:00`, loadOut: `${date}T23:59`, onsiteContact: 'Oliver', payments: [{ id: id('vp'), label: 'Full', dueDate: addDays(date, 14), amount: 24500, status: 'paid', paidAt: ts(today, -45), proofRef: 'BACS-1192' }], vendorInvoices: [], confirmedAt: ts(today, -150) },
    ];
    ev.shifts = [{ id: id('sh'), staffId: 'st_lucas', role: 'Lead planner', date, start: '08:00', end: '23:30', confirmed: true, clockIn: `${date}T08:02:00`, clockOut: `${date}T23:41:00` }, { id: id('sh'), staffId: 'st_sam', role: 'Production assistant', date, start: '07:00', end: '23:59', confirmed: true, clockIn: `${date}T07:00:00`, clockOut: `${date}T23:59:00` }];
    ev.closing = { venueDepositReturned: true, surveySent: true, survey: { rating: 5, comment: 'Flawless execution, press loved it.', at: ts(today, -50) }, reviewRequested: true, vendorRatingsDone: true, damageBilled: true };
    ev.decorReturn = { checkedAt: ts(today, -58), items: [], totalCharge: 0 };
    events.push(ev);
  }

  // ===== 7. Pipeline leads =====
  const sat150 = saturdayNear(today, 150);
  const leadDefs = [
    { id: 'ev_lead_nguyen', name: 'Nguyen–Rivera Wedding', eventTypeId: 'wedding', clientId: 'cl_nguyen', date: sat150, stage: 'qualified', source: 'WeddingWire', guestCount: 180, budget: 90000, currency: 'USD', jurisdictionId: 'US-TX-AUS', probability: 40, salesId: 'u_sales', plannerId: 'u_planner', createdAt: ts(today, -9), hold: { priority: 2, expires: 6 } },
    { id: 'ev_lead_stellar', name: 'Stellar Bank Client Appreciation Gala', eventTypeId: 'conference', clientId: 'cl_stellar', date: sat150, stage: 'proposal_sent', source: 'Referral', guestCount: 250, budget: 210000, currency: 'USD', jurisdictionId: 'US-NY-NYC', probability: 55, salesId: 'u_sales', plannerId: 'u_planner', createdAt: ts(today, -14), hold: { priority: 1, expires: 1 }, proposal: true },
    { id: 'ev_lead_okafor', name: 'Okafor 40th Birthday', eventTypeId: 'birthday', clientId: 'cl_okafor', date: saturdayNear(today, 95), stage: 'lead', source: 'Bark', guestCount: 60, budget: 25000, currency: 'USD', jurisdictionId: 'US-NY-NYC', probability: 15, salesId: 'u_sales', plannerId: null, createdAt: ts(today, -1) },
    { id: 'ev_lead_moss', name: 'Moss Engagement Party', eventTypeId: 'birthday', clientId: 'cl_moss', date: null, stage: 'lead', source: 'Instagram', guestCount: null, budget: null, currency: 'USD', jurisdictionId: 'US-NY-NYC', probability: 10, salesId: 'u_sales2', plannerId: null, createdAt: ts(today, 0) },
    { id: 'ev_lead_rossi', name: 'Rossi Wedding, Lake Como', eventTypeId: 'wedding', clientId: 'cl_rossi', date: saturdayNear(today, 260), stage: 'qualified', source: 'The Knot', guestCount: 90, budget: 130000, currency: 'EUR', jurisdictionId: 'EU-IT', probability: 35, salesId: 'u_sales2', plannerId: 'u_planner2', createdAt: ts(today, -6) },
    { id: 'ev_lost_1', name: 'Hamilton Rehearsal Dinner', eventTypeId: 'birthday', clientId: 'cl_moss', date: addDays(today, 30), stage: 'lost', source: 'Website form', guestCount: 40, budget: 12000, currency: 'USD', jurisdictionId: 'US-NY-NYC', probability: 0, salesId: 'u_sales', plannerId: null, createdAt: ts(today, -70), lostReason: 'Budget too low' },
    { id: 'ev_lost_2', name: 'TechCo Holiday Party', eventTypeId: 'conference', clientId: 'cl_stellar', date: addDays(today, 55), stage: 'lost', source: 'Bark', guestCount: 120, budget: 40000, currency: 'USD', jurisdictionId: 'US-NY-NYC', probability: 0, salesId: 'u_sales2', plannerId: null, createdAt: ts(today, -80), lostReason: 'Chose competitor' },
  ];
  for (const d of leadDefs) {
    const ev = { ...emptyEventParts(), id: d.id, name: d.name, eventTypeId: d.eventTypeId, segment: EVENT_TYPES.find((t) => t.id === d.eventTypeId).segment, clientId: d.clientId, date: d.date, dateStatus: d.hold ? 'hold' : 'none', stage: d.stage, source: d.source, plannerId: d.plannerId, salesId: d.salesId, guestCount: d.guestCount, budget: d.budget, currency: d.currency, jurisdictionId: d.jurisdictionId, probability: d.probability, createdAt: d.createdAt, lostReason: d.lostReason, venue: { name: 'TBD', address: '', parking: '', accessCode: '', emergencyContact: '', nearestHospital: '', curfew: '' } };
    ev.interactions = [{ id: id('int'), type: 'email', at: d.createdAt, by: d.salesId, summary: `Inquiry received via ${d.source}` }];
    if (d.proposal) {
      const et = EVENT_TYPES.find((t) => t.id === d.eventTypeId);
      ev.proposals = [makeProposal({ version: 1, status: 'active', lines: [...et.proposalTemplate.map((c) => line(c)), ...et.optionalTemplate.map((c) => line(c, { optional: true, selected: false }))], guestCount: d.guestCount, jurisdictionId: d.jurisdictionId, currency: d.currency, createdAt: ts(today, -8), validUntil: addDays(today, 13), changeSummary: 'Initial proposal' })];
      ev.interactions.push({ id: id('int'), type: 'meeting', at: ts(today, -10), by: d.salesId, summary: 'Site visit with Patricia Gomez' });
    }
    events.push(ev);
    if (d.hold) holds.push({ id: id('hold'), eventId: ev.id, date: d.date, priority: d.hold.priority, createdAt: ts(today, -3), expiresAt: addDays(today, d.hold.expires), status: 'active' });
  }

  // ===== 8. Cancelled by client (with cancellation computation) =====
  {
    const date = addDays(today, 70);
    const ev = { ...emptyEventParts(), id: 'ev_cancel', name: 'Bennett Anniversary Dinner', eventTypeId: 'birthday', segment: 'social', clientId: 'cl_okafor', date, dateStatus: 'none', stage: 'cancelled_client', prevStage: 'planning', source: 'Referral', plannerId: 'u_planner', salesId: 'u_sales', guestCount: 50, budget: 30000, currency: 'USD', jurisdictionId: 'US-NY-NYC', probability: 0, createdAt: ts(today, -120), venue: { name: 'The Loft at Soho', address: '', parking: '', accessCode: '', emergencyContact: '', nearestHospital: '', curfew: '' } };
    ev.cancellation = { at: ts(today, -12), by: 'client', reason: 'Family emergency', daysBefore: 82, forfeitPct: 75, fee: 18000, paid: 7200, refund: 0, balanceDue: 10800, contractTotal: 24000 };
    ev.interactions = [{ id: id('int'), type: 'call', at: ts(today, -12), by: 'u_planner', summary: 'Client called to cancel — family emergency' }];
    events.push(ev);
  }

  // ===== Workforce, production coordination & site plans (multi-vendor, outsourced crews) =====
  enrichCarter(events.find((e) => e.id === 'ev_carter'), today);
  enrichAcme(events.find((e) => e.id === 'ev_acme'), today);

  const notifications = [
    { id: id('ntf'), ts: ts(today, 0, '08:00'), toRoles: ['planner', 'admin'], eventId: 'ev_carter', text: 'Vendor Groove Collective COI has EXPIRED — booking at risk for Carter–Walker Wedding.', read: false, level: 'danger' },
    { id: id('ntf'), ts: ts(today, 0, '08:01'), toRoles: ['sales', 'admin'], eventId: 'ev_lead_stellar', text: 'First hold for Stellar Bank expires tomorrow.', read: false, level: 'warning' },
  ];

  const activityLog = [
    { id: id('log'), ts: new Date().toISOString(), userId: 'system', userName: 'System', role: 'system', type: 'SEED', entity: 'system', entityId: null, eventId: null, summary: 'Demo data loaded (mock seed)' },
  ];

  // Decor inventory reservations to seed the external system
  const decorReservations = events
    .filter((e) => e.decorRequests.length && !['cancelled_client', 'lost'].includes(e.stage))
    .map((e) => ({ id: `res_${e.id}`, eventId: e.id, eventName: e.name, date: e.date, items: e.decorRequests.map((r) => ({ ...r })), status: e.stage === 'archived' ? 'returned' : 'reserved', createdAt: e.createdAt }));
  events.forEach((e) => { if (decorReservations.find((r) => r.eventId === e.id)) e.decorReservationId = `res_${e.id}`; });

  return {
    version: 3,
    seededAt: new Date().toISOString(),
    currentUserId: 'u_admin',
    online: true,
    offlineQueue: [],
    settings,
    users,
    clients,
    vendors,
    staff,
    events,
    holds,
    notifications,
    outbox: [],
    activityLog,
    decorReservations,
  };
}


const P = (o) => ({ id: id('pos'), zones: ['Front of house'], notes: '', vendorId: null, rate: 0, ...o });
function W(ev, pos, names, status = 'confirmed') {
  return names.map((n, i) => {
    const w = { id: id('wk'), positionId: pos.id, name: n, phone: `+1 646 555 ${String(1000 + i * 37).slice(-4)}`, email: '', vendorId: pos.vendorId, company: pos.company ?? 'Freelance', status: Array.isArray(status) ? status[i] ?? 'confirmed' : status, zones: [...pos.zones], checkIn: null, checkOut: null };
    w.credentialCode = `CRW-${ev.id.slice(-4).toUpperCase()}-${w.id.slice(-5).toUpperCase()}`;
    return w;
  });
}
const byAct = (ev, txt) => ev.ros.items.find((i) => i.activity.startsWith(txt));

function enrichCarter(ev, today) {
  const d = ev.date;
  ev.production = {
    accessWindows: [{ date: d, start: '08:00', end: '01:00' }],
    resources: [
      { id: 'res_c_dock', name: 'Loading dock (W 47th St)', exclusive: true },
      { id: 'res_c_lift', name: 'Service elevator', exclusive: true },
      { id: 'res_c_garden', name: 'Garden Room', exclusive: false },
      { id: 'res_c_hall', name: 'Grand Hall', exclusive: false },
      { id: 'res_c_kitchen', name: 'Kitchen', exclusive: false },
    ],
  };
  const mk = (o) => ({ id: id('ros'), subEventId: 'se_c2', track: 'production', vendorIds: [], cue: '', notes: '', liveStatus: 'pending', resourceIds: [], dependsOn: [], ...o });
  const rentals = mk({ start: '11:30', duration: 90, activity: 'Rental delivery — chairs, tables, linens', location: 'Dock → Grand Hall', ownerStaffId: 'st_diego', resourceIds: ['res_c_dock', 'res_c_lift', 'res_c_hall'], notes: 'Lumière decor truck' });
  const lighting = mk({ start: '10:00', duration: 240, activity: 'Lighting & draping rig', location: 'Grand Hall', ownerStaffId: 'st_diego', resourceIds: ['res_c_hall'], notes: 'Festoon + uplights; ladders on dance floor' });
  const centres = mk({ start: '13:30', duration: 90, activity: 'Reception centrepieces install', location: 'Grand Hall', ownerStaffId: 'st_maria', vendorIds: ['vd_bloom'], resourceIds: ['res_c_hall'], notes: 'Needs tables dressed & rig finished' });
  ev.ros.items.push(rentals, lighting, centres);
  const florist = byAct(ev, 'Florist load-in');
  const catering = byAct(ev, 'Catering load-in');
  const sound = byAct(ev, 'Band sound check');
  const loadout = byAct(ev, 'Load-out');
  Object.assign(florist, { resourceIds: ['res_c_dock', 'res_c_garden'] });
  Object.assign(catering, { resourceIds: ['res_c_dock', 'res_c_lift', 'res_c_kitchen'] }); // overlaps rental delivery on the dock → demo conflict
  Object.assign(sound, { resourceIds: ['res_c_hall'], dependsOn: [lighting.id] });
  centres.dependsOn = [lighting.id, rentals.id]; // starts 13:30 but rig ends 14:00 → demo dependency violation
  Object.assign(loadout, { resourceIds: ['res_c_dock', 'res_c_lift'] });
  ev.ros.items.filter((i) => i.track === 'guest').forEach((i) => { i.resourceIds = i.subEventId === 'se_c2' ? ['res_c_garden'] : i.subEventId === 'se_c4' ? ['res_c_hall'] : []; i.dependsOn ??= []; });

  const captain = P({ department: 'Front of house', role: 'Event captain', qty: 1, date: d, start: '12:00', end: '23:59', source: 'internal', zones: ['All access'] });
  const servers = P({ department: 'Catering & bar', role: 'Banquet server', qty: 12, date: d, start: '15:00', end: '23:59', source: 'outsourced', vendorId: 'vd_gourmet', company: 'Gourmet Table Catering', rate: 38, zones: ['Kitchen', 'Front of house'] });
  const bartenders = P({ department: 'Catering & bar', role: 'Bartender', qty: 4, date: d, start: '16:00', end: '23:30', source: 'outsourced', vendorId: 'vd_mixology', company: 'Mixology Bar Co.', rate: 45, zones: ['Front of house'] });
  const security = P({ department: 'Security', role: 'Licensed security guard', qty: 2, date: d, start: '15:00', end: '01:00', source: 'outsourced', vendorId: 'vd_shield', company: 'Shield Event Security', rate: 52, zones: ['All access'] });
  const valet = P({ department: 'Guest services', role: 'Coat check & valet', qty: 3, date: d, start: '15:00', end: '00:30', source: 'outsourced', vendorId: 'vd_staffpro', company: 'StaffPro Events', rate: 32 });
  const stagehands = P({ department: 'Production', role: 'Stagehand', qty: 4, date: d, start: '09:30', end: '15:30', source: 'freelance', rate: 35, zones: ['Production', 'Backstage'] });
  const florals = P({ department: 'Production', role: 'Florals assistant', qty: 2, date: d, start: '10:00', end: '18:00', source: 'internal', zones: ['Production'] });
  const prodLead = P({ department: 'Production', role: 'Production lead', qty: 1, date: d, start: '09:30', end: '23:59', source: 'internal', zones: ['All access'] });
  ev.positions = [captain, servers, bartenders, security, valet, stagehands, florals, prodLead];
  ev.shifts.forEach((s) => {
    if (s.staffId === 'st_jamal') s.positionId = captain.id;
    if (s.staffId === 'st_maria') s.positionId = florals.id;
    if (s.staffId === 'st_diego') s.positionId = prodLead.id;
  });
  ev.workers = [
    ...W(ev, servers, ['Ana Ruiz', 'Ben Okoro', 'Carla Mendes', 'Dev Patel', 'Eli Grant', 'Fatima Noor', 'Gus Ward', 'Hana Sato', 'Ivan Petrov']),
    ...W(ev, bartenders, ['Lena Ford', 'Max Hill'], ['confirmed', 'invited']),
    ...W(ev, security, ['Tony Reyes', 'Kim Alvarez']),
    ...W(ev, stagehands, ['Rob Chen', 'Sam Diaz', 'Zoe Park'], ['confirmed', 'confirmed', 'declined']),
  ];
  ev.sitePlan = { rooms: [
    { id: 'room_c_hall', name: 'Grand Hall — reception', width: 36, height: 24, elements: [
      { id: id('el'), type: 'stage', label: 'Band stage', x: 13, y: 1, w: 10, h: 4, shape: 'rect', vendorId: 'vd_groove' },
      { id: id('el'), type: 'dance', label: 'Dance floor', x: 13, y: 6, w: 10, h: 7, shape: 'rect' },
      { id: id('el'), type: 'table', label: 'Head Table', x: 13, y: 14.5, w: 10, h: 1.6, shape: 'rect', tableId: 'tb_c1' },
      ...Array.from({ length: 14 }, (_, i) => ({ id: id('el'), type: 'table', label: `Table ${i + 1}`, x: i < 7 ? 2 + (i % 2) * 4.5 : 26 + (i % 2) * 4.5, y: 2 + Math.floor((i % 7) / 2) * 5 + ((i % 7) % 2) * 2.5, w: 3, h: 3, shape: 'circle', tableId: `tb_c${i + 2}` })),
      { id: id('el'), type: 'bar', label: 'Bar 1', x: 1, y: 21, w: 6, h: 2, shape: 'rect', vendorId: 'vd_mixology' },
      { id: id('el'), type: 'bar', label: 'Bar 2', x: 29, y: 21, w: 6, h: 2, shape: 'rect', vendorId: 'vd_mixology' },
      { id: id('el'), type: 'service', label: 'Kitchen door', x: 33, y: 0, w: 3, h: 1, shape: 'rect', vendorId: 'vd_gourmet' },
      { id: id('el'), type: 'feature', label: 'Photo booth', x: 15, y: 20.5, w: 3, h: 2.5, shape: 'rect' },
      { id: id('el'), type: 'entry', label: 'Main entrance', x: 17, y: 23, w: 4, h: 1, shape: 'rect' },
      { id: id('el'), type: 'power', label: 'Power 63A', x: 23.5, y: 1, w: 1, h: 1, shape: 'rect' },
    ] },
    { id: 'room_c_garden', name: 'Garden Room — ceremony', width: 24, height: 18, elements: [
      { id: id('el'), type: 'feature', label: 'Moongate arch', x: 10, y: 1, w: 4, h: 2, shape: 'rect', vendorId: 'vd_bloom' },
      { id: id('el'), type: 'seating', label: 'Ceremony seating L (75)', x: 2, y: 5, w: 8, h: 10, shape: 'rect' },
      { id: id('el'), type: 'seating', label: 'Ceremony seating R (75)', x: 14, y: 5, w: 8, h: 10, shape: 'rect' },
      { id: id('el'), type: 'feature', label: 'Aisle', x: 10.5, y: 4, w: 3, h: 12, shape: 'rect' },
      { id: id('el'), type: 'stage', label: 'String trio', x: 19, y: 1, w: 4, h: 2.5, shape: 'rect', vendorId: 'vd_groove' },
      { id: id('el'), type: 'entry', label: 'Guest entrance', x: 10, y: 17, w: 4, h: 1, shape: 'rect' },
    ] },
  ] };
}

function enrichAcme(ev, today) {
  const d = ev.date;
  const eve = addDays(d, -1);
  ev.production = {
    accessWindows: [{ date: eve, start: '18:00', end: '23:59' }, { date: d, start: '05:00', end: '23:30' }],
    resources: [
      { id: 'res_a_dock', name: 'Pico Blvd dock (2 bays)', exclusive: false },
      { id: 'res_a_freight', name: 'Freight elevator B', exclusive: true },
      { id: 'res_a_hallA', name: 'Hall A', exclusive: false },
      { id: 'res_a_ball', name: 'Ballroom', exclusive: false },
    ],
  };
  const mk = (o) => ({ id: id('ros'), track: 'production', vendorIds: [], cue: '', notes: '', liveStatus: 'pending', resourceIds: [], dependsOn: [], ...o });
  const se = ev.subEvents;
  const led = mk({ subEventId: se[1].id, start: '05:00', duration: 150, activity: 'LED wall build & line array fly', location: 'Hall A', ownerStaffId: 'st_tom', vendorIds: ['vd_soundwave'], resourceIds: ['res_a_hallA', 'res_a_freight'] });
  const gala = mk({ subEventId: se[3].id, start: '14:00', duration: 180, activity: 'Ballroom flip — stage, gala tables, uplights', location: 'Ballroom', ownerStaffId: 'st_tom', vendorIds: ['vd_soundwave', 'vd_pacific'], resourceIds: ['res_a_ball', 'res_a_freight'] });
  const rehearsal = mk({ subEventId: se[1].id, start: '07:45', duration: 60, activity: 'Keynote tech rehearsal', location: 'Hall A', ownerStaffId: 'st_ava', vendorIds: ['vd_soundwave'], resourceIds: ['res_a_hallA'], dependsOn: [led.id] });
  ev.ros.items.push(led, gala, rehearsal);
  ev.ros.items.forEach((i) => { i.resourceIds ??= []; i.dependsOn ??= []; });
  const reg = P({ department: 'Guest services', role: 'Registration staff', qty: 6, date: d, start: '06:30', end: '13:00', source: 'outsourced', vendorId: 'vd_staffpro', company: 'StaffPro Events', rate: 30 });
  const amb = P({ department: 'Guest services', role: 'Brand ambassador', qty: 4, date: d, start: '08:30', end: '22:30', source: 'freelance', rate: 34 });
  const av = P({ department: 'Production', role: 'AV technician (union)', qty: 8, date: d, start: '05:00', end: '23:30', source: 'outsourced', vendorId: 'vd_soundwave', company: 'SoundWave AV', rate: 68, zones: ['Production', 'Backstage'] });
  const sec = P({ department: 'Security', role: 'Security / bag check', qty: 4, date: d, start: '06:30', end: '23:00', source: 'outsourced', vendorId: 'vd_shield', company: 'Shield Event Security', rate: 52, zones: ['All access'] });
  const stage = P({ department: 'Production', role: 'Stage manager', qty: 1, date: d, start: '06:00', end: '23:30', source: 'internal', zones: ['All access'] });
  const regLead = P({ department: 'Guest services', role: 'Registration lead', qty: 1, date: d, start: '05:30', end: '17:30', source: 'internal' });
  ev.positions = [reg, amb, av, sec, stage, regLead];
  ev.shifts.forEach((s) => { if (s.staffId === 'st_tom') s.positionId = stage.id; if (s.staffId === 'st_priya') s.positionId = regLead.id; });
  ev.workers = [
    ...W(ev, reg, ['Alicia Gomez', 'Bryce Lam', 'Chen Wu', 'Dana Ortiz'], ['confirmed', 'confirmed', 'confirmed', 'invited']),
    ...W(ev, av, ['K. Ito (crew chief)', 'L. Moreno', 'P. Singh', 'R. Adams', 'S. Kim', 'T. Brown', 'U. Ali', 'V. Cruz']),
    ...W(ev, amb, ['Mia Lopez', 'Noah Reed']),
  ];
  ev.sitePlan = { rooms: [
    { id: 'room_a_hall', name: 'Hall A — keynote', width: 40, height: 30, elements: [
      { id: id('el'), type: 'stage', label: 'Main stage + LED wall', x: 10, y: 1, w: 20, h: 5, shape: 'rect', vendorId: 'vd_soundwave' },
      { id: id('el'), type: 'seating', label: 'Theatre seating (300)', x: 6, y: 9, w: 28, h: 15, shape: 'rect' },
      { id: id('el'), type: 'service', label: 'FOH mix position', x: 17, y: 25, w: 6, h: 2.5, shape: 'rect', vendorId: 'vd_soundwave' },
      { id: id('el'), type: 'feature', label: 'Livestream camera riser', x: 24, y: 25, w: 3, h: 2.5, shape: 'rect', vendorId: 'vd_soundwave' },
      { id: id('el'), type: 'entry', label: 'Doors (registration side)', x: 1, y: 27, w: 5, h: 1, shape: 'rect' },
      { id: id('el'), type: 'power', label: 'Power 3-phase', x: 31, y: 1, w: 1.5, h: 1.5, shape: 'rect' },
    ] },
  ] };
}

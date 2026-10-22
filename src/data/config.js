// Static configuration seed: catalog, tax jurisdictions, event types (segment templates), policies, templates.
// Segment differences (social vs corporate) live HERE as configuration, not in separate code paths.

export const COMPANY = {
  name: 'Lumière Events Co.',
  country: 'US',
  state: 'NY',
  euVatCountry: 'FR', // EU VAT registration (Paris branch) used for reverse-charge checks
  baseCurrency: 'USD',
  address: '250 Hudson St, New York, NY 10013',
};

export const FX_RATES_TO_USD = { USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.12, IDR: 0.000062, SGD: 0.75, AUD: 0.66 };

export const JURISDICTIONS = [
  { id: 'US-NY-NYC', name: 'New York City, NY', region: 'US', country: 'US', rate: 8.875, taxServiceFees: true },
  { id: 'US-CA-LA', name: 'Los Angeles, CA', region: 'US', country: 'US', rate: 9.5, taxServiceFees: false },
  { id: 'US-FL-MIA', name: 'Miami, FL', region: 'US', country: 'US', rate: 7.0, taxServiceFees: true },
  { id: 'US-TX-AUS', name: 'Austin, TX', region: 'US', country: 'US', rate: 8.25, taxServiceFees: true },
  { id: 'EU-FR', name: 'France (VAT)', region: 'EU', country: 'FR', rate: 20 },
  { id: 'EU-DE', name: 'Germany (VAT)', region: 'EU', country: 'DE', rate: 19 },
  { id: 'EU-IT', name: 'Italy (VAT)', region: 'EU', country: 'IT', rate: 22 },
  { id: 'EU-NL', name: 'Netherlands (VAT)', region: 'EU', country: 'NL', rate: 21 },
  { id: 'UK', name: 'United Kingdom (VAT)', region: 'UK', country: 'GB', rate: 20 },
  { id: 'CH', name: 'Switzerland (VAT)', region: 'CH', country: 'CH', rate: 8.1 },
  { id: 'ID-JKT', name: 'Indonesia (PPN)', region: 'ID', country: 'ID', rate: 11, taxLabel: 'PPN' },
  { id: 'ID-BALI', name: 'Bali, Indonesia (PPN + PB1)', region: 'ID', country: 'ID', rate: 11, taxLabel: 'PPN' },
  { id: 'SG', name: 'Singapore (GST)', region: 'SG', country: 'SG', rate: 9, taxLabel: 'GST' },
  { id: 'AU', name: 'Australia (GST)', region: 'AU', country: 'AU', rate: 10, taxLabel: 'GST' },
];

export const BUDGET_CATEGORIES = ['Planning', 'Venue', 'Catering', 'Decor', 'Florals', 'Entertainment', 'Photo/Video', 'AV', 'Transportation', 'Registration', 'Staffing', 'Fees', 'Other'];

export const CATALOG = [
  { id: 'svc_planning', name: 'Full Planning Fee', category: 'Planning', pricing: 'fixed', unitPrice: 12000, unitCost: 4500, qty: 1 },
  { id: 'svc_coord', name: 'Day-of Coordination', category: 'Planning', pricing: 'fixed', unitPrice: 3500, unitCost: 1400, qty: 1 },
  { id: 'svc_design', name: 'Design & Styling', category: 'Decor', pricing: 'fixed', unitPrice: 4000, unitCost: 1500, qty: 1 },
  { id: 'svc_venue', name: 'Venue Rental (pass-through)', category: 'Venue', pricing: 'fixed', unitPrice: 18000, unitCost: 16000, qty: 1, passThrough: true },
  { id: 'svc_catering', name: 'Catering — 3 course dinner', category: 'Catering', pricing: 'per_guest', unitPrice: 145, unitCost: 98, passThrough: true },
  { id: 'svc_bar', name: 'Open Bar Package (5h)', category: 'Catering', pricing: 'per_guest', unitPrice: 55, unitCost: 34, passThrough: true },
  { id: 'svc_cake', name: 'Celebration Cake', category: 'Catering', pricing: 'per_guest', unitPrice: 9, unitCost: 5.5 },
  { id: 'svc_chairs', name: 'Chiavari Chairs (gold)', category: 'Decor', pricing: 'per_guest', unitPrice: 9, unitCost: 2.5, decorItemId: 'dec_1' },
  { id: 'svc_tables', name: 'Round Tables 60"', category: 'Decor', pricing: 'fixed', unitPrice: 22, unitCost: 6, qty: 15, decorItemId: 'dec_3' },
  { id: 'svc_linen', name: 'Ivory Linens & Tabletop', category: 'Decor', pricing: 'fixed', unitPrice: 60, unitCost: 18, qty: 15, decorItemId: 'dec_5' },
  { id: 'svc_lighting', name: 'Festoon & Uplight Package', category: 'Decor', pricing: 'fixed', unitPrice: 3200, unitCost: 900, qty: 1 },
  { id: 'svc_arch', name: 'Moongate Ceremony Arch', category: 'Decor', pricing: 'fixed', unitPrice: 450, unitCost: 60, qty: 1, decorItemId: 'dec_9' },
  { id: 'svc_florals', name: 'Florals Package', category: 'Florals', pricing: 'fixed', unitPrice: 8500, unitCost: 5600, qty: 1, passThrough: true },
  { id: 'svc_photo', name: 'Photography (8 hours)', category: 'Photo/Video', pricing: 'fixed', unitPrice: 6000, unitCost: 4500, qty: 1, passThrough: true },
  { id: 'svc_video', name: 'Cinematic Videography', category: 'Photo/Video', pricing: 'fixed', unitPrice: 5200, unitCost: 3900, qty: 1 },
  { id: 'svc_dj', name: 'DJ & MC', category: 'Entertainment', pricing: 'fixed', unitPrice: 2800, unitCost: 2000, qty: 1 },
  { id: 'svc_band', name: 'Live Band (8 piece)', category: 'Entertainment', pricing: 'fixed', unitPrice: 9500, unitCost: 7500, qty: 1 },
  { id: 'svc_photobooth', name: 'Photo Booth', category: 'Entertainment', pricing: 'fixed', unitPrice: 1200, unitCost: 650, qty: 1 },
  { id: 'svc_av', name: 'AV Production (stage, LED, audio)', category: 'AV', pricing: 'fixed', unitPrice: 15000, unitCost: 10500, qty: 1 },
  { id: 'svc_stream', name: 'Livestream Package', category: 'AV', pricing: 'fixed', unitPrice: 4800, unitCost: 3100, qty: 1 },
  { id: 'svc_transport', name: 'Guest Shuttle Service', category: 'Transportation', pricing: 'fixed', unitPrice: 2400, unitCost: 1700, qty: 1 },
  { id: 'svc_reg', name: 'Registration & Badging', category: 'Registration', pricing: 'per_guest', unitPrice: 12, unitCost: 5 },
  { id: 'svc_gifts', name: 'Welcome Bags', category: 'Other', pricing: 'per_guest', unitPrice: 35, unitCost: 22 },
  { id: 'svc_sparkler', name: 'Sparkler Send-off', category: 'Other', pricing: 'fixed', unitPrice: 900, unitCost: 400, qty: 1 },
  { id: 'svc_service', name: 'Service Charge', category: 'Fees', pricing: 'percentage', pct: 20, costPct: 0, isServiceFee: true },
  { id: 'svc_mgmt', name: 'Management Fee', category: 'Fees', pricing: 'percentage', pct: 15, costPct: 0, isServiceFee: true },
];

export const PAYMENT_SCHEDULES = [
  {
    id: 'ps_social',
    name: 'Social standard (30/40/30)',
    installments: [
      { label: 'Deposit (30%) — due at signing', pct: 30, due: 'signing' },
      { label: 'Second payment (40%) — T‑90', pct: 40, due: { daysBefore: 90 } },
      { label: 'Final payment (30%) — T‑14', pct: 30, due: { daysBefore: 14 } },
    ],
  },
  {
    id: 'ps_corporate',
    name: 'Corporate (50/50, Net terms)',
    installments: [
      { label: 'Deposit (50%) — due at signing / PO', pct: 50, due: 'signing' },
      { label: 'Balance (50%) — T‑30', pct: 50, due: { daysBefore: 30 } },
    ],
  },
  {
    id: 'ps_half',
    name: 'Half & half (50/50, T-14)',
    installments: [
      { label: 'Down payment (50%) — due at signing', pct: 50, due: 'signing' },
      { label: 'Balance (50%) — T‑14', pct: 50, due: { daysBefore: 14 } },
    ],
  },
];

export const CANCELLATION_POLICIES = [
  {
    id: 'cp_social',
    name: 'Social standard',
    rows: [
      { minDaysBefore: 365, forfeitPct: 10 },
      { minDaysBefore: 180, forfeitPct: 30 },
      { minDaysBefore: 90, forfeitPct: 50 },
      { minDaysBefore: 30, forfeitPct: 75 },
      { minDaysBefore: 0, forfeitPct: 100 },
    ],
    postponement: 'One postponement within 12 months permitted with a 10% rescheduling fee, subject to date availability.',
    forceMajeure: 'Neither party is liable for failure to perform due to events beyond reasonable control (acts of God, pandemic, government order). Payments are credited to a rescheduled date within 18 months.',
  },
  {
    id: 'cp_corporate',
    name: 'Corporate',
    rows: [
      { minDaysBefore: 120, forfeitPct: 25 },
      { minDaysBefore: 60, forfeitPct: 50 },
      { minDaysBefore: 30, forfeitPct: 80 },
      { minDaysBefore: 0, forfeitPct: 100 },
    ],
    postponement: 'Postponement permitted once with written notice ≥ 60 days before the event; third-party costs incurred are non-refundable.',
    forceMajeure: 'Force majeure events suspend obligations; parties will negotiate in good faith a new date within 12 months.',
  },
];

export const CONTRACT_TEMPLATES = [
  {
    id: 'ct_standard',
    name: 'Standard Event Services Agreement',
    body: `EVENT SERVICES AGREEMENT

This Agreement is made on {{sign_date}} between {{company_name}} ("Planner") and {{client_name}} ("Client").

1. EVENT. {{event_name}} on {{event_date}} at {{venue}}, for approximately {{guest_count}} guests.
2. FEES. The total contract value is {{total}} ({{currency}}), inclusive of applicable taxes as itemized in Proposal {{proposal_version}}.
3. PAYMENT SCHEDULE.
{{payment_schedule}}
4. DATE RESERVATION. The event date is held, not reserved, until the deposit is received in cleared funds.
5. CANCELLATION. If Client cancels, the following portion of the total contract value is forfeited:
{{cancellation_table}}
6. POSTPONEMENT. {{postponement}}
7. FORCE MAJEURE. {{force_majeure}}
8. CHANGES. Any change after signature requires a written Change Order approved by Client. This Agreement is immutable once signed.
9. LATE PAYMENT. Overdue balances accrue a late fee of {{late_fee_pct}}% per month.

Signed electronically by the parties listed below.`,
  },
];

const T = (key, title, offsetDays, extra = {}) => ({ key, title, offsetDays, ...extra });

export const EVENT_TYPES = [
  {
    id: 'wedding',
    name: 'Wedding',
    segment: 'social',
    paymentScheduleId: 'ps_social',
    cancellationPolicyId: 'cp_social',
    features: { guestHouseholds: true, seating: true, registration: false, poRequired: false, multiplePayers: true, clientApprovalLayers: false, rsvp: true, checkInQR: false },
    defaultSubEvents: ['Welcome Dinner', 'Ceremony', 'Cocktail Hour', 'Reception', 'Farewell Brunch'],
    proposalTemplate: ['svc_planning', 'svc_design', 'svc_catering', 'svc_bar', 'svc_cake', 'svc_chairs', 'svc_tables', 'svc_linen', 'svc_florals', 'svc_photo', 'svc_dj', 'svc_service'],
    optionalTemplate: ['svc_photobooth', 'svc_sparkler', 'svc_gifts', 'svc_video'],
    taskTemplate: [
      T('budget', 'Confirm overall budget & payers', -300, { category: 'planning', priority: 'high' }),
      T('venue', 'Book ceremony & reception venue', -270, { category: 'vendors', priority: 'high', dependsOn: ['budget'] }),
      T('photo', 'Book photographer', -240, { category: 'vendors', dependsOn: ['venue'] }),
      T('std', 'Send save the dates', -180, { category: 'guests', assigneeType: 'client' }),
      T('design', 'Approve design board & palette', -150, { category: 'design', assigneeType: 'client' }),
      T('florist', 'Florist proposal & booking', -150, { category: 'vendors', dependsOn: ['design'] }),
      T('inv', 'Send invitations', -60, { category: 'guests', assigneeType: 'client', priority: 'high' }),
      T('qform', 'Complete planning questionnaire', -60, { category: 'planning', assigneeType: 'client' }),
      T('menu', 'Menu tasting & selection', -45, { category: 'vendors' }),
      T('rsvp', 'RSVP deadline', -30, { category: 'guests', priority: 'high' }),
      T('seating', 'Finalize seating chart', -16, { category: 'guests', assigneeType: 'client', dependsOn: ['rsvp'] }),
      T('headcount', 'Final headcount to catering', -14, { category: 'vendors', priority: 'high', dependsOn: ['rsvp'] }),
      T('ros', 'Finalize run of show & share with vendors', -10, { category: 'production', priority: 'high' }),
      T('callsheet', 'Distribute call sheet', -3, { category: 'production' }),
      T('closeout', 'Post-event vendor payments & close-out', 7, { category: 'finance' }),
    ],
    forms: ['Music preferences', 'Family photo list', 'Emergency contacts', 'Accessibility needs'],
  },
  {
    id: 'birthday',
    name: 'Milestone Birthday / Private Gala',
    segment: 'social',
    paymentScheduleId: 'ps_social',
    cancellationPolicyId: 'cp_social',
    features: { guestHouseholds: true, seating: true, registration: false, poRequired: false, multiplePayers: false, clientApprovalLayers: false, rsvp: true, checkInQR: false },
    defaultSubEvents: ['Cocktail Reception', 'Dinner & Party'],
    proposalTemplate: ['svc_coord', 'svc_design', 'svc_catering', 'svc_bar', 'svc_lighting', 'svc_dj', 'svc_service'],
    optionalTemplate: ['svc_photobooth', 'svc_photo'],
    taskTemplate: [
      T('venue', 'Confirm venue', -120, { category: 'vendors', priority: 'high' }),
      T('theme', 'Approve theme & design', -90, { category: 'design', assigneeType: 'client' }),
      T('inv', 'Send invitations', -45, { category: 'guests', assigneeType: 'client' }),
      T('rsvp', 'RSVP deadline', -21, { category: 'guests' }),
      T('headcount', 'Final headcount to catering', -10, { category: 'vendors', priority: 'high', dependsOn: ['rsvp'] }),
      T('ros', 'Finalize run of show', -7, { category: 'production' }),
      T('closeout', 'Post-event close-out', 5, { category: 'finance' }),
    ],
    forms: ['Music preferences', 'Emergency contacts'],
  },
  {
    id: 'conference',
    name: 'Corporate Conference',
    segment: 'corporate',
    paymentScheduleId: 'ps_corporate',
    cancellationPolicyId: 'cp_corporate',
    features: { guestHouseholds: false, seating: false, registration: true, poRequired: true, multiplePayers: false, clientApprovalLayers: true, rsvp: true, checkInQR: true },
    defaultSubEvents: ['Registration', 'Opening Keynote', 'Breakout Sessions', 'Gala Dinner'],
    proposalTemplate: ['svc_planning', 'svc_venue', 'svc_catering', 'svc_av', 'svc_stream', 'svc_reg', 'svc_transport', 'svc_mgmt'],
    optionalTemplate: ['svc_gifts', 'svc_photo'],
    taskTemplate: [
      T('po', 'Obtain client PO & approval chain', -150, { category: 'finance', priority: 'high', assigneeType: 'client' }),
      T('venue', 'Venue contract & room block', -140, { category: 'vendors', priority: 'high' }),
      T('speakers', 'Confirm speakers & agenda', -90, { category: 'planning', assigneeType: 'client' }),
      T('regopen', 'Open attendee registration', -75, { category: 'guests' }),
      T('av', 'AV production plan', -45, { category: 'production', dependsOn: ['venue'] }),
      T('regclose', 'Registration close', -21, { category: 'guests', priority: 'high' }),
      T('headcount', 'Final F&B guarantee', -14, { category: 'vendors', priority: 'high', dependsOn: ['regclose'] }),
      T('badges', 'Print badges & QR codes', -5, { category: 'production', dependsOn: ['regclose'] }),
      T('ros', 'Final show flow & cue sheet', -5, { category: 'production', priority: 'high' }),
      T('report', 'Budget reconciliation report to client', 14, { category: 'finance' }),
    ],
    forms: ['Speaker requirements', 'Accessibility needs', 'Emergency contacts'],
  },
  {
    id: 'product_launch',
    name: 'Product Launch',
    segment: 'corporate',
    paymentScheduleId: 'ps_corporate',
    cancellationPolicyId: 'cp_corporate',
    features: { guestHouseholds: false, seating: false, registration: true, poRequired: true, multiplePayers: false, clientApprovalLayers: true, rsvp: true, checkInQR: true },
    defaultSubEvents: ['Press Preview', 'Launch Show', 'After Party'],
    proposalTemplate: ['svc_planning', 'svc_venue', 'svc_av', 'svc_catering', 'svc_bar', 'svc_lighting', 'svc_reg', 'svc_mgmt'],
    optionalTemplate: ['svc_stream', 'svc_video'],
    taskTemplate: [
      T('po', 'Obtain client PO', -90, { category: 'finance', priority: 'high', assigneeType: 'client' }),
      T('venue', 'Venue booking', -80, { category: 'vendors', priority: 'high' }),
      T('creative', 'Creative & stage design sign-off', -45, { category: 'design', assigneeType: 'client' }),
      T('press', 'Press list & invitations', -30, { category: 'guests' }),
      T('headcount', 'Final headcount', -10, { category: 'vendors', priority: 'high' }),
      T('rehearsal', 'Technical rehearsal', -1, { category: 'production', priority: 'high' }),
    ],
    forms: ['Brand guidelines upload', 'VIP list'],
  },
  {
    id: 'offsite',
    name: 'Corporate Offsite / Retreat',
    segment: 'corporate',
    paymentScheduleId: 'ps_corporate',
    cancellationPolicyId: 'cp_corporate',
    features: { guestHouseholds: false, seating: false, registration: true, poRequired: true, multiplePayers: false, clientApprovalLayers: true, rsvp: true, checkInQR: true },
    defaultSubEvents: ['Arrival & Welcome', 'Workshops', 'Team Dinner', 'Departure'],
    proposalTemplate: ['svc_planning', 'svc_venue', 'svc_catering', 'svc_transport', 'svc_av', 'svc_mgmt'],
    optionalTemplate: ['svc_gifts', 'svc_photo'],
    taskTemplate: [
      T('po', 'Obtain client PO', -100, { category: 'finance', assigneeType: 'client' }),
      T('venue', 'Venue & room block', -90, { category: 'vendors', priority: 'high' }),
      T('travel', 'Collect travel details', -30, { category: 'guests', assigneeType: 'client' }),
      T('headcount', 'Final headcount', -14, { category: 'vendors', priority: 'high' }),
      T('ros', 'Final agenda', -7, { category: 'production' }),
    ],
    forms: ['Dietary & accessibility', 'Travel details'],
  },
];

export const LOST_REASONS = ['Budget too low', 'Chose competitor', 'Date unavailable', 'Event cancelled by client', 'No response', 'Other'];

export const LEAD_SOURCES = ['Website form', 'Email', 'The Knot', 'WeddingWire', 'Bark', 'Referral', 'Instagram', 'Manual'];

export const EMAIL_TEMPLATES = [
  { id: 'tpl_hold_expiring', name: 'Hold expiring soon', subject: 'Your date hold for {{event_date}} expires in {{days_left}} days', body: 'Hi {{client_name}},\n\nJust a reminder that we are holding {{event_date}} for you until {{hold_expires}}. Sign the proposal to secure it!\n\n— {{planner_name}}' },
  { id: 'tpl_hold_promoted', name: 'Second hold promoted', subject: 'Good news — {{event_date}} is now available to you', body: 'Hi {{client_name}},\n\nThe first hold on {{event_date}} has been released. You are now first in line.\n\n— {{planner_name}}' },
  { id: 'tpl_payment_due', name: 'Payment due reminder', subject: 'Payment {{invoice_number}} due {{due_date}}', body: 'Hi {{client_name}},\n\nA payment of {{amount}} for {{event_name}} is due on {{due_date}}. Pay securely in your client portal.\n\nThank you!' },
  { id: 'tpl_payment_overdue', name: 'Payment overdue', subject: 'Overdue: invoice {{invoice_number}}', body: 'Hi {{client_name}},\n\nInvoice {{invoice_number}} ({{amount}}) is overdue. Per your agreement a late fee may apply.' },
  { id: 'tpl_rsvp_deadline', name: 'RSVP deadline reminder', subject: 'RSVP for {{event_name}} closes soon', body: 'Dear guest,\n\nPlease RSVP using your code before {{rsvp_deadline}}.' },
  { id: 'tpl_coi_expiring', name: 'Vendor COI expiring', subject: 'Certificate of Insurance expiring {{expiry}}', body: 'Hi {{vendor_name}},\n\nYour COI on file expires on {{expiry}}. Please upload a renewed certificate via the vendor portal.' },
  { id: 'tpl_stage_booked', name: 'Welcome — booking confirmed', subject: 'Welcome aboard, {{client_name}}!', body: 'Your contract for {{event_name}} is signed. Your planner {{planner_name}} will reach out to kick off planning.' },
  { id: 'tpl_survey', name: 'Post-event survey', subject: 'How did we do?', body: 'Hi {{client_name}}, thank you for trusting us with {{event_name}}. Please take our 2-minute survey and leave us a review!' },
];

export const AUTOMATIONS = [
  { id: 'au_1', name: 'Remind client 2 days before hold expires', trigger: 'hold_expiring', config: { daysBefore: 2 }, templateId: 'tpl_hold_expiring', enabled: true },
  { id: 'au_2', name: 'Notify second hold when first releases', trigger: 'hold_promoted', config: {}, templateId: 'tpl_hold_promoted', enabled: true },
  { id: 'au_3', name: 'Payment due reminder (7 days before)', trigger: 'payment_due', config: { daysBefore: 7 }, templateId: 'tpl_payment_due', enabled: true },
  { id: 'au_4', name: 'Payment overdue notice', trigger: 'payment_overdue', config: {}, templateId: 'tpl_payment_overdue', enabled: true },
  { id: 'au_5', name: 'RSVP deadline reminder (T-37)', trigger: 'relative_date', config: { offsetDays: -37 }, templateId: 'tpl_rsvp_deadline', enabled: true },
  { id: 'au_6', name: 'Vendor COI expiring (30 days)', trigger: 'doc_expiry', config: { daysBefore: 30 }, templateId: 'tpl_coi_expiring', enabled: true },
  { id: 'au_7', name: 'Welcome email when booked', trigger: 'stage_change', config: { to: 'booked' }, templateId: 'tpl_stage_booked', enabled: true },
  { id: 'au_8', name: 'Survey after event (post-event)', trigger: 'stage_change', config: { to: 'post_event' }, templateId: 'tpl_survey', enabled: true },
];

export const ACCOUNT_MAPPING = [
  { key: 'revenue_services', label: 'Event services revenue', quickbooks: '4000 Services Revenue', xero: '200 Sales' },
  { key: 'revenue_passthrough', label: 'Pass-through revenue', quickbooks: '4100 Reimbursable Revenue', xero: '210 Pass-through Sales' },
  { key: 'deferred_revenue', label: 'Deferred revenue (deposits)', quickbooks: '2400 Customer Deposits', xero: '835 Revenue Received in Advance' },
  { key: 'sales_tax', label: 'Sales tax / VAT payable', quickbooks: '2200 Sales Tax Payable', xero: '820 GST/VAT' },
  { key: 'cogs_vendor', label: 'Vendor costs (COGS)', quickbooks: '5000 Cost of Events', xero: '310 Cost of Goods Sold' },
  { key: 'cogs_crew', label: 'Crew labor', quickbooks: '5100 Event Labor', xero: '477 Wages' },
  { key: 'gratuity_liability', label: 'Gratuities payable (not revenue)', quickbooks: '2500 Gratuities Payable', xero: '826 Tips Payable' },
  { key: 'commission_income', label: 'Vendor commissions', quickbooks: '4300 Commission Income', xero: '260 Other Revenue' },
];

export const ROLES = [
  { id: 'admin', label: 'Owner / Admin' },
  { id: 'sales', label: 'Sales / Account Manager' },
  { id: 'planner', label: 'Event Planner / Coordinator' },
  { id: 'production', label: 'Production / Logistics Lead' },
  { id: 'finance', label: 'Finance' },
  { id: 'crew', label: 'Day-of Coordinator / Crew' },
  { id: 'client', label: 'Client (portal)' },
  { id: 'vendor', label: 'Vendor (portal)' },
];

export const CLIENT_PERMISSIONS = [
  { id: 'view_all', label: 'View all event sections' },
  { id: 'approve_costs', label: 'Approve proposals / change orders' },
  { id: 'sign', label: 'Sign contracts' },
  { id: 'pay', label: 'Make payments' },
  { id: 'manage_guests', label: 'Manage guests & seating' },
  { id: 'forms', label: 'Fill planning forms' },
  { id: 'message', label: 'Message planner' },
];

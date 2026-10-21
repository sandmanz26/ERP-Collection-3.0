// Static reference data shared by every tenant (ports, modes, charge codes, milestones, regions, plans, roles).

export const PORTS = [
  { code: 'IDJKT', name: 'Jakarta', country: 'ID', aliases: ['jakarta', 'tanjung priok', 'jkt', 'cgk'] },
  { code: 'IDSUB', name: 'Surabaya', country: 'ID', aliases: ['surabaya', 'tanjung perak', 'sby'] },
  { code: 'SGSIN', name: 'Singapore', country: 'SG', aliases: ['singapore', 'sin', 'sg'] },
  { code: 'CNSHA', name: 'Shanghai', country: 'CN', aliases: ['shanghai', 'sha', 'pvg'] },
  { code: 'CNNGB', name: 'Ningbo', country: 'CN', aliases: ['ningbo', 'ngb'] },
  { code: 'CNYTN', name: 'Shenzhen (Yantian)', country: 'CN', aliases: ['shenzhen', 'yantian', 'szx'] },
  { code: 'HKHKG', name: 'Hong Kong', country: 'HK', aliases: ['hong kong', 'hkg'] },
  { code: 'KRPUS', name: 'Busan', country: 'KR', aliases: ['busan', 'pusan'] },
  { code: 'VNSGN', name: 'Ho Chi Minh City', country: 'VN', aliases: ['ho chi minh', 'hcmc', 'saigon', 'cat lai'] },
  { code: 'THLCH', name: 'Laem Chabang', country: 'TH', aliases: ['laem chabang', 'bangkok'] },
  { code: 'MYPKG', name: 'Port Klang', country: 'MY', aliases: ['port klang', 'klang', 'kuala lumpur'] },
  { code: 'INNSA', name: 'Nhava Sheva', country: 'IN', aliases: ['nhava sheva', 'mumbai', 'jnpt'] },
  { code: 'AEJEA', name: 'Jebel Ali', country: 'AE', aliases: ['jebel ali', 'dubai'] },
  { code: 'DEHAM', name: 'Hamburg', country: 'DE', aliases: ['hamburg', 'ham'] },
  { code: 'DEFRA', name: 'Frankfurt', country: 'DE', aliases: ['frankfurt', 'fra'] },
  { code: 'NLRTM', name: 'Rotterdam', country: 'NL', aliases: ['rotterdam', 'rtm'] },
  { code: 'BEANR', name: 'Antwerp', country: 'BE', aliases: ['antwerp', 'antwerpen'] },
  { code: 'GBFXT', name: 'Felixstowe', country: 'GB', aliases: ['felixstowe'] },
  { code: 'USLAX', name: 'Los Angeles', country: 'US', aliases: ['los angeles', 'long beach', 'lax'] },
  { code: 'USNYC', name: 'New York', country: 'US', aliases: ['new york', 'newark', 'nyc'] },
  { code: 'USSAV', name: 'Savannah', country: 'US', aliases: ['savannah'] },
  { code: 'USCHI', name: 'Chicago', country: 'US', aliases: ['chicago', 'ord'] },
  { code: 'AUSYD', name: 'Sydney', country: 'AU', aliases: ['sydney'] },
];

export const portByCode = Object.fromEntries(PORTS.map((p) => [p.code, p]));
export const portName = (code) => (portByCode[code] ? `${portByCode[code].name} (${code})` : code || '—');

export const MODES = {
  SEA_FCL: { label: 'Sea FCL', cw: { transport: 'SEA', container: 'FCL' }, color: 'blue' },
  SEA_LCL: { label: 'Sea LCL', cw: { transport: 'SEA', container: 'LCL' }, color: 'cyan' },
  AIR: { label: 'Air', cw: { transport: 'AIR', container: 'LSE' }, color: 'purple' },
  ROAD: { label: 'Road FTL', cw: { transport: 'ROA', container: 'FTL' }, color: 'orange' },
};

export const CONTAINER_TYPES = ['20GP', '40GP', '40HC', '40RF'];
export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

export const COMMODITIES = [
  'Garments', 'Furniture', 'Consumer electronics', 'Auto parts', 'Coffee beans', 'Frozen seafood',
  'Industrial machinery', 'Textiles', 'Solar panels', 'Toys', 'Footwear', 'Ceramic tiles',
  'Pharmaceuticals', 'Rubber products', 'Paper products', 'Chemicals (non-DG)',
];

export const PACKAGE_TYPES = ['pallets', 'cartons', 'crates', 'packages'];

// Charge codes are aligned with typical CargoWise charge codes.
export const CHARGE_CODES = {
  FRT: 'Ocean freight',
  AFR: 'Air freight',
  RFR: 'Road freight',
  BAF: 'Bunker adjustment factor',
  FSC: 'Fuel surcharge',
  SSC: 'Security surcharge',
  THO: 'Terminal handling — origin',
  THD: 'Terminal handling — destination',
  DOC: 'Documentation fee',
  CUS: 'Customs clearance',
  TRK: 'Trucking / delivery',
  HDL: 'Handling fee',
  DEM: 'Demurrage',
  STO: 'Storage',
  INS: 'Cargo insurance',
};

export const CHANNELS = {
  email: { label: 'Email', color: 'geekblue' },
  pdf: { label: 'PDF', color: 'red' },
  excel: { label: 'Excel', color: 'green' },
  whatsapp: { label: 'WhatsApp', color: 'lime' },
};

// Standard milestone templates (code = CargoWise-style event code).
export const MILESTONES = {
  SEA: [
    { code: 'BKD', name: 'Booking confirmed', offset: 0 },
    { code: 'GIN', name: 'Gate in at origin', offset: 3 },
    { code: 'DEP', name: 'Vessel departed (ATD)', offset: 5 },
    { code: 'TSH', name: 'Transshipment', offset: 12 },
    { code: 'ARV', name: 'Vessel arrived (ATA)', offset: 22 },
    { code: 'CLR', name: 'Customs cleared', offset: 24 },
    { code: 'DLV', name: 'Delivered', offset: 26 },
  ],
  AIR: [
    { code: 'BKD', name: 'Booking confirmed', offset: 0 },
    { code: 'RCS', name: 'Received from shipper', offset: 1 },
    { code: 'DEP', name: 'Flight departed', offset: 2 },
    { code: 'ARV', name: 'Flight arrived', offset: 3 },
    { code: 'CLR', name: 'Customs cleared', offset: 4 },
    { code: 'DLV', name: 'Delivered', offset: 5 },
  ],
  ROAD: [
    { code: 'BKD', name: 'Booking confirmed', offset: 0 },
    { code: 'PUP', name: 'Picked up', offset: 1 },
    { code: 'BRD', name: 'Border crossing', offset: 2 },
    { code: 'DLV', name: 'Delivered', offset: 3 },
  ],
};
export const milestoneFamily = (mode) => (mode === 'AIR' ? 'AIR' : mode === 'ROAD' ? 'ROAD' : 'SEA');

export const REGIONS = {
  'ap-southeast-3': { name: 'Asia Pacific (Jakarta)', flag: '🇮🇩', law: 'Indonesia PDP Law (UU 27/2022)', storage: 'jkt-1a, jkt-1b', ai: 'In-region inference endpoint' },
  'ap-southeast-1': { name: 'Asia Pacific (Singapore)', flag: '🇸🇬', law: 'Singapore PDPA', storage: 'sin-1a, sin-1b', ai: 'In-region inference endpoint' },
  'eu-central-1': { name: 'Europe (Frankfurt)', flag: '🇪🇺', law: 'EU GDPR', storage: 'fra-1a, fra-1b, fra-1c', ai: 'EU-only inference endpoint' },
  'us-east-1': { name: 'US East (N. Virginia)', flag: '🇺🇸', law: 'CCPA / SOC 2', storage: 'iad-1a, iad-1b', ai: 'In-region inference endpoint' },
  'me-central-1': { name: 'Middle East (UAE)', flag: '🇦🇪', law: 'UAE PDPL', storage: 'dxb-1a, dxb-1b', ai: 'In-region inference endpoint' },
};

export const PLANS = {
  starter: { name: 'Starter', monthly: 490, included: { rfqs: 150, documents: 400, invoices: 250 }, overage: { rfqs: 1.8, documents: 0.45, invoices: 0.6 } },
  growth: { name: 'Growth', monthly: 1490, included: { rfqs: 600, documents: 1500, invoices: 1000 }, overage: { rfqs: 1.2, documents: 0.3, invoices: 0.4 } },
  enterprise: { name: 'Enterprise', monthly: 4900, included: { rfqs: 3000, documents: 8000, invoices: 5000 }, overage: { rfqs: 0.8, documents: 0.2, invoices: 0.25 } },
};

export const METERS = {
  rfqs: 'RFQs processed',
  documents: 'Documents processed',
  invoices: 'Invoices processed (AR + AP)',
};

export const ROLES = {
  admin: { label: 'Tenant admin', color: 'magenta', desc: 'Full access, configures workflows, users and connectors' },
  manager: { label: 'Branch manager', color: 'volcano', desc: 'Final approver for low-margin or high-value quotes' },
  pricing: { label: 'Pricing analyst', color: 'blue', desc: 'Reviews RFQ extraction, rate comparison and quotes' },
  sales: { label: 'Sales', color: 'cyan', desc: 'Owns customers, sends quotes' },
  ops: { label: 'Operations', color: 'green', desc: 'Bookings, documents, tracking' },
  finance: { label: 'Finance', color: 'gold', desc: 'AR invoices and AP reconciliation' },
};

export const AI_MODEL = 'fp-extract-v3 (LLM + layout)';

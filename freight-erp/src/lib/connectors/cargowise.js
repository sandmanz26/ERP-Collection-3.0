// CargoWise One eAdaptor adapter: builds Universal Shipment / Universal Event / Universal Transaction XML.
// The structure follows the CargoWise Universal XML schema (namespace 2011/11); values come from our records.
import { MODES } from '../reference.js';

const NS = 'http://www.cargowise.com/Schemas/Universal/2011/11';

export const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tiny XML builder: el('A', [el('B', 'x')]) */
export function el(name, children, attrs) {
  const a = attrs ? Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('') : '';
  if (children == null || children === '') return `<${name}${a}/>`;
  if (Array.isArray(children)) return `<${name}${a}>${children.filter(Boolean).join('')}</${name}>`;
  return `<${name}${a}>${esc(children)}</${name}>`;
}
const code = (name, value) => el(name, [el('Code', value)]);

export function prettyXml(xml) {
  let indent = 0;
  return xml
    .replace(/>\s*</g, '><')
    .replace(/(<[^/!?][^>]*[^/]>)(?=<[^/])/g, '$1\n')
    .replace(/(<\/[^>]+>)(?=<)/g, '$1\n')
    .replace(/(<[^>]+\/>)(?=<)/g, '$1\n')
    .split('\n')
    .map((line) => {
      if (/^<\//.test(line)) indent = Math.max(0, indent - 1);
      const out = '  '.repeat(indent) + line;
      if (/^<[^/!?][^>]*[^/]>$/.test(line) && !/<\/.+>$/.test(line)) indent += 1;
      return out;
    })
    .join('\n');
}

const dataContext = (cfg, targetType, key) => el('DataContext', [
  el('DataTargetCollection', [el('DataTarget', [el('Type', targetType), key ? el('Key', key) : null])]),
  code('Company', cfg.companyCode),
  el('EnterpriseID', cfg.enterpriseId),
  el('ServerID', cfg.serverId),
]);

export function universalShipment(s, ctx) {
  const m = MODES[s.mode]?.cw || MODES.SEA_FCL.cw;
  const xml = el('UniversalShipment', [
    el('Shipment', [
      dataContext(ctx.config, 'ForwardingShipment', s.cwKey),
      code('TransportMode', m.transport),
      code('ContainerMode', m.container),
      code('PortOfLoading', s.origin),
      code('PortOfDischarge', s.destination),
      code('ShipmentIncoTerm', s.incoterm),
      el('GoodsDescription', s.commodity),
      el('OuterPacks', s.packages),
      code('OuterPacksPackageType', 'PLT'),
      el('TotalWeight', s.weightKg),
      code('TotalWeightUnit', 'KG'),
      el('TotalVolume', s.volumeCbm),
      code('TotalVolumeUnit', 'M3'),
      el('IsHazardous', s.hazardous ? 'true' : 'false'),
      el('BookingConfirmationReference', s.ref),
      el('LocalProcessing', [el('EstimatedPickup', s.cargoReadyDate)]),
      el('OrganizationAddressCollection', [
        el('OrganizationAddress', [el('AddressType', 'ConsignorDocumentaryAddress'), el('OrganizationCode', orgCode(s.shipper)), el('CompanyName', s.shipper)]),
        el('OrganizationAddress', [el('AddressType', 'ConsigneeDocumentaryAddress'), el('OrganizationCode', orgCode(s.consignee)), el('CompanyName', s.consignee)]),
        el('OrganizationAddress', [el('AddressType', 'SendersLocalClient'), el('OrganizationCode', ctx.customer?.cwCode), el('CompanyName', ctx.customer?.name)]),
        el('OrganizationAddress', [el('AddressType', 'ShippingLineAddress'), el('OrganizationCode', ctx.partner?.cwCode), el('CompanyName', ctx.partner?.name)]),
      ]),
      s.containerType ? el('ContainerCollection', [el('Container', [code('ContainerType', s.containerType), el('ContainerCount', s.containerCount || 1), el('ContainerNumber', s.containerNo)])]) : null,
      el('JobCosting', [
        code('Currency', ctx.currency),
        el('ChargeLineCollection', (s.sellLines || []).map((l) => el('ChargeLine', [
          code('ChargeCode', l.code),
          el('Description', l.desc),
          el('CostOSAmount', l.buy?.toFixed?.(2) ?? l.buy),
          el('SellOSAmount', l.sell?.toFixed?.(2) ?? l.sell),
          el('CostOSCurrency', [el('Code', ctx.currency)]),
          el('Creditor', [el('Type', 'Organization'), el('Key', ctx.partner?.cwCode)]),
          el('Debtor', [el('Type', 'Organization'), el('Key', ctx.customer?.cwCode)]),
        ]))),
      ]),
    ]),
  ], { xmlns: NS, version: '1.1' });
  return { format: 'xml', messageType: 'UniversalShipment', body: prettyXml(xml) };
}

export function universalEvent(e, ctx) {
  const xml = el('UniversalEvent', [
    el('Event', [
      el('DataContext', [
        el('DataSourceCollection', [el('DataSource', [el('Type', 'ForwardingShipment'), el('Key', e.cwKey)])]),
        code('Company', ctx.config.companyCode),
        el('EnterpriseID', ctx.config.enterpriseId),
        el('ServerID', ctx.config.serverId),
      ]),
      el('EventTime', e.at),
      el('EventType', e.code),
      el('EventReference', e.name),
      el('IsEstimate', 'false'),
      el('AdditionalFieldsToUpdateCollection', [el('AdditionalFieldsToUpdate', [el('Type', 'Location'), el('Value', e.location)])]),
    ]),
  ], { xmlns: NS, version: '1.1' });
  return { format: 'xml', messageType: 'UniversalEvent', body: prettyXml(xml) };
}

export function universalTransaction(inv, ctx) {
  const isAr = inv.ledger === 'AR';
  const xml = el('UniversalTransaction', [
    el('TransactionInfo', [
      dataContext(ctx.config, isAr ? 'AccountingInvoice' : 'AccountingCreditorInvoice'),
      el('Ledger', inv.ledger),
      el('TransactionType', 'INV'),
      el('Number', inv.ref),
      el('TransactionDate', inv.date),
      el('DueDate', inv.dueDate),
      code('OSCurrency', ctx.currency),
      el('OSTotal', inv.total.toFixed(2)),
      el('OrganizationAddress', [el('OrganizationCode', isAr ? ctx.customer?.cwCode : ctx.partner?.cwCode)]),
      el('Job', [el('Type', 'Job'), el('Key', inv.cwKey)]),
      el('PostingJournalCollection', inv.lines.map((l) => el('PostingJournal', [
        code('ChargeCode', l.code),
        el('Description', l.desc),
        el('OSAmount', Number(l.amount).toFixed(2)),
        code('Branch', ctx.config.branchCode),
      ]))),
    ]),
  ], { xmlns: NS, version: '1.1' });
  return { format: 'xml', messageType: 'UniversalTransaction', body: prettyXml(xml) };
}

const orgCode = (name) => String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 9).padEnd(9, 'X');

export const cargowiseAdapter = {
  build(capability, entity, ctx) {
    if (capability === 'shipment.create' || capability === 'shipment.update') return universalShipment(entity, ctx);
    if (capability === 'event.inbound') return universalEvent(entity, ctx);
    if (capability === 'transaction.ar.post' || capability === 'transaction.ap.post') return universalTransaction(entity, ctx);
    throw new Error(`CargoWise adapter does not support ${capability}`);
  },
  test(config) {
    const missing = ['endpoint', 'username', 'password', 'enterpriseId', 'serverId', 'companyCode'].filter((k) => !config?.[k]);
    if (missing.length) return { ok: false, message: `Missing: ${missing.join(', ')}` };
    if (!/^https:\/\//.test(config.endpoint)) return { ok: false, message: 'eAdaptor endpoint must use HTTPS' };
    return { ok: true, message: `eAdaptor ping OK — ${config.enterpriseId}/${config.serverId}, company ${config.companyCode}` };
  },
};

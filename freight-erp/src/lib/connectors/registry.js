// Connector framework. The core product only ever calls `dispatch(capability, entity, ...)`;
// which system receives the message is decided by the tenant's connector instances.
// Adding a TMS/ERP = add one definition (+ adapter) here. No change to pages or store logic.
import { cargowiseAdapter } from './cargowise.js';

export const CAPABILITIES = {
  'rfq.inbound': 'Receive RFQs',
  'notify.customer': 'Send customer messages',
  'shipment.create': 'Create shipment',
  'shipment.update': 'Update shipment',
  'event.inbound': 'Receive milestone events',
  'transaction.ar.post': 'Post AR invoices',
  'transaction.ap.post': 'Post AP invoices',
  'document.attach': 'Attach documents',
};

const jsonAdapter = (messageType, required) => ({
  build(capability, entity) {
    return { format: 'json', messageType: `${messageType}:${capability}`, body: JSON.stringify({ capability, data: entity }, null, 2) };
  },
  test(config) {
    const missing = required.filter((k) => !config?.[k]);
    return missing.length ? { ok: false, message: `Missing: ${missing.join(', ')}` } : { ok: true, message: `${messageType} API reachable` };
  },
});

export const CONNECTOR_DEFINITIONS = [
  {
    key: 'cargowise',
    name: 'CargoWise One',
    vendor: 'WiseTech Global',
    category: 'TMS / ERP',
    protocol: 'eAdaptor (HTTPS, Universal XML)',
    formats: ['Universal Shipment', 'Universal Event', 'Universal Transaction'],
    capabilities: ['shipment.create', 'shipment.update', 'event.inbound', 'transaction.ar.post', 'transaction.ap.post', 'document.attach'],
    configSchema: [
      { key: 'endpoint', label: 'eAdaptor endpoint URL', type: 'url', required: true, placeholder: 'https://<enterprise>.wisegrid.net/eAdaptor' },
      { key: 'username', label: 'eAdaptor username', type: 'text', required: true },
      { key: 'password', label: 'eAdaptor password', type: 'secret', required: true },
      { key: 'enterpriseId', label: 'Enterprise ID', type: 'text', required: true, placeholder: 'e.g. NFI' },
      { key: 'serverId', label: 'Server ID', type: 'text', required: true, placeholder: 'e.g. PRD' },
      { key: 'companyCode', label: 'Company code', type: 'text', required: true, placeholder: 'e.g. JKT' },
      { key: 'branchCode', label: 'Default branch', type: 'text', required: false },
      { key: 'inboundQueue', label: 'Inbound event queue', type: 'text', required: false, placeholder: 'eHub inbound queue name' },
    ],
    adapter: cargowiseAdapter,
    logo: 'CW',
  },
  {
    key: 'magaya',
    name: 'Magaya',
    vendor: 'Magaya Corp.',
    category: 'TMS',
    protocol: 'REST / JSON',
    formats: ['JSON'],
    capabilities: ['shipment.create', 'event.inbound', 'transaction.ar.post'],
    configSchema: [
      { key: 'apiUrl', label: 'API URL', type: 'url', required: true },
      { key: 'networkId', label: 'Network ID', type: 'text', required: true },
      { key: 'apiKey', label: 'API key', type: 'secret', required: true },
    ],
    adapter: jsonAdapter('Magaya', ['apiUrl', 'networkId', 'apiKey']),
    logo: 'MG',
  },
  {
    key: 'sap',
    name: 'SAP S/4HANA',
    vendor: 'SAP',
    category: 'ERP / Finance',
    protocol: 'OData v4',
    formats: ['JSON'],
    capabilities: ['transaction.ar.post', 'transaction.ap.post'],
    configSchema: [
      { key: 'host', label: 'Host', type: 'url', required: true },
      { key: 'client', label: 'Client', type: 'text', required: true },
      { key: 'clientId', label: 'OAuth client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'OAuth client secret', type: 'secret', required: true },
    ],
    adapter: jsonAdapter('SAP', ['host', 'client', 'clientId', 'clientSecret']),
    logo: 'SAP',
  },
  {
    key: 'xero',
    name: 'Xero',
    vendor: 'Xero',
    category: 'Accounting',
    protocol: 'REST / OAuth2',
    formats: ['JSON'],
    capabilities: ['transaction.ar.post', 'transaction.ap.post'],
    configSchema: [
      { key: 'tenantId', label: 'Xero tenant ID', type: 'text', required: true },
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client secret', type: 'secret', required: true },
    ],
    adapter: jsonAdapter('Xero', ['tenantId', 'clientId', 'clientSecret']),
    logo: 'XR',
  },
  {
    key: 'dcsa',
    name: 'Carrier Track & Trace (DCSA)',
    vendor: 'Ocean carriers',
    category: 'Carrier API',
    protocol: 'DCSA T&T 2.2 webhooks',
    formats: ['JSON'],
    capabilities: ['event.inbound'],
    configSchema: [
      { key: 'subscriptionUrl', label: 'Callback URL', type: 'url', required: true },
      { key: 'carriers', label: 'Subscribed carriers (SCAC)', type: 'text', required: true, placeholder: 'MAEU, MSCU, CMDU' },
      { key: 'secret', label: 'Signing secret', type: 'secret', required: true },
    ],
    adapter: jsonAdapter('DCSA', ['subscriptionUrl', 'carriers', 'secret']),
    logo: 'TT',
  },
  {
    key: 'email',
    name: 'Shared mailbox',
    vendor: 'Microsoft 365 / Google Workspace',
    category: 'Messaging',
    protocol: 'Graph API / IMAP + SMTP',
    formats: ['MIME'],
    capabilities: ['rfq.inbound', 'notify.customer', 'document.attach'],
    configSchema: [
      { key: 'mailbox', label: 'Mailbox address', type: 'text', required: true },
      { key: 'provider', label: 'Provider', type: 'select', options: ['Microsoft 365', 'Google Workspace', 'IMAP'], required: true },
      { key: 'appPassword', label: 'App password / token', type: 'secret', required: true },
    ],
    adapter: jsonAdapter('Mail', ['mailbox', 'provider', 'appPassword']),
    logo: '@',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    vendor: 'Meta',
    category: 'Messaging',
    protocol: 'WhatsApp Cloud API',
    formats: ['JSON'],
    capabilities: ['rfq.inbound', 'notify.customer'],
    configSchema: [
      { key: 'phoneNumberId', label: 'Phone number ID', type: 'text', required: true },
      { key: 'businessAccountId', label: 'Business account ID', type: 'text', required: true },
      { key: 'token', label: 'Permanent access token', type: 'secret', required: true },
    ],
    adapter: jsonAdapter('WhatsApp', ['phoneNumberId', 'businessAccountId', 'token']),
    logo: 'WA',
  },
];

export const connectorDef = (key) => CONNECTOR_DEFINITIONS.find((d) => d.key === key);

/** Pick the tenant's connected instance that handles a capability. */
export function resolveConnector(instances, tenantId, capability) {
  return instances.find((i) => i.tenantId === tenantId && i.status === 'connected' && (i.enabledCapabilities || []).includes(capability) && connectorDef(i.connectorKey)?.capabilities.includes(capability));
}

/**
 * Build the outbound/inbound message for a capability. Returns null when no connector handles it.
 * ctx: { tenant, customer, partner, currency }
 */
export function dispatch(instances, tenantId, capability, entity, ctx) {
  const inst = resolveConnector(instances, tenantId, capability);
  if (!inst) return null;
  const def = connectorDef(inst.connectorKey);
  const built = def.adapter.build(capability, entity, { ...ctx, config: inst.config });
  return { connectorId: inst.id, connectorName: inst.name, capability, ...built };
}

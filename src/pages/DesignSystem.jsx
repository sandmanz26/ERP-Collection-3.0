import React, { useState } from 'react';
import {
  Button, Badge, Input, Select, Textarea, Checkbox, Money, Swatch, ProgressBar, Spinner, Avatar, QrCode,
  Field, CommitInput, StageBadge, StatusBadge, StatTile, Alert, Tabs, PillSelect, KeyValue, EmptyState, SearchInput, ConfirmButton,
  Card, PageHeader, Modal, BarChart, useDialog, MobileTemplate,
} from '../design-system/index.js';

const COLOR_TOKENS = ['--color-brand', '--color-brand-soft', '--color-ink', '--color-ink-2', '--color-ink-3', '--color-surface', '--color-surface-2', '--color-border', '--color-success', '--color-warning', '--color-danger', '--color-info'];
const SPACE = [1, 2, 3, 4, 5, 6];

function Section({ level, title, children }) {
  return (
    <Card title={<span><Badge tone="brand">{level}</Badge> {title}</span>}>
      <div className="stack">{children}</div>
    </Card>
  );
}

/** Living style guide: every building block of the Atomic Design system, rendered from the real components. */
export default function DesignSystem() {
  const dialog = useDialog();
  const [tab, setTab] = useState('a');
  const [pill, setPill] = useState('one');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [val, setVal] = useState('Commit on blur');
  return (
    <div>
      <PageHeader crumbs="Admin" title="Design System" subtitle="Atomic Design: tokens → atoms → molecules → organisms → templates → pages. Source: src/design-system/." />
      <div className="grid g2">
        <Section level="Tokens" title="Color">
          <div className="row">{COLOR_TOKENS.map((t) => <div key={t} style={{ textAlign: 'center', fontSize: 11 }}><Swatch color={`var(${t})`} size={40} /><div className="faint">{t.replace('--color-', '')}</div></div>)}</div>
        </Section>
        <Section level="Tokens" title="Spacing, radius, type">
          <div className="row">{SPACE.map((s) => <div key={s} style={{ textAlign: 'center', fontSize: 11 }}><div style={{ width: `var(--space-${s})`, height: 24, background: 'var(--color-brand)' }} /><div className="faint">space-{s}</div></div>)}</div>
          <div className="row">{['sm', 'md', 'lg', 'xl', 'pill'].map((r) => <div key={r} style={{ width: 48, height: 32, border: '1px solid var(--color-border)', borderRadius: `var(--radius-${r})`, display: 'grid', placeItems: 'center', fontSize: 10 }}>{r}</div>)}</div>
          <div><span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>2xl</span> · <span style={{ fontSize: 'var(--text-xl)' }}>xl</span> · <span style={{ fontSize: 'var(--text-md)' }}>md</span> · <span style={{ fontSize: 'var(--text-xs)' }}>xs</span></div>
        </Section>
        <Section level="Atoms" title="Button & Badge">
          <div className="row"><Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="success">Success</Button><Button variant="danger">Danger</Button><Button variant="danger-solid">Danger solid</Button><Button variant="ghost">Ghost</Button><Button size="sm">Small</Button><Button loading>Loading</Button><Button disabled>Disabled</Button></div>
          <div className="row"><Badge>neutral</Badge><Badge tone="brand">brand</Badge><Badge tone="ok">ok</Badge><Badge tone="warn">warn</Badge><Badge tone="danger">danger</Badge><Badge tone="info">info</Badge></div>
        </Section>
        <Section level="Atoms" title="Inputs & display">
          <div className="row"><Input placeholder="Input" /><Input invalid placeholder="Invalid" /><Select options={['Option A', 'Option B']} /><Checkbox label="Checkbox" defaultChecked /></div>
          <Textarea placeholder="Textarea" />
          <div className="row"><Money value={12345.6} currency="EUR" /><Money value={-250} /><Avatar name="Ava Chen" /><Spinner /><QrCode value="CAR1234" size={56} /></div>
          <ProgressBar value={64} /><ProgressBar value={90} tone="ok" />
        </Section>
        <Section level="Molecules" title="Form & status">
          <div className="grid g2">
            <Field label="Field with hint" hint="Helper text"><Input /></Field>
            <Field label="Field with error" error="Required"><Input invalid /></Field>
            <Field label="CommitInput (dispatches on blur)"><CommitInput value={val} onCommit={setVal} /></Field>
            <Field label="SearchInput"><SearchInput value={q} onChange={setQ} /></Field>
          </div>
          <div className="row"><StageBadge stage="negotiation" /><StageBadge stage="planning" /><StatusBadge status="overdue" /><StatusBadge status="paid" /><StatusBadge status="partially_signed" /></div>
          <PillSelect options={['one', 'two', 'three']} value={pill} onChange={setPill} />
          <Tabs tabs={[{ id: 'a', label: 'Tab A' }, { id: 'b', label: 'Tab B', count: 3 }]} value={tab} onChange={setTab} />
        </Section>
        <Section level="Molecules" title="Feedback & data">
          <Alert tone="info">Info alert</Alert><Alert tone="success">Success alert</Alert><Alert tone="warning">Warning alert</Alert><Alert tone="danger">Danger alert</Alert>
          <div className="grid g2"><StatTile label="Stat tile" value="$12,400" sub="sub-label" /><StatTile label="Tone" value="−3%" tone="danger" /></div>
          <KeyValue rows={[['Key', 'Value'], ['Another key', 'Another value']]} />
          <EmptyState>Empty state</EmptyState>
        </Section>
        <Section level="Organisms" title="Dialogs, modal, chart">
          <div className="row">
            <Button onClick={() => setModal(true)}>Open modal</Button>
            <ConfirmButton variant="danger" message="This is the design-system confirm dialog." onConfirm={() => {}}>Confirm dialog</ConfirmButton>
            <Button onClick={async () => { const r = await dialog.form({ title: 'Form dialog', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'qty', label: 'Quantity', type: 'number', defaultValue: 1 }] }); r && dialog.alert({ title: 'Result', message: JSON.stringify(r) }); }}>Form dialog</Button>
          </div>
          <BarChart label="Example chart" rows={[{ label: 'Website', value: 42, display: '42%' }, { label: 'Referral', value: 71, display: '71%' }, { label: 'The Knot', value: 28, display: '28%' }]} max={100} />
        </Section>
        <Section level="Templates" title="Mobile template (day-of)">
          <div style={{ transform: 'scale(.7)', transformOrigin: 'top left', height: 300 }}>
            <MobileTemplate title="Event name" status={<Badge tone="ok">online</Badge>}><Alert tone="info">Content slot</Alert></MobileTemplate>
          </div>
        </Section>
      </div>
      {modal && <Modal title="Modal organism" onClose={() => setModal(false)} footer={<Button variant="primary" onClick={() => setModal(false)}>Close</Button>}>Esc or backdrop click closes it.</Modal>}
    </div>
  );
}

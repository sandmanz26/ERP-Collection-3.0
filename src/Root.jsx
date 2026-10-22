import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { usePlatform } from './platform/PlatformStore.jsx';
import WorkspaceRoot from './platform/WorkspaceRoot.jsx';
// Route-level code splitting: the marketing site, onboarding, operator console and the app are separate chunks.
const Landing = lazy(() => import('./platform/pages/Landing.jsx'));
const Signup = lazy(() => import('./platform/pages/Signup.jsx'));
const Onboarding = lazy(() => import('./platform/pages/Onboarding.jsx'));
const FindWorkspace = lazy(() => import('./platform/pages/FindWorkspace.jsx'));
const Operator = lazy(() => import('./platform/pages/Operator.jsx'));
const RsvpPublic = lazy(() => import('./pages/RsvpPublic.jsx'));
const InquiryPublic = lazy(() => import('./pages/InquiryPublic.jsx'));
import { PLATFORM } from './platform/plans.js';

/**
 * Two layers:
 *  - Platform (public site, sign-up, onboarding, workspace finder, operator console) when no workspace is open;
 *  - Workspace (the event-management app) once a workspace is entered — isolated store, plan-gated actions.
 */
export default function Root() {
  const { pstate } = usePlatform();
  if (pstate.session.tenantId) return <WorkspaceRoot key={pstate.session.tenantId} tenantId={pstate.session.tenantId} />;
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/login" element={<FindWorkspace />} />
      <Route path="/operator" element={<Operator />} />
      <Route path="/rsvp" element={<PublicTenantPage><RsvpPublic /></PublicTenantPage>} />
      <Route path="/inquiry" element={<PublicTenantPage><InquiryPublic /></PublicTenantPage>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

/** Guest-facing pages (RSVP, inquiry form) of a workspace, addressed by ?w=<workspace-url>; no sign-in needed. */
function PublicTenantPage({ children }) {
  const { pstate } = usePlatform();
  const [sp] = useSearchParams();
  const t = pstate.tenants.find((x) => x.slug === sp.get('w')) ?? pstate.tenants.find((x) => x.id === PLATFORM.demoTenantId);
  if (!t || t.status === 'suspended') return <div className="empty">This page is not available.</div>;
  return <WorkspaceRoot tenantId={t.id}>{children}</WorkspaceRoot>;
}

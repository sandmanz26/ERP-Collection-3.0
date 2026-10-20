import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { useStore } from './store/AppStore.jsx';
import { navFor, homeFor } from './lib/permissions.js';
import Dashboard from './pages/Dashboard.jsx';
import Pipeline from './pages/Pipeline.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Events from './pages/Events.jsx';
import EventWorkspace from './pages/event/EventWorkspace.jsx';
import Vendors from './pages/Vendors.jsx';
import Staff from './pages/Staff.jsx';
import Finance from './pages/Finance.jsx';
import Reports from './pages/Reports.jsx';
import Automation from './pages/Automation.jsx';
import Settings from './pages/Settings.jsx';
import ActivityLog from './pages/ActivityLog.jsx';
import DayOf from './pages/DayOf.jsx';
import ClientPortal from './pages/ClientPortal.jsx';
import VendorPortal from './pages/VendorPortal.jsx';
import RsvpPublic from './pages/RsvpPublic.jsx';
import InquiryPublic from './pages/InquiryPublic.jsx';
import DesignSystem from './pages/DesignSystem.jsx';

function Guard({ path, children }) {
  const { user } = useStore();
  const allowed = navFor(user).some((n) => n.path === path) || (path === '/events' && navFor(user).some((n) => n.path === '/events'));
  if (!allowed) return <Navigate to={homeFor(user)} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/rsvp" element={<RsvpPublic />} />
      <Route path="/inquiry" element={<InquiryPublic />} />
      <Route
        path="*"
        element={
          <AppShell>
            <Routes>
              <Route path="/" element={<Guard path="/"><Dashboard /></Guard>} />
              <Route path="/pipeline" element={<Guard path="/pipeline"><Pipeline /></Guard>} />
              <Route path="/calendar" element={<Guard path="/calendar"><CalendarPage /></Guard>} />
              <Route path="/events" element={<Guard path="/events"><Events /></Guard>} />
              <Route path="/events/:id" element={<Guard path="/events"><EventWorkspace /></Guard>} />
              <Route path="/vendors" element={<Guard path="/vendors"><Vendors /></Guard>} />
              <Route path="/staff" element={<Guard path="/staff"><Staff /></Guard>} />
              <Route path="/finance" element={<Guard path="/finance"><Finance /></Guard>} />
              <Route path="/reports" element={<Guard path="/reports"><Reports /></Guard>} />
              <Route path="/automation" element={<Guard path="/automation"><Automation /></Guard>} />
              <Route path="/settings" element={<Guard path="/settings"><Settings /></Guard>} />
              <Route path="/activity" element={<Guard path="/activity"><ActivityLog /></Guard>} />
              <Route path="/design-system" element={<Guard path="/design-system"><DesignSystem /></Guard>} />
              <Route path="/dayof" element={<Guard path="/dayof"><DayOf /></Guard>} />
              <Route path="/dayof/:id" element={<Guard path="/dayof"><DayOf /></Guard>} />
              <Route path="/portal" element={<Guard path="/portal"><ClientPortal /></Guard>} />
              <Route path="/portal/:id" element={<Guard path="/portal"><ClientPortal /></Guard>} />
              <Route path="/vendor-portal" element={<Guard path="/vendor-portal"><VendorPortal /></Guard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
}

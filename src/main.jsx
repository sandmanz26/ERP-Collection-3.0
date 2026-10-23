import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { PlatformProvider } from './platform/PlatformStore.jsx';
import { DialogProvider } from './design-system/index.js';
import Root from './Root.jsx';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './design-system/styles/index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <PlatformProvider>
        <DialogProvider>
          <Root />
        </DialogProvider>
      </PlatformProvider>
    </HashRouter>
  </React.StrictMode>,
);

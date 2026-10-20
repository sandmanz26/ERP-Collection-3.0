import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { StoreProvider } from './store/AppStore.jsx';
import { DialogProvider } from './design-system/index.js';
import App from './App.jsx';
import './design-system/styles/index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <DialogProvider>
        <App />
        </DialogProvider>
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
);

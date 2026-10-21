import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import { StoreProvider } from './store/StoreProvider.jsx';
import AppRoutes from './App.jsx';
import './styles.css';

function Root() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('freightpilot-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const toggleDark = () => {
    setDark((v) => {
      try {
        localStorage.setItem('freightpilot-theme', v ? 'light' : 'dark');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };
  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#2f54eb', borderRadius: 8, fontFamily: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif" },
        components: { Layout: { siderBg: '#0b1437', headerBg: dark ? '#141414' : '#ffffff' }, Menu: { darkItemBg: '#0b1437', darkSubMenuItemBg: '#0b1437' } },
      }}
    >
      <AntApp>
        <StoreProvider>
          <HashRouter>
            <AppRoutes dark={dark} toggleDark={toggleDark} />
          </HashRouter>
        </StoreProvider>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

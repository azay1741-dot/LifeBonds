import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import './index.css';

// Google Maps Platform Demo Key runtime auth & quota failure detector
(window as Window & { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded', { detail: { type: 'auth_failure' } }));
};

const origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  origConsoleError(...args);
  try {
    const joined = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    if (
      joined.includes('OverQuotaMapError') ||
      joined.includes('QuotaExceededError') ||
      joined.includes('RefererNotAllowedMapError')
    ) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded', { detail: { type: 'over_quota' } }));
    }
  } catch {
    // Ignore logging inspection errors
  }
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>
);

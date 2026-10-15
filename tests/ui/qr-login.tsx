import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from '../../src/components/AuthScreen';
import { Header } from '../../src/components/Header';
import '../../src/index.css';
import '../../src/styles/design-system.css';

const mode = new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')!).render(<StrictMode>
  {mode === 'phone' || mode === 'admin'
    ? <Header currentUser="학생" isAdmin={mode === 'admin'} onLogout={() => {}} />
    : <AuthScreen onLogin={() => {}} />}
</StrictMode>);

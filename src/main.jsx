import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'

const API = import.meta.env.VITE_API_URL || '';

// Read ?form=<id> from URL on load
function getInitialFormId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('form') || null;
}

function Root() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [pendingFormId, setPendingFormId] = useState(getInitialFormId);

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
  }, []);

  const handleLogin = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch { /* ignore */ }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
  };

  // If there's a reset token in the URL, always show login page (reset form)
  const hasResetToken = new URLSearchParams(window.location.search).has('token');

  if (!token || !user || hasResetToken) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <App user={user} token={token} onLogout={handleLogout} initialFormId={pendingFormId} onInitialFormLoaded={() => setPendingFormId(null)} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

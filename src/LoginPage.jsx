import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

export default function LoginPage({ onLogin }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch(`${API}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Login failed');
                setLoading(false);
                return;
            }

            // Store in localStorage
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));
            onLogin(data.token, data.user);
        } catch (err) {
            setError('Cannot connect to server');
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-particles">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="particle" style={{ '--i': i }} />
                ))}
            </div>

            <form className="login-card" onSubmit={handleSubmit}>
                <div className="login-logo">
                    <div className="login-logo-icon">B</div>
                    <h1 className="login-title">PVBudget</h1>
                    <p className="login-subtitle">Sign in to your account</p>
                </div>

                {error && (
                    <div className="login-error">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        {error}
                    </div>
                )}

                <div className="login-field">
                    <label htmlFor="login-username">Username</label>
                    <input
                        id="login-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        autoFocus
                        autoComplete="username"
                        required
                    />
                </div>

                <div className="login-field">
                    <label htmlFor="login-password">Password</label>
                    <input
                        id="login-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                    />
                </div>

                <button
                    type="submit"
                    className="login-btn"
                    disabled={loading}
                >
                    {loading ? (
                        <span className="login-spinner" />
                    ) : (
                        'Sign In'
                    )}
                </button>
            </form>
        </div>
    );
}

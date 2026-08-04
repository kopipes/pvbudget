import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || '';

// Check URL for reset token on load
function getResetToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
}

export default function LoginPage({ onLogin }) {
    const resetToken = getResetToken();
    const [mode, setMode] = useState(resetToken ? 'reset' : 'login'); // 'login' | 'register' | 'forgot' | 'reset'

    // Login state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Register state
    const [regEmail, setRegEmail] = useState('');
    const [regDisplayName, setRegDisplayName] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirm, setRegConfirm] = useState('');
    const [regDivision, setRegDivision] = useState('');
    const [divisions, setDivisions] = useState([]);

    // Forgot password state
    const [forgotEmail, setForgotEmail] = useState('');

    // Reset password state
    const [resetPassword, setResetPassword] = useState('');
    const [resetConfirm, setResetConfirm] = useState('');

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch(`${API}/api/auth/divisions`)
            .then(r => r.json())
            .then(data => Array.isArray(data) && setDivisions(data))
            .catch(() => {});
    }, []);

    const switchMode = (m) => {
        setMode(m);
        setError('');
        setSuccess('');
    };

    const handleLogin = async (e) => {
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

            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));
            onLogin(data.token, data.user);
        } catch (err) {
            setError('Cannot connect to server');
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (regPassword !== regConfirm) {
            setError('Passwords do not match');
            return;
        }
        if (regPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(`${API}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: regEmail,
                    display_name: regDisplayName,
                    password: regPassword,
                    division_id: regDivision || null
                })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Registration failed');
                setLoading(false);
                return;
            }

            setSuccess('Account created. You can now sign in.');
            setRegEmail('');
            setRegDisplayName('');
            setRegPassword('');
            setRegConfirm('');
            setLoading(false);
            setTimeout(() => switchMode('login'), 2000);
        } catch (err) {
            setError('Cannot connect to server');
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const res = await fetch(`${API}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to send reset email');
                setLoading(false);
                return;
            }

            setSuccess(data.message);
            setLoading(false);
        } catch (err) {
            setError('Cannot connect to server');
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (resetPassword !== resetConfirm) {
            setError('Passwords do not match');
            return;
        }
        if (resetPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(`${API}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, password: resetPassword })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to reset password');
                setLoading(false);
                return;
            }

            setSuccess(data.message);
            setResetPassword('');
            setResetConfirm('');
            setLoading(false);
            // Clean up URL token
            window.history.replaceState({}, '', window.location.pathname);
            setTimeout(() => switchMode('login'), 2500);
        } catch (err) {
            setError('Cannot connect to server');
            setLoading(false);
        }
    };

    const getSubtitle = () => {
        if (mode === 'login') return 'Sign in to your account';
        if (mode === 'register') return 'Create a new account';
        if (mode === 'forgot') return 'Reset your password';
        if (mode === 'reset') return 'Set a new password';
    };

    const getSubmitHandler = () => {
        if (mode === 'login') return handleLogin;
        if (mode === 'register') return handleRegister;
        if (mode === 'forgot') return handleForgotPassword;
        if (mode === 'reset') return handleResetPassword;
    };

    const getSubmitLabel = () => {
        if (mode === 'login') return 'Sign In';
        if (mode === 'register') return 'Create Account';
        if (mode === 'forgot') return 'Send Reset Link';
        if (mode === 'reset') return 'Set New Password';
    };

    return (
        <div className="login-page">
            <div className="login-particles">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="particle" style={{ '--i': i }} />
                ))}
            </div>

            <form className="login-card" onSubmit={getSubmitHandler()}>
                <div className="login-logo">
                    <div className="login-logo-icon">B</div>
                    <h1 className="login-title">PVBudget</h1>
                    <p className="login-subtitle">{getSubtitle()}</p>
                </div>

                {error && (
                    <div className="login-error">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        {error}
                    </div>
                )}

                {success && (
                    <div className="login-success">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
                        </svg>
                        {success}
                    </div>
                )}

                {mode === 'login' && (
                    <>
                        <div className="login-field">
                            <label htmlFor="login-username">Username or Email</label>
                            <input
                                id="login-username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter your username or email"
                                autoFocus
                                autoComplete="username"
                                required
                            />
                        </div>
                        <div className="login-field">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label htmlFor="login-password">Password</label>
                                <button type="button" className="login-toggle-btn" style={{ fontSize: '0.75rem' }} onClick={() => switchMode('forgot')}>
                                    Lupa password?
                                </button>
                            </div>
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
                    </>
                )}

                {mode === 'register' && (
                    <>
                        <div className="login-field">
                            <label htmlFor="reg-email">Email</label>
                            <input
                                id="reg-email"
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                placeholder="Enter your email"
                                autoFocus
                                autoComplete="email"
                                required
                            />
                        </div>
                        <div className="login-field">
                            <label htmlFor="reg-display-name">Display Name</label>
                            <input
                                id="reg-display-name"
                                type="text"
                                value={regDisplayName}
                                onChange={(e) => setRegDisplayName(e.target.value)}
                                placeholder="Your full name"
                                autoComplete="name"
                                required
                            />
                        </div>
                        <div className="login-field">
                            <label htmlFor="reg-password">Password</label>
                            <input
                                id="reg-password"
                                type="password"
                                value={regPassword}
                                onChange={(e) => setRegPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <div className="login-field">
                            <label htmlFor="reg-confirm">Confirm Password</label>
                            <input
                                id="reg-confirm"
                                type="password"
                                value={regConfirm}
                                onChange={(e) => setRegConfirm(e.target.value)}
                                placeholder="Repeat your password"
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <div className="login-field">
                            <label htmlFor="reg-division">Division</label>
                            <select
                                id="reg-division"
                                value={regDivision}
                                onChange={(e) => setRegDivision(e.target.value)}
                                className="login-select"
                            >
                                <option value="">— Select a division —</option>
                                {divisions.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                    </>
                )}

                {mode === 'forgot' && (
                    <div className="login-field">
                        <label htmlFor="forgot-email">Email</label>
                        <input
                            id="forgot-email"
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="Enter your registered email"
                            autoFocus
                            autoComplete="email"
                            required
                        />
                    </div>
                )}

                {mode === 'reset' && (
                    <>
                        <div className="login-field">
                            <label htmlFor="reset-password">New Password</label>
                            <input
                                id="reset-password"
                                type="password"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                autoFocus
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <div className="login-field">
                            <label htmlFor="reset-confirm">Confirm New Password</label>
                            <input
                                id="reset-confirm"
                                type="password"
                                value={resetConfirm}
                                onChange={(e) => setResetConfirm(e.target.value)}
                                placeholder="Repeat new password"
                                autoComplete="new-password"
                                required
                            />
                        </div>
                    </>
                )}

                <button type="submit" className="login-btn" disabled={loading}>
                    {loading ? <span className="login-spinner" /> : getSubmitLabel()}
                </button>

                <div className="login-toggle">
                    {mode === 'login' && (
                        <>
                            Don&apos;t have an account?{' '}
                            <button type="button" className="login-toggle-btn" onClick={() => switchMode('register')}>
                                Sign Up
                            </button>
                        </>
                    )}
                    {mode === 'register' && (
                        <>
                            Already have an account?{' '}
                            <button type="button" className="login-toggle-btn" onClick={() => switchMode('login')}>
                                Sign In
                            </button>
                        </>
                    )}
                    {(mode === 'forgot' || mode === 'reset') && (
                        <>
                            Kembali ke{' '}
                            <button type="button" className="login-toggle-btn" onClick={() => switchMode('login')}>
                                Sign In
                            </button>
                        </>
                    )}
                </div>
            </form>
        </div>
    );
}

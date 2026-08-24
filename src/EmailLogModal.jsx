import { useState, useEffect } from 'react';
import { X, Mail, CheckCircle, XCircle, AlertCircle, RefreshCw, Bell, Eye } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

export default function EmailLogModal({ token, onClose }) {
    const [logs, setLogs] = useState([]);
    const [users, setUsers] = useState([]);
    const [financeIds, setFinanceIds] = useState([]);
    const [financeSuccess, setFinanceSuccess] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [previewHtml, setPreviewHtml] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const fetchLogs = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API}/api/admin/email-log`, { headers });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
            setLogs(await res.json());
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API}/api/users`, { headers });
            if (res.ok) setUsers(await res.json());
        } catch {}
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${API}/api/admin/settings`, { headers });
            if (res.ok) {
                const data = await res.json();
                if (data.finance_recipient_ids) {
                    try { setFinanceIds(JSON.parse(data.finance_recipient_ids)); } catch {}
                }
            }
        } catch {}
    };

    const openPreview = async () => {
        setPreviewLoading(true);
        try {
            const res = await fetch(`${API}/api/admin/email-preview`, { headers });
            const html = await res.text();
            setPreviewHtml(html);
        } catch {
            setPreviewHtml('<p style="padding:2rem;color:red">Failed to load preview.</p>');
        } finally {
            setPreviewLoading(false);
        }
    };

    useEffect(() => { fetchLogs(); fetchUsers(); fetchSettings(); }, []);

    const saveFinanceIds = async (ids) => {
        try {
            await fetch(`${API}/api/admin/settings`, {
                method: 'PUT', headers,
                body: JSON.stringify({ key: 'finance_recipient_ids', value: JSON.stringify(ids) })
            });
            setFinanceSuccess('Saved');
            setTimeout(() => setFinanceSuccess(''), 2000);
        } catch {}
    };

    const toggleFinanceId = (id) => {
        const numId = Number(id);
        const updated = financeIds.includes(numId)
            ? financeIds.filter(i => i !== numId)
            : [...financeIds, numId];
        setFinanceIds(updated);
        saveFinanceIds(updated);
    };

    const statusIcon = (status) => {
        if (status === 'sent') return <CheckCircle size={14} style={{ color: '#16a34a' }} />;
        if (status === 'failed') return <XCircle size={14} style={{ color: '#dc2626' }} />;
        return <AlertCircle size={14} style={{ color: '#d97706' }} />;
    };

    const statusStyle = (status) => ({
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
        background: status === 'sent' ? '#dcfce7' : status === 'failed' ? '#fee2e2' : '#fef3c7',
        color: status === 'sent' ? '#166534' : status === 'failed' ? '#991b1b' : '#92400e',
    });

    const formatDate = (dt) => {
        if (!dt) return '-';
        return new Date(dt).toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const usersWithEmail = users.filter(u => u.email);

    return (
        <>
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Mail size={20} /> Email Notifications
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={openPreview}
                            disabled={previewLoading}
                            title="Preview email template"
                        >
                            <Eye size={14} /> {previewLoading ? 'Loading...' : 'Preview Email'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={fetchLogs} title="Refresh log">
                            <RefreshCw size={14} />
                        </button>
                        <button onClick={onClose}><X size={24} /></button>
                    </div>
                </div>

                <div className="modal-body">
                    {error && <div className="um-alert um-alert-error">{error}</div>}

                    {/* Notification Recipients Setting */}
                    <div style={{ background: 'var(--bg-color, #f9fafb)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--border)' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                            <Bell size={15} /> Additional Notification Recipients
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            Selected users receive an email when a form is fully approved, alongside the form creator and their manager. Only users with an email address are shown.
                        </p>
                        {financeSuccess && <div className="um-alert um-alert-success" style={{ marginBottom: '0.5rem' }}>{financeSuccess}</div>}
                        {usersWithEmail.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No users with email addresses found. Add email addresses in User Management first.</p>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {usersWithEmail.map(u => (
                                    <label key={u.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                                        padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                                        border: `1px solid ${financeIds.includes(Number(u.id)) ? 'var(--primary)' : 'var(--border)'}`,
                                        background: financeIds.includes(Number(u.id)) ? 'var(--primary-light, #eff6ff)' : 'var(--surface, #fff)',
                                        fontSize: '13px', userSelect: 'none'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={financeIds.includes(Number(u.id))}
                                            onChange={() => toggleFinanceId(u.id)}
                                            style={{ margin: 0 }}
                                        />
                                        <span>{u.display_name}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({u.email})</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Email Log Table */}
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>Send Log</h3>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
                    ) : logs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No emails sent yet. Emails appear here after a form is fully approved.
                        </div>
                    ) : (
                        <div className="um-table-wrap">
                            <table className="um-table">
                                <thead>
                                    <tr>
                                        <th>Form</th>
                                        <th>Recipient</th>
                                        <th>Email</th>
                                        <th>Status</th>
                                        <th>Sent At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => (
                                        <tr key={log.id}>
                                            <td>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{log.project_no || `Form #${log.form_id}`}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{log.event || ''}</div>
                                            </td>
                                            <td style={{ fontSize: '13px' }}>{log.to_name || '-'}</td>
                                            <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{log.to_email}</td>
                                            <td>
                                                <span style={statusStyle(log.status)}>
                                                    {statusIcon(log.status)} {log.status}
                                                </span>
                                                {log.error && (
                                                    <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{log.error}</div>
                                                )}
                                            </td>
                                            <td style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {formatDate(log.sent_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Email Preview Modal */}
        {previewHtml && (
            <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setPreviewHtml(null)}>
                <div
                    className="modal-content"
                    style={{ maxWidth: '680px', width: '95%', maxHeight: '90vh', padding: '0', overflow: 'hidden' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="modal-header" style={{ padding: '1rem 1.5rem' }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                            <Eye size={16} /> Email Preview (Sample Data)
                        </h2>
                        <button onClick={() => setPreviewHtml(null)}><X size={24} /></button>
                    </div>
                    <iframe
                        srcDoc={previewHtml}
                        title="Email Preview"
                        style={{ width: '100%', height: '600px', border: 'none', display: 'block' }}
                        sandbox="allow-same-origin"
                    />
                </div>
            </div>
        )}
        </>
    );
}

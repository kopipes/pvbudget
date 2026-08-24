import { useState, useEffect } from 'react';
import { X, Mail, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

export default function EmailLogModal({ token, onClose }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const headers = { 'Authorization': `Bearer ${token}` };

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

    useEffect(() => { fetchLogs(); }, []);

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
        return new Date(dt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta',
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Mail size={20} /> Email Notification Log
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={fetchLogs} title="Refresh">
                            <RefreshCw size={14} />
                        </button>
                        <button onClick={onClose}><X size={24} /></button>
                    </div>
                </div>

                <div className="modal-body">
                    {error && <div className="um-alert um-alert-error">{error}</div>}

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</div>
                    ) : logs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No emails sent yet. Emails will appear here after a form is fully approved.
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
    );
}

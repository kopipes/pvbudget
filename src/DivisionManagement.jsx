import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save, Building2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

export default function DivisionManagement({ token, onClose }) {
    const [divisions, setDivisions] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const fetchDivisions = async () => {
        try {
            const res = await fetch(`${API}/api/divisions`, { headers });
            if (res.ok) setDivisions(await res.json());
        } catch (e) {
            setError('Failed to load divisions');
        }
    };

    useEffect(() => { fetchDivisions(); }, []);

    const handleSave = async () => {
        if (!editName.trim()) return;
        setError(''); setSuccess('');
        try {
            const res = await fetch(`${API}/api/divisions/${editingId}`, {
                method: 'PUT', headers, body: JSON.stringify({ name: editName, description: editDesc })
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setEditingId(null); setSuccess('Division updated'); fetchDivisions();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) { setError('Failed to update division'); }
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setError(''); setSuccess('');
        try {
            const res = await fetch(`${API}/api/divisions`, {
                method: 'POST', headers, body: JSON.stringify({ name: newName, description: newDesc })
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setShowNew(false); setNewName(''); setNewDesc('');
            setSuccess('Division created'); fetchDivisions();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) { setError('Failed to create division'); }
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`Delete division "${name}"? This cannot be undone.`)) return;
        setError(''); setSuccess('');
        try {
            const res = await fetch(`${API}/api/divisions/${id}`, { method: 'DELETE', headers });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setSuccess('Division deleted'); fetchDivisions();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) { setError('Failed to delete division'); }
    };

    const startEdit = (d) => {
        setEditingId(d.id); setEditName(d.name); setEditDesc(d.description || '');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content user-mgmt-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><Building2 size={20} /> Division Management</h2>
                    <button onClick={onClose}><X size={24} /></button>
                </div>

                {error && <div className="um-alert um-alert-error">{error}</div>}
                {success && <div className="um-alert um-alert-success">{success}</div>}

                {showNew ? (
                    <div className="um-form">
                        <h3>New Division</h3>
                        <div className="um-form-grid">
                            <div className="um-field">
                                <label>Division Name</label>
                                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Finance" autoFocus />
                            </div>
                            <div className="um-field">
                                <label>Description</label>
                                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
                            </div>
                        </div>
                        <div className="um-form-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowNew(false)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={handleCreate}><Save size={14} /> Create</button>
                        </div>
                    </div>
                ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} style={{ alignSelf: 'flex-start' }}>
                        <Plus size={14} /> Add Division
                    </button>
                )}

                <div className="um-table-wrap">
                    <table className="um-table">
                        <thead>
                            <tr>
                                <th>Division Name</th>
                                <th>Description</th>
                                <th style={{ width: '80px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {divisions.map(d => (
                                <tr key={d.id}>
                                    {editingId === d.id ? (
                                        <>
                                            <td><input className="cell-input" value={editName} onChange={e => setEditName(e.target.value)} autoFocus /></td>
                                            <td><input className="cell-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} /></td>
                                            <td>
                                                <div className="um-actions">
                                                    <button className="btn-icon" onClick={handleSave}><Save size={15} /></button>
                                                    <button className="btn-icon" onClick={() => setEditingId(null)}><X size={15} /></button>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="um-name">{d.name}</td>
                                            <td className="um-manager">{d.description || '—'}</td>
                                            <td>
                                                <div className="um-actions">
                                                    <button className="btn-icon" title="Edit" onClick={() => startEdit(d)}><Edit2 size={15} /></button>
                                                    <button className="btn-icon" title="Delete" onClick={() => handleDelete(d.id, d.name)}><Trash2 size={15} /></button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                            {divisions.length === 0 && (
                                <tr><td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>No divisions found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
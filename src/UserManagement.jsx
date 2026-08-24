import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save, Shield, Users, UserCheck, Search } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const PAGE_SIZE = 15;

export default function UserManagement({ token, onClose }) {
    const [users, setUsers] = useState([]);
    const [managers, setManagers] = useState([]);
    const [editingUser, setEditingUser] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [confirmConfig, setConfirmConfig] = useState(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const showConfirm = (message) => new Promise(resolve => {
        setConfirmConfig({ message, onConfirm: () => { setConfirmConfig(null); resolve(true); }, onCancel: () => { setConfirmConfig(null); resolve(false); } });
    });
    const [form, setForm] = useState({
        username: '',
        password: '',
        display_name: '',
        role: 'user',
        manager_id: '',
        division_id: '',
        managedDivisions: []
    });

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const [divisions, setDivisions] = useState([]);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API}/api/users`, { headers });
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
                setManagers(data.filter(u => u.role === 'manager' || u.role === 'admin'));
            }
        } catch (e) {
            setError('Failed to load users');
        }
    };

    const fetchDivisions = async () => {
        try {
            const res = await fetch(`${API}/api/divisions`, { headers });
            if (res.ok) {
                const data = await res.json();
                setDivisions(data);
            }
        } catch (e) {
            console.error('Failed to load divisions');
        }
    };

    useEffect(() => { fetchUsers(); fetchDivisions(); }, []);

    const resetForm = () => {
        setForm({ username: '', password: '', display_name: '', email: '', role: 'user', manager_id: '', division_id: '', managedDivisions: [] });
        setEditingUser(null);
        setShowForm(false);
        setError('');
    };

    const handleSave = async () => {
        setError('');
        setSuccess('');

        if (!form.username || !form.display_name || !form.role) {
            setError('Username, display name, and role are required');
            return;
        }
        if (!editingUser && !form.password) {
            setError('Password is required for new users');
            return;
        }

        try {
            const body = { ...form };
            body.manager_id = body.manager_id ? parseInt(body.manager_id) : null;
            body.division_id = body.division_id ? parseInt(body.division_id) : null;
            if (editingUser && !body.password) delete body.password;
            // Send managedDivisions for managers
            const managedDivisions = body.managedDivisions || [];
            delete body.managedDivisions;
    
            const url = editingUser ? `${API}/api/users/${editingUser.id}` : `${API}/api/users`;
            const method = editingUser ? 'PUT' : 'POST';
    
            const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to save user'); return; }
    
            // Save managed divisions: always update if old or new role is manager
            const savedUserId = editingUser ? editingUser.id : data.id;
            if (savedUserId && (body.role === 'manager' || editingUser?.role === 'manager')) {
                // If role changed away from manager, clear divisions; otherwise save current selection
                const divisionsToSave = body.role === 'manager' ? managedDivisions : [];
                await fetch(`${API}/api/users/${savedUserId}/managed-divisions`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ division_ids: divisionsToSave })
                });
            }

            setSuccess(editingUser ? 'User updated' : 'User created');
            resetForm();
            fetchUsers();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) {
            setError('Failed to save user');
        }
    };

    const handleEdit = (user) => {
        setForm({
            username: user.username,
            password: '',
            display_name: user.display_name,
            email: user.email || '',
            role: user.role,
            manager_id: user.manager_id || '',
            division_id: user.division_id || '',
            managedDivisions: user.managedDivisions || []
        });
        setEditingUser(user);
        setShowForm(true);
        setError('');
        // Scroll to top so the edit form is visible
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (user) => {
        const confirmed = await showConfirm(`Delete user "${user.display_name}"? This cannot be undone.`);
        if (!confirmed) return;

        try {
            const res = await fetch(`${API}/api/users/${user.id}`, { method: 'DELETE', headers });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to delete');
                return;
            }

            setSuccess('User deleted');
            fetchUsers();
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) {
            setError('Failed to delete user');
        }
    };

    const handleDivisionChange = (value) => {
        setForm({ ...form, division_id: value });
    };

    const roleBadgeClass = (role) => `role-badge role-${role}`;

    const roleIcon = (role) => {
        if (role === 'admin') return <Shield size={14} />;
        if (role === 'corporate') return <Shield size={14} />;
        if (role === 'purchasing') return <Shield size={14} />;
        if (role === 'manager') return <UserCheck size={14} />;
        return <Users size={14} />;
    };

    const filteredUsers = users.filter(u => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (u.display_name || '').toLowerCase().includes(q) ||
            (u.username || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.role || '').toLowerCase().includes(q) ||
            (u.division_name || '').toLowerCase().includes(q)
        );
    });
    const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
    const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Shield size={20} /> User Management</h2>
                <button onClick={onClose}><X size={24} /></button>
            </div>

            <div className="modal-body">
                {error && <div className="um-alert um-alert-error">{error}</div>}
                {success && <div className="um-alert um-alert-success">{success}</div>}

                {/* Add / Edit Form */}
                {showForm ? (
                    <div className="um-form">
                        <h3>{editingUser ? 'Edit User' : 'New User'}</h3>
                        <div className="um-form-grid">
                            <div className="um-field">
                                <label>Username</label>
                                <input
                                    type="text"
                                    value={form.username}
                                    onChange={e => setForm({ ...form, username: e.target.value })}
                                    placeholder="Username"
                                />
                            </div>
                            <div className="um-field">
                                <label>{editingUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    placeholder={editingUser ? '(unchanged)' : 'Password'}
                                />
                            </div>
                            <div className="um-field">
                                <label>Display Name</label>
                                <input
                                    type="text"
                                    value={form.display_name}
                                    onChange={e => setForm({ ...form, display_name: e.target.value })}
                                    placeholder="Full Name"
                                />
                            </div>
                            <div className="um-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={form.email || ''}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div className="um-field">
                                <label>Role</label>
                                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                    <option value="user">User</option>
                                    <option value="manager">Manager</option>
                                    <option value="corporate">Corporate</option>
                                <option value="purchasing">Purchasing</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="um-field">
                                <label>Division</label>
                                <select value={form.division_id} onChange={e => setForm({ ...form, division_id: e.target.value })}>
                                    <option value="">— No Division —</option>
                                    {divisions.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            {form.role === 'user' && (
                                <div className="um-field" style={{ gridColumn: '1 / -1' }}>
                                    <label>Assigned Manager</label>
                                    <select value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                                        <option value="">— No Manager —</option>
                                        {managers.map(m => (
                                            <option key={m.id} value={m.id}>{m.display_name} ({m.role})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {form.role === 'manager' && (
                                <div className="um-field" style={{ gridColumn: '1 / -1' }}>
                                    <label>Managed Divisions</label>
                                    <div className="um-checkbox-grid">
                                        {divisions.map(d => (
                                            <label key={d.id} className="um-checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={form.managedDivisions.includes(d.id)}
                                                    onChange={e => {
                                                        const ids = e.target.checked
                                                            ? [...form.managedDivisions, d.id]
                                                            : form.managedDivisions.filter(id => id !== d.id);
                                                        setForm({ ...form, managedDivisions: ids });
                                                    }}
                                                />
                                                {d.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="um-form-actions">
                            <button className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={handleSave}>
                                <Save size={14} /> {editingUser ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setEditingUser(null); }}>
                        <Plus size={14} /> Add User
                    </button>
                )}

                {/* Search + Users Table */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0 0.5rem' }}>
                    <div className="dash-search-wrap" style={{ maxWidth: '320px' }}>
                        <Search size={15} />
                        <input
                            type="text"
                            placeholder="Search by name, email, username..."
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            className="dash-search-input"
                        />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{filteredUsers.length} users</span>
                </div>
                <div className="um-table-wrap">
                    <table className="um-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Division</th>
                                <th>Manager</th>
                                <th style={{ width: '80px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedUsers.map(u => (
                                <tr key={u.id}>
                                    <td className="um-name">{u.display_name}</td>
                                    <td className="um-username">{u.username}</td>
                                    <td className="um-username">{u.email || '—'}</td>
                                    <td><span className={roleBadgeClass(u.role)}>{roleIcon(u.role)} {u.role}</span></td>
                                    <td className="um-manager">{u.division_name || '—'}</td>
                                    <td className="um-manager">{u.manager_name || '—'}</td>
                                    <td>
                                        <div className="um-actions">
                                            <button className="btn-icon" title="Edit" onClick={() => handleEdit(u)}>
                                                <Edit2 size={15} />
                                            </button>
                                            <button className="btn-icon" title="Delete" onClick={() => handleDelete(u)}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {pagedUsers.length === 0 && (
                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>No users found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {totalUserPages > 1 && (
                    <div className="dash-pagination">
                        <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
                        <span className="dash-page-info">Page {page} of {totalUserPages}</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalUserPages, p + 1))} disabled={page === totalUserPages}>Next →</button>
                    </div>
                )}
            </div>

            {/* Confirm Dialog */}
            {confirmConfig && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={confirmConfig.onCancel}>
                    <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Confirm</h2>
                            <button onClick={confirmConfig.onCancel}><X size={24} /></button>
                        </div>
                        <div style={{ padding: '1rem 0' }}><p>{confirmConfig.message}</p></div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                            <button className="btn btn-secondary" onClick={confirmConfig.onCancel}>Cancel</button>
                            <button className="btn btn-primary" onClick={confirmConfig.onConfirm}>OK</button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Save, Shield, Users, UserCheck } from 'lucide-react';

const API = 'http://localhost:3001';

export default function UserManagement({ token, onClose }) {
    const [users, setUsers] = useState([]);
    const [managers, setManagers] = useState([]);
    const [editingUser, setEditingUser] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [form, setForm] = useState({
        username: '',
        password: '',
        display_name: '',
        role: 'user',
        manager_id: ''
    });

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

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

    useEffect(() => { fetchUsers(); }, []);

    const resetForm = () => {
        setForm({ username: '', password: '', display_name: '', role: 'user', manager_id: '' });
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
            if (editingUser && !body.password) delete body.password;

            const url = editingUser ? `${API}/api/users/${editingUser.id}` : `${API}/api/users`;
            const method = editingUser ? 'PUT' : 'POST';

            const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to save user');
                return;
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
            role: user.role,
            manager_id: user.manager_id || ''
        });
        setEditingUser(user);
        setShowForm(true);
        setError('');
    };

    const handleDelete = async (user) => {
        if (!confirm(`Delete user "${user.display_name}"? This cannot be undone.`)) return;

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

    const roleIcon = (role) => {
        if (role === 'admin') return <Shield size={14} />;
        if (role === 'manager') return <UserCheck size={14} />;
        return <Users size={14} />;
    };

    const roleBadgeClass = (role) => `role-badge role-${role}`;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content user-mgmt-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><Shield size={20} /> User Management</h2>
                    <button onClick={onClose}><X size={24} /></button>
                </div>

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
                                <label>Role</label>
                                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                    <option value="user">User</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
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

                {/* Users Table */}
                <div className="um-table-wrap">
                    <table className="um-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Manager</th>
                                <th style={{ width: '80px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id}>
                                    <td className="um-name">{u.display_name}</td>
                                    <td className="um-username">{u.username}</td>
                                    <td><span className={roleBadgeClass(u.role)}>{roleIcon(u.role)} {u.role}</span></td>
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
                            {users.length === 0 && (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>No users found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

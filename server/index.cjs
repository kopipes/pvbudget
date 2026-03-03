const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db.cjs');
const { authMiddleware, setupAuthRoutes, setupUserRoutes } = require('./auth.cjs');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

// Auth routes (login/logout — no auth required for login)
setupAuthRoutes(app);

// User management routes (admin only — auth checked inside)
setupUserRoutes(app);

// ===== PROTECTED FORM ROUTES =====
// All form routes require authentication
app.use('/api/forms', authMiddleware);

// Helper: get list of user IDs this user can see
function getVisibleUserIds(user, callback) {
    if (user.role === 'admin') {
        // Admin sees all — return null to skip filtering
        callback(null, null);
    } else if (user.role === 'manager') {
        // Manager sees own forms + forms from users managed by them
        db.all('SELECT id FROM users WHERE manager_id = ?', [user.id], (err, rows) => {
            if (err) return callback(err);
            const ids = [user.id, ...rows.map(r => r.id)];
            callback(null, ids);
        });
    } else {
        // Regular user sees only own forms
        callback(null, [user.id]);
    }
}

// 1. GET /api/forms (Search / List all — filtered by role)
app.get('/api/forms', (req, res) => {
    const { query, type } = req.query;

    getVisibleUserIds(req.user, (err, visibleIds) => {
        if (err) return res.status(500).json({ error: err.message });

        let sql = 'SELECT f.id, f.form_type, f.parent_id, f.project_no, f.event, f.venue, f.periode, f.periode_start, f.periode_end, f.note, f.created_by, f.updated_at, u.display_name as creator_name FROM forms f LEFT JOIN users u ON f.created_by = u.id';
        let conditions = [];
        let params = [];

        if (type) {
            conditions.push('f.form_type = ?');
            params.push(type);
        }

        if (query) {
            conditions.push('(f.event LIKE ? OR f.venue LIKE ? OR f.periode LIKE ? OR f.project_no LIKE ?)');
            const wildcardQuery = `%${query}%`;
            params.push(wildcardQuery, wildcardQuery, wildcardQuery, wildcardQuery);
        }

        // Role-based filtering
        if (visibleIds !== null) {
            const placeholders = visibleIds.map(() => '?').join(',');
            conditions.push(`(f.created_by IN (${placeholders}) OR f.created_by IS NULL)`);
            params.push(...visibleIds);
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY f.updated_at DESC';

        db.all(sql, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        });
    });
});

// 2. GET /api/forms/:id (Load Data — with permission check)
app.get('/api/forms/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT f.*, u.display_name as creator_name FROM forms f LEFT JOIN users u ON f.created_by = u.id WHERE f.id = ?', [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Form not found' });
        }

        // Check access
        const user = req.user;
        if (user.role !== 'admin') {
            if (row.created_by && row.created_by !== user.id) {
                // Manager can view subordinates' forms
                if (user.role === 'manager') {
                    db.get('SELECT id FROM users WHERE id = ? AND manager_id = ?', [row.created_by, user.id], (err, subordinate) => {
                        if (err) return res.status(500).json({ error: err.message });
                        if (!subordinate) {
                            return res.status(403).json({ error: 'Access denied' });
                        }
                        // Send with readonly flag for manager
                        if (row.data) {
                            try { row.data = JSON.parse(row.data); } catch (e) { console.error('Error parsing JSON data', e); }
                        }
                        row.readonly = true;
                        res.json(row);
                    });
                    return;
                }
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        // parse JSON back to object for client
        if (row.data) {
            try {
                row.data = JSON.parse(row.data);
            } catch (e) {
                console.error('Error parsing JSON data', e);
            }
        }
        row.readonly = false;
        res.json(row);
    });
});

// 3. POST /api/forms (Create new — sets created_by)
app.post('/api/forms', (req, res) => {
    const { form_type, parent_id, project_no, event, venue, periode, periode_start, periode_end, data, note } = req.body;

    const sql = `INSERT INTO forms (form_type, parent_id, project_no, event, venue, periode, periode_start, periode_end, data, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [form_type || 'budget', parent_id || null, project_no, event, venue, periode, periode_start, periode_end, JSON.stringify(data), note, req.user.id];

    db.run(sql, params, function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Form created successfully' });
    });
});

// 4. PUT /api/forms/:id (Update existing — permission check)
app.put('/api/forms/:id', (req, res) => {
    const { id } = req.params;
    const { form_type, parent_id, project_no, event, venue, periode, periode_start, periode_end, data, note } = req.body;

    // Check ownership first
    db.get('SELECT created_by FROM forms WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Form not found' });

        const user = req.user;
        // Admin can edit anything
        // Manager and User can only edit their own forms
        if (user.role !== 'admin' && row.created_by && row.created_by !== user.id) {
            return res.status(403).json({ error: 'You can only edit your own forms' });
        }

        const sql = `UPDATE forms SET form_type = ?, parent_id = ?, project_no = ?, event = ?, venue = ?, periode = ?, periode_start = ?, periode_end = ?, data = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        const params = [form_type || 'budget', parent_id || null, project_no, event, venue, periode, periode_start, periode_end, JSON.stringify(data), note, id];

        db.run(sql, params, function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Form not found' });
            }
            res.json({ id, message: 'Form updated successfully' });
        });
    });
});

// 5. DELETE /api/forms/:id (Admin only)
app.delete('/api/forms/:id', (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete forms' });
    }

    db.run('DELETE FROM forms WHERE id = ?', [id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Form not found' });
        }
        res.json({ message: 'Form deleted successfully' });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Backend API Server running silently on http://localhost:${PORT}`);
});

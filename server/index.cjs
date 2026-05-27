const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db.cjs');
const { authMiddleware, setupAuthRoutes, setupUserRoutes } = require('./auth.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

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

// ---- Status constants ----
const STATUS = {
    DRAFT: 'draft',
    PENDING: 'pending',
    REVISION: 'revision',
    APPROVED: 'approved'
};

// ---- Check if user can edit a form ----
function canEditForm(user, form, callback) {
    if (user.role === 'admin') return callback(null, false); // admin can edit approved
    if (user.role === 'corporate') return callback(null, true); // corporate always readonly
    if (form.status === STATUS.APPROVED) return callback(null, true); // locked
    if (form.created_by === user.id) return callback(null, false); // owner can edit
    return callback(null, true); // default readonly
}

// ---- Visibility: what forms can this user see? ----
// Corporate/Admin: all forms
// Manager: own + subordinates' forms + approved from all
// User: own forms only
function buildFormVisibility(user, extraField = '') {
    const sqlExtra = extraField ? `, ${extraField}` : '';
    let join = `LEFT JOIN users u ON f.created_by = u.id LEFT JOIN divisions div ON f.division_id = div.id`;
    let where = '';
    let params = [];

    if (user.role === 'admin' || user.role === 'corporate') {
        where = '';
    } else if (user.role === 'manager') {
        where = ` AND (f.created_by = ? OR u.manager_id = ? OR f.status = ? OR f.division_id IN (SELECT division_id FROM manager_divisions WHERE manager_id = ?))`;
        params = [user.id, user.id, STATUS.APPROVED, user.id];
    } else {
        where = ` AND (f.created_by = ? OR f.status = ?)`;
        params = [user.id, STATUS.APPROVED];
    }

    return {
        select: `SELECT f.*, u.display_name as creator_name, u.username as creator_username, div.name as division_name${sqlExtra}`,
        join: ` FROM forms f LEFT JOIN users u ON f.created_by = u.id LEFT JOIN divisions div ON f.division_id = div.id`,
        where,
        params
    };
}

// 1. LIST /api/forms (with filters)
app.get('/api/forms', (req, res) => {
    const { query, type, status } = req.query;
    const vis = buildFormVisibility(req.user);

    let sql = `${vis.select} ${vis.join} WHERE 1=1 ${vis.where}`;
    let params = [...vis.params];

    if (type) {
        sql += ' AND f.form_type = ?';
        params.push(type);
    }
    if (status) {
        sql += ' AND f.status = ?';
        params.push(status);
    }
    if (query) {
        sql += ' AND (f.event LIKE ? OR f.venue LIKE ? OR f.project_no LIKE ?)';
        const w = `%${query}%`;
        params.push(w, w, w);
    }

    sql += ' ORDER BY f.updated_at DESC';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. GET form history (all versions of a root form)
app.get('/api/forms/:id/history', (req, res) => {
    const { id } = req.params;

    db.get('SELECT root_form_id FROM forms WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const rootId = row && row.root_form_id ? row.root_form_id : id;

        const vis = buildFormVisibility(req.user);
        const sql = `${vis.select} ${vis.join ? vis.join : ''} WHERE (f.id = ? OR f.root_form_id = ?) AND f.status != 'archived' ORDER BY f.version_number ASC`;
        db.all(sql, [rootId, rootId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

// 3. GET /api/forms/:id (Load Detail)
app.get('/api/forms/:id', (req, res) => {
    const { id } = req.params;

    db.get(
        `SELECT f.*, u.display_name as creator_name, u.username as creator_username, u.division_id, div.name as division_name,
          (SELECT display_name FROM users WHERE id = f.approved_by_1) as approver_1_name,
          (SELECT display_name FROM users WHERE id = f.approved_by_2) as approver_2_name,
          (SELECT display_name FROM users WHERE id = f.rejected_by) as rejector_name
         FROM forms f
         LEFT JOIN users u ON f.created_by = u.id
         LEFT JOIN divisions div ON f.division_id = div.id
         WHERE f.id = ?`,
        [id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Form not found' });

            const user = req.user;
            canEditForm(user, row, (err, readonly) => {
                if (err) return res.status(500).json({ error: err.message });
                row.readonly = readonly || user.role === 'corporate';
                if (row.data) {
                    try { row.data = JSON.parse(row.data); } catch (e) {}
                }
                res.json(row);
            });
        }
    );
});

// 4. GET /api/forms/pending (Corporate/Admin — pending approvals)
app.get('/api/forms/pending', (req, res) => {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'corporate') {
        return res.status(403).json({ error: 'Access denied' });
    }

    db.all(
        `SELECT f.*, u.display_name as creator_name, u.division_id, div.name as division_name,
          (SELECT display_name FROM users WHERE id = f.approved_by_1) as approver_1_name
         FROM forms f
         LEFT JOIN users u ON f.created_by = u.id
         LEFT JOIN divisions div ON f.division_id = div.id
         WHERE f.status = ?
         ORDER BY f.submitted_at ASC`,
        [STATUS.PENDING],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// 5. GET /api/forms/my (User's own forms with status filter)
app.get('/api/forms/my', (req, res) => {
    const { status } = req.query;
    let sql = `SELECT f.*, div.name as division_name
               FROM forms f
               LEFT JOIN divisions div ON f.division_id = div.id
               WHERE f.created_by = ?`;
    let params = [req.user.id];

    if (status) {
        sql += ' AND f.status = ?';
        params.push(status);
    }

    sql += ' ORDER BY f.updated_at DESC';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 6. GET /api/forms/revisions (Forms sent back for revision, belonging to current user)
app.get('/api/forms/revisions', (req, res) => {
    db.all(
        `SELECT f.*, (SELECT display_name FROM users WHERE id = f.rejected_by) as rejector_name
         FROM forms f
         WHERE f.created_by = ? AND f.status = ?
         ORDER BY f.updated_at DESC`,
        [req.user.id, STATUS.REVISION],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// 7. POST /api/forms (Create new form as draft)
app.post('/api/forms', (req, res) => {
    const { form_type, project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, division_id } = req.body;

    if (req.user.role === 'corporate') {
        return res.status(403).json({ error: 'Corporate users cannot create forms' });
    }

    const sql = `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, status, version_number, created_by, division_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`;
    const params = [
        form_type || 'budget',
        project_no, event, venue, periode, periode_start, periode_end,
        management_fee_pct != null ? management_fee_pct : 10,
        JSON.stringify(data), note,
        STATUS.DRAFT, req.user.id, division_id || req.user.division_id || null
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Form created successfully' });
    });
});

// 8. PUT /api/forms/:id (Update form — only draft/revision owner can edit)
app.put('/api/forms/:id', (req, res) => {
    const { id } = req.params;
    const { project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, division_id } = req.body;

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        const user = req.user;
        const editableStatuses = [STATUS.DRAFT, STATUS.REVISION];

        if (!editableStatuses.includes(form.status) && user.role !== 'admin') {
            return res.status(403).json({ error: 'Only draft or revision forms can be edited' });
        }

        if (form.created_by !== user.id && user.role !== 'admin') {
            return res.status(403).json({ error: 'You can only edit your own forms' });
        }

        if (form.status === STATUS.APPROVED && user.role !== 'admin') {
            return res.status(403).json({ error: 'Approved forms are locked' });
        }

        const sql = `UPDATE forms SET project_no = ?, event = ?, venue = ?, periode = ?, periode_start = ?, periode_end = ?, management_fee_pct = ?, data = ?, note = ?, division_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        const params = [
            project_no, event, venue, periode, periode_start, periode_end,
            management_fee_pct != null ? management_fee_pct : 10,
            JSON.stringify(data), note, division_id, id
        ];

        db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id, message: 'Form updated successfully' });
        });
    });
});

// 9. POST /api/forms/:id/submit (Submit for approval)
app.post('/api/forms/:id/submit', (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });
        if (form.created_by !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (form.status !== STATUS.DRAFT && form.status !== STATUS.REVISION) {
            return res.status(400).json({ error: 'Only draft or revision forms can be submitted' });
        }

        db.run(
            `UPDATE forms SET status = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [STATUS.PENDING, id],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id, message: 'Form submitted for approval' });
            }
        );
    });
});

// 10. POST /api/forms/:id/approve (Corporate or Admin approves — 2-stage approval)
app.post('/api/forms/:id/approve', (req, res) => {
    const { id } = req.params;
    const { note } = req.body;

    if (req.user.role !== 'admin' && req.user.role !== 'corporate') {
        return res.status(403).json({ error: 'Only Admin or Corporate can approve forms' });
    }

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });
        if (form.status !== STATUS.PENDING) {
            return res.status(400).json({ error: 'Only pending forms can be approved' });
        }
        if (form.approval_stage === 'pending_2nd') {
            // === STAGE 2: Final approval ===
            // Prevent same user from doing both stages
            if (form.approved_by_1 && form.approved_by_1 === req.user.id) {
                return res.status(400).json({ error: 'You already approved this form at stage 1. A different approver is required for stage 2.' });
            }
            db.run(
                `UPDATE forms SET status = ?, approval_stage = ?, approved_at_2 = CURRENT_TIMESTAMP, approved_by_2 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [STATUS.APPROVED, 'final', req.user.id, id],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    // Archive previous approved version
                    db.run(`UPDATE forms SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE root_form_id = ? AND status = ? AND id != ?`,
                        [form.root_form_id || form.id, STATUS.APPROVED, id], () => {});
                    db.run(`INSERT INTO approval_history (form_id, action, note, actor_id, approval_stage) VALUES (?, 'approve', ?, ?, ?)`,
                        [id, note || 'Final approval', req.user.id, '2nd'], () => {});
                    res.json({ id, message: 'Form fully approved! (2nd approval complete)' });
                }
            );
        } else {
            // === STAGE 1: First approval ===
            // Prevent same user from approving both stages
            if (form.approved_by_1 && form.approved_by_1 === req.user.id) {
                return res.status(400).json({ error: 'You already approved this form at stage 1. Another approver is needed for stage 2.' });
            }
            db.run(
                `UPDATE forms SET approval_stage = ?, approved_at_1 = CURRENT_TIMESTAMP, approved_by_1 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                ['pending_2nd', req.user.id, id],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    db.run(`INSERT INTO approval_history (form_id, action, note, actor_id, approval_stage) VALUES (?, 'approve', ?, ?, ?)`,
                        [id, note || 'First approval', req.user.id, '1st'], () => {});
                    res.json({ id, message: 'First approval recorded. Awaiting second approval from different Admin or Corporate.' });
                }
            );
        }
    });
});

// 11. POST /api/forms/:id/reject (Corporate or Admin rejects — sends back for revision)
app.post('/api/forms/:id/reject', (req, res) => {
    const { note } = req.body;

    if (req.user.role !== 'admin' && req.user.role !== 'corporate') {
        return res.status(403).json({ error: 'Only Admin or Corporate can reject forms' });
    }

    const id = parseInt(req.params.id);

    if (!note || note.trim() === '') {
        return res.status(400).json({ error: 'Revision note is required when rejecting a form' });
    }

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });
        if (form.status !== STATUS.PENDING) {
            return res.status(400).json({ error: 'Only pending forms can be rejected' });
        }

        // Archive rejected version
        db.run(
            `UPDATE forms SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id],
            () => {}
        );

        // Create new revision version — reset approval stage
        const rootId = form.root_form_id || form.id;

        const sql = `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, status, version_number, root_form_id, revision_note, parent_id, created_by, division_id, approval_stage, rejected_by, rejected_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            form.form_type, form.project_no, form.event, form.venue, form.periode, form.periode_start, form.periode_end,
            form.management_fee_pct, form.data, form.note,
            STATUS.REVISION, form.version_number + 1, rootId || id,
            note, id, req.user.id, form.division_id, 'pending_1st', req.user.id, new Date().toISOString()
        ];

        db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO approval_history (form_id, action, note, actor_id) VALUES (?, 'reject', ?, ?)`, [id, note, req.user.id], () => {});
            res.status(201).json({ id: this.lastID, message: 'Form sent back for revision. New version created.' });
        });
    });
});

// 12. DELETE /api/forms/:id (Admin only, only draft/revision/archived)
app.delete('/api/forms/:id', (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete forms' });
    }

    const { id } = req.params;
    db.get('SELECT status FROM forms WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Form not found' });

        const deletable = [STATUS.DRAFT, STATUS.REVISION, 'archived'];
        if (!deletable.includes(row.status)) {
            return res.status(400).json({ error: 'Only draft, revision or archived forms can be deleted' });
        }

        db.run('DELETE FROM forms WHERE id = ?', [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Form deleted successfully' });
        });
    });
});

// 13. GET /api/forms/:id/approval-history
app.get('/api/forms/:id/approval-history', (req, res) => {
    const { id } = req.params;
    db.all(
        `SELECT ah.*, u.display_name as actor_name
         FROM approval_history ah
         JOIN users u ON ah.actor_id = u.id
         WHERE ah.form_id = ? ORDER BY ah.created_at ASC`,
        [id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// 14. PUT /api/forms/:id/unlock (Admin unlocks an approved form back to draft for re-submission)
app.put('/api/forms/:id/unlock', (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only Admin can unlock approved forms' });
    }

    const { id } = req.params;
    db.get('SELECT status FROM forms WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Form not found' });

        if (row.status !== STATUS.APPROVED) {
            return res.status(400).json({ error: 'Only approved forms can be unlocked' });
        }

        // Archive current approved
        db.run(`UPDATE forms SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id], () => {});

        db.run(`UPDATE forms SET status = ?, approved_by = NULL, approved_at = NULL, version_number = version_number + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [STATUS.REVISION, id],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id, message: 'Approved form unlocked back to revision. Please submit again.' });
            }
        );
    });
});

// 15. POST /api/forms/:id/create-realization (Create realization form from approved budget)
app.post('/api/forms/:id/create-realization', (req, res) => {
    if (req.user.role === 'corporate') {
        return res.status(403).json({ error: 'Corporate users cannot create realization forms' });
    }

    const { id } = req.params;

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        // Only allow creating realization from approved budget forms
        if (form.form_type !== 'budget') {
            return res.status(400).json({ error: 'Only budget forms can be converted to realization' });
        }
        if (form.status !== STATUS.APPROVED) {
            return res.status(400).json({ error: 'Only approved budget forms can be converted to realization' });
        }

        // Check if realization already exists for this budget
        db.get('SELECT id FROM forms WHERE source_budget_id = ?', [id], (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });
            if (existing) {
                return res.status(400).json({ 
                    error: 'Realization form already exists for this budget', 
                    existing_id: existing.id 
                });
            }

            // Create realization form with copied data
            // Reset actualRate in each sub item to 0
            let data = [];
            try {
                data = JSON.parse(form.data);
                data = data.map(main => ({
                    ...main,
                    subs: main.subs.map(sub => ({ ...sub, actualRate: 0 }))
                }));
            } catch (e) {}

            const sql = `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, status, version_number, source_budget_id, created_by, division_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`;
            const params = [
                'realization',
                form.project_no, form.event, form.venue, form.periode, form.periode_start, form.periode_end,
                form.management_fee_pct,
                JSON.stringify(data),
                form.note || '',
                STATUS.DRAFT,
                id, // source_budget_id
                req.user.id,
                form.division_id
            ];

            db.run(sql, params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ 
                    id: this.lastID, 
                    message: 'Realization form created successfully',
                    source_budget_id: id
                });
            });
        });
    });
});

// Serve static frontend files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Backend API Server running on http://localhost:${PORT}`);
});

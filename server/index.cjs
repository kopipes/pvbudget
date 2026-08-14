const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

// ─── Read-only integration export for 2ndbrain (keyed) ───────────────────────
const INTEGRATION_KEY = (() => {
    if (process.env.INTERNAL_API_KEY) return process.env.INTERNAL_API_KEY.trim();
    try { return fs.readFileSync(path.join(__dirname, '..', '.integration_key'), 'utf8').trim(); } catch { return ''; }
})();
function safeEq(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function requireIntegrationKey(req, res, next) {
    if (!INTEGRATION_KEY) return res.status(503).json({ error: 'Integration disabled (no key configured)' });
    const h = String(req.header('x-internal-api-key') || '').trim();
    const b = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if ((h && safeEq(h, INTEGRATION_KEY)) || (b && safeEq(b, INTEGRATION_KEY))) return next();
    return res.status(401).json({ error: 'Unauthorized' });
}
const allAsync = (sql) => new Promise((resolve, reject) => db.all(sql, [], (e, rows) => (e ? reject(e) : resolve(rows))));
app.get('/api/integration/export', requireIntegrationKey, async (req, res) => {
    try {
        const [divisions, users, forms, approval_history] = await Promise.all([
            allAsync('SELECT * FROM divisions'),
            allAsync('SELECT id, username, display_name, role, division_id, manager_id, created_at FROM users'), // NO password
            allAsync('SELECT * FROM forms'),
            allAsync('SELECT * FROM approval_history'),
        ]);
        res.json({ app: 'pvbudget', exportDate: new Date().toISOString(), divisions, users, forms, approval_history });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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
// Returns true = readonly, false = editable
// Rules:
//   admin     → always editable
//   corporate → always readonly
//   manager   → editable if they are the owner OR the form is in their division
//   user      → editable only if they are the owner
function canEditForm(user, form, callback) {
    const role = user.role?.toLowerCase();
    if (role === 'admin') return callback(null, false); // admin never readonly
    if (role === 'corporate' || role === 'purchasing') return callback(null, true); // always readonly
    if (role === 'manager') {
        // Manager can always edit their own forms
        if (String(form.created_by) === String(user.id)) return callback(null, false);
        // For non-owned forms: resolve effective division (form.division_id or creator's division_id)
        db.get(
            `SELECT COALESCE(f.division_id, u.division_id) as effective_div
             FROM forms f LEFT JOIN users u ON f.created_by = u.id WHERE f.id = ?`,
            [form.id],
            (err, row) => {
                if (err) return callback(err, true);
                const effectiveDiv = row && row.effective_div;
                if (!effectiveDiv) return callback(null, true); // no division → readonly

                // Check manager_divisions first
                db.get(
                    'SELECT 1 FROM manager_divisions WHERE manager_id = ? AND division_id = ?',
                    [user.id, effectiveDiv],
                    (err, divRow) => {
                        if (err) return callback(err, true);
                        if (divRow) return callback(null, false); // editable via manager_divisions

                        // Fallback: manager's own division_id on users table
                        db.get('SELECT division_id FROM users WHERE id = ?', [user.id], (err, managerRow) => {
                            if (err) return callback(err, true);
                            const sameDiv = managerRow && String(managerRow.division_id) === String(effectiveDiv);
                            return callback(null, !sameDiv);
                        });
                    }
                );
            }
        );
        return;
    }
    // user role: editable only if owner
    return callback(null, String(form.created_by) !== String(user.id));
}

// ---- Visibility: what forms can this user see? ----
// Corporate/Admin: all forms
// Manager: own + subordinates' + division forms + approved from all
// User: own forms + same-division forms (read-only) + globally approved forms
function buildFormVisibility(user, extraField = '') {
    const sqlExtra = extraField ? `, ${extraField}` : '';
    let join = `LEFT JOIN users u ON f.created_by = u.id LEFT JOIN divisions div ON COALESCE(f.division_id, u.division_id) = div.id`;
    let where = '';
    let params = [];

    if (user.role === 'admin' || user.role === 'corporate') {
        where = '';
    } else if (user.role === 'purchasing') {
        // Purchasing sees all approved forms across all divisions (read-only)
        where = ` AND f.status = ?`;
        params = [STATUS.APPROVED];
    } else if (user.role === 'manager') {
        // Manager sees: own forms + subordinates' forms + approved forms + division forms
        // Division check covers both manager_divisions table and manager's own division_id
        where = ` AND (f.created_by = ? OR u.manager_id = ? OR f.status = ? OR COALESCE(f.division_id, u.division_id) IN (SELECT division_id FROM manager_divisions WHERE manager_id = ?) OR COALESCE(f.division_id, u.division_id) = (SELECT division_id FROM users WHERE id = ?))`;
        params = [user.id, user.id, STATUS.APPROVED, user.id, user.id];
    } else {
        // user: own forms + same-division forms + globally approved forms
        where = ` AND (f.created_by = ? OR f.status = ? OR COALESCE(f.division_id, u.division_id) = (SELECT division_id FROM users WHERE id = ?))`;
        params = [user.id, STATUS.APPROVED, user.id];
    }

    return {
        select: `SELECT f.*, u.display_name as creator_name, u.username as creator_username, div.name as division_name${sqlExtra}`,
        join: ` FROM forms f LEFT JOIN users u ON f.created_by = u.id LEFT JOIN divisions div ON COALESCE(f.division_id, u.division_id) = div.id`,
        where,
        params
    };
}

// 1. LIST /api/forms (with filters + pagination)
app.get('/api/forms', (req, res) => {
    const { query, type, status, page = 1, limit = 50 } = req.query;
    const vis = buildFormVisibility(req.user);

    // Parse pagination params
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

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
    if (req.query.source_budget_id) {
        sql += ' AND f.source_budget_id = ?';
        params.push(req.query.source_budget_id);
    }

    // Get total count for pagination
    const countSql = sql.replace(vis.select, 'SELECT COUNT(*) as total');
    db.get(countSql, params, (err, countRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const total = countRow ? countRow.total : 0;

        // Add pagination
        sql += ' ORDER BY f.updated_at DESC LIMIT ? OFFSET ?';
        db.all(sql, [...params, limitNum, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                data: rows,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: total,
                    totalPages: Math.ceil(total / limitNum)
                }
            });
        });
    });
});

// 2. GET /api/forms/my (User's own forms - MUST be before /:id)
app.get('/api/forms/my', (req, res) => {
    const { status } = req.query;
    let sql = `SELECT f.*, div.name as division_name
               FROM forms f
               LEFT JOIN users u ON f.created_by = u.id
               LEFT JOIN divisions div ON COALESCE(f.division_id, u.division_id) = div.id
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

// 3. GET /api/forms/pending (Corporate/Admin — pending approvals)
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
         LEFT JOIN divisions div ON COALESCE(f.division_id, u.division_id) = div.id
         WHERE f.status = ?
         ORDER BY f.submitted_at ASC`,
        [STATUS.PENDING],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// 4. GET /api/forms/revisions (Forms sent back for revision)
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

// 5. GET form history (all versions of a root form - MUST be before /:id)
app.get('/api/forms/:id/history', (req, res) => {
    const { id } = req.params;

    db.get('SELECT root_form_id FROM forms WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const rootId = row && row.root_form_id ? row.root_form_id : id;

        const vis = buildFormVisibility(req.user);
        // Include archived so version history shows all snapshots including approved ones that were superseded
        const sql = `${vis.select} ${vis.join ? vis.join : ''} WHERE (f.id = ? OR f.root_form_id = ?)${vis.where} ORDER BY f.version_number ASC`;
        db.all(sql, [rootId, rootId, ...vis.params], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

// 6. GET /api/forms/:id (Load Detail - MUST be after specific routes above)
app.get('/api/forms/:id', (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const vis = buildFormVisibility(user);

    // Build visibility-aware query so users can only fetch forms they're allowed to see
    const sql = `SELECT f.*, u.display_name as creator_name, u.username as creator_username, u.division_id, div.name as division_name,
          (SELECT display_name FROM users WHERE id = f.approved_by_1) as approver_1_name,
          (SELECT display_name FROM users WHERE id = f.approved_by_2) as approver_2_name,
          (SELECT display_name FROM users WHERE id = f.rejected_by) as rejector_name,
          COALESCE(f.has_realisasi, 0) as has_realisasi
         FROM forms f
         LEFT JOIN users u ON f.created_by = u.id
         LEFT JOIN divisions div ON COALESCE(f.division_id, u.division_id) = div.id
         WHERE f.id = ?${vis.where}`;

    db.get(sql, [id, ...vis.params], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Form not found' });

        canEditForm(user, row, (err, readonly) => {
            if (err) return res.status(500).json({ error: err.message });
            row.readonly = readonly || user.role === 'corporate';
            if (row.data) {
                try { row.data = JSON.parse(row.data); } catch (e) {}
            }
            if (row.realiza_data) {
                try { row.realiza_data = JSON.parse(row.realiza_data); } catch (e) {}
            }
            res.json(row);
        });
    });
});

// 7. POST /api/forms (Create new form as draft)
app.post('/api/forms', (req, res) => {
    const { form_type, project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, division_id, include_pph23, discount_pct } = req.body;

    if (req.user.role === 'corporate') {
        return res.status(403).json({ error: 'Corporate users cannot create forms' });
    }

    // Validate management_fee_pct is a valid number
    if (management_fee_pct != null && (typeof management_fee_pct !== 'number' || management_fee_pct < 0 || management_fee_pct > 100)) {
        return res.status(400).json({ error: 'Management fee percentage must be between 0 and 100' });
    }

    // Validate data structure if provided
    if (data !== undefined && data !== null) {
        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Form data must be an array' });
        }
    }

    const sql = `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, include_pph23, discount_pct, data, note, status, version_number, created_by, division_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,1, ?, ?)`;
    const params = [
        form_type || 'budget',
        project_no || '', event || '', venue || '', periode || '', periode_start || '', periode_end || '',
        management_fee_pct != null ? management_fee_pct : 10,
        include_pph23 !== undefined ? (include_pph23 ? 1 : 0) : 1,
        discount_pct != null ? discount_pct : 0,
        JSON.stringify(data || []), note || '',
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
    const { project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, division_id, realiza_data, include_pph23, discount_pct } = req.body;

    // Validate management_fee_pct is a valid number
    if (management_fee_pct != null && (typeof management_fee_pct !== 'number' || management_fee_pct < 0 || management_fee_pct > 100)) {
        return res.status(400).json({ error: 'Management fee percentage must be between 0 and 100' });
    }

    // Validate data structure if provided
    if (data !== undefined && data !== null) {
        if (!Array.isArray(data)) {
            return res.status(400).json({ error: 'Form data must be an array' });
        }
    }

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        const user = req.user;
        const editableStatuses = [STATUS.DRAFT, STATUS.REVISION];

        // Allow saving realiza_data on approved forms by the owner or admin
        const isRealizaOnlyUpdate = realiza_data !== undefined && data === undefined && project_no === undefined && event === undefined;
        const isOwner = String(form.created_by) === String(user.id);

        if (form.status === STATUS.APPROVED && !isRealizaOnlyUpdate && user.role !== 'admin') {
            return res.status(403).json({ error: 'Approved forms are locked' });
        }

        if (!editableStatuses.includes(form.status) && !isRealizaOnlyUpdate && user.role !== 'admin') {
            return res.status(403).json({ error: 'Only draft or revision forms can be edited' });
        }

        if (!isOwner && user.role !== 'admin') {
            return res.status(403).json({ error: 'You can only edit your own forms' });
        }

        if (isRealizaOnlyUpdate) {
            // Only owner or admin can update realisasi data
            if (!isOwner && user.role !== 'admin') {
                return res.status(403).json({ error: 'Only the form owner or admin can update realisasi data' });
            }
            // Only update realiza_data, leave everything else untouched
            db.run(`UPDATE forms SET realiza_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [JSON.stringify(realiza_data), id],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ id, message: 'Realisasi data saved successfully' });
                }
            );
            return;
        }

        const sql = `UPDATE forms SET project_no = ?, event = ?, venue = ?, periode = ?, periode_start = ?, periode_end = ?, management_fee_pct = ?, include_pph23 = ?, discount_pct = ?, data = ?, note = ?, division_id = ?, realiza_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        const params = [
            project_no || '', event || '', venue || '', periode || '', periode_start || '', periode_end || '',
            management_fee_pct != null ? management_fee_pct : 10,
            include_pph23 !== undefined ? (include_pph23 ? 1 : 0) : 1,
            discount_pct != null ? discount_pct : 0,
            JSON.stringify(data || []), note || '', division_id,
            // Preserve existing realiza_data if not explicitly provided
            realiza_data !== undefined ? JSON.stringify(realiza_data) : form.realiza_data || null,
            id
        ];

        db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id, message: 'Form updated successfully' });
        });
    });
});

// 9. POST /api/forms/:id/submit (Submit for approval)
// Only manager or admin can submit forms
app.post('/api/forms/:id/submit', (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only a Manager or Admin can submit forms for approval' });
    }

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        // Manager must be the owner or manage the division this form belongs to
        if (req.user.role === 'manager') {
            const isOwner = String(form.created_by) === String(req.user.id);
            if (isOwner) return doSubmit();

            // Resolve the effective division of the form (form.division_id or creator's division_id)
            db.get(
                `SELECT COALESCE(f.division_id, u.division_id) as effective_div
                 FROM forms f LEFT JOIN users u ON f.created_by = u.id WHERE f.id = ?`,
                [id],
                (err, row) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const effectiveDiv = row && row.effective_div;
                    if (!effectiveDiv) return res.status(403).json({ error: 'Form has no division assigned' });

                    // Check manager_divisions first, then fall back to manager's own division_id
                    db.get(
                        `SELECT 1 FROM manager_divisions WHERE manager_id = ? AND division_id = ?`,
                        [req.user.id, effectiveDiv],
                        (err, divRow) => {
                            if (err) return res.status(500).json({ error: err.message });
                            if (divRow) return doSubmit();

                            // Fallback: check manager's own division_id on users table
                            db.get(
                                `SELECT division_id FROM users WHERE id = ?`,
                                [req.user.id],
                                (err, managerRow) => {
                                    if (err) return res.status(500).json({ error: err.message });
                                    if (managerRow && String(managerRow.division_id) === String(effectiveDiv)) {
                                        return doSubmit();
                                    }
                                    return res.status(403).json({ error: 'You can only submit forms you own or that belong to your division' });
                                }
                            );
                        }
                    );
                }
            );
        } else {
            doSubmit();
        }

        function doSubmit() {
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
        }
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
            if (form.approved_by_1 && String(form.approved_by_1) === String(req.user.id)) {
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
            if (form.approved_by_1 && String(form.approved_by_1) === String(req.user.id)) {
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

        const rootId = form.root_form_id || form.id;
        const insertSql = `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, status, version_number, root_form_id, revision_note, parent_id, created_by, division_id, approval_stage, rejected_by, rejected_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const insertParams = [
            form.form_type, form.project_no, form.event, form.venue, form.periode, form.periode_start, form.periode_end,
            form.management_fee_pct, form.data, form.note,
            STATUS.REVISION, form.version_number + 1, rootId || id,
            note, id, form.created_by, form.division_id, 'pending_1st', req.user.id, new Date().toISOString()
        ];

        // Create new revision first, then archive old — both must succeed
        db.run(insertSql, insertParams, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const newId = this.lastID;
            // Archive the rejected form and log history — new revision is already safely created
            db.run(`UPDATE forms SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id], (archiveErr) => {
                if (archiveErr) console.error('Failed to archive rejected form:', archiveErr.message);
            });
            db.run(`INSERT INTO approval_history (form_id, action, note, actor_id) VALUES (?, 'reject', ?, ?)`, [id, note, req.user.id], () => {});
            res.status(201).json({ id: newId, message: 'Form sent back for revision. New version created.' });
        });
    });
});

// 12. DELETE /api/forms/:id (Admin only - can delete any form)
app.delete('/api/forms/:id', (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete forms' });
    }

    const { id } = req.params;
    db.get('SELECT status FROM forms WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Form not found' });
        
        // Admin can delete any form (draft, revision, approved, archived)

        db.run('DELETE FROM forms WHERE id = ?', [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Form deleted successfully' });
        });
    });
});

// 13. GET /api/forms/:id/approval-history
app.get('/api/forms/:id/approval-history', (req, res) => {
    const { id } = req.params;
    const vis = buildFormVisibility(req.user);
    // Verify the requesting user can see this form before returning its history
    const checkSql = `SELECT f.id FROM forms f LEFT JOIN users u ON f.created_by = u.id WHERE f.id = ?${vis.where}`;
    db.get(checkSql, [id, ...vis.params], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Form not found' });
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
});

// 14. PUT /api/forms/:id/unlock (Admin unlocks an approved form back to revision)
app.put('/api/forms/:id/unlock', (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only Admin can unlock approved forms' });
    }

    const { id } = req.params;
    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        if (form.status !== STATUS.APPROVED) {
            return res.status(400).json({ error: 'Only approved forms can be unlocked' });
        }

        const rootId = form.root_form_id || form.id;
        const newVersion = (form.version_number || 1) + 1;

        // Create a new revision copy — preserves the approved snapshot
        const sql = `INSERT INTO forms
            (form_type, project_no, event, venue, periode, periode_start, periode_end,
             management_fee_pct, data, note, status, version_number, root_form_id,
             parent_id, created_by, division_id, approval_stage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            form.form_type, form.project_no, form.event, form.venue, form.periode,
            form.periode_start, form.periode_end, form.management_fee_pct, form.data,
            form.note, STATUS.REVISION, newVersion, rootId,
            form.id, form.created_by, form.division_id, 'pending_1st'
        ];

        db.run(sql, params, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const newId = this.lastID;
            res.json({ id: newId, message: 'New revision created from approved form. Please edit and re-submit.' });
        });
    });
});

// 15. POST /api/forms/:id/create-po (Create PO from approved budget)
// Allowed: User (form creator), Manager, Admin (NOT Corporate)
app.post('/api/forms/:id/create-po', (req, res) => {
    if (req.user.role === 'corporate') {
        return res.status(403).json({ error: 'Corporate users cannot create PO' });
    }

    const { id } = req.params;

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        // Only owner or admin/manager can create PO
        if (req.user.role !== 'admin' && req.user.role !== 'manager' && String(form.created_by) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the form owner, manager, or admin can create a PO' });
        }

        // Only allow creating PO from approved budget forms
        if (form.form_type && form.form_type !== 'budget') {
            return res.status(400).json({ error: 'Only budget forms can have PO created' });
        }
        if (form.status !== STATUS.APPROVED) {
            return res.status(400).json({ error: 'Only approved budget forms can have PO created' });
        }

        // Check if PO already exists for this budget
        if (form.has_po) {
            return res.status(400).json({ 
                error: 'PO already exists for this budget',
                po_number: form.po_number
            });
        }

        // Update the budget form to mark it has having PO
        // PO Number will be set via update-po endpoint
        db.run(`UPDATE forms SET has_po = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ 
                id: id, 
                message: 'PO creation initiated. Please set the PO Number.',
                po_number: null
            });
        });
    });
});

// 16. PUT /api/forms/:id/po (Update PO number and per-row PO data - Admin/Manager/Corporate)
app.put('/api/forms/:id/po', (req, res) => {
    const { id } = req.params;
    const { po_number, items } = req.body;

    // Admin, Manager, and Corporate can update PO Number
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.role !== 'corporate') {
        return res.status(403).json({ error: 'Only Admin, Manager, or Corporate can update PO Number' });
    }

    // po_number is optional — user may save per-row PO data without a main PO number yet

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        // Allow update if has_po is set (PO initiated) OR if corporate or admin (always can set)

        // Update po_number and optionally per-row item data (for per-row PO numbers)
        const dataToSave = items ? JSON.stringify(items) : form.data;
        const savedPoNumber = po_number ? po_number.trim() : (form.po_number || null);
        db.run(`UPDATE forms SET po_number = ?, has_po = 1, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
            [savedPoNumber, dataToSave, id], 
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ 
                    id, 
                    po_number: savedPoNumber,
                    message: 'PO Number saved successfully'
                });
            }
        );
    });
});

// 17. POST /api/forms/:id/enable-realisasi (Enable REALISASI tab - marks has_realisasi=1)
app.post('/api/forms/:id/enable-realisasi', (req, res) => {
    if (req.user.role === 'corporate') {
        return res.status(403).json({ error: 'Corporate users cannot enable realization' });
    }

    const { id } = req.params;

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        // Only owner or admin can enable realisasi
        if (req.user.role !== 'admin' && String(form.created_by) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the form owner or admin can enable realization' });
        }
        
        if (form.status !== STATUS.APPROVED) {
            return res.status(400).json({ error: 'Only approved forms can have realization enabled' });
        }

        db.run(`UPDATE forms SET has_realisasi = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id, message: 'Realisasi enabled', has_realisasi: 1 });
        });
    });
});

// 17b. POST /api/forms/:id/create-realization (Create realization form from approved budget)
app.post('/api/forms/:id/create-realization', (req, res) => {
    if (req.user.role === 'corporate') {
        return res.status(403).json({ error: 'Corporate users cannot create realization forms' });
    }

    const { id } = req.params;

    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, form) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!form) return res.status(404).json({ error: 'Form not found' });

        // Only owner or admin can create realization
        if (req.user.role !== 'admin' && String(form.created_by) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Only the form owner or admin can create a realization form' });
        }

        // Only allow creating realization from approved budget forms
        // Treat null/undefined form_type as 'budget' for backward compatibility
        if (form.form_type && form.form_type !== 'budget') {
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

            const sql = `INSERT INTO forms (form_type, event, venue, periode, periode_start, periode_end, management_fee_pct, data, note, status, version_number, source_budget_id, created_by, division_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`;
            const params = [
                'realization',
                form.event, form.venue, form.periode, form.periode_start, form.periode_end,
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

 // Division routes are handled by setupUserRoutes in auth.cjs

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

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db.cjs');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

// 1. GET /api/forms (Search / List all)
app.get('/api/forms', (req, res) => {
    const { query, type } = req.query; // type can be 'budget' or 'realisasi'

    let sql = 'SELECT id, form_type, parent_id, project_no, event, venue, periode, periode_start, periode_end, note, updated_at FROM forms';
    let conditions = [];
    let params = [];

    if (type) {
        conditions.push('form_type = ?');
        params.push(type);
    }

    if (query) {
        conditions.push('(event LIKE ? OR venue LIKE ? OR periode LIKE ? OR project_no LIKE ?)');
        const wildcardQuery = `%${query}%`;
        params.push(wildcardQuery, wildcardQuery, wildcardQuery, wildcardQuery);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY updated_at DESC';

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 2. GET /api/forms/:id (Load Data)
app.get('/api/forms/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM forms WHERE id = ?', [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Form not found' });
        }
        // parse JSON back to object for client
        if (row.data) {
            try {
                row.data = JSON.parse(row.data);
            } catch (e) {
                console.error('Error parsing JSON data', e);
            }
        }
        res.json(row);
    });
});

// 3. POST /api/forms (Create new)
app.post('/api/forms', (req, res) => {
    const { form_type, parent_id, project_no, event, venue, periode, periode_start, periode_end, data, note } = req.body;

    const sql = `INSERT INTO forms (form_type, parent_id, project_no, event, venue, periode, periode_start, periode_end, data, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [form_type || 'budget', parent_id || null, project_no, event, venue, periode, periode_start, periode_end, JSON.stringify(data), note];

    db.run(sql, params, function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Form created successfully' });
    });
});

// 4. PUT /api/forms/:id (Update existing)
app.put('/api/forms/:id', (req, res) => {
    const { id } = req.params;
    const { form_type, parent_id, project_no, event, venue, periode, periode_start, periode_end, data, note } = req.body;

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

// 5. DELETE /api/forms/:id
app.delete('/api/forms/:id', (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (password !== 'admin123') {
        return res.status(401).json({ error: 'Incorrect password' });
    }

    db.run('DELETE FROM forms WHERE id = ?', [id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Form not found' });
        }
        // Optional: also delete children if deleting a budget, but simple version deletes one by one
        res.json({ message: 'Form deleted successfully' });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Backend API Server running silently on http://localhost:${PORT}`);
});

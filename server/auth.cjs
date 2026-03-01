const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db.cjs');

// Generate a random session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Auth middleware — attaches req.user if valid token
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);

    db.get(
        `SELECT u.id, u.username, u.display_name, u.role, u.manager_id
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = ?`,
        [token],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Internal server error' });
            }
            if (!user) {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }
            req.user = user;
            next();
        }
    );
}

// Role-checking middleware factory
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

// Setup auth routes on the given express app
function setupAuthRoutes(app) {
    // Login
    app.post('/api/auth/login', (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!user) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const valid = bcrypt.compareSync(password, user.password);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const token = generateToken();
            db.run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, user.id], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({
                    token,
                    user: {
                        id: user.id,
                        username: user.username,
                        display_name: user.display_name,
                        role: user.role,
                        manager_id: user.manager_id
                    }
                });
            });
        });
    });

    // Logout
    app.post('/api/auth/logout', authMiddleware, (req, res) => {
        const authHeader = req.headers.authorization;
        const token = authHeader.slice(7);

        db.run('DELETE FROM sessions WHERE token = ?', [token], (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Logged out successfully' });
        });
    });

    // Get current user info
    app.get('/api/auth/me', authMiddleware, (req, res) => {
        res.json({ user: req.user });
    });
}

// Setup user management routes (admin only)
function setupUserRoutes(app) {
    // List all users
    app.get('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
        db.all(
            `SELECT u.id, u.username, u.display_name, u.role, u.manager_id, u.created_at,
              m.display_name as manager_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       ORDER BY u.created_at ASC`,
            [],
            (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json(rows);
            }
        );
    });

    // Create user
    app.post('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
        const { username, password, display_name, role, manager_id } = req.body;

        if (!username || !password || !display_name || !role) {
            return res.status(400).json({ error: 'username, password, display_name, and role are required' });
        }

        if (!['admin', 'manager', 'user'].includes(role)) {
            return res.status(400).json({ error: 'role must be admin, manager, or user' });
        }

        const hash = bcrypt.hashSync(password, 10);

        db.run(
            `INSERT INTO users (username, password, display_name, role, manager_id) VALUES (?, ?, ?, ?, ?)`,
            [username, hash, display_name, role, manager_id || null],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(409).json({ error: 'Username already exists' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ id: this.lastID, message: 'User created successfully' });
            }
        );
    });

    // Update user
    app.put('/api/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
        const { id } = req.params;
        const { username, password, display_name, role, manager_id } = req.body;

        // Build dynamic update
        const fields = [];
        const params = [];

        if (username) { fields.push('username = ?'); params.push(username); }
        if (display_name) { fields.push('display_name = ?'); params.push(display_name); }
        if (role) {
            if (!['admin', 'manager', 'user'].includes(role)) {
                return res.status(400).json({ error: 'role must be admin, manager, or user' });
            }
            fields.push('role = ?');
            params.push(role);
        }
        if (password) {
            fields.push('password = ?');
            params.push(bcrypt.hashSync(password, 10));
        }
        // manager_id can be explicitly set to null
        if (manager_id !== undefined) {
            fields.push('manager_id = ?');
            params.push(manager_id);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id);
        db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({ id, message: 'User updated successfully' });
        });
    });

    // Delete user
    app.delete('/api/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
        const { id } = req.params;

        // Prevent deleting yourself
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            // Also clean up sessions for the deleted user
            db.run('DELETE FROM sessions WHERE user_id = ?', [id]);
            res.json({ message: 'User deleted successfully' });
        });
    });
}

module.exports = { authMiddleware, requireRole, setupAuthRoutes, setupUserRoutes };

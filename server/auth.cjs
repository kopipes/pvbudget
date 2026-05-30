const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db.cjs');

// Session configuration
const SESSION_EXPIRY_HOURS = 24;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

// In-memory rate limiting store
const loginAttempts = new Map();

// Clean up old rate limit entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of loginAttempts.entries()) {
        if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
            loginAttempts.delete(ip);
        }
    }
}, 60 * 1000); // Clean up every minute

// Check if IP is rate limited
function isRateLimited(ip) {
    const now = Date.now();
    const data = loginAttempts.get(ip);
    
    if (!data) return false;
    
    // Reset if window has passed
    if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
        loginAttempts.delete(ip);
        return false;
    }
    
    return data.attempts >= MAX_LOGIN_ATTEMPTS;
}

// Record a failed login attempt
function recordFailedAttempt(ip) {
    const now = Date.now();
    const data = loginAttempts.get(ip);
    
    if (!data || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
        loginAttempts.set(ip, { attempts: 1, windowStart: now });
    } else {
        data.attempts++;
 }
}

// Clear rate limit on successful login
function clearRateLimit(ip) {
    loginAttempts.delete(ip);
}

// Generate a random session token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Check if session is expired
function isSessionExpired(session) {
    if (!session.created_at) return false;
    const createdAt = new Date(session.created_at);
    const now = new Date();
    const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
    return hoursDiff > SESSION_EXPIRY_HOURS;
}

// Auth middleware — attaches req.user if valid token
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);

    // First, check if session exists and is not expired
    db.get('SELECT * FROM sessions WHERE token = ?', [token], (err, session) => {
        if (err) {
            return res.status(500).json({ error: 'Internal server error' });
        }
        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        // Check session expiration
        if (isSessionExpired(session)) {
            // Clean up expired session
            db.run('DELETE FROM sessions WHERE token = ?', [token], () => {});
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }

        // Get user data
        db.get(
            `SELECT u.id, u.username, u.display_name, u.role, u.manager_id, u.division_id, d.name as division_name
             FROM users u
             LEFT JOIN divisions d ON u.division_id = d.id
             WHERE u.id = ?`,
            [session.user_id],
            (err, user) => {
                if (err) {
                    return res.status(500).json({ error: 'Internal server error' });
                }
                if (!user) {
                    return res.status(401).json({ error: 'User not found' });
                }
                // Get divisions managed by this manager
                if (user.role === 'manager') {
                    db.all(`SELECT division_id FROM manager_divisions WHERE manager_id = ?`, [user.id], (err, divs) => {
                        user.managedDivisions = divs.map(r => r.division_id);
                        req.user = user;
                        next();
                    });
                } else {
                    user.managedDivisions = [];
                    req.user = user;
                    next();
                }
            }
        );
    });
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

// Cleanup expired sessions - call periodically
function cleanupExpiredSessions() {
    db.all('SELECT token, created_at FROM sessions', [], (err, sessions) => {
        if (err) return;
        sessions.forEach(session => {
            if (isSessionExpired(session)) {
                db.run('DELETE FROM sessions WHERE token = ?', [session.token], () => {});
            }
        });
    });
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Setup auth routes on the given express app
function setupAuthRoutes(app) {
    // Login
    app.post('/api/auth/login', (req, res) => {
        const { username, password } = req.body;
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

        // Check rate limit
        if (isRateLimited(clientIp)) {
            return res.status(429).json({ 
                error: 'Too many login attempts. Please try again after 15 minutes.',
                retryAfter: 900 // seconds
            });
        }

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!user) {
                recordFailedAttempt(clientIp);
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            const valid = bcrypt.compareSync(password, user.password);
            if (!valid) {
                recordFailedAttempt(clientIp);
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            // Clear rate limit on successful login
            clearRateLimit(clientIp);

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
                        manager_id: user.manager_id,
                        division_id: user.division_id
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
            `SELECT u.id, u.username, u.display_name, u.role, u.manager_id, u.division_id, u.created_at,
              m.display_name as manager_name, d.name as division_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       LEFT JOIN divisions d ON u.division_id = d.id
       ORDER BY u.created_at ASC`,
            [],
            (err, rows) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                // Get managed divisions for each manager
                const getManagedDivisions = (userId) => new Promise((resolve) => {
                    db.all(`SELECT division_id FROM manager_divisions WHERE manager_id = ?`, [userId], (err, divs) => {
                        if (err) return resolve([]);
                        resolve(divs.map(r => r.division_id));
                    });
                });
                Promise.all(rows.map(r => getManagedDivisions(r.id)))
                    .then(managedDivisionsList => {
                        rows.forEach((row, i) => {
                            row.managedDivisions = managedDivisionsList[i] || [];
                        });
                        res.json(rows);
                    });
            }
        );
    });

    // Create user
    app.post('/api/users', authMiddleware, requireRole('admin'), (req, res) => {
        const { username, password, display_name, role, manager_id, division_id } = req.body;

        if (!username || !password || !display_name || !role) {
            return res.status(400).json({ error: 'username, password, display_name, and role are required' });
        }

        if (!['admin', 'corporate', 'manager', 'user'].includes(role)) {
            return res.status(400).json({ error: 'role must be admin, corporate, manager, or user' });
        }

        const hash = bcrypt.hashSync(password, 10);

        db.run(
            `INSERT INTO users (username, password, display_name, role, manager_id, division_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [username, hash, display_name, role, manager_id || null, division_id || null],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(409).json({ error: 'Username already exists' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                const userId = this.lastID;

                // Save managed divisions for managers
                if (role === 'manager' && req.body.managedDivisions && req.body.managedDivisions.length > 0) {
                    const insertMany = req.body.managedDivisions.map(divId =>
                        new Promise((resolve, reject) => {
                            db.run(`INSERT OR IGNORE INTO manager_divisions (manager_id, division_id) VALUES (?, ?)`, [userId, divId], function (err) {
                                if (err) return reject(err);
                                resolve();
                            });
                        })
                    );
                    Promise.all(insertMany)
                        .then(() => res.status(201).json({ id: userId, message: 'User created successfully' }))
                        .catch(err => res.status(500).json({ error: err.message }));
                } else {
                    res.status(201).json({ id: userId, message: 'User created successfully' });
                }
            }
        );
    });

    // Update user
    app.put('/api/users/:id', authMiddleware, requireRole('admin'), (req, res) => {
        const { id } = req.params;
        const { username, password, display_name, role, manager_id, division_id } = req.body;

        // Build dynamic update
        const fields = [];
        const params = [];

        if (username) { fields.push('username = ?'); params.push(username); }
        if (display_name) { fields.push('display_name = ?'); params.push(display_name); }
        if (role) {
            if (!['admin', 'corporate', 'manager', 'user'].includes(role)) {
                return res.status(400).json({ error: 'role must be admin, corporate, manager, or user' });
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
        // division_id can be explicitly set to null
        if (division_id !== undefined) {
            fields.push('division_id = ?');
            params.push(division_id);
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

    // ===== MANAGER MANAGED DIVISIONS ROUTES =====
    // GET managed divisions for a specific manager
    app.get('/api/users/:id/managed-divisions', authMiddleware, requireRole('admin'), (req, res) => {
        const { id } = req.params;
        db.all(`SELECT division_id FROM manager_divisions WHERE manager_id = ?`, [id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(r => r.division_id));
        });
    });

    // PUT update managed divisions for a manager
    app.put('/api/users/:id/managed-divisions', authMiddleware, requireRole('admin'), (req, res) => {
        const { id } = req.params;
        const { division_ids } = req.body;

        // Remove all existing assignments
        db.run(`DELETE FROM manager_divisions WHERE manager_id = ?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Insert new assignments
            if (Array.isArray(division_ids) && division_ids.length > 0) {
                const insertMany = division_ids.map(divId =>
                    new Promise((resolve, reject) => {
                        db.run(`INSERT OR IGNORE INTO manager_divisions (manager_id, division_id) VALUES (?, ?)`, [id, divId], function (err) {
                            if (err) return reject(err);
                            resolve();
                        });
                    })
                );
                Promise.all(insertMany)
                    .then(() => res.json({ id, message: 'Managed divisions updated' }))
                    .catch(err => res.status(500).json({ error: err.message }));
            } else {
                res.json({ id, message: 'Managed divisions updated' });
            }
        });
    });

    // ===== DIVISION ROUTES (Admin only) =====
    app.get('/api/divisions', authMiddleware, requireRole('admin', 'manager', 'user', 'corporate'), (req, res) => {
        db.all(`SELECT * FROM divisions ORDER BY name ASC`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    app.post('/api/divisions', authMiddleware, requireRole('admin'), (req, res) => {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Division name is required' });

        db.run(`INSERT INTO divisions (name, description) VALUES (?, ?)`, [name, description || ''], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE') || err.message.includes('unique')) {
                    return res.status(409).json({ error: 'Division name already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ id: this.lastID, message: 'Division created successfully' });
        });
    });

    app.put('/api/divisions/:id', authMiddleware, requireRole('admin'), (req, res) => {
        const { id } = req.params;
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Division name is required' });

        db.run(`UPDATE divisions SET name = ?, description = ? WHERE id = ?`, [name, description || '', id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Division not found' });
            res.json({ id, message: 'Division updated successfully' });
        });
    });

    app.delete('/api/divisions/:id', authMiddleware, requireRole('admin'), (req, res) => {
        const { id } = req.params;

        // Check if division is in use
        db.get(`SELECT id FROM users WHERE division_id = ? LIMIT 1`, [id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (row) return res.status(409).json({ error: 'Division is assigned to users. Reassign them first.' });

            db.run(`DELETE FROM divisions WHERE id = ?`, [id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) return res.status(404).json({ error: 'Division not found' });
                res.json({ message: 'Division deleted successfully' });
            });
        });
    });
}

module.exports = { authMiddleware, requireRole, setupAuthRoutes, setupUserRoutes };

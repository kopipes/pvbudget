const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'form-builder.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Enable WAL mode for better concurrency
        db.run('PRAGMA journal_mode=WAL');

        // Create forms table
        db.run(`CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_type TEXT DEFAULT 'budget',
      parent_id INTEGER,
      project_no TEXT,
      event TEXT,
      venue TEXT,
      periode TEXT,
      periode_start TEXT,
      periode_end TEXT,
      data TEXT,
      note TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

        // Create users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      manager_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    )`);

        // Create sessions table
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

        // Add created_by column to forms if it doesn't exist
        db.run(`ALTER TABLE forms ADD COLUMN created_by INTEGER`, (err) => {
            // Ignore error if column already exists
        });

        // Seed default admin user if no users exist
        db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
            if (err) {
                console.error('Error checking users', err.message);
                return;
            }
            if (row.count === 0) {
                const hash = bcrypt.hashSync('admin123', 10);
                db.run(
                    `INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)`,
                    ['admin', hash, 'Administrator', 'admin'],
                    (err) => {
                        if (err) {
                            console.error('Error seeding admin user', err.message);
                        } else {
                            console.log('Default admin user created (admin / admin123)');
                        }
                    }
                );
            }
        });
    }
});

module.exports = db;

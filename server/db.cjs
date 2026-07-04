const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
dotenv.config({ path: path.join(__dirname, '..', '.env.production') });

const dbPath = path.resolve(__dirname, 'form-builder.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Enable WAL mode for better concurrency
        db.run('PRAGMA journal_mode=WAL');

        // Create divisions table
        db.run(`CREATE TABLE IF NOT EXISTS divisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

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
      status TEXT DEFAULT 'draft',
      version_number INTEGER DEFAULT 1,
      root_form_id INTEGER,
      revision_note TEXT,
      submitted_at DATETIME,
      approved_at DATETIME,
      approved_by INTEGER,
      rejected_by INTEGER,
      rejected_at DATETIME,
      created_by INTEGER,
      division_id INTEGER,
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
      division_id INTEGER,
      manager_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE SET NULL,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    )`);

        // Create sessions table
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

        // Create manager_divisions table (many-to-many: which divisions each manager manages)
        db.run(`CREATE TABLE IF NOT EXISTS manager_divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      division_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE CASCADE,
      UNIQUE(manager_id, division_id)
    )`);

        // Create approval_history table (tracks every approve/reject action)
        db.run(`CREATE TABLE IF NOT EXISTS approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      note TEXT,
      actor_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

        // Add missing columns if they don't exist
        db.run(`ALTER TABLE forms ADD COLUMN status TEXT DEFAULT 'draft'`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN version_number INTEGER DEFAULT 1`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN root_form_id INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN revision_note TEXT`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN submitted_at DATETIME`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN approved_at DATETIME`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN approved_by INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN rejected_by INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN rejected_at DATETIME`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN division_id INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN division_id INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN approval_stage TEXT DEFAULT 'pending_1st'`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN approved_by_1 INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN approved_at_1 DATETIME`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN approved_by_2 INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN approved_at_2 DATETIME`, () => {});
        db.run(`ALTER TABLE approval_history ADD COLUMN approval_stage TEXT`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN source_budget_id INTEGER`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN po_number TEXT`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN has_po INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN management_fee_pct REAL DEFAULT 10`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN realiza_data TEXT`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN email TEXT`, () => {});
        db.run(`ALTER TABLE forms ADD COLUMN has_realisasi INTEGER DEFAULT 0`, () => {});

        // Seed default admin user if no users exist
        db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
            if (err) {
                console.error('Error checking users', err.message);
                return;
            }
            if (row.count === 0) {
                // Get passwords from environment variables
                const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
                const corpPassword = process.env.DEFAULT_CORPORATE_PASSWORD || 'corp123';
                const mgrPassword = process.env.DEFAULT_MANAGER_PASSWORD || 'manager123';
                const userPassword = process.env.DEFAULT_USER_PASSWORD || 'user123';

                const hash = bcrypt.hashSync(adminPassword, 10);
                const hashCorp = bcrypt.hashSync(corpPassword, 10);
                const hashMgr = bcrypt.hashSync(mgrPassword, 10);
                const hashUser = bcrypt.hashSync(userPassword, 10);

                // Create default divisions
                db.run(`INSERT INTO divisions (name, description) VALUES ('Finance', 'Finance and Accounting Division')`, () => {});
                db.run(`INSERT INTO divisions (name, description) VALUES ('Marketing', 'Marketing and Communications Division')`, () => {});
                db.run(`INSERT INTO divisions (name, description) VALUES ('Operations', 'Operations Division')`, () => {});
                db.run(`INSERT INTO divisions (name, description) VALUES ('Human Resources', 'HR Division')`, () => {});

                db.run(
                    `INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)`,
                    ['admin', hash, 'Administrator', 'admin'],
                    (err) => {
                        if (err) console.error('Error seeding admin user', err.message);
                        else console.log(`Default admin user created (admin / ${adminPassword})`);
                    }
                );
                db.run(
                    `INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)`,
                    ['corporate', hashCorp, 'Corporate Viewer', 'corporate'],
                    (err) => {
                        if (err) console.error('Error seeding corporate user', err.message);
                        else console.log(`Default corporate user created (corporate / ${corpPassword})`);
                    }
                );
                db.run(
                    `INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)`,
                    ['manager', hashMgr, 'Manager', 'manager'],
                    (err) => {
                        if (err) console.error('Error seeding manager user', err.message);
                        else console.log(`Default manager user created (manager / ${mgrPassword})`);
                    }
                );
                db.run(
                    `INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)`,
                    ['user', hashUser, 'User', 'user'],
                    (err) => {
                        if (err) console.error('Error seeding user', err.message);
                        else console.log(`Default user created (user / ${userPassword})`);
                    }
                );
            }
        });
    }
});

module.exports = db;

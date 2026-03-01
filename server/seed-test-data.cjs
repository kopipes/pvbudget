const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'form-builder.sqlite');
const db = new sqlite3.Database(dbPath);

const hashPassword = (password) => {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
};

const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const getQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const createForm = (title, userId) => {
    const defaultData = {
        projectNo: `PROJ-${Math.floor(Math.random() * 1000)}`,
        event: title,
        venue: 'Main Office',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        sections: []
    };
    return runQuery(
        `INSERT INTO forms (data, created_by) VALUES (?, ?)`,
        [JSON.stringify(defaultData), userId]
    );
};

async function seedData() {
    try {
        console.log("Checking for manager1 and user1...");
        let m1 = await getQuery(`SELECT id FROM users WHERE username = ?`, ['manager1']);
        let u1 = await getQuery(`SELECT id FROM users WHERE username = ?`, ['user1']);

        // Only insert manager2 if not exists
        let m2 = await getQuery(`SELECT id FROM users WHERE username = ?`, ['manager2']);
        if (!m2) {
            console.log("Creating manager2...");
            const res = await runQuery(
                `INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)`,
                ['manager2', hashPassword('test123'), 'Sales Manager', 'manager']
            );
            m2 = { id: res.lastID };
        }

        let u2 = await getQuery(`SELECT id FROM users WHERE username = ?`, ['user2']);
        if (!u2) {
            console.log("Creating user2...");
            const res = await runQuery(
                `INSERT INTO users (username, password, display_name, role, manager_id) VALUES (?, ?, ?, ?, ?)`,
                ['user2', hashPassword('test123'), 'Sales Rep', 'user', m2.id]
            );
            u2 = { id: res.lastID };
        }

        console.log("Adding sample forms...");

        // Admin forms
        let admin = await getQuery(`SELECT id FROM users WHERE username = ?`, ['admin']);
        if (admin) {
            await createForm('Admin Global Config Form', admin.id);
            await createForm('Admin Master Budget', admin.id);
        }

        // Manager 1 forms 
        if (m1) {
            await createForm('Manager 1 Q1 Planning', m1.id);
            await createForm('Manager 1 Team Building', m1.id);
        }

        // User 1 forms
        if (u1) {
            await createForm('User 1 Expense Report', u1.id);
            await createForm('User 1 Client Lunch', u1.id);
        }

        // Manager 2 forms
        if (m2) {
            await createForm('Manager 2 Sales Strategy', m2.id);
            await createForm('Manager 2 Offsite Event', m2.id);
        }

        // User 2 forms
        if (u2) {
            await createForm('User 2 Travel Request', u2.id);
            await createForm('User 2 Conference Budget', u2.id);
        }

        console.log("Sample data seeding complete!");
    } catch (error) {
        console.error("Error seeding data:", error);
    } finally {
        db.close();
    }
}

seedData();

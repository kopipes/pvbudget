const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'form-builder.sqlite');
const db = new sqlite3.Database(dbPath);

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

// Realistic budget form data with items
const createFormData = (projectNo, event, venue, divisionId) => ({
    projectNo,
    name: event,
    venue,
    periode: 'Q2 2026',
    periodeStart: '2026-04-01',
    periodeEnd: '2026-06-30',
    managementFeePercent: 10,
    note: '',
    creatorName: '',
    divisionId: divisionId || null,
    sections: []
});

const createBudgetItems = () => [
    {
        id: 'm1',
        name: 'VENUE & FACILITIES',
        subs: [
            { id: 's1', name: 'Hall Rental (3 days)', qty: 1, mdy: 3, internalRate: 15000000, rate: 18000000, actualRate: 0 },
            { id: 's2', name: 'Stage Setup & Lighting', qty: 1, mdy: 1, internalRate: 8000000, rate: 9500000, actualRate: 0 },
            { id: 's3', name: 'Sound System', qty: 1, mdy: 1, internalRate: 5000000, rate: 6000000, actualRate: 0 },
            { id: 's4', name: 'Decoration & Backdrop', qty: 1, mdy: 1, internalRate: 4000000, rate: 5000000, actualRate: 0 },
        ]
    },
    {
        id: 'm2',
        name: 'CATERING & HOSPITALITY',
        subs: [
            { id: 's5', name: 'Lunch Buffets (150 pax x 3 days)', qty: 450, mdy: 1, internalRate: 85000, rate: 95000, actualRate: 0 },
            { id: 's6', name: 'Coffee Breaks (2x daily)', qty: 150, mdy: 6, internalRate: 35000, rate: 40000, actualRate: 0 },
            { id: 's7', name: 'Welcome Dinner', qty: 150, mdy: 1, internalRate: 150000, rate: 175000, actualRate: 0 },
        ]
    },
    {
        id: 'm3',
        name: 'TRANSPORTATION & LOGISTICS',
        subs: [
            { id: 's8', name: 'Bus Transportation (2 buses)', qty: 2, mdy: 3, internalRate: 3000000, rate: 3500000, actualRate: 0 },
            { id: 's9', name: 'Parking & Toll', qty: 1, mdy: 1, internalRate: 2000000, rate: 2500000, actualRate: 0 },
            { id: 's10', name: 'Speaker Airport Transfer', qty: 4, mdy: 2, internalRate: 500000, rate: 600000, actualRate: 0 },
        ]
    },
    {
        id: 'm4',
        name: 'MARKETING & PROMOTION',
        subs: [
            { id: 's11', name: 'Printed Materials (brochures, banners)', qty: 200, mdy: 1, internalRate: 25000, rate: 30000, actualRate: 0 },
            { id: 's12', name: 'Social Media Ads', qty: 1, mdy: 1, internalRate: 5000000, rate: 6000000, actualRate: 0 },
            { id: 's13', name: 'Photo & Video Documentation', qty: 1, mdy: 3, internalRate: 3500000, rate: 4000000, actualRate: 0 },
        ]
    },
    {
        id: 'm5',
        name: 'HONORARIUM & SPEAKERS',
        subs: [
            { id: 's14', name: 'Keynote Speaker Fee', qty: 1, mdy: 1, internalRate: 20000000, rate: 25000000, actualRate: 0 },
            { id: 's15', name: 'Workshop Facilitators (3 pax)', qty: 3, mdy: 1, internalRate: 5000000, rate: 6000000, actualRate: 0 },
            { id: 's16', name: 'MC & Event Host', qty: 1, mdy: 1, internalRate: 3000000, rate: 4000000, actualRate: 0 },
        ]
    },
    {
        id: 'm6',
        name: 'CONTINGENCY',
        subs: [
            { id: 's17', name: 'Miscellaneous & Contingency (5%)', qty: 1, mdy: 1, internalRate: 7500000, rate: 8000000, actualRate: 0 },
        ]
    }
];

async function seedSampleForms() {
    console.log('🌱 Seeding sample form data...\n');

    // Ensure forms.division_id column exists (may already be in CREATE TABLE, or added via ALTER)
    try {
        await runQuery(`ALTER TABLE forms ADD COLUMN division_id INTEGER`);
        console.log('  ✓ Added division_id column to forms table');
    } catch (e) {
        // Column already exists, ignore
    }

    // Get or create test users
    let salesManager = await getQuery(`SELECT id FROM users WHERE username = ?`, ['sales_mgr']);
    let financeUser = await getQuery(`SELECT id FROM users WHERE username = ?`, ['finance_user']);
    let mktUser = await getQuery(`SELECT id FROM users WHERE username = ?`, ['mkt_user']);

    // Create test users if they don't exist
    if (!salesManager) {
        const r = await runQuery(
            `INSERT INTO users (username, password, display_name, role, division_id) VALUES (?, ?, ?, ?, ?)`,
            ['sales_mgr', bcrypt.hashSync('test123', 10), 'Ahmad Wijaya', 'manager', 1]
        );
        salesManager = { id: r.lastID };
        // Assign this manager to division 1
        await runQuery(`INSERT OR IGNORE INTO manager_divisions (manager_id, division_id) VALUES (?, ?)`, [salesManager.id, 1]);
        await runQuery(`INSERT OR IGNORE INTO manager_divisions (manager_id, division_id) VALUES (?, ?)`, [salesManager.id, 2]);
        console.log('  ✓ Created sales_mgr (manager)');
    }

    if (!financeUser) {
        const r = await runQuery(
            `INSERT INTO users (username, password, display_name, role, division_id, manager_id) VALUES (?, ?, ?, ?, ?, ?)`,
            ['finance_user', bcrypt.hashSync('test123', 10), 'Budi Santoso', 'user', 1, salesManager.id]
        );
        financeUser = { id: r.lastID };
        console.log('  ✓ Created finance_user (user, under sales_mgr)');
    }

    if (!mktUser) {
        const r = await runQuery(
            `INSERT INTO users (username, password, display_name, role, division_id, manager_id) VALUES (?, ?, ?, ?, ?, ?)`,
            ['mkt_user', bcrypt.hashSync('test123', 10), 'Siti Rahayu', 'user', 2, salesManager.id]
        );
        mktUser = { id: r.lastID };
        await runQuery(`INSERT OR IGNORE INTO manager_divisions (manager_id, division_id) VALUES (?, ?)`, [salesManager.id, 2]);
        console.log('  ✓ Created mkt_user (user, under sales_mgr)');
    }

    console.log('');

    // Get divisions
    const div1 = await getQuery(`SELECT id FROM divisions WHERE name = ?`, ['Finance']);
    const div2 = await getQuery(`SELECT id FROM divisions WHERE name = ?`, ['Marketing']);

    // FORM 1: Draft (just saved, not submitted) - created by finance_user
    const existing1 = await getQuery(`SELECT id FROM forms WHERE project_no = ?`, ['BUD-2026-001']);
    if (!existing1) {
        await runQuery(
            `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, created_by, division_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'budget', 'BUD-2026-001', 'Annual Sales Kickoff Meeting 2026',
                'Sultan Hotel Jakarta', 'Q2 2026', '2026-04-15', '2026-04-17',
                JSON.stringify(createBudgetItems()),
                'Annual company-wide sales kickoff event with all regional managers.',
                'draft', 1, financeUser.id, div1?.id || 1
            ]
        );
        console.log('  ✓ Created Form 1: Draft - "Annual Sales Kickoff Meeting" (BUD-2026-001) by finance_user');
    } else {
        console.log('  ✓ Form 1 already exists, skipping');
    }

    // FORM 2: Pending approval (submitted, waiting for corporate/admin) - created by mkt_user
    const existing2 = await getQuery(`SELECT id FROM forms WHERE project_no = ?`, ['BUD-2026-002']);
    if (!existing2) {
        await runQuery(
            `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, submitted_at, created_by, division_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'budget', 'BUD-2026-002', 'Product Launch Event Q2',
                'ICE BSD Convention Center', 'Q2 2026', '2026-05-20', '2026-05-22',
                JSON.stringify(createBudgetItems().map(item => ({
                    ...item,
                    subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 1.05) }))
                }))),
                'Major product launch for our flagship product line. Includes VIP guests, media, and key distributors.',
                'pending', 1, new Date().toISOString(), mktUser.id, div2?.id || 2
            ]
        );
        console.log('  ✓ Created Form 2: Pending - "Product Launch Event Q2" (BUD-2026-002) by mkt_user');
    } else {
        console.log('  ✓ Form 2 already exists, skipping');
    }

    // FORM 3: Revision (rejected by corporate, sent back for revision) - created by finance_user
    const existing3 = await getQuery(`SELECT id FROM forms WHERE project_no = ?`, ['BUD-2026-003']);
    if (!existing3) {
        const budgetItems = createBudgetItems().map(item => ({
            ...item,
            subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 0.95) }))
        }));
        await runQuery(
            `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, root_form_id, revision_note, rejected_by, rejected_at, submitted_at, created_by, division_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                'budget', 'BUD-2026-003', 'Training Workshop Series 2026',
                'Aryaduta Hotel Bandung', 'Q2 2026', '2026-04-10', '2026-04-12',
                JSON.stringify(budgetItems),
                'Quarterly skills training for sales team. Please revise catering budget - per person cost exceeds allocated allowance.',
                'revision', 2, null,
                'Budget exceeds corporate guidelines for catering. Please reduce from 150 pax to 100 pax and lower per-person rate to Rp 85,000 max.',
                (await getQuery(`SELECT id FROM users WHERE role = ?`, ['corporate']))?.id || 2,
                new Date().toISOString(),
                new Date(Date.now() - 86400000).toISOString(), // submitted yesterday
                financeUser.id, div1?.id || 1
            ]
        );
        // Archive the rejected v1
        await runQuery(
            `UPDATE forms SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE project_no = ? AND version_number = 1`,
            ['BUD-2026-003']
        );
        console.log('  ✓ Created Form 3: Revision - "Training Workshop Series" (BUD-2026-003 v2) by finance_user');
    } else {
        console.log('  ✓ Form 3 already exists, skipping');
    }

    console.log('\n✅ Sample data seeding complete!\n');
    console.log('Test credentials:');
    console.log('  User:     sales_mgr / test123 (Manager)');
    console.log('  User:     finance_user / test123 (User, reports to sales_mgr)');
    console.log('  User:     mkt_user / test123 (User, reports to sales_mgr)');
    console.log('  Admin:    admin / admin123');
    console.log('  Corporate: corporate / corp123\n');

    db.close();
}

seedSampleForms().catch(err => {
    console.error('Error seeding:', err);
    db.close();
});

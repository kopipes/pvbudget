const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'form-builder.sqlite');
const db = new sqlite3.Database(dbPath);

const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const getQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// Budget items structure
const budgetItems = [
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

async function createSampleData() {
    console.log('🚀 Creating sample budget forms...\n');

    // Clean existing forms (optional - remove if you want to keep existing)
    await runQuery(`DELETE FROM forms`);
    console.log('  ✓ Cleared existing forms');

    // Ensure columns exist
    try { await runQuery(`ALTER TABLE forms ADD COLUMN approval_stage TEXT`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN approved_by_1 INTEGER`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN approved_at_1 DATETIME`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN approved_by_2 INTEGER`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN approved_at_2 DATETIME`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN has_realisasi INTEGER DEFAULT 0`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN has_po INTEGER DEFAULT 0`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN po_number TEXT`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN rejected_by INTEGER`); } catch(e) {}
    try { await runQuery(`ALTER TABLE forms ADD COLUMN rejected_at DATETIME`); } catch(e) {}

    // Get or create users
    let admin = await getQuery(`SELECT id FROM users WHERE username = 'admin'`);
    if (!admin) {
        await runQuery(`INSERT INTO users (username, password, display_name, role, division_id) VALUES (?, ?, ?, ?, ?)`,
            ['admin', bcrypt.hashSync('admin123', 10), 'Administrator', 'admin', 1]);
        admin = await getQuery(`SELECT id FROM users WHERE username = 'admin'`);
    }

    let corporate = await getQuery(`SELECT id FROM users WHERE username = 'corporate'`);
    if (!corporate) {
        await runQuery(`INSERT INTO users (username, password, display_name, role, division_id) VALUES (?, ?, ?, ?, ?)`,
            ['corporate', bcrypt.hashSync('corp123', 10), 'Corporate Viewer', 'corporate', 1]);
        corporate = await getQuery(`SELECT id FROM users WHERE username = 'corporate'`);
    }

    let manager = await getQuery(`SELECT id FROM users WHERE username = 'manager'`);
    if (!manager) {
        await runQuery(`INSERT INTO users (username, password, display_name, role, division_id) VALUES (?, ?, ?, ?, ?)`,
            ['manager', bcrypt.hashSync('manager123', 10), 'Manager', 'manager', 1]);
        manager = await getQuery(`SELECT id FROM users WHERE username = 'manager'`);
        await runQuery(`INSERT OR IGNORE INTO manager_divisions (manager_id, division_id) VALUES (?, ?)`, [manager.id, 1]);
        await runQuery(`INSERT OR IGNORE INTO manager_divisions (manager_id, division_id) VALUES (?, ?)`, [manager.id, 2]);
    }

    let user = await getQuery(`SELECT id FROM users WHERE username = 'user'`);
    if (!user) {
        await runQuery(`INSERT INTO users (username, password, display_name, role, division_id, manager_id) VALUES (?, ?, ?, ?, ?, ?)`,
            ['user', bcrypt.hashSync('user123', 10), 'Regular User', 'user', 1, manager.id]);
        user = await getQuery(`SELECT id FROM users WHERE username = 'user'`);
    }

    // Get divisions
    let div1 = await getQuery(`SELECT id FROM divisions WHERE name = 'Finance'`);
    if (!div1) {
        await runQuery(`INSERT INTO divisions (name, description) VALUES ('Finance', 'Finance Division')`);
        div1 = await getQuery(`SELECT id FROM divisions WHERE name = 'Finance'`);
    }
    let div2 = await getQuery(`SELECT id FROM divisions WHERE name = 'Marketing'`);
    if (!div2) {
        await runQuery(`INSERT INTO divisions (name, description) VALUES ('Marketing', 'Marketing Division')`);
        div2 = await getQuery(`SELECT id FROM divisions WHERE name = 'Marketing'`);
    }

    console.log('Users: admin=' + admin.id + ', corporate=' + corporate.id + ', manager=' + manager.id + ', user=' + user.id);
    console.log('Divisions: Finance=' + (div1?.id || 'N/A') + ', Marketing=' + (div2?.id || 'N/A') + '\n');

    // FORM 1: Draft (NOT submitted yet)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, created_by, division_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2026-001', 'Annual Sales Kickoff Meeting 2026',
            'Sultan Hotel Jakarta', 'Q2 2026', '2026-04-15', '2026-04-17',
            JSON.stringify(budgetItems),
            'Annual company-wide sales kickoff event with all regional managers.',
            'draft', 1, user.id, div1.id
        ]
    );
    console.log('  ✓ Created Form 1: DRAFT - "Annual Sales Kickoff Meeting" (BUD-2026-001)');

    // FORM 2: Pending approval (submitted, waiting for corporate/admin)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, submitted_at, created_by, division_id, approval_stage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2026-002', 'Product Launch Event Q2',
            'ICE BSD Convention Center', 'Q2 2026', '2026-05-20', '2026-05-22',
            JSON.stringify(budgetItems.map(item => ({
                ...item,
                subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 1.05) }))
            }))),
            'Major product launch for flagship product line. Includes VIP guests, media, and key distributors.',
            'pending', 1, new Date().toISOString(), user.id, div2.id, 'pending_1st'
        ]
    );
    console.log('  ✓ Created Form 2: PENDING - "Product Launch Event Q2" (BUD-2026-002)');

    // FORM 3: Revision (rejected, sent back for revision)
    // First create original version (archived)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, submitted_at, created_by, division_id, approval_stage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2026-003', 'Training Workshop Series 2026',
            'Aryaduta Hotel Bandung', 'Q2 2026', '2026-04-10', '2026-04-12',
            JSON.stringify(budgetItems.map(item => ({
                ...item,
                subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 0.9) }))
            }))),
            'Original version - exceeded budget.',
            'archived', 1, new Date(Date.now() - 172800000).toISOString(), user.id, div1.id, 'pending_1st'
        ]
    );
    const v1Id = (await getQuery(`SELECT last_insert_rowid() as id`)).id;
    // Create revision version (status=revision)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, root_form_id, revision_note, rejected_by, rejected_at, submitted_at, created_by, division_id, approval_stage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2026-003', 'Training Workshop Series 2026',
            'Aryaduta Hotel Bandung', 'Q2 2026', '2026-04-10', '2026-04-12',
            JSON.stringify(budgetItems.map(item => ({
                ...item,
                subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 0.7) }))
            }))),
            'Please revise catering budget - per person cost exceeds allocated allowance.',
            'revision', 2, v1Id,
            'Budget exceeds corporate guidelines for catering. Please reduce from 150 pax to 100 pax and lower per-person rate.',
            corporate.id, new Date().toISOString(),
            new Date(Date.now() - 86400000).toISOString(), user.id, div1.id, 'pending_1st'
        ]
    );
    console.log('  ✓ Created Form 3: REVISION (v2) - "Training Workshop Series" (BUD-2026-003)');

    // FORM 4: Approved (fully approved by corporate)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, submitted_at, created_by, division_id, approval_stage, approved_by_1, approved_at_1, approved_by_2, approved_at_2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2026-004', 'Company Annual Dinner 2026',
            'Baker Zack Convention Hall', 'Q1 2026', '2026-02-28', '2026-02-28',
            JSON.stringify(budgetItems.map(item => ({
                ...item,
                subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 1.1) }))
            }))),
            'Annual company dinner for all employees. VIP guests and external partners will attend.',
            'approved', 1, new Date(Date.now() - 259200000).toISOString(), user.id, div1.id, 'final',
            admin.id, new Date(Date.now() - 172800000).toISOString(),
            corporate.id, new Date(Date.now() - 86400000).toISOString()
        ]
    );
    console.log('  ✓ Created Form 4: APPROVED - "Company Annual Dinner" (BUD-2026-004)');

    // FORM 5: Archived (old completed form)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, submitted_at, created_by, division_id, approval_stage, approved_by_1, approved_at_1, approved_by_2, approved_at_2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2025-012', 'Year-End Party 2025',
            'J会展中心', 'Q4 2025', '2025-12-20', '2025-12-20',
            JSON.stringify(budgetItems.map(item => ({
                ...item,
                subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 0.8) }))
            }))),
            'Year-end celebration event completed in December 2025.',
            'archived', 1, new Date(Date.now() - 7776000000).toISOString(), user.id, div2.id, 'final',
            admin.id, new Date(Date.now() - 7776000000).toISOString(),
            corporate.id, new Date(Date.now() - 7603200000).toISOString()
        ]
    );
    console.log('  ✓ Created Form 5: ARCHIVED - "Year-End Party 2025" (BUD-2025-012)');

    // FORM 6: Approved with PO (for testing PO functionality)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, submitted_at, created_by, division_id, approval_stage, approved_by_1, approved_at_1, approved_by_2, approved_at_2, has_po, po_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2026-005', 'Marketing Campaign Q2',
            'various venues', 'Q2 2026', '2026-04-01', '2026-06-30',
            JSON.stringify(budgetItems.map(item => ({
                ...item,
                subs: item.subs.map(sub => ({ ...sub, rate: Math.round(sub.rate * 0.95) }))
            }))),
            'Quarterly marketing campaign with multiple events.',
            'approved', 1, new Date(Date.now() - 345600000).toISOString(), user.id, div2.id, 'final',
            admin.id, new Date(Date.now() - 259200000).toISOString(),
            corporate.id, new Date(Date.now() - 172800000).toISOString(),
            1, 'PO/2026/001'
        ]
    );
    console.log('  ✓ Created Form 6: APPROVED with PO - "Marketing Campaign Q2" (BUD-2026-005) - PO: PO/2026/001');

    // FORM 7: Approved with Realisasi (for testing Realisasi functionality)
    await runQuery(
        `INSERT INTO forms (form_type, project_no, event, venue, periode, periode_start, periode_end, data, note, status, version_number, submitted_at, created_by, division_id, approval_stage, approved_by_1, approved_at_1, approved_by_2, approved_at_2, has_realisasi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'budget', 'BUD-2026-006', 'Trade Show Participation',
            'Jakarta Convention Center', 'Q1 2026', '2026-03-15', '2026-03-18',
            JSON.stringify(budgetItems.map(item => ({
                ...item,
                subs: item.subs.map(sub => ({ 
                    ...sub, 
                    rate: Math.round(sub.rate * 1.0),
                    actualRate: Math.round(sub.rate * 0.95)  // Realisasi actual cost (slightly lower)
                }))
            }))),
            'Trade show booth rental and marketing materials.',
            'approved', 1, new Date(Date.now() - 432000000).toISOString(), user.id, div2.id, 'final',
            admin.id, new Date(Date.now() - 345600000).toISOString(),
            corporate.id, new Date(Date.now() - 259200000).toISOString(),
            1  // has_realisasi = 1
        ]
    );
    console.log('  ✓ Created Form 7: APPROVED with Realisasi - "Trade Show Participation" (BUD-2026-006)');

    console.log('\n✅ Sample data creation complete!');
    console.log('\n📋 Test Credentials:');
    console.log('   Admin:    admin / admin123');
    console.log('   Corporate: corporate / corp123');
    console.log('   Manager:   manager / manager123');
    console.log('   User:      user / user123');
    console.log('\n📊 Forms Created:');
    console.log('   1. BUD-2026-001 - Draft (not submitted)');
    console.log('   2. BUD-2026-002 - Pending (awaiting approval)');
    console.log('   3. BUD-2026-003 - Revision (needs revision)');
    console.log('   4. BUD-2026-004 - Approved (fully approved)');
    console.log('   5. BUD-2025-012 - Archived (old completed)');
    console.log('   6. BUD-2026-005 - Approved with PO (PO/2026/001)');
    console.log('   7. BUD-2026-006 - Approved with Realisasi data');
    console.log('\n🔧 Test Scenarios:');
    console.log('   - PO: Open BUD-2026-004 or BUD-2026-005 (admin can create/save PO)');
    console.log('   - Realisasi: Open BUD-2026-006 (admin can fill actual rates)');
    console.log('   - Edit Draft: Open BUD-2026-001 (admin can edit)');
    console.log('   - Submit for Approval: Open BUD-2026-001 (submit as user, approve as admin)');
    console.log('   - Revision: Open BUD-2026-003 (make changes and re-submit)\n');

    db.close();
}

createSampleData().catch(err => {
    console.error('Error:', err);
    db.close();
    process.exit(1);
});
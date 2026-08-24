const { Resend } = require('resend');
const dotenv = require('dotenv');
const path = require('path');
const db = require('./db.cjs');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
dotenv.config({ path: path.join(__dirname, '..', '.env.production'), override: true });

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM || 'no-reply@provaliantgroup.com';
const APP_URL = process.env.APP_URL || 'https://budget.provaliantgroup.com';

/**
 * Format a number as IDR currency
 */
function formatIDR(num) {
    if (!num && num !== 0) return '-';
    return 'Rp ' + Number(num).toLocaleString('id-ID');
}

/**
 * Build HTML email body for form approval notification
 */
function buildEmailHtml({ form, recipientName, approver1Name, approver2Name }) {
    const totalBudget = (() => {
        try {
            const data = JSON.parse(form.data || '[]');
            const total = data.reduce((sum, section) => {
                if (Array.isArray(section.subs)) {
                    return sum + section.subs.reduce((s, sub) => s + (parseFloat(sub.total) || 0), 0);
                }
                return sum;
            }, 0);
            return formatIDR(total);
        } catch {
            return '-';
        }
    })();

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #1d4ed8; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 28px 32px; }
    .greeting { font-size: 15px; color: #374151; margin-bottom: 16px; }
    .status-badge { display: inline-block; background: #dcfce7; color: #166534; border-radius: 20px; padding: 4px 14px; font-weight: 700; font-size: 13px; margin-bottom: 20px; }
    .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .summary-table tr td { padding: 8px 10px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    .summary-table tr td:first-child { color: #6b7280; width: 40%; }
    .summary-table tr td:last-child { color: #111827; font-weight: 500; }
    .summary-table tr:last-child td { border-bottom: none; }
    .approvers { background: #f9fafb; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; font-size: 13px; color: #374151; }
    .approvers strong { display: block; margin-bottom: 6px; color: #111827; }
    .btn { display: inline-block; background: #1d4ed8; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; }
    .footer { padding: 16px 32px; background: #f9fafb; font-size: 12px; color: #9ca3af; border-top: 1px solid #f0f0f0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Budget Form Approved</h1>
      <p>PVBudget — Notification</p>
    </div>
    <div class="body">
      <p class="greeting">Dear ${recipientName},</p>
      <p style="font-size:14px;color:#374151;margin-bottom:16px;">
        The following budget form has been <strong>fully approved</strong> and is now ready for execution.
      </p>
      <span class="status-badge">APPROVED</span>

      <table class="summary-table">
        <tr><td>Project No.</td><td>${form.project_no || '-'}</td></tr>
        <tr><td>Event</td><td>${form.event || '-'}</td></tr>
        <tr><td>Venue</td><td>${form.venue || '-'}</td></tr>
        <tr><td>Period</td><td>${form.periode || '-'}</td></tr>
        <tr><td>Total Budget</td><td>${totalBudget}</td></tr>
        <tr><td>Approved At</td><td>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</td></tr>
      </table>

      <div class="approvers">
        <strong>Approval Chain</strong>
        1st Approver: ${approver1Name || '-'}<br>
        2nd Approver: ${approver2Name || '-'}
      </div>

      <a href="${APP_URL}" class="btn">View in PVBudget</a>
    </div>
    <div class="footer">
      This is an automated notification from PVBudget. Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Log email send result to email_log table
 */
function logEmail({ formId, toEmail, toName, subject, status, resendId, error }) {
    db.run(
        `INSERT INTO email_log (form_id, to_email, to_name, subject, status, resend_id, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [formId, toEmail, toName || '', subject, status, resendId || null, error || null],
        (err) => { if (err) console.error('[mailer] Failed to log email:', err.message); }
    );
}

/**
 * Send approval notification emails.
 * Recipients: form creator, their manager, and finance users from app_settings.
 */
async function sendApprovalNotification(form, approver2Id) {
    // Look up approver names
    const getUser = (id) => new Promise((resolve) => {
        if (!id) return resolve(null);
        db.get('SELECT id, display_name, email FROM users WHERE id = ?', [id], (err, row) => resolve(row || null));
    });

    const [approver1, approver2] = await Promise.all([
        getUser(form.approved_by_1),
        getUser(approver2Id)
    ]);

    // Collect recipient user IDs: creator + manager + finance users from settings
    const recipientIds = new Set();

    if (form.created_by) recipientIds.add(form.created_by);

    // Get manager of the creator
    await new Promise((resolve) => {
        db.get('SELECT manager_id FROM users WHERE id = ?', [form.created_by], (err, row) => {
            if (row && row.manager_id) recipientIds.add(row.manager_id);
            resolve();
        });
    });

    // Get finance recipient user IDs from app_settings
    await new Promise((resolve) => {
        db.get(`SELECT value FROM app_settings WHERE key = 'finance_recipient_ids'`, (err, row) => {
            if (row && row.value) {
                try {
                    JSON.parse(row.value).forEach(id => recipientIds.add(Number(id)));
                } catch {}
            }
            resolve();
        });
    });

    // Fetch all recipients
    const ids = [...recipientIds].filter(Boolean);
    if (ids.length === 0) {
        console.log('[mailer] No recipients found for approval notification, skipping.');
        return;
    }

    const recipients = await new Promise((resolve) => {
        db.all(
            `SELECT id, display_name, email FROM users WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids,
            (err, rows) => resolve(rows || [])
        );
    });

    const subject = `[Approved] Budget Form — ${form.project_no || 'No Project'} / ${form.event || 'No Event'}`;

    for (const recipient of recipients) {
        if (!recipient.email) {
            console.warn(`[mailer] Skipping ${recipient.display_name} — no email address set.`);
            logEmail({
                formId: form.id, toEmail: '(no email)', toName: recipient.display_name,
                subject, status: 'skipped', error: 'No email address configured'
            });
            continue;
        }

        const html = buildEmailHtml({
            form,
            recipientName: recipient.display_name,
            approver1Name: approver1 ? approver1.display_name : null,
            approver2Name: approver2 ? approver2.display_name : null,
        });

        try {
            const result = await resend.emails.send({
                from: FROM_EMAIL,
                to: recipient.email,
                subject,
                html,
            });
            console.log(`[mailer] Sent to ${recipient.email} — id: ${result.data?.id}`);
            logEmail({
                formId: form.id, toEmail: recipient.email, toName: recipient.display_name,
                subject, status: 'sent', resendId: result.data?.id
            });
        } catch (err) {
            console.error(`[mailer] Failed to send to ${recipient.email}:`, err.message);
            logEmail({
                formId: form.id, toEmail: recipient.email, toName: recipient.display_name,
                subject, status: 'failed', error: err.message
            });
        }
    }
}

module.exports = { sendApprovalNotification, buildEmailHtml };

import { useState, Fragment, useEffect } from 'react';
import { Plus, Trash2, PlusCircle, Save, FileDown, FilePlus, Search, X, AlertTriangle, LogOut, Shield, Building2, Send, Check, RefreshCw, Clock, CheckCircle, XCircle, History, Eye, LayoutDashboard } from 'lucide-react';
import * as XLSX from 'xlsx';
import UserManagement from './UserManagement.jsx';
import DivisionManagement from './DivisionManagement.jsx';
import Dashboard from './Dashboard.jsx';
import './App.css';

const API = import.meta.env.VITE_API_URL || '';

const STATUS = {
    DRAFT: 'draft',
    PENDING: 'pending',
    REVISION: 'revision',
    APPROVED: 'approved'
};

const STATUS_LABELS = {
    draft: 'Draft',
    pending: 'Pending Approval',
    revision: 'Needs Revision',
    approved: 'Approved'
};

const formatCurrency = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '';
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const parseCurrency = (str) => {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    const cleaned = str.replace(/\./g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? 0 : parsed;
};

function App({ user, token, onLogout }) {
    const [activeTab, setActiveTab] = useState('budget');

    const [eventData, setEventData] = useState({
        projectNo: '',
        name: '',
        venue: '',
        periode: '',
        periodeStart: '',
        periodeEnd: '',
        managementFeePercent: 10,
        note: '',
        creatorName: user.display_name,
        divisionId: user.division_id || ''
    });

    const [loadedForm, setLoadedForm] = useState(null);
    const [items, setItems] = useState([{ id: 'm1', name: 'NEW SECTION', subs: [] }]);
    const [currentFormId, setCurrentFormId] = useState(null);
    const [currentStatus, setCurrentStatus] = useState(STATUS.DRAFT);
    const [currentVersion, setCurrentVersion] = useState(1);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [modalMode, setModalMode] = useState('load');
    const [searchTerm, setSearchTerm] = useState('');
    const [formList, setFormList] = useState([]);
    const [showUserMgmt, setShowUserMgmt] = useState(false);
    const [showDivisionMgmt, setShowDivisionMgmt] = useState(false);
    const [dialogConfig, setDialogConfig] = useState(null);
    const [showDashboard, setShowDashboard] = useState(true);
    const [openedFormId, setOpenedFormId] = useState(null);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [versionHistory, setVersionHistory] = useState([]);
    const [pendingApprovals, setPendingApprovals] = useState([]);
    const [myForms, setMyForms] = useState([]);
    const [selectedDivisionId, setSelectedDivisionId] = useState(user.division_id || '');
    const [divisions, setDivisions] = useState([]);
    const [approvalHistory, setApprovalHistory] = useState([]);
    const [isReadOnly, setIsReadOnly] = useState(false);

    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const isAdmin = user.role === 'admin';
    const isCorporate = user.role === 'corporate';
    const isManager = user.role === 'manager';
    const isUser = user.role === 'user';
    const canEdit = !isReadOnly && !isCorporate && [STATUS.DRAFT, STATUS.REVISION].includes(currentStatus);
    const canSubmit = [STATUS.DRAFT, STATUS.REVISION].includes(currentStatus) && (currentStatus !== STATUS.REVISION || currentFormId);
    const canApprove = isAdmin || isCorporate;
    const canDelete = isAdmin && [STATUS.DRAFT, STATUS.REVISION, 'archived'].includes(currentStatus);

    useEffect(() => {
        fetchDivisions();
        if (isCorporate || isAdmin) fetchPendingApprovals();
        fetchMyForms();
    }, []);

    const fetchDivisions = async () => {
        try {
            const res = await fetch(`${API}/api/divisions`, { headers: authHeaders });
            if (res.ok) setDivisions(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchPendingApprovals = async () => {
        try {
            const res = await fetch(`${API}/api/forms/pending`, { headers: authHeaders });
            if (res.ok) setPendingApprovals(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchMyForms = async () => {
        try {
            const res = await fetch(`${API}/api/forms/my`, { headers: authHeaders });
            if (res.ok) setMyForms(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchVersionHistory = async (formId) => {
        try {
            const res = await fetch(`${API}/api/forms/${formId}/history`, { headers: authHeaders });
            if (res.ok) setVersionHistory(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchApprovalHistory = async (formId) => {
        try {
            const res = await fetch(`${API}/api/forms/${formId}/approval-history`, { headers: authHeaders });
            if (res.ok) setApprovalHistory(await res.json());
        } catch (e) { console.error(e); }
    };

    const showDialog = (type, message, title = '') => {
        return new Promise((resolve) => {
            setDialogConfig({ type, message, title,
                onConfirm: (val) => { setDialogConfig(null); resolve(val !== undefined ? val : true); },
                onCancel: () => { setDialogConfig(null); resolve(type === 'prompt' ? null : false); }
            });
        });
    };

    const generateId = () => Math.random().toString(36).substr(2, 9);

    // --- Item handlers ---
    const addMainItem = () => { if (!canEdit) return; setItems([...items, { id: generateId(), name: 'NEW ITEM', subs: [] }]); };
    const removeMainItem = (mainId) => { if (!canEdit) return; setItems(items.filter(item => item.id !== mainId)); };
    const updateMainItemName = (mainId, name) => { if (!canEdit) return; setItems(items.map(item => item.id === mainId ? { ...item, name } : item)); };
    const addSubItem = (mainId) => {
        if (!canEdit) return;
        setItems(items.map(item => {
            if (item.id === mainId) return { ...item, subs: [...item.subs, { id: generateId(), name: 'New Sub Item', qty: 1, mdy: 1, internalRate: 0, rate: 0, actualRate: 0 }] };
            return item;
        }));
    };
    const removeSubItem = (mainId, subId) => { if (!canEdit) return; setItems(items.map(item => item.id === mainId ? { ...item, subs: item.subs.filter(sub => sub.id !== subId) } : item)); };
    const updateSubItem = (mainId, subId, field, value) => {
        if (!canEdit) return;
        setItems(items.map(item => {
            if (item.id === mainId) return { ...item, subs: item.subs.map(sub => sub.id === subId ? { ...sub, [field]: value } : sub) };
            return item;
        }));
    };

    // --- Calculations ---
    let subtotalInternal = 0, subtotalBudget = 0, subtotalRealisasi = 0;
    items.forEach(item => { item.subs.forEach(sub => { subtotalInternal += (sub.qty * sub.mdy * sub.internalRate); subtotalBudget += (sub.qty * sub.mdy * sub.rate); subtotalRealisasi += (sub.actualRate || 0); }); });
    const mgmtPct = parseFloat(eventData.managementFeePercent) || 0;
    const managementFee = subtotalBudget * (mgmtPct / 100);
    const totalInternal = subtotalInternal;
    const totalBudget = subtotalBudget + managementFee;
    const ppn = totalBudget * 0.11;
    const grandTotalInternal = totalInternal;
    const grandTotalBudget = totalBudget + ppn;
    const grandTotalRealisasi = subtotalRealisasi;
    const afterPpn = totalBudget;
    const pph = totalBudget * 0.02;
    const afterPph = afterPpn - pph;
    const profitLoss = afterPph - grandTotalInternal;
    const profitLossRealisasi = grandTotalRealisasi - grandTotalInternal;

    // --- Form actions ---
    const handleNewForm = async () => {
        const confirmed = await showDialog('confirm', 'Start a new form? Unsaved changes will be lost.', 'New Form');
        if (confirmed) {
            resetFormState();
            setCurrentStatus(STATUS.DRAFT);
            setCurrentVersion(1);
            setShowDashboard(false);
        }
    };

    const resetFormState = () => {
        setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', managementFeePercent: 10, note: '', creatorName: user.display_name, divisionId: user.division_id || '' });
        setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
        setCurrentFormId(null);
        setCurrentStatus(STATUS.DRAFT);
        setCurrentVersion(1);
        setIsReadOnly(false);
        setSelectedDivisionId(user.division_id || '');
        setLoadedForm(null);
        setApprovalHistory([]);
        setOpenedFormId(null);
    };

    // Partial reset — keeps items as template for duplication
    const duplicateFromForm = (form) => {
        setEventData({
            projectNo: '', name: '', venue: '',
            periode: form.periode || '', periodeStart: '', periodeEnd: '',
            managementFeePercent: form.management_fee_pct != null ? form.management_fee_pct : 10,
            note: '', creatorName: user.display_name, divisionId: user.division_id || ''
        });
        setSelectedDivisionId(user.division_id || '');
        setItems(form.data && Array.isArray(form.data) ? JSON.parse(JSON.stringify(form.data)) : [{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
        setCurrentFormId(null);
        setCurrentStatus(STATUS.DRAFT);
        setCurrentVersion(1);
        setIsReadOnly(false);
        setLoadedForm(null);
        setApprovalHistory([]);
        setOpenedFormId(null);
    };

    const handleSaveForm = async () => {
        if (!canEdit) return;
        try {
            const dataToSave = {
                project_no: eventData.projectNo, event: eventData.name, venue: eventData.venue,
                periode: eventData.periode, periode_start: eventData.periodeStart, periode_end: eventData.periodeEnd,
                management_fee_pct: eventData.managementFeePercent, note: eventData.note,
                division_id: selectedDivisionId || null, data: items
            };
            let url = `${API}/api/forms`;
            let method = 'POST';
            if (currentFormId) { url = `${API}/api/forms/${currentFormId}`; method = 'PUT'; }

            const response = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(dataToSave) });
            if (response.status === 403) { await showDialog('alert', 'Only draft or revision forms can be edited', 'Access Denied'); return; }
            if (!response.ok) throw new Error('Save failed');
            const result = await response.json();
            if (!currentFormId && result.id) setCurrentFormId(result.id);
            setCurrentStatus(STATUS.DRAFT);
            await showDialog('alert', 'Form saved successfully!', 'Success');
        } catch (error) {
            console.error(error);
            await showDialog('alert', 'Failed to save form', 'Error');
        }
    };

    const handleSubmitForm = async () => {
        if (!canEdit && currentStatus === STATUS.DRAFT) {
            await showDialog('alert', 'Please save the form before submitting.', 'Save First');
            return;
        }
        if (!currentFormId) { await showDialog('alert', 'Please save the form first.', 'Save First'); return; }
        const confirmed = await showDialog('confirm', 'Submit this form for corporate approval? You cannot edit it after submission.', 'Submit for Approval');
        if (!confirmed) return;

        try {
            const res = await fetch(`${API}/api/forms/${currentFormId}/submit`, { method: 'POST', headers: authHeaders });
            const data = await res.json();
            if (!res.ok) { await showDialog('alert', data.error || 'Failed to submit', 'Error'); return; }
            setCurrentStatus(STATUS.PENDING);
            await showDialog('alert', 'Form submitted for approval!', 'Submitted');
        } catch (e) { await showDialog('alert', 'Failed to submit form', 'Error'); }
    };

    const handleApproveForm = async () => {
        const note = await showDialog('prompt', 'Add approval note (optional):', 'Approve Form');
        try {
            const res = await fetch(`${API}/api/forms/${currentFormId}/approve`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ note: note || '' }) });
            const data = await res.json();
            if (!res.ok) { await showDialog('alert', data.error || 'Failed to approve', 'Error'); return; }
            fetchPendingApprovals();
            // Reload form to get updated approval_stage
            const formRes = await fetch(`${API}/api/forms/${currentFormId}`, { headers: authHeaders });
            if (formRes.ok) {
                const updatedForm = await formRes.json();
                setLoadedForm(updatedForm);
                setCurrentStatus(updatedForm.status);
                setIsReadOnly(updatedForm.readonly || false);
            }
            await showDialog('alert', data.message, data.message.includes('fully') ? 'Approved' : 'First Approval');
        } catch (e) { await showDialog('alert', 'Failed to approve', 'Error'); }
    };

    const handleRejectForm = async () => {
        const note = await showDialog('prompt', 'Enter revision note (required):\n\nExplain what needs to be revised:', 'Send Back for Revision');
        if (!note || !note.trim()) { await showDialog('alert', 'Revision note is required to reject a form.', 'Required'); return; }
        try {
            const res = await fetch(`${API}/api/forms/${currentFormId}/reject`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ note }) });
            const data = await res.json();
            if (!res.ok) { await showDialog('alert', data.error || 'Failed to reject', 'Error'); return; }
            // New revision form was created
            const newId = data.id;
            await showDialog('alert', `Form sent back for revision. Version ${(currentVersion + 1)} created.`, 'Revision Sent');
            // Load the new revision
            loadForm(newId);
            fetchPendingApprovals();
        } catch (e) { await showDialog('alert', 'Failed to reject', 'Error'); }
    };

    const handleUnlockForm = async () => {
        const confirmed = await showDialog('confirm', 'Unlock this approved form for revision? The current approved version will be archived.', 'Unlock Approved Form');
        if (!confirmed) return;
        try {
            const res = await fetch(`${API}/api/forms/${currentFormId}/unlock`, { method: 'PUT', headers: authHeaders });
            const data = await res.json();
            if (!res.ok) { await showDialog('alert', data.error || 'Failed', 'Error'); return; }
            setCurrentStatus(STATUS.REVISION);
            setCurrentVersion(currentVersion + 1);
            await showDialog('alert', 'Approved form unlocked back to revision. Please edit and re-submit.', 'Unlocked');
        } catch (e) { await showDialog('alert', 'Failed', 'Error'); }
    };

    const handleDeleteForm = async () => {
        if (!currentFormId || !canDelete) return;
        const confirmed = await showDialog('confirm', 'Delete this form? This cannot be undone.', 'Delete Form');
        if (!confirmed) return;
        try {
            const res = await fetch(`${API}/api/forms/${currentFormId}`, { method: 'DELETE', headers: authHeaders });
            if (!res.ok) { const d = await res.json(); await showDialog('alert', d.error || 'Failed', 'Error'); return; }
            await showDialog('alert', 'Form deleted!', 'Deleted');
            resetFormState();
        } catch (e) { await showDialog('alert', 'Failed to delete', 'Error'); }
    };

    const fetchForms = async (query = '', typeFilter = activeTab) => {
        try {
            const res = await fetch(`${API}/api/forms?query=${encodeURIComponent(query)}&type=${typeFilter}`, { headers: authHeaders });
            if (res.status === 401) { onLogout(); return; }
            if (res.ok) setFormList(await res.json());
        } catch (e) { console.error(e); }
    };

    const openLoadModal = async () => {
        const confirmed = await showDialog('confirm', 'Unsaved form data will be lost. Continue?', 'Load Form');
        if (confirmed) { setModalMode('load'); setShowLoadModal(true); fetchForms(searchTerm, activeTab); }
    };

    const loadForm = async (id, asTemplate = false) => {
        // If id is null, just open a fresh form
        if (id === null || id === undefined) {
            resetFormState();
            setCurrentStatus(STATUS.DRAFT);
            setCurrentVersion(1);
            setShowDashboard(false);
            setOpenedFormId(null);
            return;
        }
        try {
            const res = await fetch(`${API}/api/forms/${id}`, { headers: authHeaders });
            if (res.status === 401) { onLogout(); return; }
            if (res.ok) {
                const form = await res.json();

                if (asTemplate) {
                    duplicateFromForm(form);
                    setShowDashboard(false);
                    return;
                }

                setLoadedForm(form);
                fetchApprovalHistory(form.id);
                setCurrentFormId(form.id);
                setCurrentStatus(form.status);
                setCurrentVersion(form.version_number || 1);
                setIsReadOnly(form.readonly || false);
                setEventData({
                    projectNo: form.project_no || '', name: form.event || '', venue: form.venue || '',
                    periode: form.periode || '', periodeStart: form.periode_start || '', periodeEnd: form.periode_end || '',
                    managementFeePercent: form.management_fee_pct != null ? form.management_fee_pct : 10,
                    note: form.note || '', creatorName: form.creator_name || 'Unknown',
                    revisionNote: form.revision_note || '',
                    divisionId: form.division_id || ''
                });
                setSelectedDivisionId(form.division_id || '');
                if (form.data && Array.isArray(form.data)) setItems(form.data);
                setShowLoadModal(false);
                setShowVersionHistory(false);
                setShowDashboard(false);
                setOpenedFormId(id);
            }
        } catch (e) { await showDialog('alert', 'Failed to load form', 'Error'); }
    };

    const loadPendingForm = (id) => {
        loadForm(id);
    };

    // --- Excel Export ---
    const handleExportExcel = () => {
        const ws = XLSX.utils.aoa_to_sheet([[]]);
        let r = 0;
        const setCell = (row, col, val) => { ws[XLSX.utils.encode_cell({ r: row, c: col })] = val; };

        // --- Header info ---
        const setH = (label, val) => { ws[XLSX.utils.encode_cell({ r, c: 0 })] = label; ws[XLSX.utils.encode_cell({ r, c: 1 })] = val; r++; };
        setH('PROJECT NO.', eventData.projectNo || '');
        setH('EVENT', eventData.name || '');
        setH('VENUE', eventData.venue || '');
        setH('PERIODE', eventData.periodeStart && eventData.periodeEnd ? `${eventData.periodeStart} to ${eventData.periodeEnd}` : eventData.periode || '');
        setH('MANAGEMENT FEE', `${mgmtPct}%`);
        setH('VERSION', `v${currentVersion}`);
        setH('STATUS', STATUS_LABELS[currentStatus] || currentStatus);
        r++;

        // --- Table header ---
        const headers = ['DESCRIPTION', 'QTY', 'MDY', 'INTERNAL BUDGET', 'BUDGET'];
        if (activeTab === 'realisasi') headers.push('REALISASI');
        headers.forEach((h, i) => { setCell(r, i, h); });
        const tableHeaderRow = r;
        r++;

        // --- Track item data rows for SUM formula ---
        const itemDataRows = [];

        items.forEach(main => {
            setCell(r, 0, main.name);
            if (activeTab === 'realisasi') setCell(r, 5, '');
            r++;

            main.subs.forEach(sub => {
                itemDataRows.push(r);
                setCell(r, 0, `  ${sub.name}`);
                setCell(r, 1, { t: 'n', v: sub.qty });
                setCell(r, 2, { t: 'n', v: sub.mdy });
                setCell(r, 3, { t: 'n', v: sub.qty * sub.mdy * sub.internalRate, z: '#,##0.00' });
                setCell(r, 4, { t: 'n', v: sub.qty * sub.mdy * sub.rate, z: '#,##0.00' });
                if (activeTab === 'realisasi') setCell(r, 5, { t: 'n', v: sub.actualRate || 0, z: '#,##0.00' });
                r++;
            });
        });

        // Empty row
        r++;

        // --- SUBTOTAL ---
        const subStart = itemDataRows.length > 0 ? Math.min(...itemDataRows) : tableHeaderRow + 1;
        const subEnd = itemDataRows.length > 0 ? Math.max(...itemDataRows) : tableHeaderRow;
        const sumRange = (col) => `SUM(${XLSX.utils.encode_cell({ r: subStart, c: col })}:${XLSX.utils.encode_cell({ r: subEnd, c: col })})`;

        const subR = r;
        setCell(r, 0, 'SUBTOTAL'); setCell(r, 3, { t: 'n', f: sumRange(3), z: '#,##0.00' }); setCell(r, 4, { t: 'n', f: sumRange(4), z: '#,##0.00' });
        if (activeTab === 'realisasi') setCell(r, 5, { t: 'n', f: sumRange(5), z: '#,##0.00' });
        r++;

        // --- MANAGEMENT FEE ---
        const mgmtR = r;
        setCell(r, 0, `MANAGEMENT FEE (${mgmtPct}%)`); setCell(r, 4, { t: 'n', f: `E${subR}*${mgmtPct / 100}`, z: '#,##0.00' });
        if (activeTab === 'realisasi') setCell(r, 5, '');
        r++;

        // --- TOTAL ---
        const totR = r;
        setCell(r, 0, 'TOTAL'); setCell(r, 3, { t: 'n', f: `D${subR}`, z: '#,##0.00' }); setCell(r, 4, { t: 'n', f: `E${subR}+E${mgmtR}`, z: '#,##0.00' });
        if (activeTab === 'realisasi') setCell(r, 5, '');
        r++;

        // --- PPN (11%) ---
        const ppnR = r;
        setCell(r, 0, 'PPN (11%)'); setCell(r, 4, { t: 'n', f: `E${totR}*0.11`, z: '#,##0.00' });
        if (activeTab === 'realisasi') setCell(r, 5, '');
        r++;

        // --- GRAND TOTAL ---
        const grandR = r;
        setCell(r, 0, 'GRAND TOTAL'); setCell(r, 3, { t: 'n', f: `D${totR}`, z: '#,##0.00' }); setCell(r, 4, { t: 'n', f: `E${totR}+E${ppnR}`, z: '#,##0.00' });
        if (activeTab === 'realisasi') setCell(r, 5, { t: 'n', f: `F${subR}`, z: '#,##0.00' });
        r++;

        // Empty
        r++;
        // --- Metrics section ---
        setCell(r, 3, 'Submitted Budget'); setCell(r, 4, { t: 'n', f: `E${grandR}`, z: '#,##0.00' }); r++;
        const afterPpnR = r; setCell(r, 3, 'After PPN'); setCell(r, 4, { t: 'n', f: `E${totR}`, z: '#,##0.00' }); r++;
        const afterPphR = r; setCell(r, 3, 'After PPH'); setCell(r, 4, { t: 'n', f: `E${afterPpnR}-(E${totR}*0.02)`, z: '#,##0.00' }); r++;
        setCell(r, 3, 'P/L (Budget)'); setCell(r, 4, { t: 'n', f: `E${afterPphR}-D${grandR}`, z: '#,##0.00' }); r++;

        if (activeTab === 'realisasi') {
            r++;
            const actualR = r; setCell(r, 3, 'Actual Budget (Realisasi)'); setCell(r, 4, { t: 'n', f: `F${subR}`, z: '#,##0.00' }); r++;
            setCell(r, 3, 'P/L (Realisasi)'); setCell(r, 4, { t: 'n', f: `E${actualR}-D${grandR}`, z: '#,##0.00' }); r++;
        }

        if (eventData.note) {
            r++;
            setCell(r, 0, 'NOTES:'); r++;
            eventData.note.split('\n').forEach(line => { setCell(r, 0, line); r++; });
        }

        ws['!cols'] = [
            { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
            ...(activeTab === 'realisasi' ? [{ wch: 20 }] : [])
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Budget");
        XLSX.writeFile(wb, `PVBudget_v${currentVersion}.xlsx`);
    };

    const roleBadge = (role) => {
        const labels = { admin: 'Admin', corporate: 'Corporate', manager: 'Manager', user: 'User' };
        return <span className={`role-badge role-${role}`}>{labels[role] || role}</span>;
    };

    const statusBadge = (status) => {
        const styles = {
            draft: { background: 'rgba(100,116,139,0.12)', color: '#64748B', border: '1px solid rgba(100,116,139,0.25)' },
            pending: { background: 'rgba(234,179,8,0.12)', color: '#CA8A04', border: '1px solid rgba(234,179,8,0.25)' },
            revision: { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' },
            approved: { background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' },
            archived: { background: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.25)' }
        };
        const s = styles[status] || styles.draft;
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', ...s }}>
            {status === 'approved' && <CheckCircle size={12} />}
            {status === 'pending' && <Clock size={12} />}
            {status === 'revision' && <XCircle size={12} />}
            {status === 'draft' && <FilePlus size={12} />}
            {STATUS_LABELS[status] || status}
        </span>;
    };

    return (
        <div className="app-container">
            {/* DASHBOARD VIEW */}
            {showDashboard ? (
                <Dashboard user={user} token={token} onLogout={onLogout} onOpenForm={(id) => { loadForm(id); }} />
            ) : (
            <>
            {/* USER INFO BAR */}
            <div className="user-bar">
                <div className="user-bar-info">
                    <div className="user-avatar">{user.display_name?.charAt(0)?.toUpperCase() || 'U'}</div>
                    <div>
                        <span className="user-bar-name">{user.display_name}</span>
                        {roleBadge(user.role)}
                        {user.division_name && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '4px' }}>• {user.division_name}</span>}
                    </div>
                </div>
                <div className="user-bar-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowDashboard(true)}>
                        <LayoutDashboard size={14} /> Dashboard
                    </button>
                    {(isAdmin || isCorporate) && pendingApprovals.length > 0 && (
                        <span style={{ background: '#ef4444', color: '#fff', borderRadius: '12px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {pendingApprovals.length} pending
                        </span>
                    )}
                    {isAdmin && (
                        <>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowDivisionMgmt(true)}><Building2 size={14} /> Divisions</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowUserMgmt(true)}><Shield size={14} /> Users</button>
                        </>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={onLogout}><LogOut size={14} /> Logout</button>
                </div>
            </div>

            {/* READ-ONLY BANNER */}
            {isReadOnly && currentStatus !== STATUS.APPROVED && (
                <div className="readonly-banner">
                    <AlertTriangle size={16} />
                    <span>You are viewing in <strong>read-only</strong> mode. Only the form owner can edit.</span>
                </div>
            )}
            {isReadOnly && currentStatus === STATUS.APPROVED && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#16a34a', fontSize: '0.875rem', fontWeight: 500 }}>
                    <CheckCircle size={16} />
                    <span>This form is <strong>APPROVED</strong> and locked.</span>
                </div>
            )}
            {currentStatus === STATUS.REVISION && canEdit && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#ef4444', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, marginBottom: eventData.revisionNote ? '0.4rem' : 0 }}>
                        <RefreshCw size={16} />
                        <span>Form sent back for revision. Please revise and re-submit.</span>
                    </div>
                    {eventData.revisionNote && (
                        <div style={{ marginLeft: '1.5rem', fontStyle: 'italic', opacity: 0.85, fontSize: '0.8rem' }}>
                            Reason: "{eventData.revisionNote}"
                        </div>
                    )}
                </div>
            )}
            {currentStatus === STATUS.PENDING && (
                <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#CA8A04', fontSize: '0.875rem', fontWeight: 500 }}>
                    <Clock size={16} />
                    <span>Form is <strong>pending approval</strong> from Corporate/Admin.</span>
                </div>
            )}

            {/* APP TITLE & TABS */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ fontWeight: '800', letterSpacing: '4px', color: 'var(--primary)', textTransform: 'uppercase', margin: 0 }}>
                    {activeTab === 'budget' ? 'BUDGET' : 'REALISASI'}
                </h1>
                <div style={{ display: 'inline-flex', marginTop: '1rem', background: 'var(--surface)', borderRadius: '8px', padding: '4px', boxShadow: 'var(--shadow-sm)' }}>
                    <button className={`btn btn-sm ${activeTab === 'budget' ? 'btn-primary' : 'btn-secondary'}`} style={{ border: 'none', boxShadow: 'none' }} onClick={() => setActiveTab('budget')}>BUDGET</button>
                    <button className={`btn btn-sm ${activeTab === 'realisasi' ? 'btn-primary' : 'btn-secondary'}`} style={{ border: 'none', boxShadow: 'none' }} onClick={() => setActiveTab('realisasi')}>REALISASI</button>
                </div>
            </div>

            {/* TOP ACTION BAR */}
            <div className="top-action-bar">
                {currentStatus === STATUS.DRAFT && !isCorporate && (
                    <button className="btn btn-secondary btn-sm" onClick={handleNewForm}><FilePlus size={16} /> New Form</button>
                )}
                {currentStatus === STATUS.DRAFT && (
                    <button className="btn btn-secondary btn-sm" onClick={openLoadModal}>
                        <Search size={16} /> Load / Use Template
                    </button>
                )}
                {canEdit && (
                    <button className="btn btn-secondary btn-sm" onClick={handleSaveForm}><Save size={16} /> Save</button>
                )}
                {canSubmit && currentFormId && (
                    <button className="btn btn-primary btn-sm" onClick={handleSubmitForm} style={{ background: 'var(--primary)', color: '#000' }}>
                        <Send size={16} /> Submit for Approval
                    </button>
                )}
                {/* Corporate/Admin approval actions */}
                {canApprove && currentStatus === STATUS.PENDING && currentFormId && loadedForm && (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {loadedForm.approval_stage === 'pending_2nd' ? (
                                    <span style={{ background: 'rgba(234,179,8,0.15)', color: '#CA8A04', border: '1px solid rgba(234,179,8,0.3)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                                        <CheckCircle size={11} style={{ display: 'inline', marginRight: 3 }} />Awaiting 2nd Approval
                                    </span>
                                ) : (
                                    <span style={{ background: 'rgba(234,179,8,0.15)', color: '#CA8A04', border: '1px solid rgba(234,179,8,0.3)', padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                                        <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />Awaiting 1st Approval
                                    </span>
                                )}
                                {loadedForm.approver_1_name && (
                                    <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>
                                        ✓ {loadedForm.approver_1_name} (1st)
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} onClick={handleApproveForm}>
                                    <Check size={16} /> {loadedForm.approval_stage === 'pending_2nd' ? 'Final Approve' : 'Approve (1st)'}
                                </button>
                                <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff' }} onClick={handleRejectForm}>
                                    <X size={16} /> Reject / Revise
                                </button>
                            </div>
                        </div>
                    </>
                )}
                {/* Admin unlock approved */}
                {isAdmin && currentStatus === STATUS.APPROVED && currentFormId && (
                    <button className="btn btn-sm" style={{ background: '#8b5cf6', color: '#fff' }} onClick={handleUnlockForm}>
                        <RefreshCw size={16} /> Unlock for Revision
                    </button>
                )}
                <button className="btn btn-success btn-sm" onClick={handleExportExcel}><FileDown size={16} /> Export XLS</button>
                {currentFormId && (
                    <button className="btn btn-secondary btn-sm" onClick={() => { setShowVersionHistory(true); fetchVersionHistory(currentFormId); }} style={{ marginLeft: 'auto' }}>
                        <History size={16} /> v{currentVersion}
                    </button>
                )}
                {canDelete && currentFormId && (
                    <button className="btn btn-sm" style={{ background: '#ef4444', color: '#fff' }} onClick={handleDeleteForm}><Trash2 size={16} /> Delete</button>
                )}
            </div>

            {/* STATUS BAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1rem', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                {currentFormId && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '4px 12px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {statusBadge(currentStatus)}
                    {currentVersion > 1 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Rev-{currentVersion}</span>}
                    <span>• Form Owner: <strong style={{ color: 'var(--text-main)' }}>{eventData.creatorName}</strong></span>
                    {eventData.divisionId && divisions.find(d => d.id === parseInt(eventData.divisionId)) && (
                        <span>• {divisions.find(d => d.id === parseInt(eventData.divisionId)).name}</span>
                    )}
                </span>
                )}
                {(isAdmin || isCorporate) && pendingApprovals.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444' }}>Pending Approvals:</span>
                        {pendingApprovals.slice(0, 3).map(p => (
                            <span key={p.id} style={{ background: 'rgba(234,179,8,0.12)', color: '#CA8A04', border: '1px solid rgba(234,179,8,0.25)', padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', cursor: 'pointer' }} onClick={() => loadPendingForm(p.id)}>
                                {p.event || 'Untitled'} v{p.version_number}
                            </span>
                        ))}
                        {pendingApprovals.length > 3 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{pendingApprovals.length - 3} more</span>}
                    </div>
                )}
            </div>

            {/* APPROVAL HISTORY TIMELINE */}
            {approvalHistory.length > 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Approval Log</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {approvalHistory.map((h, i) => (
                            <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: h.action === 'approve' ? 'var(--success)' : '#ef4444', flexShrink: 0, marginTop: 4 }} />
                                <div style={{ flex: 1, fontSize: '0.8rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600 }}>{h.actor_name}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{h.created_at ? new Date(h.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
                                    </div>
                                    <div style={{ color: h.action === 'approve' ? '#16a34a' : '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>
                                        {h.action === 'approve' ? (h.approval_stage === '1st' ? '1st Approval' : 'Final Approval') : 'Revision Requested'}
                                    </div>
                                    {h.note ? (
                                        <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                            "{h.note}"
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* HEADER SECTION */}
            <div className="document-header" style={{ marginTop: '0.5rem' }}>
                {!isCorporate && (
                    <div className="input-group">
                        <label>Division</label>
                        <select value={selectedDivisionId} onChange={e => setSelectedDivisionId(e.target.value)} disabled={!canEdit && currentStatus !== STATUS.DRAFT} style={{ padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '1rem', background: 'var(--surface)' }}>
                            <option value="">— Select Division —</option>
                            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                )}
                <div className="input-group">
                    <label>Project No</label>
                    <input type="text" value={eventData.projectNo} onChange={(e) => setEventData({ ...eventData, projectNo: e.target.value })} placeholder="Project Number" disabled={!canEdit} />
                </div>
                <div className="input-group">
                    <label>Event</label>
                    <input type="text" value={eventData.name} onChange={(e) => setEventData({ ...eventData, name: e.target.value })} placeholder="Event Name" disabled={!canEdit} />
                </div>
                <div className="input-group">
                    <label>Venue</label>
                    <input type="text" value={eventData.venue} onChange={(e) => setEventData({ ...eventData, venue: e.target.value })} placeholder="Event Venue" disabled={!canEdit} />
                </div>
                <div className="input-group">
                    <label>Periode Dates</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="date" style={{ flex: 1 }} value={eventData.periodeStart} onChange={(e) => setEventData({ ...eventData, periodeStart: e.target.value })} disabled={!canEdit} />
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>to</span>
                        <input type="date" style={{ flex: 1 }} value={eventData.periodeEnd} onChange={(e) => setEventData({ ...eventData, periodeEnd: e.target.value })} disabled={!canEdit} />
                    </div>
                </div>
                <div className="input-group">
                    <label>Management Fee (%)</label>
                    <input type="number" min="0" max="100" step="0.5" value={eventData.managementFeePercent} onChange={(e) => setEventData({ ...eventData, managementFeePercent: parseFloat(e.target.value) || 0 })} placeholder="10" disabled={!canEdit} style={{ maxWidth: '120px' }} />
                </div>
            </div>

            {/* DATA GRID */}
            <div className="grid-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th className="col-desc">Description</th>
                            <th className="col-qty">QTY</th>
                            <th className="col-mdy">MDY</th>
                            <th className="col-internal">Internal Budget</th>
                            <th className="col-budget">Budget</th>
                            {activeTab === 'realisasi' && <th className="col-realisasi">Realisasi</th>}
                            <th className="col-actions"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((mainItem) => (
                            <Fragment key={mainItem.id}>
                                <tr className="row-main-item">
                                    <td>
                                        <input type="text" className="cell-input" value={mainItem.name} onChange={(e) => updateMainItemName(mainItem.id, e.target.value)} style={{ fontWeight: 700 }} disabled={!canEdit} />
                                    </td>
                                    <td></td><td></td><td></td><td></td>
                                    {activeTab === 'realisasi' && <td></td>}
                                    <td className="col-actions" style={{ display: 'flex', gap: '4px' }}>
                                        {canEdit && (
                                            <>
                                                <button className="btn-icon btn-add-sub" title="Add Sub Item" onClick={() => addSubItem(mainItem.id)}><PlusCircle size={18} /></button>
                                                <button className="btn-icon" title="Remove Main Item" onClick={() => removeMainItem(mainItem.id)}><Trash2 size={18} /></button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                                {mainItem.subs.map((sub) => {
                                    const rowTotalInternal = sub.qty * sub.mdy * sub.internalRate;
                                    const rowTotalBudget = sub.qty * sub.mdy * sub.rate;
                                    return (
                                        <tr className="row-sub-item" key={sub.id}>
                                            <td><input type="text" className="cell-input" value={sub.name} onChange={(e) => updateSubItem(mainItem.id, sub.id, 'name', e.target.value)} style={{ paddingLeft: '2rem' }} disabled={!canEdit} /></td>
                                            <td><input type="number" className="cell-input align-center" value={sub.qty} onChange={(e) => updateSubItem(mainItem.id, sub.id, 'qty', parseFloat(e.target.value) || 0)} disabled={!canEdit} /></td>
                                            <td><input type="number" className="cell-input align-center" value={sub.mdy} onChange={(e) => updateSubItem(mainItem.id, sub.id, 'mdy', parseFloat(e.target.value) || 0)} disabled={!canEdit} /></td>
                                            <td>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem' }}>
                                                    <input type="text" className="cell-input align-right" value={sub.internalRate === 0 ? '' : formatCurrency(sub.internalRate)} onChange={(e) => updateSubItem(mainItem.id, sub.id, 'internalRate', parseCurrency(e.target.value))} style={{ width: '45%' }} placeholder="Rate" disabled={!canEdit} />
                                                    <div className="cell-readonly align-right" style={{ width: '50%' }}>{formatCurrency(rowTotalInternal)}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem' }}>
                                                    <input type="text" className="cell-input align-right" value={sub.rate === 0 ? '' : formatCurrency(sub.rate)} onChange={(e) => updateSubItem(mainItem.id, sub.id, 'rate', parseCurrency(e.target.value))} style={{ width: '45%' }} placeholder="Rate" disabled={!canEdit} />
                                                    <div className="cell-readonly align-right" style={{ width: '50%', fontWeight: 600 }}>{formatCurrency(rowTotalBudget)}</div>
                                                </div>
                                            </td>
                                            {activeTab === 'realisasi' && (
                                                <td style={{ background: 'rgba(234,179,8,0.05)', padding: '0 0.5rem' }}>
                                                    <input type="text" className="cell-input align-right" value={sub.actualRate === 0 ? '' : formatCurrency(sub.actualRate)} onChange={(e) => updateSubItem(mainItem.id, sub.id, 'actualRate', parseCurrency(e.target.value))} style={{ width: '100%', color: 'var(--primary)', fontWeight: 600 }} placeholder="Actual Total" disabled={!canEdit} />
                                                </td>
                                            )}
                                            <td className="col-actions">
                                                {canEdit && <button className="btn-icon" title="Remove Sub Item" onClick={() => removeSubItem(mainItem.id, sub.id)}><Trash2 size={18} /></button>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </Fragment>
                        ))}
                        <tr><td colSpan={activeTab === 'realisasi' ? 7 : 6} style={{ height: '0.5rem' }}></td></tr>
                        {canEdit && (
                            <tr>
                                <td colSpan={activeTab === 'realisasi' ? 7 : 6} style={{ padding: '0.5rem 1rem', borderBottom: 'none' }}>
                                    <button className="btn btn-primary btn-sm" onClick={addMainItem}><Plus size={16} /> Add Main Item</button>
                                </td>
                            </tr>
                        )}
                        <tr className="summary-row highlight">
                            <td colSpan="3" className="align-right">SUBTOTAL</td>
                            <td>{formatCurrency(subtotalInternal)}</td>
                            <td>{formatCurrency(subtotalBudget)}</td>
                            {activeTab === 'realisasi' && <td></td>}
                            <td></td>
                        </tr>
                        <tr className="summary-row">
                            <td colSpan="3" className="align-right">{`MANAGEMENT FEE (${mgmtPct}%)`}</td>
                            <td></td><td>{formatCurrency(managementFee)}</td>
                            {activeTab === 'realisasi' && <td></td>}<td></td>
                        </tr>
                        <tr className="summary-row highlight">
                            <td colSpan="3" className="align-right">TOTAL</td>
                            <td>{formatCurrency(totalInternal)}</td>
                            <td>{formatCurrency(totalBudget)}</td>
                            {activeTab === 'realisasi' && <td></td>}<td></td>
                        </tr>
                        <tr className="summary-row">
                            <td colSpan="3" className="align-right">PPN (11%)</td>
                            <td></td><td>{formatCurrency(ppn)}</td>
                            {activeTab === 'realisasi' && <td></td>}<td></td>
                        </tr>
                        <tr className="summary-row highlight">
                            <td colSpan="3" className="align-right">GRAND TOTAL</td>
                            <td>{formatCurrency(grandTotalInternal)}</td>
                            <td>{formatCurrency(grandTotalBudget)}</td>
                            {activeTab === 'realisasi' && <td style={{ color: 'var(--primary)', fontWeight: '800' }}>{formatCurrency(grandTotalRealisasi)}</td>}
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* METRICS & NOTES FOOTER */}
            <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.875rem' }}>Notes</label>
                    <textarea value={eventData.note} onChange={(e) => setEventData({ ...eventData, note: e.target.value })} placeholder="Add any additional notes or terms here..." disabled={!canEdit} style={{ width: '100%', minHeight: '150px', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', background: !canEdit ? 'var(--bg-color)' : 'var(--surface)', fontFamily: 'inherit', fontSize: '0.95rem', resize: 'vertical', boxShadow: 'var(--shadow-sm)' }} />
                </div>
                <div className="metrics-section" style={{ marginTop: 0, flexBasis: '400px' }}>
                    <div className="metric-line"><span className="metric-label">Submitted Budget</span><span className="metric-value">{formatCurrency(grandTotalBudget)}</span></div>
                    <div className="metric-line"><span className="metric-label">After PPN (Budget)</span><span className="metric-value">{formatCurrency(afterPpn)}</span></div>
                    <div className="metric-line"><span className="metric-label">After PPH (Budget)</span><span className="metric-value">{formatCurrency(afterPph)}</span></div>
                    <div className="metric-line pl"><span className="metric-label">P/L (Budget)</span><span className="metric-value" style={profitLoss < 0 ? { color: '#ef4444' } : {}}>{formatCurrency(profitLoss)}</span></div>
                    {activeTab === 'realisasi' && (
                        <>
                            <div style={{ height: '1px', background: 'var(--border)', margin: '1rem 0' }}></div>
                            <div className="metric-line"><span className="metric-label" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Actual Budget (Realisasi)</span><span className="metric-value" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{formatCurrency(grandTotalRealisasi)}</span></div>
                            <div className="metric-line pl"><span className="metric-label" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>P/L (Realisasi)</span><span className="metric-value" style={{ color: profitLossRealisasi < 0 ? '#ef4444' : 'var(--primary)', fontWeight: 'bold' }}>{formatCurrency(profitLossRealisasi)}</span></div>
                        </>
                    )}
                </div>
            </div>

            {/* LOAD FORM MODAL */}
            {showLoadModal && (
                <div className="modal-overlay" onClick={() => setShowLoadModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><Search size={20} /> Load Form</h2>
                            <button onClick={() => setShowLoadModal(false)}><X size={24} /></button>
                        </div>
                        <div className="modal-search">
                            <input type="text" placeholder="Search by Event, Venue, Project..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); fetchForms(e.target.value); }} />
                            <button className="btn btn-primary" onClick={() => fetchForms(searchTerm)}>Search</button>
                        </div>
                        <div className="form-list">
                            {formList.length === 0 ? (
                                <div style={{ padding: '1rem', textAlign: 'center', color: '#64748B' }}>No forms found.</div>
                            ) : (
                                formList.map(form => (
                                    <div key={form.id} className="form-item">
                                        <div className="form-item-info" onClick={() => loadForm(form.id)} style={{ cursor: 'pointer', flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span className="form-item-title">{form.project_no ? `[${form.project_no}] ` : ''}{form.event || 'Untitled Event'}</span>
                                                {statusBadge(form.status)}
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(v{form.version_number || 1})</span>
                                            </div>
                                            <span className="form-item-date">
                                                {form.venue} • {form.periode_start && form.periode_end ? `${form.periode_start} to ${form.periode_end}` : form.periode} • {form.creator_name || 'Unknown'}
                                                {form.division_name && ` • ${form.division_name}`}
                                            </span>
                                        </div>
                                        <button className="btn btn-sm" style={{ background: 'var(--accent-light)', color: '#92400E', border: '1px solid rgba(250,204,21,0.3)', flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); loadForm(form.id, true); }}>
                                            Use as Template
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* VERSION HISTORY MODAL */}
            {showVersionHistory && (
                <div className="modal-overlay" onClick={() => setShowVersionHistory(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2><History size={20} /> Version History</h2>
                            <button onClick={() => setShowVersionHistory(false)}><X size={24} /></button>
                        </div>
                        <div className="form-list">
                            {versionHistory.map(v => (
                                <div key={v.id} className="form-item" onClick={() => loadForm(v.id)} style={{ cursor: v.id === currentFormId ? 'default' : 'pointer', border: v.id === currentFormId ? '2px solid var(--primary)' : undefined }}>
                                    <div className="form-item-info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span className="form-item-title">Version {v.version_number || 1}</span>
                                            {statusBadge(v.status)}
                                            {v.id === currentFormId && <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>← Current</span>}
                                        </div>
                                        <span className="form-item-date">
                                            {v.approved_at && `Approved: ${v.approved_at}`}
                                            {v.revision_note && ` • Note: "${v.revision_note}"`}
                                            {v.creator_name && ` • By: ${v.creator_name}`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTOM DIALOG MODAL */}
            {dialogConfig && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h2>{dialogConfig.title || 'Notification'}</h2>
                            <button onClick={dialogConfig.onCancel}><X size={24} /></button>
                        </div>
                        <div style={{ padding: '1rem 0' }}><p>{dialogConfig.message}</p>
                            {dialogConfig.type === 'prompt' && (
                                <input type="text" autoFocus style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { const el = document.getElementById('prompt-input-modal'); dialogConfig.onConfirm(el ? el.value : ''); } else if (e.key === 'Escape') dialogConfig.onCancel(); }}
                                    id="prompt-input-modal"
                                />
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                            {dialogConfig.type !== 'alert' && <button className="btn btn-secondary" onClick={dialogConfig.onCancel}>Cancel</button>}
                            <button className="btn btn-primary" onClick={() => {
                                if (dialogConfig.type === 'prompt') { const el = document.getElementById('prompt-input-modal'); dialogConfig.onConfirm(el ? el.value : ''); }
                                else dialogConfig.onConfirm(true);
                            }}>OK</button>
                        </div>
                    </div>
                </div>
            )}

            {/* USER MANAGEMENT MODAL */}
            {showUserMgmt && <UserManagement token={token} onClose={() => setShowUserMgmt(false)} />}

            {/* DIVISION MANAGEMENT MODAL */}
            {showDivisionMgmt && <DivisionManagement token={token} onClose={() => setShowDivisionMgmt(false)} />}
            </>
            )}
        </div>
    );
}

export default App;

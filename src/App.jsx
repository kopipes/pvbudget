import { useState, Fragment } from 'react';
import { Plus, Trash2, PlusCircle, Save, FileDown, FilePlus, Search, X, AlertTriangle, LogOut, Shield } from 'lucide-react';
import * as XLSX from 'xlsx';
import UserManagement from './UserManagement.jsx';
import './App.css';

const API = 'http://localhost:3001';

// Helper to format currency
const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '';
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Helper to clean string for parsing
const parseCurrency = (str) => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = str.replace(/\./g, '');
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
};

function App({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState('budget'); // 'budget' or 'realisasi'

  const [eventData, setEventData] = useState({
    projectNo: '',
    name: '',
    venue: '',
    periode: '',
    periodeStart: '',
    periodeEnd: '',
    note: '',
    creatorName: user.display_name
  });

  const [items, setItems] = useState([
    {
      id: 'm1',
      name: 'NEW SECTION',
      subs: []
    }
  ]);

  const [parentFormId, setParentFormId] = useState(null);
  const [currentFormId, setCurrentFormId] = useState(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [modalMode, setModalMode] = useState('load');
  const [searchTerm, setSearchTerm] = useState('');
  const [formList, setFormList] = useState([]);
  const [isReadOnly, setIsReadOnly] = useState(false); // when manager views subordinate's form
  const [showUserMgmt, setShowUserMgmt] = useState(false);

  const [dialogConfig, setDialogConfig] = useState(null);

  // Auth header helper
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Role checks
  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const isUser = user.role === 'user';
  const canEdit = !isReadOnly; // can edit if not in read-only mode
  const canDelete = isAdmin; // only admin can delete

  const showDialog = (type, message, title = '') => {
    return new Promise((resolve) => {
      setDialogConfig({
        type,
        message,
        title,
        onConfirm: (val) => {
          setDialogConfig(null);
          resolve(val !== undefined ? val : true);
        },
        onCancel: () => {
          setDialogConfig(null);
          resolve(type === 'prompt' ? null : false);
        }
      });
    });
  };

  // Generators for unique ids
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // State Handlers
  const addMainItem = () => {
    if (!canEdit) return;
    setItems([
      ...items,
      { id: generateId(), name: 'NEW ITEM', subs: [] }
    ]);
  };

  const removeMainItem = (mainId) => {
    if (!canEdit) return;
    setItems(items.filter(item => item.id !== mainId));
  };

  const updateMainItemName = (mainId, name) => {
    if (!canEdit) return;
    setItems(items.map(item => item.id === mainId ? { ...item, name } : item));
  };

  const addSubItem = (mainId) => {
    if (!canEdit) return;
    setItems(items.map(item => {
      if (item.id === mainId) {
        return {
          ...item,
          subs: [
            ...item.subs,
            { id: generateId(), name: 'New Sub Item', qty: 1, mdy: 1, internalRate: 0, rate: 0, actualRate: 0 }
          ]
        };
      }
      return item;
    }));
  };

  const removeSubItem = (mainId, subId) => {
    if (!canEdit) return;
    setItems(items.map(item => {
      if (item.id === mainId) {
        return { ...item, subs: item.subs.filter(sub => sub.id !== subId) };
      }
      return item;
    }));
  };

  const updateSubItem = (mainId, subId, field, value) => {
    if (!canEdit) return;
    setItems(items.map(item => {
      if (item.id === mainId) {
        return {
          ...item,
          subs: item.subs.map(sub => {
            if (sub.id === subId) {
              return { ...sub, [field]: value };
            }
            return sub;
          })
        };
      }
      return item;
    }));
  };

  // Calculations
  let subtotalInternal = 0;
  let subtotalBudget = 0;
  let subtotalRealisasi = 0;

  items.forEach(item => {
    item.subs.forEach(sub => {
      subtotalInternal += (sub.qty * sub.mdy * sub.internalRate);
      subtotalBudget += (sub.qty * sub.mdy * sub.rate);
      subtotalRealisasi += (sub.actualRate || 0);
    });
  });

  const managementFee = subtotalBudget * 0.10;
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

  // Top Action Handlers
  const handleNewForm = async () => {
    if (activeTab === 'realisasi') {
      const confirmed = await showDialog('confirm', 'Select a Budget Form to create a Realisasi from? Unsaved changes will be lost.', 'Confirm New Form');
      if (confirmed) {
        setModalMode('new-realisasi');
        setShowLoadModal(true);
        fetchForms(searchTerm, 'budget');
      }
    } else {
      const confirmed = await showDialog('confirm', 'Are you sure you want to start a new form? Unsaved changes will be lost.', 'Confirm New Form');
      if (confirmed) {
        setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '', creatorName: user.display_name });
        setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
        setCurrentFormId(null);
        setParentFormId(null);
        setIsReadOnly(false);
      }
    }
  };

  const handleSaveForm = async () => {
    if (!canEdit) return;

    try {
      const dataToSave = {
        form_type: activeTab,
        parent_id: activeTab === 'realisasi' ? parentFormId : null,
        project_no: eventData.projectNo,
        event: eventData.name,
        venue: eventData.venue,
        periode: eventData.periode,
        periode_start: eventData.periodeStart,
        periode_end: eventData.periodeEnd,
        note: eventData.note,
        data: items
      };

      let url = `${API}/api/forms`;
      let method = 'POST';

      if (currentFormId) {
        url = `${API}/api/forms/${currentFormId}`;
        method = 'PUT';
      }

      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(dataToSave)
      });

      if (response.status === 401) {
        await showDialog('alert', 'Session expired. Please login again.', 'Session Expired');
        onLogout();
        return;
      }

      if (response.status === 403) {
        await showDialog('alert', 'You do not have permission to save this form.', 'Access Denied');
        return;
      }

      if (!response.ok) throw new Error('Save failed');

      const result = await response.json();
      if (!currentFormId && result.id) {
        setCurrentFormId(result.id);
      }

      await showDialog('alert', 'Form saved successfully to Database!', 'Success');
    } catch (error) {
      console.error(error);
      await showDialog('alert', 'Failed to save to Database', 'Error');
    }
  };

  const handleDeleteForm = async () => {
    if (!currentFormId || !canDelete) return;

    const confirmed = await showDialog('confirm', 'Are you sure you want to delete this form? This action cannot be undone.', 'Delete Form');
    if (!confirmed) return;

    try {
      const response = await fetch(`${API}/api/forms/${currentFormId}`, {
        method: 'DELETE',
        headers: authHeaders
      });

      if (response.status === 401) {
        await showDialog('alert', 'Session expired. Please login again.', 'Session Expired');
        onLogout();
        return;
      }

      if (response.status === 403) {
        await showDialog('alert', 'Only admins can delete forms.', 'Access Denied');
        return;
      }

      if (!response.ok) throw new Error('Delete failed');

      await showDialog('alert', 'Form deleted successfully!', 'Success');
      setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '', creatorName: user.display_name });
      setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
      setCurrentFormId(null);
      setParentFormId(null);
      setIsReadOnly(false);
    } catch (error) {
      console.error(error);
      await showDialog('alert', 'Failed to delete form', 'Error');
    }
  };

  const fetchForms = async (query = '', typeFilter = activeTab) => {
    try {
      const res = await fetch(`${API}/api/forms?query=${encodeURIComponent(query)}&type=${typeFilter}`, {
        headers: authHeaders
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setFormList(data);
      }
    } catch (e) {
      console.error('Failed to search forms', e);
    }
  };

  const openLoadModal = async () => {
    const confirmed = await showDialog('confirm', `Apakah Anda sudah menyimpan form ${activeTab} ini sebelumnya? Segala perubahan yang belum tersimpan akan hilang. Lanjutkan memuat form lain?`, 'Confirm Load Form');
    if (confirmed) {
      setModalMode('load');
      setShowLoadModal(true);
      fetchForms(searchTerm, activeTab);
    }
  };

  const handleLoadForm = async (id, isNewRealisasiTemplate = false) => {
    try {
      const res = await fetch(`${API}/api/forms/${id}`, {
        headers: authHeaders
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        let form = await res.json();

        if (isNewRealisasiTemplate) {
          setParentFormId(form.id);
          setCurrentFormId(null);
          setIsReadOnly(false); // creating new realisasi = editable
        } else {
          setCurrentFormId(form.id);
          setParentFormId(form.parent_id);
          setIsReadOnly(form.readonly || false);
        }

        setEventData({
          projectNo: form.project_no || '',
          name: isNewRealisasiTemplate ? `${form.event || ''} - Realisasi` : (form.event || ''),
          venue: form.venue || '',
          periode: form.periode || '',
          periodeStart: form.periode_start || '',
          periodeEnd: form.periode_end || '',
          note: form.note || '',
          creatorName: isNewRealisasiTemplate ? user.display_name : (form.creator_name || 'Unknown User')
        });
        if (form.data && Array.isArray(form.data)) {
          if (isNewRealisasiTemplate) {
            const cleanedData = form.data.map(m => ({
              ...m,
              subs: m.subs.map(s => ({ ...s, actualRate: 0 }))
            }));
            setItems(cleanedData);
          } else {
            setItems(form.data);
          }
        }
        setShowLoadModal(false);
      }
    } catch (e) {
      console.error('Failed to load form', e);
      await showDialog('alert', 'Failed to load form details', 'Error');
    }
  };

  const handleExportExcel = () => {
    const wsData = [];

    const displayPeriode = eventData.periodeStart && eventData.periodeEnd
      ? `${eventData.periodeStart} to ${eventData.periodeEnd}`
      : eventData.periode;

    const acctFormat = '#,##0.00';

    wsData.push([`PROJECT NO.`, eventData.projectNo]);
    wsData.push([`EVENT`, eventData.name]);
    wsData.push([`VENUE`, eventData.venue]);
    wsData.push([`PERIODE`, displayPeriode]);
    wsData.push([]);

    const headerRow = ['DESCRIPTION', 'QTY', 'MDY', 'INTERNAL BUDGET', 'BUDGET'];
    if (activeTab === 'realisasi') headerRow.push('REALISASI');
    wsData.push(headerRow);

    let currentRowIdx = 6;

    const internalSubRows = [];
    const budgetSubRows = [];
    const realisasiSubRows = [];

    items.forEach(main => {
      const mainRow = [main.name, '', '', '', ''];
      if (activeTab === 'realisasi') mainRow.push('');
      wsData.push(mainRow);
      currentRowIdx++;

      main.subs.forEach(sub => {
        currentRowIdx++;
        const rowNum = currentRowIdx;

        const realTot = sub.actualRate || 0;

        const subRow = [
          `   ${sub.name}`,
          { v: sub.qty, t: 'n' },
          { v: sub.mdy, t: 'n' },
          { v: sub.internalRate, t: 'n', z: acctFormat },
          { v: sub.rate, t: 'n', z: acctFormat },
        ];

        const internalF = `B${rowNum}*C${rowNum}*${sub.internalRate}`;
        const budgetF = `B${rowNum}*C${rowNum}*${sub.rate}`;

        subRow[3] = { v: sub.qty * sub.mdy * sub.internalRate, f: internalF, t: 'n', z: acctFormat };
        subRow[4] = { v: sub.qty * sub.mdy * sub.rate, f: budgetF, t: 'n', z: acctFormat };

        internalSubRows.push(`D${rowNum}`);
        budgetSubRows.push(`E${rowNum}`);

        if (activeTab === 'realisasi') {
          subRow.push({ v: realTot, t: 'n', z: acctFormat });
          realisasiSubRows.push(`F${rowNum}`);
        }
        wsData.push(subRow);
      });
    });

    wsData.push([]);
    currentRowIdx++;

    const sumSub = (arr) => arr.length > 0 ? arr.join('+') : '0';

    currentRowIdx++;
    const subtotalRow = currentRowIdx;
    const rowSubtotal = ['SUBTOTAL', '', ''];
    rowSubtotal.push({ v: subtotalInternal, f: sumSub(internalSubRows), t: 'n', z: acctFormat });
    rowSubtotal.push({ v: subtotalBudget, f: sumSub(budgetSubRows), t: 'n', z: acctFormat });
    if (activeTab === 'realisasi') rowSubtotal.push({ v: subtotalRealisasi, f: sumSub(realisasiSubRows), t: 'n', z: acctFormat });
    wsData.push(rowSubtotal);

    currentRowIdx++;
    const mgmtRow = currentRowIdx;
    const rowMgmt = ['MANAGEMENT FEE (10%)', '', ''];
    rowMgmt.push('');
    rowMgmt.push({ v: managementFee, f: `E${subtotalRow}*0.1`, t: 'n', z: acctFormat });
    if (activeTab === 'realisasi') rowMgmt.push('');
    wsData.push(rowMgmt);

    currentRowIdx++;
    const totalRow = currentRowIdx;
    const rowTotal = ['TOTAL', '', ''];
    rowTotal.push({ v: totalInternal, f: `D${subtotalRow}`, t: 'n', z: acctFormat });
    rowTotal.push({ v: totalBudget, f: `E${subtotalRow}+E${mgmtRow}`, t: 'n', z: acctFormat });
    if (activeTab === 'realisasi') rowTotal.push('');
    wsData.push(rowTotal);

    currentRowIdx++;
    const ppnRow = currentRowIdx;
    const rowPPN = ['PPN (11%)', '', ''];
    rowPPN.push('');
    rowPPN.push({ v: ppn, f: `E${totalRow}*0.11`, t: 'n', z: acctFormat });
    if (activeTab === 'realisasi') rowPPN.push('');
    wsData.push(rowPPN);

    currentRowIdx++;
    const grandRow = currentRowIdx;
    const rowGrand = ['GRAND TOTAL', '', ''];
    rowGrand.push({ v: grandTotalInternal, f: `D${totalRow}`, t: 'n', z: acctFormat });
    rowGrand.push({ v: grandTotalBudget, f: `E${totalRow}+E${ppnRow}`, t: 'n', z: acctFormat });
    if (activeTab === 'realisasi') {
      rowGrand.push({ v: grandTotalRealisasi, f: `F${subtotalRow}`, t: 'n', z: acctFormat });
    }
    wsData.push(rowGrand);

    wsData.push([]);
    currentRowIdx++;

    currentRowIdx++;
    wsData.push(['', '', '', 'Submitted Budget', { v: grandTotalBudget, f: `E${grandRow}`, t: 'n', z: acctFormat }]);

    currentRowIdx++;
    const afterPpnRow = currentRowIdx;
    wsData.push(['', '', '', 'After PPN', { v: afterPpn, f: `E${totalRow}`, t: 'n', z: acctFormat }]);

    currentRowIdx++;
    const afterPphRow = currentRowIdx;
    wsData.push(['', '', '', 'After PPH', { v: afterPph, f: `E${afterPpnRow}-(E${totalRow}*0.02)`, t: 'n', z: acctFormat }]);

    currentRowIdx++;
    wsData.push(['', '', '', 'P/L (Budget)', { v: profitLoss, f: `E${afterPphRow}-D${grandRow}`, t: 'n', z: acctFormat }]);

    if (activeTab === 'realisasi') {
      wsData.push([]);
      currentRowIdx++;

      currentRowIdx++;
      const actualRow = currentRowIdx;
      wsData.push(['', '', '', 'Actual Budget (Realisasi)', { v: grandTotalRealisasi, f: `F${grandRow}`, t: 'n', z: acctFormat }]);

      currentRowIdx++;
      wsData.push(['', '', '', 'P/L (Realisasi)', { v: profitLossRealisasi, f: `E${actualRow}-D${grandRow}`, t: 'n', z: acctFormat }]);
    }

    wsData.push([]);

    if (eventData.note) {
      wsData.push(['NOTES:']);
      const noteLines = eventData.note.split('\n');
      noteLines.forEach(line => {
        wsData.push([line]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const cols = [{ wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }];
    if (activeTab === 'realisasi') cols.push({ wch: 20 });
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Budget");

    XLSX.writeFile(wb, "Budget_Form_Export.xlsx");
  };

  // Role badge helper
  const roleBadge = (role) => {
    const labels = { admin: 'Admin', manager: 'Manager', user: 'User' };
    return <span className={`role-badge role-${role}`}>{labels[role] || role}</span>;
  };

  return (
    <div className="app-container">
      {/* USER INFO BAR */}
      <div className="user-bar">
        <div className="user-bar-info">
          <div className="user-avatar">{user.display_name?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div>
            <span className="user-bar-name">{user.display_name}</span>
            {roleBadge(user.role)}
          </div>
        </div>
        <div className="user-bar-actions">
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowUserMgmt(true)}>
              <Shield size={14} /> Users
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>

      {/* READ-ONLY BANNER */}
      {isReadOnly && (
        <div className="readonly-banner">
          <AlertTriangle size={16} />
          <span>You are viewing this form in <strong>read-only</strong> mode. Only the form owner can edit.</span>
        </div>
      )}

      {/* APP TITLE & TABS */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontWeight: '800', letterSpacing: '4px', color: 'var(--primary)', textTransform: 'uppercase', margin: 0 }}>
          {activeTab === 'budget' ? 'BUDGET' : 'REALISASI'}
        </h1>
        <div style={{ display: 'inline-flex', marginTop: '1rem', background: 'var(--surface)', borderRadius: '8px', padding: '4px', boxShadow: 'var(--shadow-sm)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'budget' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none', boxShadow: 'none' }}
            onClick={async () => {
              const confirmed = await showDialog('confirm', "Switching tabs will discard unsaved changes. Switch?", "Confirm Switch");
              if (confirmed) {
                setActiveTab('budget');
                setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '', creatorName: user.display_name });
                setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
                setCurrentFormId(null);
                setParentFormId(null);
                setIsReadOnly(false);
              }
            }}>
            BUDGET
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'realisasi' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none', boxShadow: 'none' }}
            onClick={async () => {
              const confirmed = await showDialog('confirm', "Switching tabs will discard unsaved changes. Switch?", "Confirm Switch");
              if (confirmed) {
                setActiveTab('realisasi');
                setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '', creatorName: user.display_name });
                setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
                setCurrentFormId(null);
                setParentFormId(null);
                setIsReadOnly(false);
                setModalMode('new-realisasi');
                setShowLoadModal(true);
                fetchForms(searchTerm, 'budget');
              }
            }}>
            REALISASI
          </button>
        </div>
      </div>

      {/* TOP ACTION BAR */}
      <div className="top-action-bar">
        <button className="btn btn-secondary btn-sm" onClick={handleNewForm}>
          <FilePlus size={16} /> New Form
        </button>
        <button className="btn btn-secondary btn-sm" onClick={openLoadModal}>
          <Search size={16} /> Load Form
        </button>
        {canEdit && (
          <button className="btn btn-secondary btn-sm" onClick={handleSaveForm}>
            <Save size={16} /> Save Form
          </button>
        )}
        <button className="btn btn-success btn-sm" onClick={handleExportExcel}>
          <FileDown size={16} /> Export to XLS
        </button>

        {/* Delete Button (Only admin and if a form is loaded) */}
        {canDelete && currentFormId && (
          <button
            className="btn btn-sm"
            style={{
              background: '#ef4444',
              color: 'white',
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            onClick={handleDeleteForm}
          >
            <AlertTriangle size={16} /> Delete Form
          </button>
        )}
      </div>

      <div style={{ padding: '0 1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '4px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          Form Owner: <strong style={{ color: 'var(--text-main)' }}>{eventData.creatorName}</strong>
        </span>
      </div>

      {/* HEADER SECTION */}
      <div className="document-header" style={{ marginTop: '0.5rem' }}>
        <div className="input-group">
          <label>Project No</label>
          <input
            type="text"
            value={eventData.projectNo}
            onChange={(e) => setEventData({ ...eventData, projectNo: e.target.value })}
            placeholder="Project Number"
            disabled={isReadOnly}
          />
        </div>
        <div className="input-group">
          <label>Event</label>
          <input
            type="text"
            value={eventData.name}
            onChange={(e) => setEventData({ ...eventData, name: e.target.value })}
            placeholder="Event Name"
            disabled={isReadOnly}
          />
        </div>
        <div className="input-group">
          <label>Venue</label>
          <input
            type="text"
            value={eventData.venue}
            onChange={(e) => setEventData({ ...eventData, venue: e.target.value })}
            placeholder="Event Venue"
            disabled={isReadOnly}
          />
        </div>
        <div className="input-group">
          <label>Periode Dates</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="date"
              style={{ flex: 1 }}
              value={eventData.periodeStart}
              onChange={(e) => setEventData({ ...eventData, periodeStart: e.target.value })}
              disabled={isReadOnly}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>to</span>
            <input
              type="date"
              style={{ flex: 1 }}
              value={eventData.periodeEnd}
              onChange={(e) => setEventData({ ...eventData, periodeEnd: e.target.value })}
              disabled={isReadOnly}
            />
          </div>
          {eventData.periode && !eventData.periodeStart && !eventData.periodeEnd && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Legacy text: {eventData.periode}
            </div>
          )}
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
                {/* Main Item Row */}
                <tr className="row-main-item">
                  <td>
                    <input
                      type="text"
                      className="cell-input"
                      value={mainItem.name}
                      onChange={(e) => updateMainItemName(mainItem.id, e.target.value)}
                      style={{ fontWeight: 700 }}
                      disabled={isReadOnly}
                    />
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  {activeTab === 'realisasi' && <td></td>}
                  <td className="col-actions" style={{ display: 'flex', gap: '4px' }}>
                    {canEdit && (
                      <>
                        <button className="btn-icon btn-add-sub" title="Add Sub Item" onClick={() => addSubItem(mainItem.id)}>
                          <PlusCircle size={18} />
                        </button>
                        <button className="btn-icon" title="Remove Main Item" onClick={() => removeMainItem(mainItem.id)}>
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>

                {/* Sub Items Rows */}
                {mainItem.subs.map((sub) => {
                  const rowTotalInternal = sub.qty * sub.mdy * sub.internalRate;
                  const rowTotalBudget = sub.qty * sub.mdy * sub.rate;

                  return (
                    <tr className="row-sub-item" key={sub.id}>
                      <td>
                        <input
                          type="text"
                          className="cell-input"
                          value={sub.name}
                          onChange={(e) => updateSubItem(mainItem.id, sub.id, 'name', e.target.value)}
                          style={{ paddingLeft: '2rem' }}
                          disabled={isReadOnly}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="cell-input align-center"
                          value={sub.qty}
                          onChange={(e) => updateSubItem(mainItem.id, sub.id, 'qty', parseFloat(e.target.value) || 0)}
                          disabled={isReadOnly}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="cell-input align-center"
                          value={sub.mdy}
                          onChange={(e) => updateSubItem(mainItem.id, sub.id, 'mdy', parseFloat(e.target.value) || 0)}
                          disabled={isReadOnly}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem' }}>
                          <input
                            type="text"
                            className="cell-input align-right"
                            value={sub.internalRate === 0 ? '' : formatCurrency(sub.internalRate)}
                            onChange={(e) => updateSubItem(mainItem.id, sub.id, 'internalRate', parseCurrency(e.target.value))}
                            style={{ width: '45%' }}
                            placeholder="Rate"
                            disabled={isReadOnly}
                          />
                          <div className="cell-readonly align-right" style={{ width: '50%' }}>
                            {formatCurrency(rowTotalInternal)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem' }}>
                          <input
                            type="text"
                            className="cell-input align-right"
                            value={sub.rate === 0 ? '' : formatCurrency(sub.rate)}
                            onChange={(e) => updateSubItem(mainItem.id, sub.id, 'rate', parseCurrency(e.target.value))}
                            style={{ width: '45%' }}
                            placeholder="Rate"
                            disabled={isReadOnly}
                          />
                          <div className="cell-readonly align-right" style={{ width: '50%', fontWeight: 600 }}>
                            {formatCurrency(rowTotalBudget)}
                          </div>
                        </div>
                      </td>
                      {activeTab === 'realisasi' && (
                        <td style={{ background: 'rgba(234, 179, 8, 0.05)', padding: '0 0.5rem' }}>
                          <input
                            type="text"
                            className="cell-input align-right"
                            value={sub.actualRate === 0 ? '' : formatCurrency(sub.actualRate)}
                            onChange={(e) => updateSubItem(mainItem.id, sub.id, 'actualRate', parseCurrency(e.target.value))}
                            style={{ width: '100%', color: 'var(--primary)', fontWeight: 600 }}
                            placeholder="Actual Total"
                            disabled={isReadOnly}
                          />
                        </td>
                      )}
                      <td className="col-actions">
                        {canEdit && (
                          <button className="btn-icon" title="Remove Sub Item" onClick={() => removeSubItem(mainItem.id, sub.id)}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}

            {/* Empty Spacer Row for aesthetics */}
            <tr><td colSpan="6" style={{ height: '0.5rem' }}></td></tr>

            {/* Add Main Item Button (Moved above Subtotal) */}
            {canEdit && (
              <tr>
                <td colSpan="6" style={{ padding: '0.5rem 1rem', borderBottom: 'none' }}>
                  <button className="btn btn-primary btn-sm" onClick={addMainItem}>
                    <Plus size={16} /> Add Main Item
                  </button>
                </td>
              </tr>
            )}

            {/* SUMMARY ROWS */}
            <tr className="summary-row highlight">
              <td colSpan="3" className="align-right">SUBTOTAL</td>
              <td>{formatCurrency(subtotalInternal)}</td>
              <td>{formatCurrency(subtotalBudget)}</td>
              {activeTab === 'realisasi' && <td></td>}
              <td></td>
            </tr>
            <tr className="summary-row">
              <td colSpan="3" className="align-right">MANAGEMENT FEE (10%)</td>
              <td></td>
              <td>{formatCurrency(managementFee)}</td>
              {activeTab === 'realisasi' && <td></td>}
              <td></td>
            </tr>
            <tr className="summary-row highlight">
              <td colSpan="3" className="align-right">TOTAL</td>
              <td>{formatCurrency(totalInternal)}</td>
              <td>{formatCurrency(totalBudget)}</td>
              {activeTab === 'realisasi' && <td></td>}
              <td></td>
            </tr>
            <tr className="summary-row">
              <td colSpan="3" className="align-right">PPN (11%)</td>
              <td></td>
              <td>{formatCurrency(ppn)}</td>
              {activeTab === 'realisasi' && <td></td>}
              <td></td>
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
          <textarea
            value={eventData.note}
            onChange={(e) => setEventData({ ...eventData, note: e.target.value })}
            placeholder="Add any additional notes or terms here..."
            disabled={isReadOnly}
            style={{
              width: '100%',
              minHeight: '150px',
              padding: '1rem',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: isReadOnly ? 'var(--bg-color)' : 'var(--surface)',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              resize: 'vertical',
              boxShadow: 'var(--shadow-sm)'
            }}
          />
        </div>

        <div className="metrics-section" style={{ marginTop: 0, flexBasis: '400px' }}>
          <div className="metric-line">
            <span className="metric-label">Submitted Budget</span>
            <span className="metric-value">{formatCurrency(grandTotalBudget)}</span>
          </div>
          <div className="metric-line">
            <span className="metric-label">After PPN (Budget)</span>
            <span className="metric-value">{formatCurrency(afterPpn)}</span>
          </div>
          <div className="metric-line">
            <span className="metric-label">After PPH (Budget)</span>
            <span className="metric-value">{formatCurrency(afterPph)}</span>
          </div>
          <div className="metric-line pl">
            <span className="metric-label">P/L (Budget)</span>
            <span className="metric-value" style={profitLoss < 0 ? { color: '#ef4444' } : {}}>
              {formatCurrency(profitLoss)}
            </span>
          </div>

          {activeTab === 'realisasi' && (
            <>
              <div style={{ height: '1px', background: 'var(--border)', margin: '1rem 0' }}></div>
              <div className="metric-line">
                <span className="metric-label" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>Actual Budget (Realisasi)</span>
                <span className="metric-value" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{formatCurrency(grandTotalRealisasi)}</span>
              </div>
              <div className="metric-line pl">
                <span className="metric-label" style={{ color: 'var(--primary)', fontWeight: 'bold' }}>P/L (Realisasi)</span>
                <span className="metric-value" style={{ color: profitLossRealisasi < 0 ? '#ef4444' : 'var(--primary)', fontWeight: 'bold' }}>
                  {formatCurrency(profitLossRealisasi)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SEARCH/LOAD MODAL */}
      {
        showLoadModal && (
          <div className="modal-overlay" onClick={() => setShowLoadModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Load Form Database</h2>
                <button onClick={() => setShowLoadModal(false)}><X size={24} /></button>
              </div>

              <div className="modal-search">
                <input
                  type="text"
                  placeholder="Search by Event, Venue, or Date..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    fetchForms(e.target.value);
                  }}
                />
                <button className="btn btn-primary" onClick={() => fetchForms(searchTerm)}>
                  Search
                </button>
              </div>

              <div className="form-list">
                {formList.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#64748B' }}>
                    No forms found in database.
                  </div>
                ) : (
                  formList.map(form => (
                    <div key={form.id} className="form-item" onClick={() => handleLoadForm(form.id, modalMode === 'new-realisasi')}>
                      <div className="form-item-info">
                        <span className="form-item-title">{form.project_no ? `[${form.project_no}] ` : ''}{form.event || 'Untitled Event'}</span>
                        <span className="form-item-date">{form.venue} | {form.periode_start && form.periode_end ? `${form.periode_start} to ${form.periode_end}` : form.periode} | Created by: {form.creator_name || 'Unknown User'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* CUSTOM DIALOG MODAL */}
      {dialogConfig && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>{dialogConfig.title || 'Notification'}</h2>
              <button onClick={dialogConfig.onCancel}><X size={24} /></button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <p>{dialogConfig.message}</p>
              {dialogConfig.type === 'prompt' && (
                <input
                  type={dialogConfig.title.toLowerCase().includes('password') ? 'password' : 'text'}
                  autoFocus
                  style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      dialogConfig.onConfirm(e.target.value);
                    } else if (e.key === 'Escape') {
                      dialogConfig.onCancel();
                    }
                  }}
                  id="prompt-input-modal"
                />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              {dialogConfig.type !== 'alert' && (
                <button className="btn btn-secondary" onClick={dialogConfig.onCancel}>Cancel</button>
              )}
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (dialogConfig.type === 'prompt') {
                    const el = document.getElementById('prompt-input-modal');
                    dialogConfig.onConfirm(el ? el.value : '');
                  } else {
                    dialogConfig.onConfirm(true);
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER MANAGEMENT MODAL */}
      {showUserMgmt && (
        <UserManagement
          token={token}
          onClose={() => setShowUserMgmt(false)}
        />
      )}

    </div>
  );
}

export default App;

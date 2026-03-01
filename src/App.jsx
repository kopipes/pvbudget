import { useState, Fragment } from 'react';
import { Plus, Trash2, PlusCircle, Save, FileDown, FilePlus, Search, X, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import './App.css';

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

function App() {
  const [activeTab, setActiveTab] = useState('budget'); // 'budget' or 'realisasi'

  const [eventData, setEventData] = useState({
    projectNo: 'PROJ-001',
    name: 'Premiere Wolf Man',
    venue: 'Agora',
    periode: '13 Januari 2025',
    periodeStart: '',
    periodeEnd: '',
    note: ''
  });

  const [items, setItems] = useState([
    {
      id: 'm1',
      name: 'PREMIERE',
      subs: [
        { id: 's1', name: 'Printing (Tent Card & A0)', qty: 1, mdy: 1, internalRate: 2000000, rate: 2000000, actualRate: 0 },
        { id: 's2', name: 'Post Card', qty: 250, mdy: 1, internalRate: 7000, rate: 8000, actualRate: 0 }
      ]
    },
    {
      id: 'm2',
      name: 'MANPOWER',
      subs: [
        { id: 's3', name: 'Crew Premiere', qty: 1, mdy: 1, internalRate: 300000, rate: 500000, actualRate: 0 }
      ]
    }
  ]);

  const [parentFormId, setParentFormId] = useState(null); // the budget id it refers to if in realisasi mode

  const [currentFormId, setCurrentFormId] = useState(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [modalMode, setModalMode] = useState('load'); // 'load' or 'new-realisasi'
  const [searchTerm, setSearchTerm] = useState('');
  const [formList, setFormList] = useState([]);

  // Note: Local storage init removed entirely as we use the backend API now

  // Generators for unique ids
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // State Handlers
  const addMainItem = () => {
    setItems([
      ...items,
      { id: generateId(), name: 'NEW ITEM', subs: [] }
    ]);
  };

  const removeMainItem = (mainId) => {
    setItems(items.filter(item => item.id !== mainId));
  };

  const updateMainItemName = (mainId, name) => {
    setItems(items.map(item => item.id === mainId ? { ...item, name } : item));
  };

  const addSubItem = (mainId) => {
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
    setItems(items.map(item => {
      if (item.id === mainId) {
        return { ...item, subs: item.subs.filter(sub => sub.id !== subId) };
      }
      return item;
    }));
  };

  const updateSubItem = (mainId, subId, field, value) => {
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
      // Row calculations
      subtotalInternal += (sub.qty * sub.mdy * sub.internalRate);
      subtotalBudget += (sub.qty * sub.mdy * sub.rate);
      subtotalRealisasi += (sub.actualRate || 0); // Realisasi is inputted as a total sum directly
    });
  });

  const managementFee = subtotalBudget * 0.10;
  const totalInternal = subtotalInternal;
  const totalBudget = subtotalBudget + managementFee;

  const ppn = totalBudget * 0.11;

  const grandTotalInternal = totalInternal;
  const grandTotalBudget = totalBudget + ppn;
  const grandTotalRealisasi = subtotalRealisasi;

  const afterPpn = totalBudget; // Submitted budget without PPN

  const pph = totalBudget * 0.02; // As deduced: 2% from Total (Before PPN)

  const afterPph = afterPpn - pph;

  const profitLoss = afterPph - grandTotalInternal;
  const profitLossRealisasi = grandTotalRealisasi - grandTotalInternal;

  // Top Action Handlers
  const handleNewForm = () => {
    if (activeTab === 'realisasi') {
      if (window.confirm('Select a Budget Form to create a Realisasi from? Unsaved changes will be lost.')) {
        setModalMode('new-realisasi');
        setShowLoadModal(true);
        fetchForms(searchTerm, 'budget');
      }
    } else {
      if (window.confirm('Are you sure you want to start a new form? Unsaved changes will be lost.')) {
        setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '' });
        setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
        setCurrentFormId(null);
        setParentFormId(null);
      }
    }
  };

  const handleSaveForm = async () => {
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

      let url = 'http://localhost:3001/api/forms';
      let method = 'POST';

      if (currentFormId) {
        url = `http://localhost:3001/api/forms/${currentFormId}`;
        method = 'PUT';
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });

      if (!response.ok) throw new Error('Save failed');

      const result = await response.json();
      if (!currentFormId && result.id) {
        setCurrentFormId(result.id);
      }

      alert('Form saved successfully to Database!');
    } catch (error) {
      console.error(error);
      alert('Failed to save to Database');
    }
  };

  const handleDeleteForm = async () => {
    if (!currentFormId) return;

    const password = window.prompt("Enter password to delete this form:");
    if (password === null) return; // cancel clicked

    try {
      const response = await fetch(`http://localhost:3001/api/forms/${currentFormId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        if (response.status === 401) {
          alert('Incorrect password!');
        } else {
          throw new Error('Delete failed');
        }
        return;
      }

      alert('Form deleted successfully!');
      // Reset form to blank state
      setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '' });
      setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
      setCurrentFormId(null);
      setParentFormId(null);

    } catch (error) {
      console.error(error);
      alert('Failed to delete form');
    }
  };

  const fetchForms = async (query = '', typeFilter = activeTab) => {
    try {
      const res = await fetch(`http://localhost:3001/api/forms?query=${encodeURIComponent(query)}&type=${typeFilter}`);
      if (res.ok) {
        const data = await res.json();
        setFormList(data);
      }
    } catch (e) {
      console.error('Failed to search forms', e);
    }
  };

  const openLoadModal = () => {
    if (window.confirm(`Apakah Anda sudah menyimpan form ${activeTab} ini sebelumnya? Segala perubahan yang belum tersimpan akan hilang. Lanjutkan memuat form lain?`)) {
      setModalMode('load');
      setShowLoadModal(true);
      fetchForms(searchTerm, activeTab);
    }
  };

  const handleLoadForm = async (id, isNewRealisasiTemplate = false) => {
    try {
      const res = await fetch(`http://localhost:3001/api/forms/${id}`);
      if (res.ok) {
        let form = await res.json();

        // If we are loading a budget to be the parent of a new realisasi:
        if (isNewRealisasiTemplate) {
          setParentFormId(form.id);
          setCurrentFormId(null); // It's a brand new realisasi
        } else {
          setCurrentFormId(form.id);
          setParentFormId(form.parent_id);
        }

        setEventData({
          projectNo: form.project_no || '',
          name: isNewRealisasiTemplate ? `${form.event || ''} - Realisasi` : (form.event || ''),
          venue: form.venue || '',
          periode: form.periode || '',
          periodeStart: form.periode_start || '',
          periodeEnd: form.periode_end || '',
          note: form.note || ''
        });
        if (form.data && Array.isArray(form.data)) {
          // If we are cloning a budget for a new realisasi, ensure actualRate exists but is 0
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
      alert('Failed to load form details');
    }
  };

  const handleExportExcel = () => {
    const wsData = [];

    const displayPeriode = eventData.periodeStart && eventData.periodeEnd
      ? `${eventData.periodeStart} to ${eventData.periodeEnd}`
      : eventData.periode;

    // Header
    wsData.push([`PROJECT NO.`, eventData.projectNo]);
    wsData.push([`EVENT`, eventData.name]);
    wsData.push([`VENUE`, eventData.venue]);
    wsData.push([`PERIODE`, displayPeriode]);
    wsData.push([]);

    // Table Header
    const headerRow = ['DESCRIPTION', 'QTY', 'MDY', 'INTERNAL BUDGET', 'BUDGET'];
    if (activeTab === 'realisasi') headerRow.push('REALISASI');
    wsData.push(headerRow);

    // Items
    items.forEach(main => {
      const mainRow = [main.name, '', '', '', ''];
      if (activeTab === 'realisasi') mainRow.push('');
      wsData.push(mainRow); // Main Title

      main.subs.forEach(sub => {
        const intTot = sub.qty * sub.mdy * sub.internalRate;
        const budgTot = sub.qty * sub.mdy * sub.rate;
        const realTot = sub.actualRate || 0;

        const subRow = [
          `   ${sub.name}`,
          sub.qty,
          sub.mdy,
          intTot,
          budgTot
        ];
        if (activeTab === 'realisasi') subRow.push(realTot);
        wsData.push(subRow);
      });
    });

    wsData.push([]);

    // Subtotals
    const rowSubtotal = ['SUBTOTAL', '', '', subtotalInternal, subtotalBudget];
    if (activeTab === 'realisasi') rowSubtotal.push('');
    wsData.push(rowSubtotal);

    const rowMgmt = ['MANAGEMENT FEE (10%)', '', '', '', managementFee];
    if (activeTab === 'realisasi') rowMgmt.push('');
    wsData.push(rowMgmt);

    const rowTotal = ['TOTAL', '', '', totalInternal, totalBudget];
    if (activeTab === 'realisasi') rowTotal.push('');
    wsData.push(rowTotal);

    const rowPPN = ['PPN (11%)', '', '', '', ppn];
    if (activeTab === 'realisasi') rowPPN.push('');
    wsData.push(rowPPN);

    // Grand Total has the value!
    const rowGrand = ['GRAND TOTAL', '', '', grandTotalInternal, grandTotalBudget];
    if (activeTab === 'realisasi') rowGrand.push(grandTotalRealisasi);
    wsData.push(rowGrand);

    wsData.push([]);
    wsData.push(['', '', '', 'Submitted Budget', grandTotalBudget]);
    wsData.push(['', '', '', 'After PPN', afterPpn]);
    wsData.push(['', '', '', 'After PPH', afterPph]);
    wsData.push(['', '', '', 'P/L (Budget)', profitLoss]);

    if (activeTab === 'realisasi') {
      wsData.push([]);
      wsData.push(['', '', '', 'Actual Budget (Realisasi)', grandTotalRealisasi]);
      wsData.push(['', '', '', 'P/L (Realisasi)', profitLossRealisasi]);
    }

    wsData.push([]);

    // Notes section
    if (eventData.note) {
      wsData.push(['NOTES:']);
      // split by newline to put each note line on a new excel row
      const noteLines = eventData.note.split('\n');
      noteLines.forEach(line => {
        wsData.push([line]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-size columns slightly
    const cols = [{ wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }];
    if (activeTab === 'realisasi') cols.push({ wch: 20 });
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Budget");

    // Use XLSX built-in browser download
    XLSX.writeFile(wb, "Budget_Form_Export.xlsx");
  };

  return (
    <div className="app-container">
      {/* APP TITLE & TABS */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontWeight: '800', letterSpacing: '4px', color: 'var(--primary)', textTransform: 'uppercase', margin: 0 }}>
          {activeTab === 'budget' ? 'BUDGET' : 'REALISASI'}
        </h1>
        <div style={{ display: 'inline-flex', marginTop: '1rem', background: 'var(--surface)', borderRadius: '8px', padding: '4px', boxShadow: 'var(--shadow-sm)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'budget' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none', boxShadow: 'none' }}
            onClick={() => {
              if (window.confirm("Switching tabs will discard unsaved changes. Switch?")) {
                setActiveTab('budget');
                setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '' });
                setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
                setCurrentFormId(null);
                setParentFormId(null);
              }
            }}>
            BUDGET
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'realisasi' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none', boxShadow: 'none' }}
            onClick={() => {
              if (window.confirm("Switching tabs will discard unsaved changes. Switch?")) {
                setActiveTab('realisasi');
                setEventData({ projectNo: '', name: '', venue: '', periode: '', periodeStart: '', periodeEnd: '', note: '' });
                setItems([{ id: generateId(), name: 'NEW SECTION', subs: [] }]);
                setCurrentFormId(null);
                setParentFormId(null);
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
        <button className="btn btn-secondary btn-sm" onClick={handleSaveForm}>
          <Save size={16} /> Save Form
        </button>
        <button className="btn btn-success btn-sm" onClick={handleExportExcel}>
          <FileDown size={16} /> Export to XLS
        </button>

        {/* Delete Button (Only if a form is currectly loaded) */}
        {currentFormId && (
          <button
            className="btn btn-sm"
            style={{
              background: '#ef4444',
              color: 'white',
              marginLeft: 'auto', // push to the right
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

      {/* HEADER SECTION */}
      <div className="document-header">
        <div className="input-group">
          <label>Project No</label>
          <input
            type="text"
            value={eventData.projectNo}
            onChange={(e) => setEventData({ ...eventData, projectNo: e.target.value })}
            placeholder="Project Number"
          />
        </div>
        <div className="input-group">
          <label>Event</label>
          <input
            type="text"
            value={eventData.name}
            onChange={(e) => setEventData({ ...eventData, name: e.target.value })}
            placeholder="Event Name"
          />
        </div>
        <div className="input-group">
          <label>Venue</label>
          <input
            type="text"
            value={eventData.venue}
            onChange={(e) => setEventData({ ...eventData, venue: e.target.value })}
            placeholder="Event Venue"
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
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>to</span>
            <input
              type="date"
              style={{ flex: 1 }}
              value={eventData.periodeEnd}
              onChange={(e) => setEventData({ ...eventData, periodeEnd: e.target.value })}
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
                    />
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  {activeTab === 'realisasi' && <td></td>}
                  <td className="col-actions" style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-icon btn-add-sub" title="Add Sub Item" onClick={() => addSubItem(mainItem.id)}>
                      <PlusCircle size={18} />
                    </button>
                    <button className="btn-icon" title="Remove Main Item" onClick={() => removeMainItem(mainItem.id)}>
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>

                {/* Sub Items Rows */}
                {mainItem.subs.map((sub, index) => {
                  const rowTotalInternal = sub.qty * sub.mdy * sub.internalRate;
                  const rowTotalBudget = sub.qty * sub.mdy * sub.rate;
                  const rowTotalRealisasi = sub.actualRate || 0;

                  return (
                    <tr className="row-sub-item" key={sub.id}>
                      <td>
                        <input
                          type="text"
                          className="cell-input"
                          value={sub.name}
                          onChange={(e) => updateSubItem(mainItem.id, sub.id, 'name', e.target.value)}
                          style={{ paddingLeft: '2rem' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="cell-input align-center"
                          value={sub.qty}
                          onChange={(e) => updateSubItem(mainItem.id, sub.id, 'qty', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="cell-input align-center"
                          value={sub.mdy}
                          onChange={(e) => updateSubItem(mainItem.id, sub.id, 'mdy', parseFloat(e.target.value) || 0)}
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
                          />
                        </td>
                      )}
                      <td className="col-actions">
                        <button className="btn-icon" title="Remove Sub Item" onClick={() => removeSubItem(mainItem.id, sub.id)}>
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}

            {/* Empty Spacer Row for aesthetics */}
            <tr><td colSpan="6" style={{ height: '0.5rem' }}></td></tr>

            {/* Add Main Item Button (Moved above Subtotal) */}
            <tr>
              <td colSpan="6" style={{ padding: '0.5rem 1rem', borderBottom: 'none' }}>
                <button className="btn btn-primary btn-sm" onClick={addMainItem}>
                  <Plus size={16} /> Add Main Item
                </button>
              </td>
            </tr>

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
            style={{
              width: '100%',
              minHeight: '150px',
              padding: '1rem',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
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
                        <span className="form-item-date">{form.venue} | {form.periode_start && form.periode_end ? `${form.periode_start} to ${form.periode_end}` : form.periode}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )
      }

    </div >
  );
}

export default App;

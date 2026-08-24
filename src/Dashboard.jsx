import { useState, useEffect } from 'react';
import './Dashboard.css';
import { LogOut, Shield, Building2, Mail } from 'lucide-react';
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Archive,
  TrendingUp,
  Eye,
  Search,
  Share2
} from 'lucide-react';
import UserManagement from './UserManagement.jsx';
import { apiFetch } from './utils/api.js';
import DivisionManagement from './DivisionManagement.jsx';
import EmailLogModal from './EmailLogModal.jsx';

const API = import.meta.env.VITE_API_URL || '';

const STATUS = {
  draft: 'draft',
  pending: 'pending',
  revision: 'revision',
  approved: 'approved',
  archived: 'archived'
};

const STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Pending',
  revision: 'Revision',
  approved: 'Approved',
  archived: 'Archived'
};

const statusConfig = {
  draft:      { icon: FileText,   color: '#64748B', bg: 'rgba(100,116,139,0.1)',  label: 'Draft' },
  pending:    { icon: Clock,      color: '#CA8A04', bg: 'rgba(234,179,8,0.1)',    label: 'Pending' },
  revision:   { icon: RefreshCw, color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Revision' },
  approved:   { icon: CheckCircle, color: '#16a34a', bg: 'rgba(34,197,94,0.1)',  label: 'Approved' },
  archived:   { icon: Archive,   color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', label: 'Archived' }
};

function Dashboard({ user, token, onLogout, onOpenForm }) {
  const [stats, setStats] = useState({ total: 0, byStatus: {}, recent: [], pending: [], revisions: [], myForms: [] });
  const [myForms, setMyForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 20;
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showDivisionMgmt, setShowDivisionMgmt] = useState(false);
  const [showEmailLog, setShowEmailLog] = useState(false);
  const [copyToast, setCopyToast] = useState(null);

  const handleShare = (formId) => {
    const url = `${window.location.origin}${window.location.pathname}?form=${formId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyToast(formId);
      setTimeout(() => setCopyToast(null), 2000);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopyToast(formId);
      setTimeout(() => setCopyToast(null), 2000);
    });
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const isAdmin = user.role === 'admin';
  const isCorporate = user.role === 'corporate';
  const isManager = user.role === 'manager';
  const isPurchasing = user.role === 'purchasing';
  const canApprove = isAdmin || isCorporate;
  const canCreate = !isCorporate && !isPurchasing;
  const canSeeOnOpen = !!onOpenForm;

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const statusParam = filterStatus !== 'all' && filterStatus !== 'my' ? `&status=${filterStatus}` : '';
      const promises = [
        apiFetch(`${API}/api/forms?query=${encodeURIComponent(searchTerm)}&page=${page}&limit=${PAGE_SIZE}${statusParam}`, { headers }),
        apiFetch(`${API}/api/forms/my`, { headers }),
      ];
      if (canApprove) promises.push(apiFetch(`${API}/api/forms/pending`, { headers }));

      const results = await Promise.all(promises.map(p => p.catch(() => ({ ok: false, json: async () => [] }))));
      const [allFormsResult, myFormsResult, pendingResult] = results;

      const rawAll = allFormsResult.ok ? await allFormsResult.json() : {data:[]};
      const rawMine = myFormsResult.ok ? await myFormsResult.json() : [];
      const rawPending = (pendingResult && pendingResult.ok) ? await pendingResult.json() : [];
      
      const allForms = Array.isArray(rawAll) ? rawAll : (rawAll.data || []);
      const mine = Array.isArray(rawMine) ? rawMine : (rawMine.data || []);
      const pending = Array.isArray(rawPending) ? rawPending : (rawPending.data || []);

      const totalCount = rawAll.pagination ? rawAll.pagination.total : allForms.length;
      setTotalPages(rawAll.pagination ? rawAll.pagination.totalPages : 1);

      const byStatus = {};
      allForms.forEach(f => { byStatus[f.status] = (byStatus[f.status] || 0) + 1; });

      const revisions = mine.filter(f => f.status === STATUS.revision);
      const recent = allForms;

      setStats({ total: totalCount, byStatus, recent, pending, revisions, myForms: mine });
      setMyForms(mine);
    } catch (e) {
      console.error('Dashboard error:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterStatus]);

  useEffect(() => {
    fetchDashboardData();
  }, [page, searchTerm, filterStatus, user.role, token]);


  const statsCards = [
    { key: 'total',    label: 'Total Projects', icon: FileText,   color: '#1e293b', value: stats.total },
    { key: 'pending',  label: 'Pending Approval', icon: Clock,    color: '#CA8A04', value: stats.byStatus['pending'] || 0 },
    { key: 'revision', label: 'Needs Revision', icon: RefreshCw,  color: '#ef4444', value: stats.byStatus['revision'] || 0 },
    { key: 'approved', label: 'Approved',       icon: CheckCircle, color: '#16a34a', value: stats.byStatus['approved'] || 0 },
    { key: 'draft',    label: 'Draft',           icon: FileText,   color: '#64748B', value: stats.byStatus['draft'] || 0 },
    { key: 'archived', label: 'Archived',       icon: Archive,   color: '#94a3b8', value: stats.byStatus['archived'] || 0 },
  ];

  const displayedForms = filterStatus === 'all'
    ? stats.recent
    : filterStatus === 'my'
      ? stats.myForms
      : stats.recent.filter(f => f.status === filterStatus);

  const statusBadge = (status) => {
    const cfg = statusConfig[status] || statusConfig.draft;
    const Icon = cfg.icon;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', background: cfg.bg, color: cfg.color }}>
        <Icon size={10} />{STATUS_LABELS[status] || status}
      </span>
    );
  };

  return (
    <div className="dashboard-container">
      {/* TOP NAV */}
      <div className="dash-nav">
        <div className="dash-nav-left">
          <div className="dash-logo">B</div>
          <span className="dash-title">PVBudget</span>
        </div>
        <div className="dash-nav-right">
          {canSeeOnOpen && (
            <button className="btn btn-primary btn-sm" onClick={() => onOpenForm && onOpenForm(null)} style={{ background: 'var(--primary)', color: '#000' }}>
              + New Form
          </button>
          )}
          {isAdmin && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDivisionMgmt(true)} style={{ marginLeft: '0.25rem' }}>
                <Building2 size={14} /> Divisions
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowUserMgmt(true)}>
                <Shield size={14} /> Users
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEmailLog(true)}>
                <Mail size={14} /> Email Log
              </button>
            </>
          )}
          <div className="dash-user-info">
            <div className="dash-avatar">{user.display_name?.charAt(0)?.toUpperCase() || 'U'}</div>
            <div>
              <span className="dash-username">{user.display_name}</span>
              <span className={`role-badge role-${user.role}`}>{user.role}</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onLogout} style={{ marginLeft: '0.5rem' }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>

      <div className="dash-body">
        {/* STATS CARDS */}
        <div className="dash-stats-row">
          {statsCards.map(card => (
            <div key={card.key} className="dash-stat-card" style={{ borderColor: card.color + '30' }}>
              <div className="dash-stat-icon-wrap" style={{ background: card.color + '15' }}>
                <card.icon size={20} style={{ color: card.color }} />
              </div>
              <div className="dash-stat-info">
                <div className="dash-stat-value" style={{ color: card.color }}>{card.value}</div>
                <div className="dash-stat-label">{card.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* PENDING APPROVALS (CORPORATE/ADMIN) */}
        {canApprove && stats.pending.length > 0 && (
          <div className="dash-section">
            <div className="dash-section-header">
              <Clock size={18} style={{ color: '#CA8A04' }} />
              <h2>Pending Approvals</h2>
              <span className="dash-badge">{stats.pending.length}</span>
            </div>
            <div className="dash-cards-grid">
              {stats.pending.map(form => (
                <div key={form.id} className="dash-card dash-card-pending" onClick={() => onOpenForm && onOpenForm(form.id)}>
                  <div className="dash-card-top">
                    {statusBadge('pending')}
                    {form.approval_stage === 'pending_2nd' ? (
                      <span style={{ background: 'rgba(234,179,8,0.15)', color: '#CA8A04', border: '1px solid rgba(234,179,8,0.3)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600 }}>
                        2nd Needed
                      </span>
                    ) : (
                      <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600 }}>
                        Awaiting 1st
                      </span>
                    )}
                    <span className="dash-card-version">v{form.version_number || 1}</span>
                  </div>
                  <div className="dash-card-title">{form.event || 'Untitled Event'}</div>
                  <div className="dash-card-meta">
                    {form.creator_name} {form.division_name && <>• {form.division_name}</>}
                  </div>
                  <div className="dash-card-date">
                    Submitted: {form.submitted_at ? new Date(form.submitted_at).toLocaleDateString('id-ID') : 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MY REVISIONS */}
        {stats.revisions.length > 0 && (
          <div className="dash-section">
            <div className="dash-section-header">
              <XCircle size={18} style={{ color: '#ef4444' }} />
              <h2>Forms Needing Revision</h2>
              <span className="dash-badge dash-badge-red">{stats.revisions.length}</span>
            </div>
            <div className="dash-cards-grid">
              {stats.revisions.map(form => (
                <div key={form.id} className="dash-card dash-card-revision" onClick={() => onOpenForm && onOpenForm(form.id)}>
                  <div className="dash-card-top">
                    {statusBadge('revision')}
                    <span className="dash-card-version">v{form.version_number || 1}</span>
                  </div>
                  <div className="dash-card-title">{form.event || 'Untitled Event'}</div>
                  <div className="dash-card-meta">{form.division_name}</div>
                  <div className="dash-card-revision-note">
                    <RefreshCw size={12} /> {form.revision_note || 'No note provided'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ALL FORMS LIST */}
        <div className="dash-section">
          <div className="dash-section-header">
            <TrendingUp size={18} />
            <h2>
              {isAdmin || isCorporate
                ? 'All Form Submissions'
                : `My Form Submissions`}
            </h2>
            <span className="dash-badge">{displayedForms.length}</span>
          </div>

          {/* Filter tabs */}
          <div className="dash-filter-row">
            <div className="dash-search-wrap">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search forms..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="dash-search-input"
              />
            </div>
            <div className="dash-filter-tabs">
              <button className={`dash-filter-tab ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>All</button>
              <button className={`dash-filter-tab ${filterStatus === 'my' ? 'active' : ''}`} onClick={() => setFilterStatus('my')}>My Forms</button>
              <button className={`dash-filter-tab ${filterStatus === 'draft' ? 'active' : ''}`} onClick={() => setFilterStatus('draft')}>Draft</button>
              <button className={`dash-filter-tab ${filterStatus === 'pending' ? 'active' : ''}`} onClick={() => setFilterStatus('pending')}>Pending</button>
              <button className={`dash-filter-tab ${filterStatus === 'approved' ? 'active' : ''}`} onClick={() => setFilterStatus('approved')}>Approved</button>
              {(isAdmin || isCorporate) && (
                <>
                  <button className={`dash-filter-tab ${filterStatus === 'revision' ? 'active' : ''}`} onClick={() => setFilterStatus('revision')}>Revision</button>
                  <button className={`dash-filter-tab ${filterStatus === 'archived' ? 'active' : ''}`} onClick={() => setFilterStatus('archived')}>Archived</button>
                </>
              )}
            </div>
          </div>

          {/* Forms table */}
          {loading ? (
            <div className="dash-loading">Loading...</div>
          ) : displayedForms.length === 0 ? (
            <div className="dash-empty">
              <FileText size={40} style={{ color: '#CBD5E1', marginBottom: '0.5rem' }} />
              <p>No forms found</p>
              {canCreate && <p style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Start by creating a new form</p>}
            </div>
          ) : (
            <>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Event / Project</th>
                    <th>Division</th>
                    <th>Owner</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Last Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedForms.map(form => (
                    <tr key={form.id} className={`dash-table-row-${form.status}`}>
                      <td className="dash-td-title">
                        <div className="dash-form-title">{form.project_no ? `[${form.project_no}] ` : ''}{form.event || 'Untitled'}</div>
                        <div className="dash-form-sub">{form.venue}</div>
                      </td>
                      <td className="dash-td-normal">{form.division_name || '—'}</td>
                      <td className="dash-td-normal">{form.creator_name}</td>
                      <td className="dash-td-normal">v{form.version_number || 1}</td>
                      <td>{statusBadge(form.status)}</td>
                      <td className="dash-td-date">{form.submitted_at ? new Date(form.submitted_at).toLocaleDateString('id-ID') : '—'}</td>
                      <td className="dash-td-date">{form.updated_at ? new Date(form.updated_at).toLocaleDateString('id-ID') : '—'}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => onOpenForm && onOpenForm(form.id)}>
                          <Eye size={14} /> Open
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          title="Copy share link"
                          onClick={() => handleShare(form.id)}
                          style={{ marginLeft: '0.25rem', minWidth: '32px', padding: '0.4rem 0.5rem' }}
                        >
                          {copyToast === form.id ? <CheckCircle size={14} style={{ color: '#16a34a' }} /> : <Share2 size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && filterStatus !== 'my' && (
              <div className="dash-pagination">
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
                <span className="dash-page-info">Page {page} of {totalPages}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* USER MANAGEMENT MODAL */}
      {isAdmin && showUserMgmt && <UserManagement token={token} onClose={() => setShowUserMgmt(false)} />}

      {/* DIVISION MANAGEMENT MODAL */}
      {isAdmin && showDivisionMgmt && <DivisionManagement token={token} onClose={() => setShowDivisionMgmt(false)} />}

      {/* EMAIL LOG MODAL */}
      {isAdmin && showEmailLog && <EmailLogModal token={token} onClose={() => setShowEmailLog(false)} />}
    </div>
  );
}

export default Dashboard;
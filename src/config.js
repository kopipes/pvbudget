// Shared configuration for the PVBudget application

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Status constants
export const STATUS = {
    DRAFT: 'draft',
    PENDING: 'pending',
    REVISION: 'revision',
    APPROVED: 'approved',
    ARCHIVED: 'archived'
};

export const STATUS_LABELS = {
    [STATUS.DRAFT]: 'Draft',
    [STATUS.PENDING]: 'Pending Approval',
    [STATUS.REVISION]: 'Needs Revision',
    [STATUS.APPROVED]: 'Approved',
    [STATUS.ARCHIVED]: 'Archived'
};

// Role constants
export const ROLES = {
    ADMIN: 'admin',
    CORPORATE: 'corporate',
    MANAGER: 'manager',
    USER: 'user',
    PURCHASING: 'purchasing'
};

export const ROLE_LABELS = {
    [ROLES.ADMIN]: 'Admin',
    [ROLES.CORPORATE]: 'Corporate',
    [ROLES.MANAGER]: 'Manager',
    [ROLES.USER]: 'User',
    [ROLES.PURCHASING]: 'Purchasing'
};

// Tax rates configuration
export const TAX_RATES = {
    PPN: 0.11,      // 11% PPN (Value Added Tax)
    PPH: 0.02,      // 2% PPH (Income Tax)
    PPN_LABEL: '11%',
    PPH_LABEL: '2%'
};

// Management fee configuration
export const DEFAULT_MANAGEMENT_FEE_PERCENT = 10;

// Session configuration
export const SESSION_EXPIRY_HOURS = 24;
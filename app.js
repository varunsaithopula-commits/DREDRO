/**
 * BudgetMate Main Application Controller
 * Manages Google Authentication, Database State Sync, Dashboard Metrics, Charts & Event Handling
 */

import { getStore, saveStore, resetStore, getStoreAsync, saveStoreAsync, resetStoreAsync } from './storage.js';
import {
  getCurrentUser,
  loginWithGoogle,
  logout,
  initAuthListener,
  parseJwt
} from './auth.js';
import {
  formatCurrency,
  formatDate,
  formatMonthYear,
  getTodayISO,
  escapeHTML,
  generateId,
  transactionsToCSV,
  downloadFile,
  validateImportJSON
} from './utils.js';

// Category Icon & Emoji Mapping
const CATEGORY_ICONS = {
  'Food & Dining': '🍔',
  'Shopping': '🛍️',
  'Bills & Utilities': '⚡',
  'Transportation': '🚗',
  'Entertainment': '🎬',
  'Health & Wellness': '🏥',
  'Salary': '💰',
  'Investment': '📈',
  'Freelance': '💻',
  'Other': '🏷️'
};

// Application State
let store = null;
let currentMonth = getTodayISO().substring(0, 7); // "YYYY-MM"
let filterType = 'all';
let filterCategory = 'all';
let searchQuery = '';
let sortOrder = 'date-desc';
let undoStack = []; // [{ transaction, timeoutId, toastEl }]
let eventListenersBound = false;

// DOM Element References
const elements = {
  // Auth Page & Header Profile
  authContainer: document.getElementById('auth-container'),
  mainContent: document.querySelector('.main-content'),
  appHeader: document.getElementById('app-header'),
  authAlert: document.getElementById('auth-alert'),
  btnGoogleLogin: document.getElementById('btn-google-login') || document.getElementById('google-login-btn'),
  googleBtnText: document.getElementById('google-btn-text'),
  btnGuestLogin: document.getElementById('btn-guest-login'),
  userHeaderProfile: document.getElementById('user-header-profile'),
  userAvatarBadge: document.getElementById('user-avatar-badge'),
  userDisplayName: document.getElementById('user-display-name'),
  btnLogout: document.getElementById('btn-logout'),

  // Google Prompt Modal
  googleModalBackdrop: document.getElementById('google-modal-backdrop'),
  btnCloseGoogleModal: document.getElementById('btn-close-google-modal'),
  btnCancelGoogleModal: document.getElementById('btn-cancel-google-modal'),
  googlePromptForm: document.getElementById('google-prompt-form'),
  googleInputEmail: document.getElementById('google-input-email'),
  googleInputName: document.getElementById('google-input-name'),
  googleInputClientId: document.getElementById('google-input-clientid'),
  errGoogleEmail: document.getElementById('err-google-email'),

  // Navigation & Header
  currentMonthLabel: document.getElementById('current-month-label'),
  btnPrevMonth: document.getElementById('btn-prev-month'),
  btnNextMonth: document.getElementById('btn-next-month'),
  btnOpenAdd: document.getElementById('btn-open-add'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  fabAdd: document.getElementById('fab-add'),

  // Metrics & Popup
  cardIncomeBalance: document.getElementById('card-income-balance'),
  cardExpenseBalance: document.getElementById('card-expense-balance'),
  cardNetBalance: document.getElementById('card-net-balance'),
  metricIncome: document.getElementById('metric-income'),
  metricExpense: document.getElementById('metric-expense'),
  metricNet: document.getElementById('metric-net'),

  // Balance Popup Modal
  balanceModalBackdrop: document.getElementById('balance-modal-backdrop'),
  btnCloseBalanceModal: document.getElementById('btn-close-balance-modal'),
  btnDoneBalancePop: document.getElementById('btn-done-balance-pop'),
  popMonthSubtitle: document.getElementById('pop-month-subtitle'),
  popNetValue: document.getElementById('pop-net-value'),
  popIncomeValue: document.getElementById('pop-income-value'),
  popExpenseValue: document.getElementById('pop-expense-value'),
  popCalcValue: document.getElementById('pop-calc-value'),
  popTxCount: document.getElementById('pop-tx-count'),

  // Budget Widget
  budgetStats: document.getElementById('budget-stats'),
  budgetBarFill: document.getElementById('budget-bar-fill'),
  budgetStatusBadge: document.getElementById('budget-status-badge'),

  // Category Breakdown & Chart
  categoryBreakdownList: document.getElementById('category-breakdown-list'),
  trendCanvas: document.getElementById('trend-canvas'),

  // Filters & Search
  searchInput: document.getElementById('search-input'),
  filterType: document.getElementById('filter-type'),
  filterCategory: document.getElementById('filter-category'),
  sortOrder: document.getElementById('sort-order'),
  txGroupsContainer: document.getElementById('tx-groups-container'),

  // Transaction Modal
  txModalBackdrop: document.getElementById('tx-modal-backdrop'),
  txModalTitle: document.getElementById('tx-modal-title'),
  txForm: document.getElementById('tx-form'),
  txId: document.getElementById('tx-id'),
  txType: document.getElementById('tx-type'),
  typeBtnExpense: document.getElementById('type-btn-expense'),
  typeBtnIncome: document.getElementById('type-btn-income'),
  txAmount: document.getElementById('tx-amount'),
  txCategory: document.getElementById('tx-category'),
  txPayment: document.getElementById('tx-payment'),
  txDate: document.getElementById('tx-date'),
  txNote: document.getElementById('tx-note'),
  btnCloseTxModal: document.getElementById('btn-close-tx-modal'),
  btnCancelTx: document.getElementById('btn-cancel-tx'),
  errAmount: document.getElementById('err-amount'),
  errCategory: document.getElementById('err-category'),
  errDate: document.getElementById('err-date'),

  // Settings Modal
  settingsModalBackdrop: document.getElementById('settings-modal-backdrop'),
  settingCurrency: document.getElementById('setting-currency'),
  settingBudget: document.getElementById('setting-budget'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnCloseSettingsModal: document.getElementById('btn-close-settings-modal'),
  btnExportCSV: document.getElementById('btn-export-csv'),
  btnImportJSON: document.getElementById('btn-import-json'),
  importJsonInput: document.getElementById('import-json-input'),
  importStatusMsg: document.getElementById('import-status-msg'),
  btnTriggerReset: document.getElementById('btn-trigger-reset'),

  // Reset Modal
  resetModalBackdrop: document.getElementById('reset-modal-backdrop'),
  btnCancelReset: document.getElementById('btn-cancel-reset'),
  btnConfirmReset: document.getElementById('btn-confirm-reset'),
  btnCloseResetModal: document.getElementById('btn-close-reset-modal'),

  // Toast Container
  toastContainer: document.getElementById('toast-container')
};

/* ==========================================================================
   1. Initialization & Event Listeners
   ========================================================================== */
export function initApp() {
  if (!eventListenersBound) {
    setupEventListeners();
    setupAuthListeners();
    eventListenersBound = true;
  }

  // Subscribe to persistent Google Auth session state
  initAuthListener((currentUser) => {
    setAppAuthState(currentUser);
  });
}

export async function setAppAuthState(currentUser) {
  const authContainer = document.getElementById('auth-container');
  const mainContent = document.querySelector('.main-content');
  const fabAdd = document.getElementById('fab-add');
  const userHeaderProfile = document.getElementById('user-header-profile');

  if (currentUser) {
    // Logged in: show main dashboard in its native CSS grid layout (380px sidebar + 1fr transactions)
    if (authContainer) authContainer.style.setProperty('display', 'none', 'important');
    if (mainContent) mainContent.style.removeProperty('display');
    if (fabAdd) fabAdd.style.removeProperty('display');
    if (userHeaderProfile) userHeaderProfile.style.setProperty('display', 'flex', 'important');

    // Render User Header Profile
    renderUserProfile(currentUser);

    // 1. Render immediately from local store (0ms delay!)
    store = getStore(currentUser.id);
    renderApp();

    // 2. Fetch latest data from database asynchronously in background
    try {
      store = await getStoreAsync(currentUser.id);
      renderApp();
    } catch (err) {
      console.warn('[BudgetMate] Database sync notice:', err);
    }
  } else {
    // Logged out: show login card, hide main dashboard
    if (authContainer) authContainer.style.setProperty('display', 'flex', 'important');
    if (mainContent) mainContent.style.setProperty('display', 'none', 'important');
    if (fabAdd) fabAdd.style.setProperty('display', 'none', 'important');
    if (userHeaderProfile) userHeaderProfile.style.setProperty('display', 'none', 'important');
  }
}

function setupEventListeners() {
  // Month Navigator
  if (elements.btnPrevMonth) elements.btnPrevMonth.addEventListener('click', () => changeMonth(-1));
  if (elements.btnNextMonth) elements.btnNextMonth.addEventListener('click', () => changeMonth(1));

  // Balance Popup Trigger
  if (elements.cardIncomeBalance) elements.cardIncomeBalance.addEventListener('click', openBalancePopup);
  if (elements.cardExpenseBalance) elements.cardExpenseBalance.addEventListener('click', openBalancePopup);
  if (elements.cardNetBalance) elements.cardNetBalance.addEventListener('click', openBalancePopup);
  if (elements.btnCloseBalanceModal) elements.btnCloseBalanceModal.addEventListener('click', closeBalancePopup);
  if (elements.btnDoneBalancePop) elements.btnDoneBalancePop.addEventListener('click', closeBalancePopup);

  // Modal Triggers
  if (elements.btnOpenAdd) elements.btnOpenAdd.addEventListener('click', () => openTxModal());
  if (elements.fabAdd) elements.fabAdd.addEventListener('click', () => openTxModal());
  if (elements.btnOpenSettings) elements.btnOpenSettings.addEventListener('click', () => openSettingsModal());

  // Modal Closers
  if (elements.btnCloseTxModal) elements.btnCloseTxModal.addEventListener('click', () => closeTxModal());
  if (elements.btnCancelTx) elements.btnCancelTx.addEventListener('click', () => closeTxModal());
  if (elements.btnCloseSettingsModal) elements.btnCloseSettingsModal.addEventListener('click', () => closeSettingsModal());
  if (elements.btnCloseResetModal) elements.btnCloseResetModal.addEventListener('click', () => closeResetModal());
  if (elements.btnCancelReset) elements.btnCancelReset.addEventListener('click', () => closeResetModal());

  // Backdrop click to close modals
  if (elements.txModalBackdrop) {
    elements.txModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.txModalBackdrop) closeTxModal();
    });
  }
  if (elements.settingsModalBackdrop) {
    elements.settingsModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.settingsModalBackdrop) closeSettingsModal();
    });
  }
  if (elements.resetModalBackdrop) {
    elements.resetModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.resetModalBackdrop) closeResetModal();
    });
  }
  if (elements.balanceModalBackdrop) {
    elements.balanceModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.balanceModalBackdrop) closeBalancePopup();
    });
  }

  // Type Toggle inside Modal
  if (elements.typeBtnExpense) elements.typeBtnExpense.addEventListener('click', () => setTxTypeToggle('expense'));
  if (elements.typeBtnIncome) elements.typeBtnIncome.addEventListener('click', () => setTxTypeToggle('income'));

  // Form Submit
  if (elements.txForm) elements.txForm.addEventListener('submit', handleTxFormSubmit);
  if (elements.btnSaveSettings) elements.btnSaveSettings.addEventListener('click', handleSaveSettings);

  // Data Tools
  if (elements.btnExportCSV) elements.btnExportCSV.addEventListener('click', handleExportCSV);
  if (elements.btnImportJSON) elements.btnImportJSON.addEventListener('click', () => elements.importJsonInput.click());
  if (elements.importJsonInput) elements.importJsonInput.addEventListener('change', handleImportJSON);
  if (elements.btnTriggerReset) {
    elements.btnTriggerReset.addEventListener('click', () => {
      closeSettingsModal();
      openResetModal();
    });
  }
  if (elements.btnConfirmReset) elements.btnConfirmReset.addEventListener('click', handleConfirmReset);

  // Filters & Search
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderTransactionsList();
    });
  }
  if (elements.filterType) {
    elements.filterType.addEventListener('change', (e) => {
      filterType = e.target.value;
      renderTransactionsList();
    });
  }
  if (elements.filterCategory) {
    elements.filterCategory.addEventListener('change', (e) => {
      filterCategory = e.target.value;
      renderTransactionsList();
    });
  }
  if (elements.sortOrder) {
    elements.sortOrder.addEventListener('change', (e) => {
      sortOrder = e.target.value;
      renderTransactionsList();
    });
  }

  // Global Keyboard Shortcuts (Esc to close modal)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTxModal();
      closeSettingsModal();
      closeResetModal();
      closeBalancePopup();
      closeGoogleModal();
    }
  });

  // Window Resize re-draws canvas chart
  window.addEventListener('resize', () => {
    if (store) renderTrendChart(getFilteredMonthTransactions());
  });
}

/* ==========================================================================
   Auth Controllers & Profile Handlers
   ========================================================================== */
function renderUserProfile(user) {
  if (!elements.userHeaderProfile) return;
  elements.userHeaderProfile.style.display = 'flex';
  elements.userDisplayName.textContent = user.name || user.displayName || user.email || 'User';

  if (user.avatar || user.photoURL) {
    elements.userAvatarBadge.innerHTML = `<img src="${escapeHTML(user.avatar || user.photoURL)}" alt="${escapeHTML(user.name || 'User')}">`;
  } else {
    const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
    elements.userAvatarBadge.textContent = initial;
  }
}

function setupAuthListeners() {
  const googleBtn = document.getElementById('google-login-btn') || document.getElementById('btn-google-login');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      const res = await loginWithGoogle();
      if (res && res.success) {
        showToast(`Signed in with Google as ${res.user.name || res.user.email}`);
        setAppAuthState(res.user);
      }
    });
  }

  const guestBtn = document.getElementById('btn-guest-login');
  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      const guestUser = {
        id: 'usr_guest_local',
        email: 'guest@budgetmate.local',
        name: 'Guest User',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=GuestUser'
      };
      const { setCurrentUser } = await import('./auth.js');
      setCurrentUser(guestUser);
      showToast('Signed in as Guest');
      setAppAuthState(guestUser);
    });
  }

  // Google Modal Closers & Form
  if (elements.btnCloseGoogleModal) elements.btnCloseGoogleModal.addEventListener('click', closeGoogleModal);
  if (elements.btnCancelGoogleModal) elements.btnCancelGoogleModal.addEventListener('click', closeGoogleModal);
  if (elements.googleModalBackdrop) {
    elements.googleModalBackdrop.addEventListener('click', (e) => {
      if (e.target === elements.googleModalBackdrop) closeGoogleModal();
    });
  }

  // Logout button
  if (elements.btnLogout) {
    elements.btnLogout.addEventListener('click', async () => {
      await logout();
      showToast('Signed out successfully');
      setAppAuthState(null);
    });
  }
}

function openGoogleModal() {
  if (elements.errGoogleEmail) elements.errGoogleEmail.style.display = 'none';
  if (elements.googleModalBackdrop) elements.googleModalBackdrop.classList.add('active');
}

function closeGoogleModal() {
  if (elements.googleModalBackdrop) elements.googleModalBackdrop.classList.remove('active');
}

/* ==========================================================================
   2. Rendering Controllers
   ========================================================================== */
function renderApp() {
  if (!store) return;
  renderHeaderMonth();
  renderMetrics();
  renderBudgetProgress();
  renderCategoryBreakdown();
  renderTransactionsList();

  const monthTxs = getFilteredMonthTransactions();
  renderTrendChart(monthTxs);
}

function renderHeaderMonth() {
  if (elements.currentMonthLabel) {
    elements.currentMonthLabel.textContent = formatMonthYear(currentMonth);
  }
}

function getFilteredMonthTransactions() {
  if (!store || !store.transactions) return [];
  return store.transactions.filter(t => t.date && t.date.startsWith(currentMonth));
}

function renderMetrics() {
  const monthTransactions = getFilteredMonthTransactions();
  const currencySymbol = store.settings.currencySymbol || '₹';

  let totalIncome = 0;
  let totalExpense = 0;

  monthTransactions.forEach(t => {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else {
      totalExpense += t.amount;
    }
  });

  const netBalance = totalIncome - totalExpense;

  if (elements.metricIncome) elements.metricIncome.textContent = formatCurrency(totalIncome, currencySymbol);
  if (elements.metricExpense) elements.metricExpense.textContent = formatCurrency(totalExpense, currencySymbol);

  if (elements.metricNet) {
    elements.metricNet.textContent = formatCurrency(netBalance, currencySymbol);
    elements.metricNet.className = 'metric-value net ' + (netBalance >= 0 ? 'positive' : 'negative');
  }
}

function openBalancePopup() {
  if (!store) return;
  const currencySymbol = store.settings.currencySymbol || '₹';
  const monthTransactions = getFilteredMonthTransactions();

  let totalIncome = 0;
  let totalExpense = 0;

  monthTransactions.forEach(t => {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else {
      totalExpense += t.amount;
    }
  });

  const net = totalIncome - totalExpense;

  if (elements.popMonthSubtitle) elements.popMonthSubtitle.textContent = `${formatMonthYear(currentMonth)} Net Balance`;
  if (elements.popNetValue) {
    elements.popNetValue.textContent = formatCurrency(net, currencySymbol);
    elements.popNetValue.style.color = net >= 0 ? 'var(--color-success)' : 'var(--color-error)';
  }
  if (elements.popIncomeValue) elements.popIncomeValue.textContent = formatCurrency(totalIncome, currencySymbol);
  if (elements.popExpenseValue) elements.popExpenseValue.textContent = formatCurrency(totalExpense, currencySymbol);
  if (elements.popCalcValue) {
    elements.popCalcValue.textContent = formatCurrency(net, currencySymbol);
    elements.popCalcValue.style.color = net >= 0 ? 'var(--color-success)' : 'var(--color-error)';
  }
  if (elements.popTxCount) elements.popTxCount.textContent = `${monthTransactions.length} entries`;

  if (elements.balanceModalBackdrop) elements.balanceModalBackdrop.classList.add('active');
}

function closeBalancePopup() {
  if (elements.balanceModalBackdrop) elements.balanceModalBackdrop.classList.remove('active');
}

function renderBudgetProgress() {
  const monthTransactions = getFilteredMonthTransactions();
  const currencySymbol = store.settings.currencySymbol || '₹';
  const monthlyBudget = store.settings.monthlyBudget || 0;

  const totalExpense = monthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  if (elements.budgetStats) {
    elements.budgetStats.textContent = `${formatCurrency(totalExpense, currencySymbol)} / ${formatCurrency(monthlyBudget, currencySymbol)}`;
  }

  let percent = 0;
  if (monthlyBudget > 0) {
    percent = Math.min(Math.round((totalExpense / monthlyBudget) * 100), 100);
  }

  if (elements.budgetBarFill) {
    elements.budgetBarFill.style.width = `${percent}%`;
    elements.budgetBarFill.className = 'budget-bar-fill ' + (percent >= 90 ? 'warning' : 'normal');
  }

  if (elements.budgetStatusBadge) {
    if (monthlyBudget === 0) {
      elements.budgetStatusBadge.textContent = 'No budget set';
      elements.budgetStatusBadge.className = 'budget-status-badge normal';
    } else if (totalExpense > monthlyBudget) {
      const overBy = totalExpense - monthlyBudget;
      elements.budgetStatusBadge.textContent = `Over budget by ${formatCurrency(overBy, currencySymbol)} (${Math.round((totalExpense / monthlyBudget) * 100)}%)`;
      elements.budgetStatusBadge.className = 'budget-status-badge alert';
    } else {
      elements.budgetStatusBadge.textContent = `On Track (${percent}%)`;
      elements.budgetStatusBadge.className = 'budget-status-badge normal';
    }
  }
}

function renderCategoryBreakdown() {
  if (!elements.categoryBreakdownList) return;
  const monthTransactions = getFilteredMonthTransactions().filter(t => t.type === 'expense');
  const currencySymbol = store.settings.currencySymbol || '₹';

  const categoryTotals = {};
  let totalExpense = 0;

  monthTransactions.forEach(t => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    totalExpense += t.amount;
  });

  const sortedCategories = Object.keys(categoryTotals)
    .map(cat => ({ category: cat, amount: categoryTotals[cat] }))
    .sort((a, b) => b.amount - a.amount);

  if (sortedCategories.length === 0) {
    elements.categoryBreakdownList.innerHTML = `<div class="empty-state" style="padding: 16px;"><span class="tx-note">No expenses logged for this month</span></div>`;
    return;
  }

  let html = '';
  sortedCategories.forEach(item => {
    const icon = CATEGORY_ICONS[item.category] || '🏷️';
    const percent = totalExpense > 0 ? Math.round((item.amount / totalExpense) * 100) : 0;

    html += `
      <div class="category-item">
        <div class="category-info">
          <span class="category-name">${icon} ${escapeHTML(item.category)}</span>
          <span class="category-amount">${formatCurrency(item.amount, currencySymbol)} (${percent}%)</span>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width: ${percent}%;"></div>
        </div>
      </div>
    `;
  });

  elements.categoryBreakdownList.innerHTML = html;
}

function renderTrendChart(monthTransactions) {
  if (!elements.trendCanvas) return;
  const canvas = elements.trendCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const yearMonth = currentMonth;
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const dailySpend = new Array(daysInMonth).fill(0);
  monthTransactions.forEach(t => {
    if (t.type === 'expense' && t.date) {
      const dayNum = parseInt(t.date.split('-')[2], 10);
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        dailySpend[dayNum - 1] += t.amount;
      }
    }
  });

  const maxSpend = Math.max(...dailySpend, 100);
  const paddingLeft = 30;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 30;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = dailySpend.map((amt, idx) => {
    const x = paddingLeft + (idx / (daysInMonth - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (amt / maxSpend) * chartHeight;
    return { x, y, amount: amt };
  });

  // Draw Area Gradient
  const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.20)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.00)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - paddingBottom);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - paddingBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Draw Points
  points.forEach(p => {
    if (p.amount > 0) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
    }
  });

  // X Axis Day Labels
  ctx.fillStyle = '#333333';
  ctx.font = '10px "Google Sans Text", sans-serif';
  ctx.textAlign = 'center';
  const labelInterval = Math.ceil(daysInMonth / 6);
  for (let i = 0; i < daysInMonth; i += labelInterval) {
    const p = points[i];
    ctx.fillText(`${i + 1}`, p.x, height - 10);
  }
}

function renderTransactionsList() {
  if (!elements.txGroupsContainer || !store) return;
  const currencySymbol = store.settings.currencySymbol || '₹';
  let filtered = [...store.transactions];

  filtered = filtered.filter(t => t.date && t.date.startsWith(currentMonth));

  if (filterType !== 'all') {
    filtered = filtered.filter(t => t.type === filterType);
  }
  if (filterCategory !== 'all') {
    filtered = filtered.filter(t => t.category === filterCategory);
  }
  if (searchQuery) {
    filtered = filtered.filter(t => {
      const noteMatch = (t.note || '').toLowerCase().includes(searchQuery);
      const catMatch = (t.category || '').toLowerCase().includes(searchQuery);
      const amtMatch = String(t.amount).includes(searchQuery);
      return noteMatch || catMatch || amtMatch;
    });
  }

  filtered.sort((a, b) => {
    if (sortOrder === 'date-desc') return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
    if (sortOrder === 'date-asc') return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
    if (sortOrder === 'amount-desc') return b.amount - a.amount;
    if (sortOrder === 'amount-asc') return a.amount - b.amount;
    return 0;
  });

  if (filtered.length === 0) {
    elements.txGroupsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💸</div>
        <div class="empty-title">No transactions found</div>
        <div class="empty-description">
          ${searchQuery || filterType !== 'all' || filterCategory !== 'all' 
            ? 'No entries match your search criteria. Try resetting filters.' 
            : 'Start tracking by tapping "+ Add Transaction".'}
        </div>
      </div>
    `;
    return;
  }

  const groups = {};
  filtered.forEach(t => {
    const dateKey = t.date || 'Unknown';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(t);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => {
    return sortOrder.includes('asc') ? a.localeCompare(b) : b.localeCompare(a);
  });

  let html = '';
  sortedDates.forEach(dateStr => {
    const dayTxList = groups[dateStr];
    const formattedDate = formatDate(dateStr);

    let daySubtotal = 0;
    dayTxList.forEach(t => {
      daySubtotal += (t.type === 'income' ? t.amount : -t.amount);
    });

    const subtotalSign = daySubtotal >= 0 ? '+' : '-';
    const subtotalClass = daySubtotal >= 0 ? 'income' : 'expense';
    const subtotalText = `${subtotalSign}${formatCurrency(Math.abs(daySubtotal), currencySymbol)}`;

    html += `
      <div class="tx-day-group">
        <div class="tx-group-header">
          <span>${escapeHTML(formattedDate)}</span>
          <span class="day-subtotal">${subtotalText}</span>
        </div>
        <ul class="tx-list">
    `;

    dayTxList.forEach(t => {
      const icon = CATEGORY_ICONS[t.category] || '🏷️';
      const isIncome = t.type === 'income';
      const sign = isIncome ? '+' : '-';
      const amountClass = isIncome ? 'income' : 'expense';

      html += `
        <li class="tx-item" data-id="${t.id}">
          <div class="tx-left">
            <div class="category-icon-badge">${icon}</div>
            <div class="tx-meta">
              <span class="tx-category">${escapeHTML(t.category)}</span>
              ${t.note ? `<span class="tx-note">${escapeHTML(t.note)}</span>` : ''}
              ${t.paymentMethod ? `<span class="tx-payment-tag">${escapeHTML(t.paymentMethod)}</span>` : ''}
            </div>
          </div>

          <div class="tx-right">
            <span class="tx-amount ${amountClass}">${sign}${formatCurrency(t.amount, currencySymbol)}</span>
            <div class="tx-actions">
              <button class="btn btn-ghost btn-icon btn-edit-tx" data-id="${t.id}" title="Edit Transaction" aria-label="Edit transaction">✏️</button>
              <button class="btn btn-ghost btn-icon btn-delete-tx" data-id="${t.id}" title="Delete Transaction" aria-label="Delete transaction">🗑️</button>
            </div>
          </div>
        </li>
      `;
    });

    html += `
        </ul>
      </div>
    `;
  });

  elements.txGroupsContainer.innerHTML = html;

  elements.txGroupsContainer.querySelectorAll('.btn-edit-tx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      editTransaction(id);
    });
  });

  elements.txGroupsContainer.querySelectorAll('.btn-delete-tx').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      deleteTransaction(id);
    });
  });
}

/* ==========================================================================
   3. CRUD Operations & Modals
   ========================================================================== */
function changeMonth(offset) {
  const [year, month] = currentMonth.split('-').map(Number);
  const d = new Date(year, month - 1 + offset, 1);
  const newYear = d.getFullYear();
  const newMonth = String(d.getMonth() + 1).padStart(2, '0');
  currentMonth = `${newYear}-${newMonth}`;
  renderApp();
}

function openTxModal(transaction = null) {
  clearTxFormErrors();

  if (transaction) {
    elements.txModalTitle.textContent = 'Edit Transaction';
    elements.txId.value = transaction.id;
    setTxTypeToggle(transaction.type);
    elements.txAmount.value = transaction.amount;
    elements.txCategory.value = transaction.category || 'Other';
    elements.txPayment.value = transaction.paymentMethod || 'UPI';
    elements.txDate.value = transaction.date;
    elements.txNote.value = transaction.note || '';
  } else {
    elements.txModalTitle.textContent = 'Add Transaction';
    resetTxFormState();
  }

  elements.txModalBackdrop.classList.add('active');
  setTimeout(() => elements.txAmount.focus(), 100);
}

function closeTxModal() {
  elements.txModalBackdrop.classList.remove('active');
}

function setTxTypeToggle(type) {
  elements.txType.value = type;
  if (type === 'expense') {
    elements.typeBtnExpense.className = 'type-btn active expense';
    elements.typeBtnIncome.className = 'type-btn income';
  } else {
    elements.typeBtnExpense.className = 'type-btn expense';
    elements.typeBtnIncome.className = 'type-btn active income';
  }
}

function clearTxFormErrors() {
  if (elements.errAmount) elements.errAmount.style.display = 'none';
  if (elements.errCategory) elements.errCategory.style.display = 'none';
  if (elements.errDate) elements.errDate.style.display = 'none';
}

function resetTxFormState() {
  if (elements.txForm) elements.txForm.reset();
  elements.txId.value = '';
  elements.txType.value = 'expense';
  setTxTypeToggle('expense');
  elements.txDate.value = getTodayISO();
  elements.txCategory.value = 'Food & Dining';
}

function handleTxFormSubmit(e) {
  e.preventDefault();
  clearTxFormErrors();

  const id = elements.txId.value;
  const type = elements.txType.value || 'expense';
  const amount = Number.parseFloat(elements.txAmount.value);
  const category = elements.txCategory.value || 'Other';
  const paymentMethod = elements.txPayment.value || 'UPI';
  const date = elements.txDate.value || getTodayISO();
  const note = elements.txNote.value.trim();

  let valid = true;

  if (!Number.isFinite(amount) || amount <= 0) {
    if (elements.errAmount) elements.errAmount.style.display = 'block';
    valid = false;
  }
  if (!date) {
    if (elements.errDate) elements.errDate.style.display = 'block';
    valid = false;
  }
  if (!category || category === 'Select Category') {
    if (elements.errCategory) elements.errCategory.style.display = 'block';
    valid = false;
  }

  if (!valid) return;

  const now = new Date().toISOString();

  if (id) {
    const index = store.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      store.transactions[index] = {
        ...store.transactions[index],
        type,
        amount: Math.round(amount * 100) / 100,
        category,
        paymentMethod,
        date,
        note,
        updatedAt: now
      };
      showToast('Transaction updated successfully!');
    }
  } else {
    const newTx = {
      id: generateId(),
      type,
      amount: Math.round(amount * 100) / 100,
      category,
      paymentMethod,
      date,
      note,
      createdAt: now,
      updatedAt: now
    };
    store.transactions.unshift(newTx);
    showToast('Transaction logged!');
  }

  if (date && date.length >= 7) {
    currentMonth = date.substring(0, 7);
  }
  if (filterType !== 'all' && filterType !== type) {
    filterType = 'all';
    elements.filterType.value = 'all';
  }
  if (searchQuery) {
    searchQuery = '';
    elements.searchInput.value = '';
  }

  resetTxFormState();
  closeTxModal();

  const activeUser = getCurrentUser();
  saveStore(store, activeUser ? activeUser.id : null);
  saveStoreAsync(store, activeUser ? activeUser.id : null);

  renderApp();
}

function editTransaction(id) {
  const tx = store.transactions.find(t => t.id === id);
  if (tx) {
    openTxModal(tx);
  }
}

function deleteTransaction(id) {
  const index = store.transactions.findIndex(t => t.id === id);
  if (index === -1) return;

  const [deletedTx] = store.transactions.splice(index, 1);
  const activeUser = getCurrentUser();
  saveStoreAsync(store, activeUser ? activeUser.id : null);
  renderApp();

  showUndoToast(deletedTx, index);
}

function showUndoToast(deletedTx, originalIndex) {
  const currencySymbol = store.settings.currencySymbol || '₹';
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  toast.innerHTML = `
    <div class="toast-message">
      Deleted ${escapeHTML(deletedTx.category)} (${formatCurrency(deletedTx.amount, currencySymbol)})
    </div>
    <button class="btn btn-primary btn-undo" style="padding: 4px 12px; min-height: 32px; font-size: 12px;">
      Undo
    </button>
    <div class="toast-progress"></div>
  `;

  elements.toastContainer.appendChild(toast);

  const timeoutId = setTimeout(() => {
    dismissToast(toast);
  }, 5000);

  const undoBtn = toast.querySelector('.btn-undo');
  undoBtn.addEventListener('click', () => {
    clearTimeout(timeoutId);
    store.transactions.splice(originalIndex, 0, deletedTx);
    const activeUser = getCurrentUser();
    saveStoreAsync(store, activeUser ? activeUser.id : null);
    renderApp();
    dismissToast(toast);
    showToast('Deletion undone!');
  });
}

function dismissToast(toastEl) {
  if (toastEl && toastEl.parentNode) {
    toastEl.parentNode.removeChild(toastEl);
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<div class="toast-message">${escapeHTML(message)}</div>`;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => dismissToast(toast), 3000);
}

/* ==========================================================================
   4. Settings & Data Tools
   ========================================================================== */
function openSettingsModal() {
  elements.settingCurrency.value = store.settings.currencySymbol || '₹';
  elements.settingBudget.value = store.settings.monthlyBudget || '';
  elements.importStatusMsg.textContent = '';
  elements.settingsModalBackdrop.classList.add('active');
}

function closeSettingsModal() {
  elements.settingsModalBackdrop.classList.remove('active');
}

function handleSaveSettings() {
  store.settings.currencySymbol = elements.settingCurrency.value;
  store.settings.monthlyBudget = Number(elements.settingBudget.value) || 0;
  const activeUser = getCurrentUser();
  saveStoreAsync(store, activeUser ? activeUser.id : null);
  closeSettingsModal();
  showToast('Settings saved!');
  renderApp();
}

function handleExportCSV() {
  if (store.transactions.length === 0) {
    showToast('No transactions to export!');
    return;
  }
  const csv = transactionsToCSV(store.transactions);
  const filename = `BudgetMate_Export_${currentMonth}_${Date.now()}.csv`;
  downloadFile(csv, filename, 'text/csv');
  showToast('Exported CSV file!');
}

function handleImportJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const result = validateImportJSON(evt.target.result);
    if (!result.valid) {
      elements.importStatusMsg.style.color = 'var(--color-error)';
      elements.importStatusMsg.textContent = `Import Failed: ${result.errors[0]}`;
    } else {
      store.transactions = result.data.transactions;
      if (result.data.settings) {
        store.settings = { ...store.settings, ...result.data.settings };
      }
      const activeUser = getCurrentUser();
      saveStoreAsync(store, activeUser ? activeUser.id : null);
      renderApp();
      elements.importStatusMsg.style.color = 'var(--color-success)';
      elements.importStatusMsg.textContent = `Successfully imported ${result.data.transactions.length} transactions!`;
      showToast('Data imported successfully!');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function openResetModal() {
  elements.resetModalBackdrop.classList.add('active');
}

function closeResetModal() {
  elements.resetModalBackdrop.classList.remove('active');
}

async function handleConfirmReset() {
  const activeUser = getCurrentUser();
  store = await resetStoreAsync(activeUser ? activeUser.id : null);
  closeResetModal();
  showToast('All data has been reset to defaults.');
  renderApp();
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initApp);
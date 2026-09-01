/**
 * KuroSpend Utility Functions
 * Sanitization, formatting, ID generation, CSV export & JSON validation
 */

/**
 * Escapes HTML characters to prevent XSS vulnerability
 * @param {string} str 
 * @returns {string}
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates a unique ID for transactions
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return 'tx_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Formats a currency value using Intl.NumberFormat
 * @param {number} amount 
 * @param {string} symbol - Custom currency symbol (e.g. ₹, $, €)
 * @param {string} locale - Default 'en-IN' or fallback
 * @returns {string}
 */
export function formatCurrency(amount, symbol = '₹', locale = 'en-IN') {
  const numericAmount = Number(amount) || 0;
  try {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(numericAmount));
    
    const prefix = numericAmount < 0 ? '-' : '';
    return `${prefix}${symbol}${formatted}`;
  } catch (e) {
    const prefix = numericAmount < 0 ? '-' : '';
    return `${prefix}${symbol}${Math.abs(numericAmount).toFixed(2)}`;
  }
}

/**
 * Formats ISO date YYYY-MM-DD into readable date (e.g., 12 Aug 2026)
 * @param {string} isoDateStr 
 * @returns {string}
 */
export function formatDate(isoDateStr) {
  if (!isoDateStr) return '';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const dateObj = new Date(year, monthIdx, day);
  return dateObj.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Formats month YYYY-MM into Month Year string (e.g., "August 2026")
 * @param {string} yearMonthStr - YYYY-MM
 * @returns {string}
 */
export function formatMonthYear(yearMonthStr) {
  if (!yearMonthStr) return '';
  const [year, month] = yearMonthStr.split('-');
  const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Gets today's date in YYYY-MM-DD format
 * @returns {string}
 */
export function getTodayISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts array of transaction objects into CSV string
 * @param {Array} transactions 
 * @returns {string}
 */
export function transactionsToCSV(transactions) {
  const headers = ['ID', 'Type', 'Amount', 'Category', 'Date', 'Note', 'Payment Method', 'Created At'];
  const rows = transactions.map(t => [
    t.id,
    t.type,
    t.amount,
    `"${(t.category || '').replace(/"/g, '""')}"`,
    t.date,
    `"${(t.note || '').replace(/"/g, '""')}"`,
    `"${(t.paymentMethod || '').replace(/"/g, '""')}"`,
    t.createdAt || ''
  ]);
  
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Triggers file download in browser
 * @param {string} content 
 * @param {string} filename 
 * @param {string} mimeType 
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates imported JSON data for transaction list
 * @param {string} jsonString 
 * @returns {{ valid: boolean, data?: object, errors: string[] }}
 */
export function validateImportJSON(jsonString) {
  const errors = [];
  let parsed;

  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { valid: false, errors: ['Invalid JSON file format. File could not be parsed.'] };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, errors: ['JSON content must be an object or array.'] };
  }

  let txList = [];
  let settings = null;

  if (Array.isArray(parsed)) {
    txList = parsed;
  } else if (parsed.transactions && Array.isArray(parsed.transactions)) {
    txList = parsed.transactions;
    if (parsed.settings && typeof parsed.settings === 'object') {
      settings = parsed.settings;
    }
  } else {
    return { valid: false, errors: ['JSON structure must contain a "transactions" array or be an array of transactions.'] };
  }

  const validTransactions = [];
  const categories = ['Food & Dining', 'Shopping', 'Bills & Utilities', 'Transportation', 'Entertainment', 'Health & Wellness', 'Salary', 'Investment', 'Freelance', 'Other'];

  txList.forEach((item, idx) => {
    const itemNum = idx + 1;
    if (typeof item !== 'object' || item === null) {
      errors.push(`Item #${itemNum}: Not a valid object.`);
      return;
    }

    // Type validation
    const type = String(item.type || '').toLowerCase();
    if (type !== 'expense' && type !== 'income') {
      errors.push(`Item #${itemNum}: Invalid type "${item.type}". Must be "expense" or "income".`);
      return;
    }

    // Amount validation
    const amount = Number(item.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Item #${itemNum}: Amount must be a positive number.`);
      return;
    }

    // Date validation
    const dateStr = String(item.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push(`Item #${itemNum}: Date "${dateStr}" must be in YYYY-MM-DD format.`);
      return;
    }

    // Category validation
    const category = String(item.category || 'Other').trim();

    validTransactions.push({
      id: item.id || generateId(),
      type,
      amount: Math.round(amount * 100) / 100,
      category: category || 'Other',
      date: dateStr,
      note: String(item.note || '').trim(),
      paymentMethod: String(item.paymentMethod || 'Cash').trim(),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  if (validTransactions.length === 0 && txList.length > 0) {
    return { valid: false, errors: ['No valid transactions could be imported.', ...errors] };
  }

  return {
    valid: true,
    data: {
      transactions: validTransactions,
      settings
    },
    errors
  };
}

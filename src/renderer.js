// renderer.js
const CacheService = require('./services/CacheService');
const ProfileService = require('./services/ProfileService');
const Sortable = require('sortablejs');
const Swal = require('sweetalert2');
const Account = require('./models/Account');
const Category = require('./models/Category');
const SubCategory = require('./models/SubCategory');
const Transaction = require('./models/Transaction');
const Transfer = require('./models/Transfer');
const BudgetAllocation = require('./models/BudgetAllocation');

const cache = new CacheService();
const profileService = new ProfileService();
const DEFAULT_BUDGET_CATEGORIES = [
  {
    name: 'Income',
    note: 'Designated for positive inflow.',
    offBudget: true,
    subCategories: []
  },
  {
    name: 'Bills',
    note: 'Fixed or recurring expenses like rent, utilities, insurance, and subscriptions.',
    subCategories: ['Rent/Mortgage', 'Utilities', 'Insurance', 'Subscriptions']
  },
  {
    name: 'Everyday Spending',
    note: 'Flexible day-to-day spending like groceries, fuel, household items, and dining out.',
    subCategories: ['Groceries', 'Gas/Transportation', 'Dining Out', 'Household']
  },
  {
    name: 'Savings',
    note: 'Money set aside for future goals, emergencies, or planned purchases.',
    subCategories: [
      { name: 'Emergency Fund', bucketMode: 'save' },
      { name: 'Vacation', bucketMode: 'save' },
      { name: 'Car Maintenance', bucketMode: 'save' }
    ]
  },
  {
    name: 'Debt Payments',
    note: 'Payments toward credit cards, loans, or other debts.',
    subCategories: ['Credit Card', 'Loans']
  },
  {
    name: 'Giving',
    note: 'Donations, gifts, tithing, or other giving.',
    subCategories: ['Donations', 'Gifts']
  },
  {
    name: 'Miscellaneous',
    note: 'Temporary holding category for expenses that do not fit elsewhere yet.',
    subCategories: ['Uncategorized']
  }
];
const DEFAULT_BUDGET_ACCOUNTS = [
  {
    name: 'Checking',
    accountType: 'checking'
  },
  {
    name: 'Savings',
    accountType: 'savings'
  },
  {
    name: 'Credit Card',
    accountType: 'creditCard'
  }
];
let editingAccountId = null;
let categoryFormMode = 'create-category';
let statusToastTimeoutId = null;
let accountsSortable = null;
let categoriesSortable = null;
let subCategorySortables = [];
let budgetListSortable = null;
let expandedCategoryIds = new Set();
let editingTransactionId = null;
let editingTransferId = null;
let transactionSubCategoriesCache = [];
let budgetDirtyToastActive = false;
const DEFAULT_TRANSACTION_FILTERS = {
  date: '',
  account: '',
  payee: '',
  category: '',
  subCategory: '',
  memo: '',
  inflow: '',
  outflow: '',
  balance: ''
};
const DEFAULT_TRANSFER_FILTERS = {
  date: '',
  fromAccount: '',
  toAccount: '',
  amount: '',
  status: '',
  memo: ''
};
let transactionTableState = {
  sortKey: 'date',
  sortDirection: 'desc',
  filtersVisible: false,
  filters: { ...DEFAULT_TRANSACTION_FILTERS }
};
let transferTableState = {
  sortKey: 'date',
  sortDirection: 'desc',
  filtersVisible: false,
  filters: { ...DEFAULT_TRANSFER_FILTERS }
};
let transactionFilterFocusState = null;
let transferFilterFocusState = null;
let budgetState = {
  selectedMonth: '',
  loadedMonth: '',
  visibleMonths: [],
  context: null,
  draftAllocationsByMonth: new Map(),
  draftMetaByMonth: new Map(),
  expandedNoteKey: null
};
let reportsState = {
  selectedMonth: ''
};

function isPrimarySaveShortcut(event) {
  const key = String(event.key || '').toLowerCase();

  return (event.ctrlKey || event.metaKey)
    && !event.altKey
    && (key === 'enter' || key === 'k');
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'budgetApp.sidebarCollapsed';
let sessionState = {
  activeUser: null,
  activeBudget: null
};
let authViewMode = 'sign-in';
let budgetManagerViewMode = 'budget-list';
const sectionCopy = {
  accounts: {
    title: 'Accounts Overview',
    subtitle: 'Track the cash you have available right now.'
  },
  categories: {
    title: 'Category Planning',
    subtitle: 'Organize spending into clear groups and goals.'
  },
  transactions: {
    title: 'Transaction Activity',
    subtitle: 'Review inflows, outflows, and the story behind your money.'
  },
  transfers: {
    title: 'Account Transfers',
    subtitle: 'Move money between accounts without treating it like spending.'
  },
  budget: {
    title: 'Monthly Budget',
    subtitle: 'Assign every dollar with confidence before the month gets busy.'
  },
  reports: {
    title: 'Reports',
    subtitle: 'See cashflow, budget performance, and category mix over time.'
  }
};

function hasActiveBudgetSession() {
  return Boolean(sessionState.activeUser && sessionState.activeBudget);
}

function resetWorkspaceState() {
  editingAccountId = null;
  categoryFormMode = 'create-category';
  editingTransactionId = null;
  editingTransferId = null;
  accountsSortable = null;
  categoriesSortable = null;
  subCategorySortables = [];
  budgetListSortable = null;
  expandedCategoryIds = new Set();
  transactionSubCategoriesCache = [];
  budgetDirtyToastActive = false;
  transactionTableState = {
    sortKey: 'date',
    sortDirection: 'desc',
    filtersVisible: false,
    filters: { ...DEFAULT_TRANSACTION_FILTERS }
  };
  transferTableState = {
    sortKey: 'date',
    sortDirection: 'desc',
    filtersVisible: false,
    filters: { ...DEFAULT_TRANSFER_FILTERS }
  };
  transactionFilterFocusState = null;
  transferFilterFocusState = null;
  budgetState = {
    selectedMonth: getCurrentMonthValue(),
    loadedMonth: '',
    visibleMonths: [],
    context: null,
    draftAllocationsByMonth: new Map(),
    draftMetaByMonth: new Map(),
    expandedNoteKey: null
  };
  reportsState = {
    selectedMonth: getCurrentMonthValue()
  };
}

function updateSessionChrome() {
  const userName = sessionState.activeUser?.name || 'No user';
  const budgetName = sessionState.activeBudget?.name || 'No budget selected';

  document.getElementById('topbar-user-name').textContent = sessionState.activeUser ? `Signed in as ${userName}` : 'Signed out';
  document.getElementById('topbar-budget-name').textContent = budgetName;
  document.getElementById('manager-user-name').textContent = userName;
  document.getElementById('app-user-name').textContent = userName;
  document.getElementById('manager-user-menu-shell').classList.toggle('hidden', !sessionState.activeUser);
}

function isDesktopSidebarLayout() {
  return window.matchMedia('(min-width: 1081px)').matches;
}

function readSidebarCollapsedPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

function writeSidebarCollapsedPreference(isCollapsed) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isCollapsed ? 'true' : 'false');
  } catch (error) {
    // Ignore storage failures and keep the in-memory state only.
  }
}

function setSidebarCollapsed(isCollapsed) {
  const appShell = document.getElementById('app-shell');
  const toggleButton = document.getElementById('sidebar-toggle');
  const shouldCollapse = Boolean(isCollapsed && isDesktopSidebarLayout());

  appShell.classList.toggle('sidebar-collapsed', shouldCollapse);
  toggleButton.setAttribute('aria-pressed', shouldCollapse ? 'true' : 'false');
  toggleButton.setAttribute('aria-label', shouldCollapse ? 'Expand navigation' : 'Collapse navigation');
  toggleButton.title = shouldCollapse ? 'Expand navigation' : 'Collapse navigation';
}

function initializeSidebarPreference() {
  setSidebarCollapsed(readSidebarCollapsedPreference());
}

function toggleSidebarCollapsed() {
  const nextCollapsed = !document.getElementById('app-shell').classList.contains('sidebar-collapsed');
  writeSidebarCollapsedPreference(nextCollapsed);
  setSidebarCollapsed(nextCollapsed);
}

function showShell(shellId) {
  const shellIds = ['auth-shell', 'manager-shell', 'app-shell'];

  shellIds.forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== shellId);
  });

  if (shellId === 'app-shell') {
    setSidebarCollapsed(readSidebarCollapsedPreference());
  }
}

function getRelativeDateLabel(value) {
  if (!value) {
    return 'Not used yet';
  }

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function setAuthViewMode(mode) {
  authViewMode = mode;
  const isCreateMode = mode === 'create-user';
  const isResetMode = mode === 'reset-password';
  const isForgotMode = mode === 'forgot-password';
  document.getElementById('auth-sign-in-view').classList.toggle('hidden', isCreateMode || isResetMode || isForgotMode);
  document.getElementById('auth-create-user-view').classList.toggle('hidden', !isCreateMode);
  document.getElementById('auth-reset-password-view').classList.toggle('hidden', !isResetMode);
  document.getElementById('auth-forgot-password-view').classList.toggle('hidden', !isForgotMode);

  if (isCreateMode) {
    document.getElementById('auth-panel-eyebrow').textContent = 'Create User';
    document.getElementById('auth-panel-title').textContent = 'Start a new profile';
    document.getElementById('auth-panel-subtitle').textContent = 'Create a local profile first, then continue into budget management.';
    return;
  }

  if (isResetMode) {
    document.getElementById('auth-panel-eyebrow').textContent = 'Reset Password';
    document.getElementById('auth-panel-title').textContent = 'Set a new password';
    document.getElementById('auth-panel-subtitle').textContent = 'Choose an existing user and replace the local password hash with a new one.';
    return;
  }

  if (isForgotMode) {
    document.getElementById('auth-panel-eyebrow').textContent = 'Forgot Password';
    document.getElementById('auth-panel-title').textContent = 'Recover local access';
    document.getElementById('auth-panel-subtitle').textContent = 'Confirm the profile you want to recover, then save a new password without the current one.';
    return;
  }

  document.getElementById('auth-panel-eyebrow').textContent = 'Sign In';
  document.getElementById('auth-panel-title').textContent = 'Choose an existing user';
  document.getElementById('auth-panel-subtitle').textContent = 'Pick a profile, enter the password, and continue to your budgets.';
}

function setBudgetManagerViewMode(mode) {
  budgetManagerViewMode = mode;
  const isCreateMode = mode === 'create-budget';
  document.getElementById('budget-list-view').classList.toggle('hidden', isCreateMode);
  document.getElementById('budget-create-view').classList.toggle('hidden', !isCreateMode);
  document.getElementById('budget-panel-eyebrow').textContent = isCreateMode ? 'Create Budget' : 'Budgets';
  document.getElementById('budget-panel-title').textContent = isCreateMode ? 'Start a new budget' : 'Your available budgets';
  document.getElementById('budget-panel-subtitle').textContent = isCreateMode
    ? 'A new budget gets its own local database files under this signed-in user.'
    : 'Pick one to open the full budgeting workspace.';
}

function resetPasswordVisibility() {
  document.querySelectorAll('.password-toggle').forEach(button => {
    const input = document.getElementById(button.dataset.passwordTarget);

    if (!input) {
      return;
    }

    input.type = 'password';
    button.textContent = 'Show';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-pressed', 'false');
  });
}

function clearAuthPasswordFields() {
  [
    'sign-in-password',
    'create-user-password',
    'create-user-confirm-password',
    'create-user-security-answer',
    'reset-password-current',
    'reset-password-value',
    'reset-password-confirm',
    'reset-password-security-answer',
    'forgot-password-answer',
    'forgot-password-value',
    'forgot-password-confirm'
  ].forEach(fieldId => {
    const field = document.getElementById(fieldId);

    if (field) {
      field.value = '';
      field.type = 'password';
    }
  });

  resetPasswordVisibility();
}

function syncForgotPasswordQuestion(userId) {
  const questionField = document.getElementById('forgot-password-question');

  if (!questionField) {
    return;
  }

  const user = userId ? profileService.getUser(userId) : null;
  questionField.value = user?.securityQuestion || '';
}

function syncResetPasswordRecoveryFields(userId) {
  const questionField = document.getElementById('reset-password-security-question');
  const answerField = document.getElementById('reset-password-security-answer');

  if (!questionField || !answerField) {
    return;
  }

  const user = userId ? profileService.getUser(userId) : null;
  questionField.value = user?.securityQuestion || '';
  answerField.value = '';
}

function renderUserList() {
  const users = profileService.getUsers();
  const userList = document.getElementById('user-list');
  const selectedUserId = document.getElementById('sign-in-user-id').value || document.getElementById('reset-password-user-id').value;

  if (!users.length) {
    userList.innerHTML = `
      <div class="launch-list-empty">
        <h4>No users yet</h4>
        <p>Create your first profile on the right to get started.</p>
      </div>
    `;
    populateUserSelects(users);
    return;
  }

  populateUserSelects(users);
  const recentUsers = users
    .slice()
    .sort((left, right) => {
      const leftTime = left.lastSignedInAt ? new Date(left.lastSignedInAt).getTime() : 0;
      const rightTime = right.lastSignedInAt ? new Date(right.lastSignedInAt).getTime() : 0;

      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
    })
    .slice(0, 3);

  userList.innerHTML = recentUsers.map(user => `
    <button
      type="button"
      class="launch-list-button ${user.id === selectedUserId ? 'is-selected' : ''}"
      data-user-id="${user.id}"
    >
      <strong>${escapeHtml(user.name)}</strong>
      <p>Last signed in ${escapeHtml(getRelativeDateLabel(user.lastSignedInAt))}</p>
    </button>
  `).join('');
}

function populateUserSelects(users) {
  const signInSelect = document.getElementById('sign-in-user-id');
  const resetSelect = document.getElementById('reset-password-user-id');
  const forgotSelect = document.getElementById('forgot-password-user-id');
  const signInValue = signInSelect.value;
  const resetValue = resetSelect.value;
  const forgotValue = forgotSelect.value;
  const optionsMarkup = ['<option value="">Choose a user</option>'].concat(
    users.map(user => `<option value="${user.id}">${escapeHtml(user.name)}</option>`)
  ).join('');

  signInSelect.innerHTML = optionsMarkup;
  resetSelect.innerHTML = optionsMarkup;
  forgotSelect.innerHTML = optionsMarkup;
  signInSelect.value = users.some(user => user.id === signInValue) ? signInValue : '';
  resetSelect.value = users.some(user => user.id === resetValue) ? resetValue : '';
  forgotSelect.value = users.some(user => user.id === forgotValue) ? forgotValue : '';
  syncResetPasswordRecoveryFields(resetSelect.value);
  syncForgotPasswordQuestion(forgotSelect.value);
}

function selectSignInUser(userId) {
  const user = profileService.getUser(userId);

  if (!user) {
    return;
  }

  document.getElementById('sign-in-user-id').value = user.id;
  document.getElementById('reset-password-user-id').value = user.id;
  document.getElementById('forgot-password-user-id').value = user.id;
  syncResetPasswordRecoveryFields(user.id);
  syncForgotPasswordQuestion(user.id);
  renderUserList();
}

function showAuthShell() {
  sessionState.activeUser = null;
  sessionState.activeBudget = null;
  cache.clearBudgetContext();
  clearStatus();
  updateSessionChrome();
  document.getElementById('sign-in-form').reset();
  document.getElementById('create-user-form').reset();
  document.getElementById('reset-password-form').reset();
  document.getElementById('forgot-password-form').reset();
  document.getElementById('sign-in-user-id').value = '';
  document.getElementById('reset-password-user-id').value = '';
  document.getElementById('forgot-password-user-id').value = '';
  syncResetPasswordRecoveryFields('');
  syncForgotPasswordQuestion('');
  clearAuthPasswordFields();
  setAuthViewMode('sign-in');
  renderUserList();
  showShell('auth-shell');
}

function renderBudgetList() {
  const budgetList = document.getElementById('budget-list');

  if (!sessionState.activeUser) {
    budgetList.innerHTML = '';
    return;
  }

  const budgets = profileService.getBudgets(sessionState.activeUser.id);
  const selectedBudgetId = sessionState.activeBudget?.id || '';

  if (!budgets.length) {
    budgetList.innerHTML = `
      <div class="launch-list-empty">
        <h4>No budgets yet</h4>
        <p>Create your first budget on the right, then open it here.</p>
      </div>
    `;
    return;
  }

  budgetList.innerHTML = budgets.map(budget => `
    <div class="budget-list-item sortable-card ${budget.id === selectedBudgetId ? 'is-selected' : ''}" data-item-id="${budget.id}">
      <div class="drag-handle budget-list-drag-handle" aria-hidden="true" title="Drag to reorder">
        ${getActionIcon('drag')}
      </div>
      <button
        type="button"
        class="launch-list-button budget-list-open-button ${budget.id === selectedBudgetId ? 'is-selected' : ''}"
        data-budget-id="${budget.id}"
      >
        <strong>${escapeHtml(budget.name)}</strong>
        <p>Last opened ${escapeHtml(getRelativeDateLabel(budget.lastOpenedAt))}</p>
      </button>
      <div class="budget-list-actions">
        <button
          type="button"
          class="icon-button"
          data-rename-budget-id="${budget.id}"
          aria-label="Rename budget"
          title="Rename budget"
        >
          ${getActionIcon('edit')}
        </button>
        <button
          type="button"
          class="icon-button danger"
          data-delete-budget-id="${budget.id}"
          aria-label="Delete budget"
          title="Delete budget"
        >
          ${getActionIcon('trash')}
        </button>
      </div>
    </div>
  `).join('');

  initializeBudgetListSortable();
}

function showManagerShell(user) {
  sessionState.activeUser = user;
  sessionState.activeBudget = null;
  cache.clearBudgetContext();
  clearStatus();
  updateSessionChrome();
  document.getElementById('create-budget-form').reset();
  setBudgetManagerViewMode('budget-list');
  renderBudgetList();
  showShell('manager-shell');
}

async function switchBudgets() {
  if (!sessionState.activeUser) {
    return;
  }

  resetWorkspaceState();
  resetDashboardDisplay();
  showManagerShell(sessionState.activeUser);
  setStatus('Choose another budget.');
}

function resetDashboardDisplay() {
  document.getElementById('total-cash').textContent = formatCurrency(0);
  document.getElementById('account-count').textContent = '0';
  document.getElementById('category-count').textContent = '0';
  document.getElementById('category-summary').textContent = '0 subcategories ready for assignment.';
}

function normalizeDefaultBudgetIdPart(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'item';
}

function buildDefaultCategoryId(budgetId, index, name) {
  return [
    'default',
    normalizeDefaultBudgetIdPart(budgetId),
    'category',
    String(index),
    normalizeDefaultBudgetIdPart(name)
  ].join('-');
}

function buildDefaultSubCategoryId(categoryId, index, name) {
  return [
    categoryId,
    'sub-category',
    String(index),
    normalizeDefaultBudgetIdPart(name)
  ].join('-');
}

function buildDefaultAccountId(budgetId, index, name) {
  return [
    'default',
    normalizeDefaultBudgetIdPart(budgetId),
    'account',
    String(index),
    normalizeDefaultBudgetIdPart(name)
  ].join('-');
}

async function seedDefaultBudgetAccounts(budget) {
  const existingAccounts = await cache.getAll('accounts');

  if (existingAccounts.length) {
    return 0;
  }

  for (let accountIndex = 0; accountIndex < DEFAULT_BUDGET_ACCOUNTS.length; accountIndex += 1) {
    const accountDefinition = DEFAULT_BUDGET_ACCOUNTS[accountIndex];
    const accountType = normalizeAccountType(accountDefinition.accountType);
    const account = {
      id: buildDefaultAccountId(budget.id, accountIndex, accountDefinition.name),
      name: accountDefinition.name,
      description: '',
      startingBalance: 0,
      currentBalance: 0,
      offBudget: getDefaultOffBudgetForAccountType(accountType),
      sortOrder: accountIndex,
      active: true,
      accountType
    };

    await cache.insert('accounts', account);
  }

  return DEFAULT_BUDGET_ACCOUNTS.length;
}

async function seedDefaultBudgetCategories(budget) {
  const existingCategories = await cache.getAll('categories');

  if (existingCategories.length) {
    return 0;
  }

  let insertedSubCategoryCount = 0;

  for (let categoryIndex = 0; categoryIndex < DEFAULT_BUDGET_CATEGORIES.length; categoryIndex += 1) {
    const categoryDefinition = DEFAULT_BUDGET_CATEGORIES[categoryIndex];
    const categoryId = buildDefaultCategoryId(budget.id, categoryIndex, categoryDefinition.name);
    const category = {
      id: categoryId,
      name: categoryDefinition.name,
      note: categoryDefinition.note || '',
      offBudget: categoryDefinition.offBudget === true,
      sortOrder: categoryIndex,
      recurringAmount: 0,
      recurringCadence: 'never',
      bucketMode: categoryDefinition.bucketMode === 'save' ? 'save' : 'spend',
      savingsGoalAmount: 0
    };

    await cache.insert('categories', category);

    for (let subCategoryIndex = 0; subCategoryIndex < categoryDefinition.subCategories.length; subCategoryIndex += 1) {
      const subCategoryDefinition = categoryDefinition.subCategories[subCategoryIndex];
      const normalizedSubCategory = typeof subCategoryDefinition === 'string'
        ? { name: subCategoryDefinition }
        : subCategoryDefinition;
      const subCategory = {
        id: buildDefaultSubCategoryId(categoryId, subCategoryIndex, normalizedSubCategory.name),
        categoryId,
        name: normalizedSubCategory.name,
        note: normalizedSubCategory.note || '',
        offBudget: category.offBudget,
        balance: 0,
        sortOrder: subCategoryIndex,
        recurringAmount: 0,
        recurringCadence: 'never',
        bucketMode: normalizedSubCategory.bucketMode === 'save' ? 'save' : 'spend',
        savingsGoalAmount: 0
      };

      await cache.insert('subCategories', subCategory);
      insertedSubCategoryCount += 1;
    }
  }

  return insertedSubCategoryCount;
}

async function openBudget(user, budget) {
  resetWorkspaceState();
  cache.setBudgetContext(user.id, budget.id);
  await seedDefaultBudgetAccounts(budget);
  await seedDefaultBudgetCategories(budget);
  const openedBudget = profileService.markBudgetOpened(user.id, budget.id);
  sessionState.activeUser = user;
  sessionState.activeBudget = openedBudget;
  updateSessionChrome();
  showShell('app-shell');
  await syncTransferTransactionState();
  await syncTransactionDerivedState();
  showSection('accounts');
  await refreshDashboard();
  setStatus(`Opened budget: ${openedBudget.name}`);
}

async function handleBudgetSelection(budgetId) {
  if (!sessionState.activeUser) {
    return;
  }

  const budget = profileService.getBudget(sessionState.activeUser.id, budgetId);

  if (!budget) {
    setStatus('That budget could not be found.');
    return;
  }

  await openBudget(sessionState.activeUser, budget);
}

async function promptRenameBudget(budgetId) {
  if (!sessionState.activeUser) {
    return;
  }

  const budget = profileService.getBudget(sessionState.activeUser.id, budgetId);

  if (!budget) {
    setStatus('That budget could not be found.');
    return;
  }

  const result = await Swal.fire({
    title: `Rename "${budget.name}"?`,
    input: 'text',
    inputValue: budget.name,
    inputLabel: 'Budget name',
    inputPlaceholder: 'Family Budget',
    showCancelButton: true,
    confirmButtonText: 'Save',
    confirmButtonColor: '#1e7f74',
    cancelButtonText: 'Cancel',
    background: '#fffdf8',
    preConfirm: (value) => {
      const normalizedValue = String(value || '').trim();

      if (!normalizedValue) {
        Swal.showValidationMessage('Enter a name for the budget.');
      }

      return normalizedValue;
    }
  });

  if (!result.isConfirmed) {
    setStatus(`Kept budget name: ${budget.name}`);
    return;
  }

  const renamedBudget = profileService.renameBudget(sessionState.activeUser.id, budgetId, result.value);

  if (sessionState.activeBudget?.id === budgetId) {
    sessionState.activeBudget = renamedBudget;
    updateSessionChrome();
  }

  renderBudgetList();
  setStatus(`Renamed budget to ${renamedBudget.name}.`);
}

async function confirmDeleteBudget(budgetId) {
  if (!sessionState.activeUser) {
    return;
  }

  const budget = profileService.getBudget(sessionState.activeUser.id, budgetId);

  if (!budget) {
    setStatus('That budget could not be found.');
    return;
  }

  const result = await Swal.fire({
    title: `Delete budget "${budget.name}"?`,
    html: `
      <p>Are you sure you want to delete this budget? This action cannot be undone.</p>
      <p>Type <strong>delete</strong> below to confirm.</p>
    `,
    input: 'text',
    inputPlaceholder: 'delete',
    showCancelButton: true,
    confirmButtonText: 'Delete Budget',
    confirmButtonColor: '#af5d39',
    cancelButtonText: 'Cancel',
    background: '#fffdf8',
    focusCancel: true,
    preConfirm: (value) => {
      if (String(value || '').trim().toLowerCase() !== 'delete') {
        Swal.showValidationMessage('Type "delete" to confirm this action.');
      }

      return value;
    }
  });

  if (!result.isConfirmed) {
    setStatus(`Kept budget: ${budget.name}`);
    return;
  }

  profileService.deleteBudget(sessionState.activeUser.id, budgetId);

  if (sessionState.activeBudget?.id === budgetId) {
    sessionState.activeBudget = null;
    updateSessionChrome();
  }

  renderBudgetList();
  setStatus(`Deleted budget: ${budget.name}`);
}

async function signOut() {
  resetWorkspaceState();
  resetDashboardDisplay();
  showAuthShell();
  setStatus('Signed out.');
}

function showSection(sectionId) {
  if (!hasActiveBudgetSession()) {
    return;
  }

  document.getElementById('app-shell').dataset.activeSection = sectionId;

  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  document.querySelectorAll('.nav-button').forEach(button => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });
  document.getElementById(sectionId).classList.add('active');
  updateSectionHeader(sectionId);
  loadSectionData(sectionId);
}

async function loadSectionData(sectionId) {
  if (!hasActiveBudgetSession()) {
    return;
  }

  switch (sectionId) {
    case 'accounts':
      await loadAccounts();
      break;
    case 'categories':
      await loadCategories();
      break;
    case 'transactions':
      await loadTransactions();
      break;
    case 'transfers':
      await loadTransfers();
      break;
    case 'budget':
      await loadBudgetView();
      break;
    case 'reports':
      await loadReports();
      break;
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  const name = document.getElementById('create-user-name').value;
  const password = document.getElementById('create-user-password').value;
  const confirmPassword = document.getElementById('create-user-confirm-password').value;
  const securityQuestion = document.getElementById('create-user-security-question').value;
  const securityAnswer = document.getElementById('create-user-security-answer').value;

  if (password !== confirmPassword) {
    setStatus('The passwords did not match.');
    return;
  }

  const user = profileService.createUser(name, password, securityQuestion, securityAnswer);
  document.getElementById('create-user-form').reset();
  renderUserList();
  selectSignInUser(user.id);
  setStatus(`Created user: ${user.name}`);
}

async function handleSignIn(event) {
  event.preventDefault();
  const userId = document.getElementById('sign-in-user-id').value;
  const password = document.getElementById('sign-in-password').value;

  if (!userId) {
    setStatus('Choose a user before signing in.');
    return;
  }

  const user = profileService.signIn(userId, password);
  document.getElementById('sign-in-form').reset();
  document.getElementById('sign-in-user-id').value = user.id;
  document.getElementById('reset-password-user-id').value = user.id;
  document.getElementById('forgot-password-user-id').value = user.id;
  syncResetPasswordRecoveryFields(user.id);
  syncForgotPasswordQuestion(user.id);
  clearAuthPasswordFields();
  renderUserList();
  showManagerShell(user);
  setStatus(`Signed in as ${user.name}.`);
}

async function handleCreateBudget(event) {
  event.preventDefault();

  if (!sessionState.activeUser) {
    setStatus('Sign in before creating a budget.');
    return;
  }

  const name = document.getElementById('create-budget-name').value;
  const budget = profileService.createBudget(sessionState.activeUser.id, name);
  document.getElementById('create-budget-form').reset();
  renderBudgetList();
  await openBudget(sessionState.activeUser, budget);
}

async function handleResetPassword(event) {
  event.preventDefault();
  const userId = document.getElementById('reset-password-user-id').value;
  const currentPassword = document.getElementById('reset-password-current').value;
  const nextPassword = document.getElementById('reset-password-value').value;
  const confirmPassword = document.getElementById('reset-password-confirm').value;
  const securityQuestion = document.getElementById('reset-password-security-question').value;
  const securityAnswer = document.getElementById('reset-password-security-answer').value;
  const userName = profileService.getUser(userId)?.name || '';

  if (!userId) {
    setStatus('Choose a user before resetting the password.');
    return;
  }

  if (nextPassword !== confirmPassword) {
    setStatus('The new passwords did not match.');
    return;
  }

  if ((securityQuestion || securityAnswer) && (!securityQuestion.trim() || !securityAnswer.trim())) {
    setStatus('Enter both a security question and answer to update recovery.');
    return;
  }

  profileService.verifyCurrentPassword(userId, currentPassword);
  profileService.resetPassword(userId, nextPassword);
  if (securityQuestion.trim() && securityAnswer.trim()) {
    profileService.updateSecurityQuestion(userId, securityQuestion, securityAnswer);
  }
  document.getElementById('reset-password-form').reset();
  document.getElementById('reset-password-user-id').value = userId;
  syncResetPasswordRecoveryFields(userId);
  clearAuthPasswordFields();
  setAuthViewMode('sign-in');
  setStatus(securityQuestion.trim() && securityAnswer.trim()
    ? `Password and recovery question updated for ${userName}.`
    : `Password reset for ${userName}.`);
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const userId = document.getElementById('forgot-password-user-id').value;
  const answer = document.getElementById('forgot-password-answer').value;
  const nextPassword = document.getElementById('forgot-password-value').value;
  const confirmPassword = document.getElementById('forgot-password-confirm').value;
  const user = profileService.getUser(userId);

  if (!userId || !user) {
    setStatus('Choose a user before recovering access.');
    return;
  }

  if (!user.securityQuestion) {
    setStatus('This profile does not have a security question set up, so password recovery is not available.');
    return;
  }

  if (nextPassword !== confirmPassword) {
    setStatus('The new passwords did not match.');
    return;
  }

  profileService.verifySecurityAnswer(userId, answer);
  profileService.resetPassword(userId, nextPassword);
  document.getElementById('forgot-password-form').reset();
  document.getElementById('sign-in-user-id').value = userId;
  document.getElementById('reset-password-user-id').value = userId;
  document.getElementById('forgot-password-user-id').value = userId;
  syncForgotPasswordQuestion(userId);
  clearAuthPasswordFields();
  setAuthViewMode('sign-in');
  renderUserList();
  setStatus(`Password recovered for ${user.name}. You can sign in with the new password now.`);
}

async function loadAccountsLegacy() {
  const accounts = sortItemsForDisplay(await cache.getAll('accounts'));
  const list = document.getElementById('accounts-list');
  if (!accounts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h4>No accounts yet</h4>
        <p>Add your checking, savings, cash, or credit card accounts to see your cash position here.</p>
      </div>
    `;
    updateDashboardStats(accounts, null);
    return;
  }

  list.innerHTML = accounts.map(acc => {
    const currentBalance = formatCurrency(acc.currentBalance);
    const startingBalance = formatCurrency(acc.startingBalance);
    const isActive = acc.active !== false;
    const budgetStatus = acc.offBudget ? 'Off Budget' : 'On Budget';
    const accountStatus = isActive ? `Active • ${budgetStatus}` : `Inactive • ${budgetStatus}`;
    const amountClass = acc.currentBalance >= 0 ? 'positive' : 'negative';
    const descriptionMarkup = acc.description
      ? `<p class="data-card-note">${escapeHtml(acc.description)}</p>`
      : '';

    return `
      <article class="data-card sortable-card" data-item-id="${acc.id}">
        <div class="data-card-header">
          <div class="data-card-title-group">
            <div class="drag-handle" aria-hidden="true" title="Drag to reorder">
              ${getActionIcon('drag')}
            </div>
            <div>
            <h4>${escapeHtml(acc.name)}</h4>
            ${descriptionMarkup}
            </div>
          </div>
          <div class="pill ${acc.offBudget || !isActive ? 'warn' : ''}">${accountStatus}</div>
        </div>
        <div class="data-card-footer">
          <p>Started with ${startingBalance}</p>
          <div class="amount ${amountClass}">${currentBalance}</div>
        </div>
        <div class="card-actions">
          <button type="button" class="icon-button" onclick="editAccount('${acc.id}')" aria-label="Edit account" title="Edit account">
            ${getActionIcon('edit')}
          </button>
          <button type="button" class="icon-button danger" onclick="confirmDeleteAccount('${acc.id}')" aria-label="Delete account" title="Delete account">
            ${getActionIcon('trash')}
          </button>
        </div>
      </article>
    `;
  }).join('');

  initializeAccountsSortable();
  updateDashboardStats(accounts, null);
}

async function loadAccounts() {
  const accounts = sortItemsForDisplay(await cache.getAll('accounts'));
  const list = document.getElementById('accounts-list');
  if (!accounts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h4>No accounts yet</h4>
        <p>Add your checking, savings, cash, or credit card accounts to see your cash position here.</p>
      </div>
    `;
    updateDashboardStats(accounts, null);
    return;
  }

  list.innerHTML = accounts.map(acc => {
    const currentBalance = formatCurrency(acc.currentBalance);
    const startingBalance = formatCurrency(acc.startingBalance);
    const isActive = acc.active !== false;
    const budgetStatus = acc.offBudget ? 'Off Budget' : 'On Budget';
    const accountStatus = isActive ? `Active &bull; ${budgetStatus}` : `Inactive &bull; ${budgetStatus}`;
    const accountTypeLabel = getAccountTypeLabel(acc);
    const amountClass = acc.currentBalance >= 0 ? 'positive' : 'negative';
    const descriptionMarkup = acc.description
      ? `<p class="data-card-note">${escapeHtml(acc.description)}</p>`
      : '';

    return `
      <article class="data-card account-card sortable-card" data-item-id="${acc.id}">
        <div class="account-card-main">
          <div class="data-card-copy account-card-copy">
            <div class="data-card-title-group">
              <div class="drag-handle" aria-hidden="true" title="Drag to reorder">
                ${getActionIcon('drag')}
              </div>
              <div>
                <h4>${escapeHtml(acc.name)}</h4>
                <p class="data-card-note">${escapeHtml(accountTypeLabel)}</p>
                ${descriptionMarkup}
              </div>
            </div>
            <p class="account-card-starting">Started with ${startingBalance}</p>
          </div>
          <div class="account-card-side">
            <div class="account-card-meta-row">
              <div class="pill ${acc.offBudget ? 'warn' : !isActive ? 'silent' : ''}">${accountStatus}</div>
              <div class="icon-actions account-card-actions">
                <button type="button" class="icon-button" onclick="editAccount('${acc.id}')" aria-label="Edit account" title="Edit account">
                  ${getActionIcon('edit')}
                </button>
                <button type="button" class="icon-button danger" onclick="confirmDeleteAccount('${acc.id}')" aria-label="Delete account" title="Delete account">
                  ${getActionIcon('trash')}
                </button>
              </div>
            </div>
            <div class="amount ${amountClass}">${currentBalance}</div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  initializeAccountsSortable();
  updateDashboardStats(accounts, null);
}

async function loadCategories() {
  const [rawCategories, subCategories] = await Promise.all([
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);
  const categories = sortItemsForDisplay(rawCategories);
  expandedCategoryIds = new Set(
    Array.from(expandedCategoryIds).filter(categoryId => categories.some(category => category.id === categoryId))
  );
  const list = document.getElementById('categories-list');
  if (!categories.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h4>No categories yet</h4>
        <p>Create a category group and optionally add its first subcategory so your budget has structure right away.</p>
      </div>
    `;
    updateDashboardStats(null, categories, subCategories);
    return;
  }

  list.innerHTML = categories.map(cat => {
      const categorySubCategories = sortItemsForDisplay(
      subCategories.filter(subCategory => subCategory.categoryId === cat.id)
    );
      const categoryStatus = cat.offBudget ? 'Off Budget' : 'On Budget';
      const categoryRecurring = getBudgetRecurring(cat);
      const categorySavingsLabel = getSavingsBucketLabel(cat);
      const isExpanded = expandedCategoryIds.has(cat.id);
      const categoryMeta = [
        categorySavingsLabel,
        categoryRecurring.enabled ? `Recurring ${RECURRING_CADENCE_LABELS[categoryRecurring.cadence].toLowerCase()} ${formatCurrency(categoryRecurring.amount)}` : ''
      ].filter(Boolean).join(' | ');
      const budgetableSubCategoryCount = categorySubCategories.filter(subCategory => !subCategory.offBudget).length;
      const subCategoryCount = `${categorySubCategories.length} ${categorySubCategories.length === 1 ? 'subcategory' : 'subcategories'}`;
      const noteMarkup = cat.note
        ? `<p class="data-card-note">${escapeHtml(cat.note)}</p>`
        : '';
      const categoryBudgetMarkup = categoryMeta
        ? `<p class="data-card-note">${escapeHtml(categoryMeta)}</p>`
        : '';
      const toggleLabel = isExpanded ? 'Collapse category details' : 'Expand category details';
      const expandedContentMarkup = categorySubCategories.length
      ? `<div class="sub-list" data-category-id="${cat.id}">${categorySubCategories.map(subCategory => `
          <div class="sub-item sortable-sub-item" data-item-id="${subCategory.id}">
            <div class="data-card-title-group">
              <div class="drag-handle" aria-hidden="true" title="Drag to reorder">
                ${getActionIcon('drag')}
              </div>
              <div>
              <strong>${escapeHtml(subCategory.name)}</strong>
              <p>${escapeHtml(getSubCategoryMeta(subCategory))}</p>
              </div>
            </div>
            <div class="sub-item-actions">
              ${isSavingsBucket(subCategory) ? '<div class="pill savings">Savings</div>' : ''}
              ${getBudgetRecurring(subCategory).enabled ? `<div class="pill ${subCategory.offBudget ? 'warn' : ''}">${escapeHtml(RECURRING_CADENCE_LABELS[getBudgetRecurring(subCategory).cadence])}</div>` : ''}
              <div class="icon-actions">
                <button type="button" class="icon-button" onclick="editSubCategory('${subCategory.id}')" aria-label="Edit subcategory" title="Edit subcategory">
                  ${getActionIcon('edit')}
                </button>
                <button type="button" class="icon-button danger" onclick="confirmDeleteSubCategory('${subCategory.id}')" aria-label="Delete subcategory" title="Delete subcategory">
                  ${getActionIcon('trash')}
                </button>
              </div>
            </div>
            </div>
          `).join('')}</div>`
      : `
        <div class="sub-item category-level-summary">
          <div class="data-card-title-group">
            <div>
              <strong>Category-Level Budget</strong>
              <p>${escapeHtml(categoryMeta || 'No recurring amount set yet.')}</p>
            </div>
          </div>
          <div class="sub-item-actions">
            ${isSavingsBucket(cat) ? '<div class="pill savings">Savings</div>' : ''}
            ${categoryRecurring.enabled ? `<div class="pill ${cat.offBudget ? 'warn' : ''}">${escapeHtml(RECURRING_CADENCE_LABELS[categoryRecurring.cadence])}</div>` : ''}
          </div>
        </div>
      `;
      const categoryDetailMarkup = isExpanded
        ? `
          <div class="category-card-body">
            ${expandedContentMarkup}
          </div>
        `
        : '';

    return `
      <article class="data-card category-card sortable-card" data-item-id="${cat.id}">
        <div class="data-card-header">
          <div class="data-card-copy">
            <div class="data-card-title-group">
              <button type="button" class="collapse-toggle ${isExpanded ? 'expanded' : ''}" onclick="toggleCategoryExpansion('${cat.id}')" aria-label="${toggleLabel}" aria-expanded="${isExpanded}" title="${toggleLabel}">
                ${getActionIcon('chevron')}
              </button>
              <div class="drag-handle" aria-hidden="true" title="Drag to reorder">
                ${getActionIcon('drag')}
              </div>
                <div>
                  <h4>${escapeHtml(cat.name)}</h4>
                  ${noteMarkup}
                  ${categoryBudgetMarkup}
                </div>
              </div>
          </div>
          <div class="card-header-actions">
            ${isSavingsBucket(cat) ? '<div class="pill savings">Savings</div>' : ''}
            <div class="pill ${cat.offBudget ? 'warn' : ''}">${categoryStatus}</div>
            <div class="icon-actions">
              <button type="button" class="secondary-button compact-button" onclick="startAddSubCategory('${cat.id}')">+ Subcategory</button>
              <button type="button" class="icon-button" onclick="editCategory('${cat.id}')" aria-label="Edit category" title="Edit category">
                ${getActionIcon('edit')}
              </button>
              <button type="button" class="icon-button danger" onclick="confirmDeleteCategory('${cat.id}')" aria-label="Delete category" title="Delete category">
                ${getActionIcon('trash')}
              </button>
            </div>
          </div>
          </div>
          <div class="data-card-footer">
            <p>${subCategoryCount}</p>
            <p>${budgetableSubCategoryCount} on-budget</p>
          </div>
        ${categoryDetailMarkup}
      </article>
    `;
  }).join('');

  initializeCategoriesSortable();
  initializeSubCategorySortables();
  updateDashboardStats(null, categories, subCategories);
}

async function toggleCategoryExpansion(categoryId) {
  if (expandedCategoryIds.has(categoryId)) {
    expandedCategoryIds.delete(categoryId);
  } else {
    expandedCategoryIds.add(categoryId);
  }

  await loadCategories();
}

async function loadTransactions() {
  const [transactions, transfers, accounts, categories, subCategories] = await Promise.all([
    cache.getAll('transactions'),
    cache.getAll('transfers'),
    cache.getAll('accounts'),
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);
  const list = document.getElementById('transactions-list');

  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const subCategoryMap = new Map(subCategories.map(subCategory => [subCategory.id, subCategory]));
  const transferMap = new Map(transfers.map(transfer => [transfer.id, transfer]));
  transactionSubCategoriesCache = subCategories;
  const visibleTransactions = getFilteredAndSortedTransactions(transactions, accountMap, categoryMap, subCategoryMap, transferMap);
  const filterToggleButton = document.getElementById('transaction-filters-toggle');

  if (filterToggleButton) {
    filterToggleButton.textContent = getFilterButtonLabel('Filters', transactionTableState.filters);
    filterToggleButton.classList.toggle('is-active', transactionTableState.filtersVisible);
  }

  const emptyMarkup = !visibleTransactions.length
    ? `
        <div class="empty-state transaction-empty-state">
          <h4>No transactions</h4>
          <p>Adjust the column filters or add a new transaction from the first row.</p>
        </div>
      `
    : '';

  list.innerHTML = `
      <div class="ledger-shell-header">
        <div class="ledger-shell-header-copy">
          <span>Table Controls</span>
        </div>
        <div class="table-toolbar-actions segmented-toolbar ledger-toolbar">
          <button type="button" id="transaction-export-button" class="secondary-button compact-button">Export CSV</button>
          <button type="button" id="transaction-filters-toggle" class="secondary-button compact-button">Filters</button>
        </div>
      </div>
      <div class="transaction-table">
        <div class="transaction-row transaction-head">
          <div><button type="button" class="transaction-sort-button" data-sort-key="date">Date${getTableSortIndicator(transactionTableState, 'date')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="account">Account${getTableSortIndicator(transactionTableState, 'account')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="payee">Payee${getTableSortIndicator(transactionTableState, 'payee')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="category">Category${getTableSortIndicator(transactionTableState, 'category')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="subCategory">Subcategory${getTableSortIndicator(transactionTableState, 'subCategory')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="memo">Memo${getTableSortIndicator(transactionTableState, 'memo')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="outflow">Outflow${getTableSortIndicator(transactionTableState, 'outflow')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="inflow">Inflow${getTableSortIndicator(transactionTableState, 'inflow')}</button></div>
          <div><button type="button" class="transaction-sort-button" data-sort-key="balance">Balance${getTableSortIndicator(transactionTableState, 'balance')}</button></div>
          <div>Cleared</div>
          <div>Actions</div>
        </div>
        ${transactionTableState.filtersVisible ? `
          <div class="transaction-row transaction-filter-row">
            <div><input type="text" class="txn-filter-input" data-filter-key="date" value="${escapeHtml(transactionTableState.filters.date)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="account" value="${escapeHtml(transactionTableState.filters.account)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="payee" value="${escapeHtml(transactionTableState.filters.payee)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="category" value="${escapeHtml(transactionTableState.filters.category)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="subCategory" value="${escapeHtml(transactionTableState.filters.subCategory)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="memo" value="${escapeHtml(transactionTableState.filters.memo)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="outflow" value="${escapeHtml(transactionTableState.filters.outflow)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="inflow" value="${escapeHtml(transactionTableState.filters.inflow)}" placeholder="Filter"></div>
            <div><input type="text" class="txn-filter-input" data-filter-key="balance" value="${escapeHtml(transactionTableState.filters.balance)}" placeholder="Filter"></div>
            <div></div>
            <div><button type="button" class="secondary-button compact-button transaction-clear-filters">Clear</button></div>
          </div>
        ` : ''}
        ${renderTransactionEditorRow({ rowMode: 'create', accounts, categories, subCategories })}
        ${visibleTransactions.map(({ transaction }) => {
          if (editingTransactionId === transaction.id) {
            return renderTransactionEditorRow({
              rowMode: 'edit',
            transaction,
            accounts,
            categories,
            subCategories
          });
        }

          return renderTransactionDisplayRow(transaction, accountMap, categoryMap, subCategoryMap, transferMap);
        }).join('')}
    </div>
    ${emptyMarkup}
  `;

  if (transactionFilterFocusState?.key) {
    const filterInput = list.querySelector(`.txn-filter-input[data-filter-key="${transactionFilterFocusState.key}"]`);

    if (filterInput) {
      filterInput.focus();

      if (typeof transactionFilterFocusState.selectionStart === 'number' && typeof transactionFilterFocusState.selectionEnd === 'number') {
        filterInput.setSelectionRange(transactionFilterFocusState.selectionStart, transactionFilterFocusState.selectionEnd);
      }
    }
  }
}

async function loadTransfers() {
  const [transfers, accounts] = await Promise.all([
    cache.getAll('transfers'),
    cache.getAll('accounts')
  ]);
  const list = document.getElementById('transfers-list');
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const selectableAccounts = sortItemsForDisplay(accounts.filter(account => account.active !== false));
  const visibleTransfers = getFilteredAndSortedTransfers(transfers, accountMap);
  const filterToggleButton = document.getElementById('transfer-filters-toggle');

  if (filterToggleButton) {
    filterToggleButton.textContent = getFilterButtonLabel('Filters', transferTableState.filters);
    filterToggleButton.classList.toggle('is-active', transferTableState.filtersVisible);
  }

  const emptyMarkup = !visibleTransfers.length
    ? `
        <div class="empty-state transaction-empty-state">
          <h4>No transfers</h4>
          <p>Adjust the filters or create one from the first row to move money between accounts.</p>
        </div>
      `
    : '';

  list.innerHTML = `
    <div class="ledger-shell-header">
      <div class="ledger-shell-header-copy">
        <span>Table Controls</span>
      </div>
      <div class="table-toolbar-actions segmented-toolbar ledger-toolbar">
        <button type="button" id="transfer-export-button" class="secondary-button compact-button">Export CSV</button>
        <button type="button" id="transfer-filters-toggle" class="secondary-button compact-button">Filters</button>
      </div>
    </div>
    <div class="transfer-table">
      <div class="transfer-row transfer-head">
        <div><button type="button" class="transaction-sort-button" data-table-type="transfers" data-sort-key="date">Date${getTableSortIndicator(transferTableState, 'date')}</button></div>
        <div><button type="button" class="transaction-sort-button" data-table-type="transfers" data-sort-key="fromAccount">From Account${getTableSortIndicator(transferTableState, 'fromAccount')}</button></div>
        <div><button type="button" class="transaction-sort-button" data-table-type="transfers" data-sort-key="toAccount">To Account${getTableSortIndicator(transferTableState, 'toAccount')}</button></div>
        <div><button type="button" class="transaction-sort-button" data-table-type="transfers" data-sort-key="amount">Amount${getTableSortIndicator(transferTableState, 'amount')}</button></div>
        <div><button type="button" class="transaction-sort-button" data-table-type="transfers" data-sort-key="status">Status${getTableSortIndicator(transferTableState, 'status')}</button></div>
        <div><button type="button" class="transaction-sort-button" data-table-type="transfers" data-sort-key="memo">Memo${getTableSortIndicator(transferTableState, 'memo')}</button></div>
        <div>Actions</div>
      </div>
      ${transferTableState.filtersVisible ? `
        <div class="transfer-row transaction-filter-row">
          <div><input type="text" class="transfer-filter-input txn-filter-input" data-filter-key="date" value="${escapeHtml(transferTableState.filters.date)}" placeholder="Filter"></div>
          <div><input type="text" class="transfer-filter-input txn-filter-input" data-filter-key="fromAccount" value="${escapeHtml(transferTableState.filters.fromAccount)}" placeholder="Filter"></div>
          <div><input type="text" class="transfer-filter-input txn-filter-input" data-filter-key="toAccount" value="${escapeHtml(transferTableState.filters.toAccount)}" placeholder="Filter"></div>
          <div><input type="text" class="transfer-filter-input txn-filter-input" data-filter-key="amount" value="${escapeHtml(transferTableState.filters.amount)}" placeholder="Filter"></div>
          <div>
            <select class="transfer-filter-input txn-filter-input" data-filter-key="status">
              <option value="">All</option>
              <option value="scheduled" ${transferTableState.filters.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
              <option value="completed" ${transferTableState.filters.status === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
          <div><input type="text" class="transfer-filter-input txn-filter-input" data-filter-key="memo" value="${escapeHtml(transferTableState.filters.memo)}" placeholder="Filter"></div>
          <div><button type="button" class="secondary-button compact-button transfer-clear-filters">Clear</button></div>
        </div>
      ` : ''}
      ${renderTransferEditorRow({ rowMode: 'create', accounts: selectableAccounts })}
      ${visibleTransfers.map(({ transfer }) => {
        if (editingTransferId === transfer.id) {
          return renderTransferEditorRow({
            rowMode: 'edit',
            transfer,
            accounts: selectableAccounts
          });
        }

        return renderTransferDisplayRow(transfer, accountMap);
      }).join('')}
    </div>
    ${emptyMarkup}
  `;

  if (transferFilterFocusState?.key) {
    const filterInput = list.querySelector(`.transfer-filter-input[data-filter-key="${transferFilterFocusState.key}"]`);

    if (filterInput) {
      filterInput.focus();

      if (typeof transferFilterFocusState.selectionStart === 'number' && typeof transferFilterFocusState.selectionEnd === 'number' && typeof filterInput.setSelectionRange === 'function') {
        filterInput.setSelectionRange(transferFilterFocusState.selectionStart, transferFilterFocusState.selectionEnd);
      }
    }
  }
}

function shiftMonthValue(monthValue, offset) {
  const [year, month] = monthValue.split('-').map(Number);
  const shiftedDate = new Date(year, month - 1 + offset, 1);

  return buildLocalMonthValue(shiftedDate);
}

function formatMonthLabel(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
}

function formatMonthWindowLabel(months) {
  if (!months.length) {
    return '';
  }

  return `${formatMonthLabel(months[0])} - ${formatMonthLabel(months[months.length - 1])}`;
}

function getVisibleBudgetMonths(centerMonth) {
  return [
    shiftMonthValue(centerMonth, -1),
    centerMonth,
    shiftMonthValue(centerMonth, 1)
  ];
}

function buildBudgetEntryKey(categoryId, subCategoryId = null) {
  return `${categoryId}::${subCategoryId || 'root'}`;
}

function buildBudgetMonthEntryKey(month, categoryId, subCategoryId = null) {
  return `${month}::${buildBudgetEntryKey(categoryId, subCategoryId)}`;
}

function buildBudgetEntryDefinitions(categories, subCategories, transactions = [], budgetAllocations = []) {
  return sortItemsForDisplay(categories)
    .filter(category => !category.offBudget)
    .map(category => {
      const visibleSubCategories = sortItemsForDisplay(
        subCategories.filter(subCategory => subCategory.categoryId === category.id && !subCategory.offBudget)
      );
      const shouldIncludeCategorySavingsRow = visibleSubCategories.length && isSavingsBucket(category);
      const needsCategoryFallbackRow = !shouldIncludeCategorySavingsRow && visibleSubCategories.length && (
        transactions.some(transaction => transaction.categoryId === category.id && !transaction.subCategoryId)
        || budgetAllocations.some(allocation => allocation.categoryId === category.id && !allocation.subCategoryId)
      );
      const rows = visibleSubCategories.length
          ? visibleSubCategories.map(subCategory => ({
              entryKey: buildBudgetEntryKey(category.id, subCategory.id),
              categoryId: category.id,
              subCategoryId: subCategory.id,
              categoryName: category.name,
              subCategoryName: subCategory.name,
              note: subCategory.note || '',
              recurring: getBudgetRecurring(subCategory),
              bucketMode: getBudgetBucketMode(subCategory),
              savingsGoalAmount: getSavingsGoalAmount(subCategory),
              isCategoryFallback: false
            }))
          : [{
              entryKey: buildBudgetEntryKey(category.id, null),
              categoryId: category.id,
              subCategoryId: null,
              categoryName: category.name,
              subCategoryName: '',
              note: category.note || '',
              recurring: getBudgetRecurring(category),
              bucketMode: getBudgetBucketMode(category),
              savingsGoalAmount: getSavingsGoalAmount(category),
              isCategoryFallback: true
            }];

        if (shouldIncludeCategorySavingsRow) {
          rows.unshift({
            entryKey: buildBudgetEntryKey(category.id, null),
            categoryId: category.id,
            subCategoryId: null,
            categoryName: category.name,
            subCategoryName: 'Category Savings Bucket',
            note: category.note || '',
            recurring: getBudgetRecurring(category),
            bucketMode: getBudgetBucketMode(category),
            savingsGoalAmount: getSavingsGoalAmount(category),
            isCategoryFallback: true
          });
        }

        if (needsCategoryFallbackRow) {
          rows.unshift({
          entryKey: buildBudgetEntryKey(category.id, null),
            categoryId: category.id,
            subCategoryId: null,
            categoryName: category.name,
            subCategoryName: 'Category-Level Activity',
            note: '',
            recurring: getBudgetRecurring(category),
            bucketMode: getBudgetBucketMode(category),
            savingsGoalAmount: getSavingsGoalAmount(category),
            isCategoryFallback: true
          });
        }

      return {
        id: category.id,
        name: category.name,
        note: category.note || '',
        rows
      };
    })
    .filter(group => group.rows.length);
}

function buildBudgetActivityLookup(transactions) {
  return transactions.reduce((lookup, transaction) => {
    if (!transaction.categoryId) {
      return lookup;
    }

    const month = String(transaction.date || '').slice(0, 7);

    if (!month) {
      return lookup;
    }

    const key = buildBudgetMonthEntryKey(month, transaction.categoryId, transaction.subCategoryId || null);
    lookup.set(key, (lookup.get(key) || 0) + Number(transaction.amount || 0));
    return lookup;
  }, new Map());
}

function buildSavedAllocationLookup(budgetAllocations) {
  return budgetAllocations.reduce((lookup, allocation) => {
    lookup.set(
      buildBudgetMonthEntryKey(allocation.month, allocation.categoryId, allocation.subCategoryId || null),
      allocation
    );
    return lookup;
  }, new Map());
}

function getNearestPriorBudgetMonth(targetMonth, budgetAllocations) {
  const priorMonths = Array.from(new Set(
    budgetAllocations
      .map(allocation => allocation.month)
      .filter(month => month < targetMonth)
  )).sort();

  return priorMonths.length ? priorMonths[priorMonths.length - 1] : null;
}

function getBudgetPrefillAmount(month, row, sourceAllocation = null) {
  const recurringAmount = getMonthlyRecurringAllocation(month, row.recurring);

  if (recurringAmount > 0) {
    return recurringAmount;
  }

  return Number(sourceAllocation?.assigned || 0);
}

function buildBudgetDraftAllocations(context, month) {
  const savedMonthRows = context.entries.flatMap(group => group.rows)
    .map(row => {
      const savedAllocation = context.savedAllocationLookup.get(
        buildBudgetMonthEntryKey(month, row.categoryId, row.subCategoryId)
      );

      return [
        row.entryKey,
        {
          categoryId: row.categoryId,
          subCategoryId: row.subCategoryId,
          assigned: Number(savedAllocation?.assigned || 0),
          suggestedAssigned: 0,
          note: String(savedAllocation?.note || '')
        }
      ];
    });

  const hasSavedMonthAllocations = savedMonthRows.some(([, draft]) => draft.assigned !== 0 || draft.note.trim());

  if (hasSavedMonthAllocations) {
    return {
      draftAllocations: new Map(savedMonthRows),
      draftSourceMonth: month,
      draftSourceLabel: '',
      isPrefilled: false
    };
  }

  const sourceMonth = getNearestPriorBudgetMonth(month, context.budgetAllocations);
  const hasRecurringPrefill = context.entries
    .flatMap(group => group.rows)
    .some(row => getMonthlyRecurringAllocation(month, row.recurring) > 0);
  const draftAllocations = new Map(context.entries.flatMap(group => group.rows).map(row => {
    const sourceAllocation = sourceMonth
      ? context.savedAllocationLookup.get(buildBudgetMonthEntryKey(sourceMonth, row.categoryId, row.subCategoryId))
      : null;

    return [
      row.entryKey,
      {
        categoryId: row.categoryId,
        subCategoryId: row.subCategoryId,
        assigned: null,
        suggestedAssigned: getBudgetPrefillAmount(month, row, sourceAllocation),
        note: ''
      }
    ];
  }));
  const draftSourceLabel = hasRecurringPrefill
    ? 'recurring category amounts'
    : sourceMonth
      ? formatMonthLabel(sourceMonth)
      : '';

  return {
    draftAllocations,
    draftSourceMonth: sourceMonth,
    draftSourceLabel,
    isPrefilled: Boolean(draftSourceLabel)
  };
}

function getMonthDraftState(month) {
  return {
    draftAllocations: budgetState.draftAllocationsByMonth.get(month) || new Map(),
    ...(budgetState.draftMetaByMonth.get(month) || {
      draftSourceMonth: null,
      draftSourceLabel: '',
      isPrefilled: false
    })
  };
}

function setMonthDraftState(month, draftState) {
  budgetState.draftAllocationsByMonth.set(month, draftState.draftAllocations);
  budgetState.draftMetaByMonth.set(month, {
    draftSourceMonth: draftState.draftSourceMonth || null,
    draftSourceLabel: draftState.draftSourceLabel || '',
    isPrefilled: Boolean(draftState.isPrefilled)
  });
}

function getAssignedAmountForEntry(entry, draftAllocations) {
  return Number(draftAllocations.get(entry.entryKey)?.assigned || 0);
}

function getSuggestedAssignedForEntry(entry, draftAllocations) {
  return Number(draftAllocations.get(entry.entryKey)?.suggestedAssigned || 0);
}

function getEffectiveAssignedForEntry(entry, draftAllocations) {
  const draft = draftAllocations.get(entry.entryKey);

  if (!draft) {
    return 0;
  }

  if (draft.assigned === null || typeof draft.assigned === 'undefined') {
    return 0;
  }

  return Number(draft.assigned || 0);
}

function getNoteForEntry(entry, draftAllocations) {
  return String(draftAllocations.get(entry.entryKey)?.note || '');
}

function isBudgetEntryDirty(context, month, entry, draftAllocations) {
  const savedAllocation = context.savedAllocationLookup.get(
    buildBudgetMonthEntryKey(month, entry.categoryId, entry.subCategoryId)
  );
  const savedAssigned = Number(savedAllocation?.assigned || 0);
  const savedNote = String(savedAllocation?.note || '');
  const draftAssigned = getAssignedAmountForEntry(entry, draftAllocations);
  const draftNote = getNoteForEntry(entry, draftAllocations);

  return draftAssigned !== savedAssigned || draftNote.trim() !== savedNote.trim();
}

function hasBudgetUnsavedChanges() {
  if (!budgetState.context) {
    return false;
  }

  return budgetState.visibleMonths.some(month => {
    const draftAllocations = getMonthDraftState(month).draftAllocations;

    return budgetState.context.entries.some(group => group.rows.some(row => (
      isBudgetEntryDirty(budgetState.context, month, row, draftAllocations)
    )));
  });
}

function syncBudgetDirtyStatus() {
  const hasUnsavedChanges = hasBudgetUnsavedChanges();

  if (hasUnsavedChanges) {
    budgetDirtyToastActive = true;
    setStatus('Budget has unsaved changes. Save the visible months to keep them.', { persist: true });
    return;
  }

  if (budgetDirtyToastActive) {
    budgetDirtyToastActive = false;
    clearStatus();
  }
}

function getActivityAmountForEntry(context, month, entry) {
  return Number(context.activityLookup.get(
    buildBudgetMonthEntryKey(month, entry.categoryId, entry.subCategoryId)
  ) || 0);
}

function isBudgetAccountInScope(account) {
  return Boolean(account && account.active !== false && !account.offBudget);
}

function buildBudgetMonthlySummary(context, month, groups) {
  const monthTransactions = context.transactions.filter(transaction => (
    !transaction.pending
    && context.activeBudgetAccountIds.has(transaction.accountId)
    && String(transaction.date || '').slice(0, 7) === month
  ));
  const inflow = monthTransactions
    .filter(transaction => !transaction.transferId && Number(transaction.amount || 0) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const outflow = monthTransactions
    .filter(transaction => !transaction.transferId && Number(transaction.amount || 0) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const balance = context.accounts
    .filter(isBudgetAccountInScope)
    .reduce((sum, account) => {
      const accountBalance = context.transactions.reduce((accountSum, transaction) => {
        if (
          transaction.pending
          || transaction.accountId !== account.id
          || String(transaction.date || '').slice(0, 7) > month
        ) {
          return accountSum;
        }

        return accountSum + Number(transaction.amount || 0);
      }, Number(account.startingBalance || 0));

      return sum + accountBalance;
    }, 0);
  const budgeted = groups.reduce((sum, group) => sum + group.totals.assigned, 0);
  const available = inflow - budgeted;

  return {
    monthLabel: formatMonthLabel(month),
    inflow,
    outflow,
    balance,
    budgeted,
    available
  };
}

function getCarryoverAmountForEntry(context, month, entry) {
  const relevantMonths = Array.from(new Set(
    [
      ...context.budgetAllocations.map(allocation => allocation.month),
      ...context.transactions
        .map(transaction => String(transaction.date || '').slice(0, 7))
        .filter(Boolean)
    ].filter(candidateMonth => candidateMonth < month)
  )).sort();

  return relevantMonths.reduce((sum, candidateMonth) => {
    const allocation = context.savedAllocationLookup.get(
      buildBudgetMonthEntryKey(candidateMonth, entry.categoryId, entry.subCategoryId)
    );
    const activity = getActivityAmountForEntry(context, candidateMonth, entry);

    return sum + Number(allocation?.assigned || 0) + activity;
  }, 0);
}

function buildBudgetPresentationModel(context, month, draftAllocations) {
  const groups = context.entries.map(group => {
    const rows = group.rows.map(entry => {
      const savedAllocation = context.savedAllocationLookup.get(
        buildBudgetMonthEntryKey(month, entry.categoryId, entry.subCategoryId)
      );
      const carryover = getCarryoverAmountForEntry(context, month, entry);
      const committedAssigned = Number(savedAllocation?.assigned || 0);
      const assigned = getEffectiveAssignedForEntry(entry, draftAllocations);
      const suggestedAssigned = getSuggestedAssignedForEntry(entry, draftAllocations);
      const monthlyNote = getNoteForEntry(entry, draftAllocations);
      const activity = getActivityAmountForEntry(context, month, entry);
      const available = carryover + assigned + activity;
      const isDirty = isBudgetEntryDirty(context, month, entry, draftAllocations);
      const savingsStatus = buildSavingsBucketStatus(available, entry.savingsGoalAmount);

      return {
        ...entry,
        carryover,
        committedAssigned,
        assigned,
        suggestedAssigned,
        isSuggestedOnly: (draftAllocations.get(entry.entryKey)?.assigned === null || typeof draftAllocations.get(entry.entryKey)?.assigned === 'undefined')
          && suggestedAssigned > 0,
        monthlyNote,
        isDirty,
        activity,
        available,
        savingsStatus
      };
    });
    const totals = rows.reduce((sum, row) => ({
      carryover: sum.carryover + row.carryover,
      assigned: sum.assigned + row.assigned,
      activity: sum.activity + row.activity,
      available: sum.available + row.available
    }), {
      carryover: 0,
      assigned: 0,
      activity: 0,
      available: 0
    });

    return {
      ...group,
      rows,
      totals
    };
  });

  return {
    groups,
    summary: buildBudgetMonthlySummary(context, month, groups)
  };
}

function renderBudgetSummaryCards(summary) {
  const container = document.getElementById('budget-summary-cards');

  container.innerHTML = `
    <article class="hero-card budget-cash-card">
      <p class="hero-label">Per Month</p>
      <h3>${escapeHtml(summary.monthLabel)}</h3>
      <p class="hero-copy">Monthly rollup for active, on-budget accounts.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">Balance</p>
      <h3 class="amount ${summary.balance < 0 ? 'negative' : 'positive'}">${formatCurrency(summary.balance)}</h3>
      <p class="hero-copy">Ending account balance across active, on-budget accounts.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">Inflow</p>
      <h3 class="amount positive">${formatCurrency(summary.inflow)}</h3>
      <p class="hero-copy">Posted incoming money for the month.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">Outflow</p>
      <h3 class="amount negative">${formatCurrency(-summary.outflow)}</h3>
      <p class="hero-copy">Posted spending for the month, excluding transfers.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">Budgeted</p>
      <h3>${formatCurrency(summary.budgeted)}</h3>
      <p class="hero-copy">Assigned in the current month, including draft edits.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">Available</p>
      <h3 class="amount ${summary.available < 0 ? 'negative' : 'positive'}">${formatCurrency(summary.available)}</h3>
      <p class="hero-copy">Total available across budget rows for the month. (Inflow - Budgeted)</p>
    </article>
  `;
}

function renderBudgetMonthGrid(month, model, draftMeta, isSelected = false) {
  return `
    <div class="budget-month-shell ${isSelected ? 'is-selected' : ''}" ${isSelected ? 'data-selected-budget-month="true"' : ''}>
      <section class="budget-month-column">
        <div class="budget-month-column-header">
          <div>
            <h4>${escapeHtml(formatMonthLabel(month))}</h4>
          </div>
          <p class="budget-month-column-hint">${escapeHtml(
            'Monthly draft ready'
          )}</p>
        </div>
        <div class="budget-groups">
          ${model.groups.map(group => `
            <article class="budget-group-card">
              <div class="budget-group-header">
                <div class="budget-group-copy">
                  <h4>${escapeHtml(group.name)}</h4>
                  <p>${escapeHtml(`${group.rows.filter(row => !row.isCategoryFallback).length} ${group.rows.filter(row => !row.isCategoryFallback).length === 1 ? 'subcategory' : 'subcategories'}`)}</p>
                </div>
              </div>
              <div class="budget-row budget-row-head">
                <div>Line</div>
                <div>Carry</div>
                <div>Assign</div>
                <div>Activity</div>
                <div>Remain</div>
                <div>Note</div>
              </div>
              ${model.groups.length ? group.rows.map(row => `
                <div class="budget-row-stack">
                  <div class="budget-row" data-budget-row-key="${month}::${row.entryKey}" data-entry-key="${row.entryKey}" data-month="${month}" data-category-id="${group.id}">
                    <div class="budget-line-copy" title="${escapeHtml(buildBudgetRowMetaText(row))}">
                      <div class="budget-line-main">
                        <strong>${escapeHtml(row.subCategoryName || row.categoryName)}</strong>
                        ${row.bucketMode === 'save' ? '<span class="budget-bucket-badge">Savings</span>' : ''}
                      </div>
                      ${row.bucketMode === 'save' && row.savingsGoalAmount > 0 ? `
                        <div class="budget-savings-progress-copy">
                          <span>Progress</span>
                          <strong>${formatSavingsProgressPercent(row.savingsStatus.progressPercent)}</strong>
                        </div>
                      ` : ''}
                    </div>
                    <div class="amount budget-row-carryover">${formatCurrency(row.carryover)}</div>
                    <div class="budget-assigned-field">
                      <div class="budget-amount-input-shell ${row.isDirty ? 'is-dirty' : ''}">
                        <span class="budget-amount-prefix" aria-hidden="true">$</span>
                        <input
                          type="number"
                          class="budget-assigned-input"
                          data-entry-key="${row.entryKey}"
                          data-month="${month}"
                          aria-label="Amount to allocate for ${escapeHtml(row.subCategoryName || row.categoryName)} in ${escapeHtml(formatMonthLabel(month))}"
                          value="${escapeHtml(String(
                            Number.isFinite(getAssignedAmountForEntry(row, getMonthDraftState(month).draftAllocations))
                              && getAssignedAmountForEntry(row, getMonthDraftState(month).draftAllocations) !== 0
                              ? getAssignedAmountForEntry(row, getMonthDraftState(month).draftAllocations)
                              : ''
                          ))}"
                          step="0.01"
                          placeholder="${escapeHtml(row.suggestedAssigned ? String(row.suggestedAssigned) : '0.00')}"
                        >
                      </div>
                    </div>
                    <div class="amount ${row.activity < 0 ? 'negative' : 'positive'} budget-row-activity">${formatCurrency(row.activity)}</div>
                    <div class="amount ${row.available < 0 ? 'negative' : 'positive'} budget-row-available">${formatCurrency(row.available)}</div>
                    <div class="budget-note-action">
                      <button
                        type="button"
                        class="icon-button ${row.monthlyNote ? '' : 'ghost'} ${budgetState.expandedNoteKey === `${month}::${row.entryKey}` ? 'is-active' : ''}"
                        data-note-toggle-entry-key="${row.entryKey}"
                        data-month="${month}"
                        aria-label="${row.monthlyNote ? 'Edit monthly note' : 'Add monthly note'}"
                        title="${row.monthlyNote ? 'Edit monthly note' : 'Add monthly note'}"
                      >
                        ${getActionIcon('note')}
                      </button>
                    </div>
                  </div>
                  ${budgetState.expandedNoteKey === `${month}::${row.entryKey}` ? `
                    <div class="budget-note-editor" data-note-editor-entry-key="${month}::${row.entryKey}">
                      <div class="budget-note-editor-copy">
                        <strong>Monthly note</strong>
                        <p>This note is saved only for ${escapeHtml(formatMonthLabel(month))}.</p>
                      </div>
                      <textarea
                        class="budget-note-textarea"
                        data-note-entry-key="${row.entryKey}"
                        data-month="${month}"
                        aria-label="Monthly note for ${escapeHtml(row.subCategoryName || row.categoryName)}"
                        rows="3"
                        placeholder="Add a monthly note for this row"
                      >${escapeHtml(row.monthlyNote)}</textarea>
                    </div>
                  ` : ''}
                </div>
              `).join('') : ''}
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

function renderBudgetWorkspaceGrid(monthModels) {
  const view = document.getElementById('budget-view');

  if (!monthModels.some(({ model }) => model.groups.length)) {
    view.innerHTML = `
      <div class="empty-state">
        <h4>No budgetable categories yet</h4>
        <p>Add an on-budget category or subcategory first so the monthly budget workspace has somewhere to assign money.</p>
      </div>
    `;
    return;
  }

  view.innerHTML = `
    <div class="budget-month-grid">
      ${monthModels.map(({ month, model, draftMeta }, index) => renderBudgetMonthGrid(month, model, draftMeta, index === 1)).join('')}
    </div>
  `;
}

function updateBudgetDraftHint() {
  const hint = document.getElementById('budget-draft-hint');

  if (!budgetState.context) {
    hint.textContent = 'Three-month budget drafts stay editable until you save the visible months.';
    return;
  }

  const visiblePrefills = budgetState.visibleMonths
    .map(month => ({ month, meta: budgetState.draftMetaByMonth.get(month) }))
    .filter(({ meta }) => meta?.isPrefilled && meta?.draftSourceLabel);

  if (visiblePrefills.length) {
    hint.textContent = 'Three-month draft loaded. Review the visible months, then save when they look right.';
    return;
  }

  hint.textContent = 'Three-month budget drafts stay editable until you save the visible months.';
}

function renderBudgetWorkspace() {
  if (!budgetState.context) {
    return;
  }

  const selectedMonth = budgetState.selectedMonth || budgetState.visibleMonths[1] || budgetState.visibleMonths[0] || getCurrentMonthValue();
  const monthPicker = document.getElementById('budget-month-picker');
  monthPicker.value = selectedMonth;
  monthPicker.title = formatMonthLabel(selectedMonth);
  monthPicker.setAttribute('aria-label', `Selected budget month: ${formatMonthLabel(selectedMonth)}`);
  updateBudgetDraftHint();

  const monthModels = budgetState.visibleMonths.map(month => {
    const draftState = getMonthDraftState(month);
    return {
      month,
      model: buildBudgetPresentationModel(
        budgetState.context,
        month,
        draftState.draftAllocations
      ),
      draftMeta: draftState
    };
  });
  const focusedMonthModel = monthModels.find(({ month }) => month === budgetState.selectedMonth)
    || monthModels[1]
    || monthModels[0];

  renderBudgetSummaryCards(focusedMonthModel.model.summary);
  renderBudgetWorkspaceGrid(monthModels);
  syncBudgetDirtyStatus();
}

function refreshBudgetComputedDisplay() {
  if (!budgetState.context) {
    return;
  }

  const monthModels = budgetState.visibleMonths.map(month => ({
    month,
    model: buildBudgetPresentationModel(
      budgetState.context,
      month,
      getMonthDraftState(month).draftAllocations
    )
  }));
  const focusedMonthModel = monthModels.find(({ month }) => month === budgetState.selectedMonth)
    || monthModels[1]
    || monthModels[0];

  renderBudgetSummaryCards(focusedMonthModel.model.summary);
  monthModels.forEach(({ month, model }) => {
    model.groups.forEach(group => {
      group.rows.forEach(row => {
        const rowElement = document.querySelector(`[data-budget-row-key="${month}::${row.entryKey}"]`);

        if (!rowElement) {
          return;
        }

        const activityElement = rowElement.querySelector('.budget-row-activity');
        const availableElement = rowElement.querySelector('.budget-row-available');
        const carryoverElement = rowElement.querySelector('.budget-row-carryover');
        const amountShell = rowElement.querySelector('.budget-amount-input-shell');
        const progressValueElement = rowElement.querySelector('.budget-savings-progress-copy strong');
        const lineCopyElement = rowElement.querySelector('.budget-line-copy');

        if (carryoverElement) {
          carryoverElement.textContent = formatCurrency(row.carryover);
        }

        if (activityElement) {
          activityElement.textContent = formatCurrency(row.activity);
          activityElement.classList.toggle('negative', row.activity < 0);
          activityElement.classList.toggle('positive', row.activity >= 0);
        }

        if (availableElement) {
          availableElement.textContent = formatCurrency(row.available);
          availableElement.classList.toggle('negative', row.available < 0);
          availableElement.classList.toggle('positive', row.available >= 0);
        }

        if (amountShell) {
          amountShell.classList.toggle('is-dirty', Boolean(row.isDirty));
        }

        if (progressValueElement) {
          progressValueElement.textContent = formatSavingsProgressPercent(row.savingsStatus.progressPercent);
        }

        if (lineCopyElement) {
          lineCopyElement.title = buildBudgetRowMetaText(row);
        }
      });
    });
  });
  syncBudgetDirtyStatus();
}

function updateBudgetDraftEntry(month, entryKey, updates) {
  const draftAllocations = budgetState.draftAllocationsByMonth.get(month);
  const currentDraft = draftAllocations?.get(entryKey);

  if (!currentDraft) {
    return;
  }

  draftAllocations.set(entryKey, {
    ...currentDraft,
    ...updates
  });
}

function resetBudgetDraftForVisibleMonths() {
  if (!budgetState.context) {
    return;
  }

  budgetState.visibleMonths.forEach(month => {
    const nextDraftState = buildBudgetDraftAllocations(budgetState.context, month);
    setMonthDraftState(month, nextDraftState);
  });
  renderBudgetWorkspace();
  syncBudgetDirtyStatus();
}

function toggleBudgetNoteEditor(month, entryKey) {
  const noteKey = `${month}::${entryKey}`;
  budgetState.expandedNoteKey = budgetState.expandedNoteKey === noteKey
    ? null
    : noteKey;
  renderBudgetWorkspace();
}

function focusBudgetAssignedInput(currentInput, direction = 1) {
  const inputs = Array.from(document.querySelectorAll('.budget-assigned-input'))
    .filter(input => !input.disabled && input.offsetParent !== null);
  const currentIndex = inputs.indexOf(currentInput);

  if (currentIndex === -1) {
    return;
  }

  const nextInput = inputs[currentIndex + direction];

  if (!nextInput) {
    return;
  }

  nextInput.focus();
  nextInput.select();
}

function copyBudgetFromPreviousMonth() {
  if (!budgetState.context) {
    return false;
  }

  const month = budgetState.selectedMonth || budgetState.visibleMonths[1] || budgetState.visibleMonths[0];
  const sourceMonth = getNearestPriorBudgetMonth(month, budgetState.context.budgetAllocations);

  if (!sourceMonth) {
    return false;
  }

  const draftAllocations = new Map(budgetState.context.entries.flatMap(group => group.rows).map(row => {
    const sourceAllocation = budgetState.context.savedAllocationLookup.get(
      buildBudgetMonthEntryKey(sourceMonth, row.categoryId, row.subCategoryId)
    );

    return [
      row.entryKey,
      {
        categoryId: row.categoryId,
        subCategoryId: row.subCategoryId,
        assigned: Number(sourceAllocation?.assigned || 0),
        suggestedAssigned: 0,
        note: ''
      }
    ];
  }));

  setMonthDraftState(month, {
    draftAllocations,
    draftSourceMonth: sourceMonth,
    draftSourceLabel: formatMonthLabel(sourceMonth),
    isPrefilled: true
  });

  renderBudgetWorkspace();
  return true;
}

function applyRecurringBudgetDefaults() {
  if (!budgetState.context) {
    return 0;
  }

  let appliedCount = 0;
  budgetState.visibleMonths.forEach(month => {
    budgetState.context.entries.forEach(group => {
      group.rows.forEach(row => {
        if (!row.recurring.enabled) {
          return;
        }

        const monthlyAllocation = getMonthlyRecurringAllocation(month, row.recurring);

        if (!monthlyAllocation) {
          return;
        }

        updateBudgetDraftEntry(month, row.entryKey, {
          assigned: Number(monthlyAllocation.toFixed(2))
        });
        appliedCount += 1;
      });
    });
  });
  renderBudgetWorkspace();
  return appliedCount;
}

async function saveBudgetMonths(months = budgetState.visibleMonths) {
  if (!budgetState.context) {
    return;
  }

  for (const month of months) {
    const draftAllocations = budgetState.draftAllocationsByMonth.get(month) || new Map();
    const existingAllocations = budgetState.context.budgetAllocations
      .filter(allocation => allocation.month === month);

    await Promise.all(existingAllocations.map(allocation => cache.remove('budgetAllocations', { id: allocation.id })));

    const rows = budgetState.context.entries.flatMap(group => group.rows);
    const allocationsToInsert = rows
      .map(row => {
        const assigned = getAssignedAmountForEntry(row, draftAllocations);
        const note = getNoteForEntry(row, draftAllocations).trim();
        const activity = getActivityAmountForEntry(budgetState.context, month, row);

        if (assigned === 0 && !note) {
          return null;
        }

        return new BudgetAllocation(
          month,
          row.categoryId,
          row.subCategoryId,
          assigned,
          activity,
          note
        );
      })
      .filter(Boolean);

    await Promise.all(allocationsToInsert.map(allocation => cache.insert('budgetAllocations', allocation)));
  }

  await loadBudgetView({ month: budgetState.selectedMonth });
  budgetDirtyToastActive = false;
  clearStatus();
}

async function loadBudgetView(options = {}) {
  const targetMonth = options.month || budgetState.selectedMonth || getCurrentMonthValue();
  const [accounts, categories, subCategories, transactions, budgetAllocations] = await Promise.all([
    cache.getAll('accounts'),
    cache.getAll('categories'),
    cache.getAll('subCategories'),
    cache.getAll('transactions'),
    cache.getAll('budgetAllocations')
  ]);
  const entries = buildBudgetEntryDefinitions(categories, subCategories, transactions, budgetAllocations);
  const visibleMonths = getVisibleBudgetMonths(targetMonth);
  const centeredMonth = visibleMonths[1] || targetMonth;

  budgetState.selectedMonth = centeredMonth;
  budgetState.loadedMonth = centeredMonth;
  budgetState.visibleMonths = visibleMonths;
  const activeBudgetAccounts = accounts.filter(isBudgetAccountInScope);
  budgetState.context = {
    accounts: activeBudgetAccounts,
    activeBudgetAccountIds: new Set(activeBudgetAccounts.map(account => account.id)),
    budgetAllocations,
    entries,
    transactions,
    savedAllocationLookup: buildSavedAllocationLookup(budgetAllocations),
    activityLookup: buildBudgetActivityLookup(transactions)
  };
  budgetState.draftAllocationsByMonth = new Map();
  budgetState.draftMetaByMonth = new Map();
  visibleMonths.forEach(month => {
    setMonthDraftState(month, buildBudgetDraftAllocations(budgetState.context, month));
  });
  budgetState.expandedNoteKey = null;

  renderBudgetWorkspace();
  syncBudgetDirtyStatus();
}

function updateSectionHeader(sectionId) {
  const copy = sectionCopy[sectionId];
  document.getElementById('section-title').textContent = copy.title;
  document.getElementById('section-subtitle').textContent = copy.subtitle;
}

async function refreshDashboard() {
  const [accounts, categories, subCategories] = await Promise.all([
    cache.getAll('accounts'),
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);

  updateDashboardStats(accounts, categories, subCategories);
}

function updateDashboardStats(accounts, categories, subCategories) {
  if (accounts) {
    const activeAccounts = accounts.filter(acc => acc.active !== false);
    const totalCash = activeAccounts.reduce((sum, acc) => sum + Number(acc.currentBalance || 0), 0);

    document.getElementById('total-cash').textContent = formatCurrency(totalCash);
    document.getElementById('account-count').textContent = activeAccounts.length.toString();
  }

  if (categories) {
    document.getElementById('category-count').textContent = categories.length.toString();
  }

  if (subCategories) {
    const label = subCategories.length === 1 ? 'subcategory' : 'subcategories';
    document.getElementById('category-summary').textContent = `${subCategories.length} ${label} ready for assignment.`;
  }
}

function clearStatus() {
  const statusPill = document.getElementById('status-pill');
  const statusMessage = document.getElementById('status-pill-message');

  if (!statusPill) {
    return;
  }

  if (statusToastTimeoutId) {
    clearTimeout(statusToastTimeoutId);
    statusToastTimeoutId = null;
  }

  statusPill.classList.remove('visible', 'persistent');
  if (statusMessage) {
    statusMessage.textContent = '';
  }
}

function setStatus(message, options = {}) {
  const statusPill = document.getElementById('status-pill');
  const statusMessage = document.getElementById('status-pill-message');

  if (!statusPill || !statusMessage) {
    return;
  }

  if (statusToastTimeoutId) {
    clearTimeout(statusToastTimeoutId);
  }

  statusMessage.textContent = message;
  statusPill.classList.add('visible');
  statusPill.classList.toggle('persistent', Boolean(options.persist));

  if (options.persist) {
    statusToastTimeoutId = null;
    return;
  }

  statusToastTimeoutId = window.setTimeout(() => {
    statusPill.classList.remove('visible', 'persistent');
    statusMessage.textContent = '';
    statusToastTimeoutId = null;
  }, 3000);
}

function getActionIcon(type) {
  if (type === 'save') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 2v5h10V6.5L15.5 5H6Zm2 0h6v3H8V5Zm0 9v5h8v-5H8Z"></path>
      </svg>
    `;
  }

  if (type === 'close') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m18.3 5.71-1.41-1.42L12 9.17 7.11 4.29 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.42L12 12l4.89 4.91 1.41-1.42-4.89-4.89 4.89-4.89Z"></path>
      </svg>
    `;
  }

  if (type === 'undo') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5V2L7 6l5 4V7c3.31 0 6 2.69 6 6a6 6 0 0 1-6 6H6v2h6a8 8 0 0 0 0-16Z"></path>
      </svg>
    `;
  }

  if (type === 'drag') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 16a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM15 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM15 16a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"></path>
      </svg>
    `;
  }

  if (type === 'chevron') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41Z"></path>
      </svg>
    `;
  }

  if (type === 'trash') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v7h-2v-7Zm4 0h2v7h-2v-7ZM7 10h2v7H7v-7Zm-1 10h12l1-12H5l1 12Z"></path>
      </svg>
    `;
  }

  if (type === 'note') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h10l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm9 1.5V8h3.5L14 4.5ZM7 11h10v1.8H7V11Zm0 4h10v1.8H7V15Z"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 17.25 9.88-9.88 3.75 3.75L6.75 21H3v-3.75Zm11.06-11.06 1.41-1.41a2 2 0 0 1 2.83 0l.94.94a2 2 0 0 1 0 2.83l-1.41 1.41-3.77-3.78Z"></path>
    </svg>
  `;
}

function setAccountFormMode(isEditing) {
  const submitButton = document.getElementById('account-submit');
  const cancelButton = document.getElementById('account-cancel');

  submitButton.textContent = isEditing ? 'Update Account' : 'Save Account';
  cancelButton.classList.toggle('hidden', !isEditing);
}

function resetAccountForm() {
  editingAccountId = null;
  document.getElementById('account-form').reset();
  document.getElementById('acc-id').value = '';
  document.getElementById('acc-type').value = 'checking';
  document.getElementById('acc-off').checked = getDefaultOffBudgetForAccountType('checking');
  document.getElementById('acc-active').checked = true;
  setAccountFormMode(false);
}

function syncAccountTypeDefaultBudgeting() {
  const selectedType = normalizeAccountType(document.getElementById('acc-type').value);
  document.getElementById('acc-off').checked = getDefaultOffBudgetForAccountType(selectedType);
}

function readRecurringFormValues() {
  const cadence = normalizeRecurringCadence(document.getElementById('cat-recurring-cadence').value);

  return {
    enabled: cadence !== 'never',
    amount: parseFloat(document.getElementById('cat-amount').value) || 0,
    cadence
  };
}

function populateRecurringFormValues(recurring = {}) {
  const normalizedRecurring = getBudgetRecurring(recurring);
  document.getElementById('cat-amount').value = Number(normalizedRecurring.amount || 0) || '';
  document.getElementById('cat-recurring-cadence').value = normalizedRecurring.cadence;
}

function readSavingsBucketFormValues() {
  const bucketMode = normalizeBudgetBucketMode(document.getElementById('cat-bucket-mode').value);
  const savingsGoalAmount = parseFloat(document.getElementById('cat-savings-goal-amount').value) || 0;

  return {
    bucketMode,
    savingsGoalAmount: bucketMode === 'save' ? savingsGoalAmount : 0
  };
}

function populateSavingsBucketFormValues(record = {}) {
  document.getElementById('cat-bucket-mode').value = getBudgetBucketMode(record);
  document.getElementById('cat-savings-goal-amount').value = getSavingsGoalAmount(record) || '';
  syncSavingsBucketFormState();
}

function syncSavingsBucketFormState() {
  const savingsGoalField = document.getElementById('cat-savings-goal-field');
  const isSavingsMode = normalizeBudgetBucketMode(document.getElementById('cat-bucket-mode').value) === 'save';
  savingsGoalField.classList.toggle('hidden', !isSavingsMode);
}

function setCategoryFormMode(mode, context = {}) {
  categoryFormMode = mode;
  document.getElementById('category-form-mode').value = mode;

  const eyebrow = document.getElementById('category-form-eyebrow');
  const title = document.getElementById('category-form-title');
  const nameLabel = document.getElementById('cat-name-label');
  const noteLabel = document.getElementById('cat-note-label');
  const offBudgetLabel = document.getElementById('cat-off-budget-label');
  const subcatNameLabel = document.getElementById('subcat-name-label');
  const submitButton = document.getElementById('category-submit');
  const cancelButton = document.getElementById('category-cancel');
  const categoryNameInput = document.getElementById('cat-name');
  const subcatFields = document.getElementById('subcat-fields');
  const subcatNameInput = document.getElementById('subcat-name');
  const subcatNameField = document.getElementById('subcat-name-field');

  if (mode === 'edit-category') {
    eyebrow.textContent = 'Edit Category';
    title.textContent = 'Update this category group';
    nameLabel.textContent = 'Category Group';
    noteLabel.textContent = 'Category Note';
      offBudgetLabel.textContent = 'Mark this category group as off budget';
      submitButton.textContent = 'Update Category';
      categoryNameInput.readOnly = false;
      subcatFields.classList.remove('hidden');
      subcatNameField.classList.add('hidden');
      subcatNameInput.required = false;
    } else if (mode === 'add-subcategory') {
    eyebrow.textContent = 'Add Subcategory';
    title.textContent = `Add a subcategory to ${context.categoryName || 'this group'}`;
    nameLabel.textContent = 'Parent Category';
    noteLabel.textContent = 'Subcategory Note';
    offBudgetLabel.textContent = 'Mark this subcategory as off budget';
    subcatNameLabel.textContent = 'Subcategory Name';
      submitButton.textContent = 'Save Subcategory';
      categoryNameInput.readOnly = true;
      subcatFields.classList.remove('hidden');
      subcatNameField.classList.remove('hidden');
      subcatNameInput.required = true;
    } else if (mode === 'edit-subcategory') {
    eyebrow.textContent = 'Edit Subcategory';
    title.textContent = `Update ${context.subCategoryName || 'this subcategory'}`;
    nameLabel.textContent = 'Parent Category';
    noteLabel.textContent = 'Subcategory Note';
    offBudgetLabel.textContent = 'Mark this subcategory as off budget';
    subcatNameLabel.textContent = 'Subcategory Name';
      submitButton.textContent = 'Update Subcategory';
      categoryNameInput.readOnly = true;
      subcatFields.classList.remove('hidden');
      subcatNameField.classList.remove('hidden');
      subcatNameInput.required = true;
    } else {
    eyebrow.textContent = 'Add Category';
    title.textContent = 'Shape your spending plan';
    nameLabel.textContent = 'Category Group';
    noteLabel.textContent = 'Note';
    offBudgetLabel.textContent = 'Mark this category group as off budget';
    subcatNameLabel.textContent = 'First Subcategory';
      submitButton.textContent = 'Save Category';
      categoryNameInput.readOnly = false;
      subcatFields.classList.remove('hidden');
      subcatNameField.classList.remove('hidden');
      subcatNameInput.required = false;
    }

  cancelButton.classList.toggle('hidden', mode === 'create-category');
}

function resetCategoryForm() {
  categoryFormMode = 'create-category';
  document.getElementById('category-form').reset();
  document.getElementById('cat-id').value = '';
  document.getElementById('subcat-id').value = '';
  document.getElementById('cat-name').readOnly = false;
  document.getElementById('subcat-fields').classList.remove('hidden');
  document.getElementById('subcat-name-field').classList.remove('hidden');
  document.getElementById('subcat-name').required = false;
  populateSavingsBucketFormValues({ bucketMode: 'spend', savingsGoalAmount: 0 });
  populateRecurringFormValues({ enabled: false, amount: 0, cadence: 'never' });
  setCategoryFormMode('create-category');
}

function sortItemsForDisplay(items) {
  const hasManualSort = items.some(item => Number.isFinite(item.sortOrder));

  return items.slice().sort((left, right) => {
    if (hasManualSort) {
      const leftOrder = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
    }

    return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
  });
}

async function getNextSortOrder(collection) {
  const items = await cache.getAll(collection);
  const numericOrders = items
    .map(item => item.sortOrder)
    .filter(value => Number.isFinite(value));

  if (!numericOrders.length) {
    return null;
  }

  return Math.max(...numericOrders) + 1;
}

async function getNextGroupedSortOrder(collection, groupField, groupValue) {
  const items = await cache.getAll(collection);
  const groupedItems = items.filter(item => item[groupField] === groupValue);
  const numericOrders = groupedItems
    .map(item => item.sortOrder)
    .filter(value => Number.isFinite(value));

  if (!numericOrders.length) {
    return null;
  }

  return Math.max(...numericOrders) + 1;
}

async function persistSortOrder(collection, orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) => cache.update(collection, { id }, { $set: { sortOrder: index } }))
  );
}

function destroySortableInstance(instance) {
  if (instance) {
    instance.destroy();
  }
}

function destroySortableInstances(instances) {
  instances.forEach(destroySortableInstance);
  return [];
}

function initializeBudgetListSortable() {
  const list = document.getElementById('budget-list');

  destroySortableInstance(budgetListSortable);

  if (!list || list.children.length < 2) {
    budgetListSortable = null;
    return;
  }

  budgetListSortable = Sortable.create(list, {
    animation: 180,
    draggable: '.sortable-card',
    filter: 'button, input, textarea, select',
    preventOnFilter: false,
    onEnd: async () => {
      if (!sessionState.activeUser) {
        return;
      }

      const orderedIds = Array.from(list.querySelectorAll('.sortable-card')).map(card => card.dataset.itemId);
      profileService.updateBudgetSortOrder(sessionState.activeUser.id, orderedIds);
      renderBudgetList();
      setStatus('Updated budget order');
    }
  });
}

function initializeAccountsSortable() {
  const list = document.getElementById('accounts-list');

  destroySortableInstance(accountsSortable);

  if (!list || list.children.length < 2) {
    accountsSortable = null;
    return;
  }

  accountsSortable = Sortable.create(list, {
    animation: 180,
    draggable: '.sortable-card',
    filter: 'button, input, textarea, select',
    preventOnFilter: false,
    onEnd: async () => {
      const orderedIds = Array.from(list.querySelectorAll('.sortable-card')).map(card => card.dataset.itemId);
      await persistSortOrder('accounts', orderedIds);
      await loadAccounts();
      setStatus('Updated account order');
    }
  });
}

function initializeCategoriesSortable() {
  const list = document.getElementById('categories-list');

  destroySortableInstance(categoriesSortable);

  if (!list || list.children.length < 2) {
    categoriesSortable = null;
    return;
  }

  categoriesSortable = Sortable.create(list, {
    animation: 180,
    draggable: '.sortable-card',
    filter: 'button, input, textarea, select',
    preventOnFilter: false,
    onEnd: async () => {
      const orderedIds = Array.from(list.querySelectorAll('.sortable-card')).map(card => card.dataset.itemId);
      await persistSortOrder('categories', orderedIds);
      await loadCategories();
      await loadTransactions();
      await loadBudgetView();
      setStatus('Updated category order');
    }
  });
}

function initializeSubCategorySortables() {
  subCategorySortables = destroySortableInstances(subCategorySortables);

  document.querySelectorAll('.sub-list').forEach(list => {
    if (list.children.length < 2) {
      return;
    }

    const categoryId = list.dataset.categoryId;

    const sortable = Sortable.create(list, {
      animation: 180,
      draggable: '.sortable-sub-item',
      filter: 'button, input, textarea, select',
      preventOnFilter: false,
      onEnd: async () => {
        const orderedIds = Array.from(list.querySelectorAll('.sortable-sub-item')).map(item => item.dataset.itemId);
        await persistSortOrder('subCategories', orderedIds);
        await loadCategories();
        await loadTransactions();
        await loadBudgetView();
        setStatus('Updated subcategory order');
      }
    });

    sortable.categoryId = categoryId;
    subCategorySortables.push(sortable);
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(amount || 0));
}

function formatCompactCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(amount || 0));
}

function padDatePart(value) {
  return String(value).padStart(2, '0');
}

function buildLocalDateValue(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function buildLocalMonthValue(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function parseDateValue(value) {
  if (typeof value !== 'string') {
    return new Date(value);
  }

  const trimmedValue = value.trim();
  const dateOnlyMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(trimmedValue);
}

function formatDate(value) {
  const parsed = parseDateValue(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getDateFilterCandidates(value) {
  const parsed = parseDateValue(value);

  if (Number.isNaN(parsed.getTime())) {
    return [value];
  }

  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const year = parsed.getFullYear();
  const shortYear = String(year).slice(-2);
  const monthPadded = padDatePart(month);
  const dayPadded = padDatePart(day);

  return Array.from(new Set([
    String(value || ''),
    formatDate(value),
    `${month}/${day}/${year}`,
    `${month}/${day}/${shortYear}`,
    `${monthPadded}/${dayPadded}/${year}`,
    `${monthPadded}/${dayPadded}/${shortYear}`,
    `${month}-${day}-${year}`,
    `${month}-${day}-${shortYear}`,
    `${monthPadded}-${dayPadded}-${year}`,
    `${monthPadded}-${dayPadded}-${shortYear}`
  ]));
}

function formatMonthShortLabel(monthValue) {
  const [year, month] = String(monthValue).split('-').map(Number);
  const date = new Date(year, month - 1, 1);

  return date.toLocaleDateString('en-US', {
    month: 'short'
  });
}

function getTableSortIndicator(tableState, sortKey) {
  if (tableState.sortKey !== sortKey) {
    return '';
  }

  return tableState.sortDirection === 'asc'
    ? ' <span class="transaction-sort-indicator" aria-hidden="true">&#9652;</span>'
    : ' <span class="transaction-sort-indicator" aria-hidden="true">&#9662;</span>';
}

function getActiveFilterCount(filters) {
  return Object.values(filters).filter(value => String(value || '').trim()).length;
}

function getFilterButtonLabel(baseLabel, filters) {
  const count = getActiveFilterCount(filters);
  return count ? `${baseLabel} (${count})` : baseLabel;
}

function normalizeTransferStatus(status) {
  return status === 'completed' ? 'completed' : 'scheduled';
}

function getTransferStatusLabel(status) {
  return normalizeTransferStatus(status) === 'completed' ? 'Completed' : 'Scheduled';
}

function buildTransferTransactionPayees(originAccount, destinationAccount) {
  return {
    originPayee: `Transfer to ${destinationAccount?.name || 'destination account'}`,
    destinationPayee: `Transfer from ${originAccount?.name || 'origin account'}`
  };
}

function getTransferDisplayContext(transaction, transfer, accountMap) {
  if (!transaction.transferId) {
    return null;
  }

  const originAccount = transfer ? accountMap.get(transfer.originAccountId) : null;
  const destinationAccount = transfer ? accountMap.get(transfer.destinationAccountId) : null;
  const payees = buildTransferTransactionPayees(originAccount, destinationAccount);
  const isOriginSide = transfer
    ? transfer.originTransactionId === transaction.id
    : Number(transaction.amount || 0) < 0;

  return {
    payee: isOriginSide ? payees.originPayee : payees.destinationPayee,
    category: 'Transfer',
    subCategory: '',
    memo: transfer ? transfer.memo || '' : transaction.memo || '',
    isOriginSide
  };
}

function buildTransactionViewModel(transaction, accountMap, categoryMap, subCategoryMap, transferMap = new Map()) {
  const account = accountMap.get(transaction.accountId);
  const category = categoryMap.get(transaction.categoryId);
  const subCategory = transaction.subCategoryId ? subCategoryMap.get(transaction.subCategoryId) : null;
  const transfer = transaction.transferId ? transferMap.get(transaction.transferId) : null;
  const transferContext = getTransferDisplayContext(transaction, transfer, accountMap);
  const runningBalanceValue = Number(transaction.runningBalance);
  const balanceLabel = transaction.pending
    ? 'Pending'
    : (Number.isFinite(runningBalanceValue) ? formatCurrency(runningBalanceValue) : '');
  const amountValue = Number(transaction.amount || 0);
  const inflowValue = amountValue > 0 ? amountValue : 0;
  const outflowValue = amountValue < 0 ? Math.abs(amountValue) : 0;
  const payeeLabel = transferContext?.payee || transaction.payee || '';
  const categoryLabel = transferContext?.category || (category ? category.name : 'Uncategorized');
  const subCategoryLabel = transferContext?.subCategory || (subCategory ? subCategory.name : '');
  const memoLabel = transferContext?.memo ?? (transaction.memo || '');

  return {
    transaction,
    values: {
      date: formatDate(transaction.date),
      account: account ? account.name : 'Unknown account',
      payee: payeeLabel,
      category: categoryLabel,
      subCategory: subCategoryLabel,
      memo: memoLabel,
      inflow: inflowValue ? formatCurrency(inflowValue) : '',
      outflow: outflowValue ? formatCurrency(outflowValue) : '',
      balance: balanceLabel
    },
    filterValues: {
      date: getDateFilterCandidates(transaction.date),
      account: [account ? account.name : 'Unknown account'],
      payee: [payeeLabel],
      category: [categoryLabel],
      subCategory: [subCategoryLabel],
      memo: [memoLabel],
      inflow: inflowValue ? [inflowValue, formatCurrency(inflowValue)] : [''],
      outflow: outflowValue ? [outflowValue, formatCurrency(outflowValue)] : [''],
      balance: transaction.pending
        ? ['Pending']
        : [Number.isFinite(runningBalanceValue) ? runningBalanceValue : '', Number.isFinite(runningBalanceValue) ? formatCurrency(runningBalanceValue) : '']
    },
    raw: {
      date: parseDateValue(transaction.date).getTime(),
      account: account ? account.name : '',
      payee: payeeLabel,
      category: categoryLabel,
      subCategory: subCategoryLabel,
      memo: memoLabel,
      inflow: inflowValue,
      outflow: outflowValue,
      balance: transaction.pending
        ? Number.NEGATIVE_INFINITY
        : (Number.isFinite(runningBalanceValue) ? runningBalanceValue : Number.NEGATIVE_INFINITY)
    }
  };
}

function matchesTransactionFilter(value, filterValue) {
  if (!filterValue) {
    return true;
  }

  const normalizedFilter = filterValue.trim().toLowerCase();
  const candidates = Array.isArray(value) ? value : [value];

  return candidates.some(candidate => String(candidate || '').toLowerCase().includes(normalizedFilter));
}

function getTransactionCreatedOrder(transaction) {
  const rawId = String(transaction?.id || '');
  const timestamp = Number(rawId.split('-')[0]);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getFilteredAndSortedTransactions(transactions, accountMap, categoryMap, subCategoryMap, transferMap = new Map()) {
  const models = transactions.map(transaction => buildTransactionViewModel(transaction, accountMap, categoryMap, subCategoryMap, transferMap));
  const filteredModels = models.filter(model => Object.entries(transactionTableState.filters).every(([key, filterValue]) => {
    if (!filterValue) {
      return true;
    }

    return matchesTransactionFilter(model.filterValues[key], filterValue);
  }));

  const direction = transactionTableState.sortDirection === 'asc' ? 1 : -1;
  const sortKey = transactionTableState.sortKey;

  filteredModels.sort((left, right) => {
    const leftValue = left.raw[sortKey];
    const rightValue = right.raw[sortKey];

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      if (leftValue !== rightValue) {
        return (leftValue - rightValue) * direction;
      }
    } else {
      const comparison = String(leftValue || '').localeCompare(String(rightValue || ''), undefined, { sensitivity: 'base' });

      if (comparison !== 0) {
        return comparison * direction;
      }
    }

    const createdOrderDifference = getTransactionCreatedOrder(left.transaction) - getTransactionCreatedOrder(right.transaction);

    if (createdOrderDifference !== 0) {
      return createdOrderDifference * direction;
    }

    return String(left.transaction.id).localeCompare(String(right.transaction.id));
  });

  return filteredModels;
}

function buildTransferViewModel(transfer, accountMap) {
  const originAccount = accountMap.get(transfer.originAccountId);
  const destinationAccount = accountMap.get(transfer.destinationAccountId);
  const normalizedStatus = normalizeTransferStatus(transfer.status);

  return {
    transfer,
    values: {
      date: formatDate(transfer.transferDate),
      fromAccount: originAccount ? originAccount.name : 'Unknown account',
      toAccount: destinationAccount ? destinationAccount.name : 'Unknown account',
      amount: formatCurrency(transfer.amount),
      status: getTransferStatusLabel(normalizedStatus),
      memo: transfer.memo || ''
    },
    filterValues: {
      date: getDateFilterCandidates(transfer.transferDate),
      fromAccount: [originAccount ? originAccount.name : 'Unknown account'],
      toAccount: [destinationAccount ? destinationAccount.name : 'Unknown account'],
      amount: [Number(transfer.amount || 0), formatCurrency(transfer.amount)],
      status: [normalizedStatus, getTransferStatusLabel(normalizedStatus)],
      memo: [transfer.memo || '']
    },
    raw: {
      date: parseDateValue(transfer.transferDate).getTime(),
      fromAccount: originAccount ? originAccount.name : '',
      toAccount: destinationAccount ? destinationAccount.name : '',
      amount: Number(transfer.amount || 0),
      status: normalizedStatus,
      memo: transfer.memo || ''
    }
  };
}

function getFilteredAndSortedTransfers(transfers, accountMap) {
  const models = transfers.map(transfer => buildTransferViewModel(transfer, accountMap));
  const filteredModels = models.filter(model => Object.entries(transferTableState.filters).every(([key, filterValue]) => {
    if (!filterValue) {
      return true;
    }

    return matchesTransactionFilter(model.filterValues[key], filterValue);
  }));

  const direction = transferTableState.sortDirection === 'asc' ? 1 : -1;
  const sortKey = transferTableState.sortKey;

  filteredModels.sort((left, right) => {
    const leftValue = left.raw[sortKey];
    const rightValue = right.raw[sortKey];

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      if (leftValue !== rightValue) {
        return (leftValue - rightValue) * direction;
      }
    } else {
      const comparison = String(leftValue || '').localeCompare(String(rightValue || ''), undefined, { sensitivity: 'base' });

      if (comparison !== 0) {
        return comparison * direction;
      }
    }

    return String(left.transfer.id).localeCompare(String(right.transfer.id));
  });

  return filteredModels;
}

function getTodayDateValue() {
  return buildLocalDateValue(new Date());
}

function getCurrentMonthValue() {
  return buildLocalMonthValue(new Date());
}

const RECURRING_CADENCE_LABELS = {
  never: 'Never',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly'
};

const BUDGET_BUCKET_MODE_LABELS = {
  spend: 'Spending',
  save: 'Savings'
};

const ACCOUNT_TYPE_LABELS = {
  cash: 'Cash',
  checking: 'Checking',
  creditCard: 'Credit Card',
  savings: 'Savings',
  investment: 'Investment',
  asset: 'Asset'
};

const ACCOUNT_TYPE_DEFAULT_OFF_BUDGET = {
  cash: false,
  checking: false,
  creditCard: false,
  savings: false,
  investment: true,
  asset: true
};

function normalizeAccountType(rawType) {
  if (Object.prototype.hasOwnProperty.call(ACCOUNT_TYPE_LABELS, rawType)) {
    return rawType;
  }

  return 'checking';
}

function getDefaultOffBudgetForAccountType(accountType) {
  return ACCOUNT_TYPE_DEFAULT_OFF_BUDGET[normalizeAccountType(accountType)];
}

function inferAccountType(account = {}) {
  if (account.accountType) {
    return normalizeAccountType(account.accountType);
  }

  const normalizedName = String(account.name || '').trim().toLowerCase();

  if (normalizedName.includes('credit')) {
    return 'creditCard';
  }

  if (normalizedName.includes('saving')) {
    return 'savings';
  }

  if (normalizedName.includes('cash')) {
    return 'cash';
  }

  if (normalizedName.includes('invest') || normalizedName.includes('brokerage') || normalizedName.includes('retirement')) {
    return 'investment';
  }

  if (normalizedName.includes('asset') || normalizedName.includes('house') || normalizedName.includes('car') || normalizedName.includes('property')) {
    return 'asset';
  }

  return 'checking';
}

function getAccountTypeLabel(account = {}) {
  const accountType = inferAccountType(account);
  return ACCOUNT_TYPE_LABELS[accountType] || ACCOUNT_TYPE_LABELS.checking;
}

function normalizeRecurringCadence(rawCadence) {
  if (Object.prototype.hasOwnProperty.call(RECURRING_CADENCE_LABELS, rawCadence)) {
    return rawCadence;
  }

  return 'never';
}

function normalizeBudgetBucketMode(rawMode) {
  return rawMode === 'save' ? 'save' : 'spend';
}

function getDaysInMonth(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function getMonthlyRecurringAllocation(monthValue, recurring) {
  if (!recurring.enabled || !Number.isFinite(Number(recurring.amount)) || Number(recurring.amount) <= 0) {
    return 0;
  }

  const amount = Number(recurring.amount);
  const cadence = normalizeRecurringCadence(recurring.cadence);

  if (cadence === 'weekly') {
    return amount * (getDaysInMonth(monthValue) / 7);
  }

  if (cadence === 'quarterly') {
    return amount / 3;
  }

  if (cadence === 'yearly') {
    return amount / 12;
  }

  return amount;
}

function getBudgetBucketMode(record) {
  return normalizeBudgetBucketMode(record?.bucketMode);
}

function isSavingsBucket(record) {
  return getBudgetBucketMode(record) === 'save';
}

function getSavingsGoalAmount(record) {
  return Number(record?.savingsGoalAmount || 0);
}

function buildSavingsBucketStatus(savedAmount, goalAmount) {
  const normalizedSavedAmount = Number(savedAmount || 0);
  const normalizedGoalAmount = Number(goalAmount || 0);
  const remainingAmount = Math.max(0, normalizedGoalAmount - normalizedSavedAmount);
  const progressPercent = normalizedGoalAmount > 0
    ? Math.min(100, Math.max(0, (normalizedSavedAmount / normalizedGoalAmount) * 100))
    : 0;

  return {
    savedAmount: normalizedSavedAmount,
    goalAmount: normalizedGoalAmount,
    remainingAmount,
    progressPercent
  };
}

function formatSavingsProgressPercent(progressPercent) {
  const normalizedPercent = Number(progressPercent || 0);

  if (normalizedPercent <= 0) {
    return '0%';
  }

  if (normalizedPercent < 1) {
    return `${normalizedPercent.toFixed(1)}%`;
  }

  return `${Math.round(normalizedPercent)}%`;
}

function buildBudgetRowMetaText(row) {
  return [
    row.bucketMode === 'save' && row.savingsGoalAmount > 0 ? `Goal ${formatCurrency(row.savingsGoalAmount)}` : '',
    row.bucketMode === 'save' ? `Saved ${formatCurrency(row.savingsStatus.savedAmount)}` : '',
    row.bucketMode === 'save' && row.savingsGoalAmount > 0 ? `To go ${formatCurrency(row.savingsStatus.remainingAmount)}` : '',
    row.recurring.enabled ? `Recurring ${RECURRING_CADENCE_LABELS[row.recurring.cadence].toLowerCase()} ${formatCurrency(row.recurring.amount)}` : '',
    row.note
  ].filter(Boolean).join(' | ');
}

function getSavingsBucketLabel(record) {
  if (!isSavingsBucket(record)) {
    return '';
  }

  const goalAmount = getSavingsGoalAmount(record);
  return goalAmount > 0
    ? `Savings goal ${formatCurrency(goalAmount)}`
    : 'Savings bucket';
}

function getSubCategoryMeta(subCategory) {
  const segments = [];

  const recurringLabel = getBudgetRecurringLabel(subCategory);

  if (recurringLabel) {
    segments.push(recurringLabel);
  }

  const savingsLabel = getSavingsBucketLabel(subCategory);

  if (savingsLabel) {
    segments.push(savingsLabel);
  }

  if (subCategory.note) {
    segments.push(subCategory.note);
  }

  return segments.join(' | ') || 'No recurring amount set yet.';
}

function getBudgetRecurring(record) {
  const cadence = normalizeRecurringCadence(record.recurringCadence ?? record.cadence);

  return {
    enabled: cadence !== 'never',
    amount: Number(record.recurringAmount ?? record.amount ?? 0),
    cadence
  };
}

function getBudgetRecurringLabel(record) {
  const recurring = getBudgetRecurring(record);

  if (!recurring.enabled) {
    return '';
  }

  return `Recurring ${RECURRING_CADENCE_LABELS[recurring.cadence].toLowerCase()} ${formatCurrency(recurring.amount)}`;
}

function buildSelectOptions(items, selectedValue, placeholder) {
  return [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(items.map(item => `
      <option value="${item.id}" ${item.id === selectedValue ? 'selected' : ''}>${escapeHtml(item.name)}</option>
    `))
    .join('');
}

function renderTransactionEditorRow({ rowMode, transaction = null, accounts, categories, subCategories }) {
  const transactionId = transaction?.id || '';
  const dateValue = transaction?.date || getTodayDateValue();
  const accountId = transaction?.accountId || '';
  const payee = transaction?.payee || '';
  const categoryId = transaction?.categoryId || '';
  const matchingSubCategories = sortItemsForDisplay(
    subCategories.filter(subCategory => subCategory.categoryId === categoryId)
  );
  const subCategoryOptions = ['<option value="">No subcategory</option>']
    .concat(matchingSubCategories.map(subCategory => `
      <option value="${subCategory.id}" ${subCategory.id === transaction?.subCategoryId ? 'selected' : ''}>${escapeHtml(subCategory.name)}</option>
    `))
    .join('');
  const memo = transaction?.memo || '';
  const inflowAmount = transaction && Number(transaction.amount || 0) > 0
    ? Math.abs(Number(transaction.amount || 0))
    : '';
  const outflowAmount = transaction && Number(transaction.amount || 0) < 0
    ? Math.abs(Number(transaction.amount || 0))
    : '';
  const isEditRow = rowMode === 'edit';

  return `
    <div class="transaction-row transaction-editor-row ${isEditRow ? 'is-editing' : 'is-creating'}" data-row-mode="${rowMode}" data-transaction-id="${transactionId}">
      <div><input type="date" class="txn-input" data-field="date" value="${escapeHtml(dateValue)}"></div>
      <div><select class="txn-input" data-field="accountId">${buildSelectOptions(accounts, accountId, 'Select')}</select></div>
      <div><input type="text" class="txn-input" data-field="payee" value="${escapeHtml(payee)}" placeholder="Payee"></div>
      <div><select class="txn-input txn-category-select" data-field="categoryId">${buildSelectOptions(categories, categoryId, 'Select')}</select></div>
      <div><select class="txn-input txn-subcategory-select" data-field="subCategoryId" ${!categoryId || !matchingSubCategories.length ? 'disabled' : ''}>${subCategoryOptions}</select></div>
      <div><input type="text" class="txn-input" data-field="memo" value="${escapeHtml(memo)}" placeholder="Memo"></div>
      <div><input type="number" class="txn-input txn-flow-input" data-field="outflow" value="${escapeHtml(String(outflowAmount))}" step="0.01" min="0" placeholder="0.00" aria-label="Transaction outflow"></div>
      <div><input type="number" class="txn-input txn-flow-input" data-field="inflow" value="${escapeHtml(String(inflowAmount))}" step="0.01" min="0" placeholder="0.00" aria-label="Transaction inflow"></div>
      <div class="transaction-muted-cell">Auto</div>
      <div class="transaction-cleared-cell">
        <input type="checkbox" class="transaction-cleared-checkbox" disabled aria-label="Transaction cleared">
      </div>
      <div class="transaction-actions">
        <button type="button" class="icon-button" onclick="${isEditRow ? `saveTransactionEdit('${transactionId}')` : 'createTransaction()'}" aria-label="${isEditRow ? 'Save transaction' : 'Add transaction'}" title="${isEditRow ? 'Save transaction' : 'Add transaction'}">
          ${getActionIcon('save')}
        </button>
        <button type="button" class="icon-button ${isEditRow ? '' : 'ghost'}" onclick="${isEditRow ? 'cancelTransactionEdit()' : 'clearTransactionDraft()'}" aria-label="${isEditRow ? 'Cancel edit' : 'Clear row'}" title="${isEditRow ? 'Cancel edit' : 'Clear row'}">
          ${getActionIcon(isEditRow ? 'close' : 'undo')}
        </button>
      </div>
    </div>
  `;
}

function renderTransactionDisplayRow(transaction, accountMap, categoryMap, subCategoryMap, transferMap = new Map()) {
  const account = accountMap.get(transaction.accountId);
  const category = categoryMap.get(transaction.categoryId);
  const subCategory = transaction.subCategoryId ? subCategoryMap.get(transaction.subCategoryId) : null;
  const transfer = transaction.transferId ? transferMap.get(transaction.transferId) : null;
  const transferContext = getTransferDisplayContext(transaction, transfer, accountMap);
  const amountValue = Number(transaction.amount || 0);
  const runningBalance = transaction.pending
    ? 'Pending'
    : (Number.isFinite(Number(transaction.runningBalance))
      ? formatCurrency(transaction.runningBalance)
      : '');
  const payeeLabel = transferContext?.payee || transaction.payee || '';
  const categoryLabel = transferContext?.category || (category ? category.name : 'Uncategorized');
  const subCategoryLabel = transferContext?.subCategory || (subCategory ? subCategory.name : '');
  const memoLabel = transferContext?.memo ?? (transaction.memo || '');
  const actionsMarkup = transaction.transferId
    ? `
      <button type="button" class="icon-button" onclick="manageTransfer('${transaction.transferId}')" aria-label="Manage transfer" title="Manage transfer">
        ${getActionIcon('edit')}
      </button>
    `
    : `
      <button type="button" class="icon-button" onclick="editTransaction('${transaction.id}')" aria-label="Edit transaction" title="Edit transaction">
        ${getActionIcon('edit')}
      </button>
      <button type="button" class="icon-button danger" onclick="confirmDeleteTransaction('${transaction.id}')" aria-label="Delete transaction" title="Delete transaction">
        ${getActionIcon('trash')}
      </button>
    `;

  return `
    <div class="transaction-row ${transaction.pending ? 'is-pending' : ''}" data-transaction-id="${transaction.id}">
      <div>${escapeHtml(formatDate(transaction.date))}</div>
      <div>${escapeHtml(account ? account.name : 'Unknown account')}</div>
      <div class="transaction-primary-cell">${escapeHtml(payeeLabel)}</div>
      <div>${escapeHtml(categoryLabel)}</div>
      <div>${escapeHtml(subCategoryLabel)}</div>
      <div class="transaction-muted-cell">${escapeHtml(memoLabel)}</div>
      <div class="amount negative">${amountValue < 0 ? formatCurrency(Math.abs(amountValue)) : ''}</div>
      <div class="amount positive">${amountValue > 0 ? formatCurrency(amountValue) : ''}</div>
      <div class="${transaction.pending ? 'transaction-muted-cell transaction-pending-balance' : 'amount'}">${escapeHtml(runningBalance)}</div>
      <div class="transaction-cleared-cell">
        <input
          type="checkbox"
          class="transaction-cleared-checkbox"
          data-transaction-cleared-id="${transaction.id}"
          ${transaction.cleared ? 'checked' : ''}
          ${transaction.pending ? 'disabled' : ''}
          aria-label="Mark ${escapeHtml(payeeLabel || 'transaction')} as cleared"
        >
      </div>
      <div class="transaction-actions">
        ${actionsMarkup}
      </div>
    </div>
  `;
}

function buildTransferAccountOptions(accounts, selectedValue) {
  return buildSelectOptions(accounts, selectedValue, 'Select');
}

function renderTransferEditorRow({ rowMode, transfer = null, accounts }) {
  const transferId = transfer?.id || '';
  const transferDate = transfer?.transferDate || getTodayDateValue();
  const originAccountId = transfer?.originAccountId || '';
  const destinationAccountId = transfer?.destinationAccountId || '';
  const amount = transfer?.amount ?? '';
  const status = normalizeTransferStatus(transfer?.status);
  const memo = transfer?.memo || '';
  const isEditRow = rowMode === 'edit';

  return `
    <div class="transfer-row transfer-editor-row ${isEditRow ? 'is-editing' : 'is-creating'}" data-row-mode="${rowMode}" data-transfer-id="${transferId}">
      <div><input type="date" class="txn-input transfer-input" data-field="transferDate" value="${escapeHtml(transferDate)}"></div>
      <div><select class="txn-input transfer-input" data-field="originAccountId">${buildTransferAccountOptions(accounts, originAccountId)}</select></div>
      <div><select class="txn-input transfer-input" data-field="destinationAccountId">${buildTransferAccountOptions(accounts, destinationAccountId)}</select></div>
      <div><input type="number" class="txn-input txn-amount-input transfer-input" data-field="amount" value="${escapeHtml(String(amount))}" step="0.01" min="0.01" placeholder="0.00"></div>
      <div>
        <select class="txn-input transfer-input" data-field="status">
          <option value="scheduled" ${status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
          <option value="completed" ${status === 'completed' ? 'selected' : ''}>Completed</option>
        </select>
      </div>
      <div><input type="text" class="txn-input transfer-input" data-field="memo" value="${escapeHtml(memo)}" placeholder="Memo"></div>
      <div class="transaction-actions">
        <button type="button" class="icon-button" onclick="${isEditRow ? `saveTransferEdit('${transferId}')` : 'createTransfer()'}" aria-label="${isEditRow ? 'Save transfer' : 'Add transfer'}" title="${isEditRow ? 'Save transfer' : 'Add transfer'}">
          ${getActionIcon('save')}
        </button>
        <button type="button" class="icon-button ${isEditRow ? '' : 'ghost'}" onclick="${isEditRow ? 'cancelTransferEdit()' : 'clearTransferDraft()'}" aria-label="${isEditRow ? 'Cancel edit' : 'Clear row'}" title="${isEditRow ? 'Cancel edit' : 'Clear row'}">
          ${getActionIcon(isEditRow ? 'close' : 'undo')}
        </button>
      </div>
    </div>
  `;
}

function renderTransferDisplayRow(transfer, accountMap) {
  const originAccount = accountMap.get(transfer.originAccountId);
  const destinationAccount = accountMap.get(transfer.destinationAccountId);
  const normalizedStatus = normalizeTransferStatus(transfer.status);

  return `
    <div class="transfer-row" data-transfer-id="${transfer.id}">
      <div>${escapeHtml(formatDate(transfer.transferDate))}</div>
      <div class="transaction-primary-cell">${escapeHtml(originAccount ? originAccount.name : 'Unknown account')}</div>
      <div class="transaction-primary-cell">${escapeHtml(destinationAccount ? destinationAccount.name : 'Unknown account')}</div>
      <div class="amount">${formatCurrency(transfer.amount)}</div>
      <div><span class="pill ${normalizedStatus === 'completed' ? '' : 'warn'}">${getTransferStatusLabel(normalizedStatus)}</span></div>
      <div class="transaction-muted-cell">${escapeHtml(transfer.memo || '')}</div>
      <div class="transaction-actions">
        <button type="button" class="icon-button" onclick="editTransfer('${transfer.id}')" aria-label="Edit transfer" title="Edit transfer">
          ${getActionIcon('edit')}
        </button>
        <button type="button" class="icon-button danger" onclick="confirmDeleteTransfer('${transfer.id}')" aria-label="Delete transfer" title="Delete transfer">
          ${getActionIcon('trash')}
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function populateAccountOptions(select, accounts, placeholder) {
  if (!select) {
    return;
  }

  const previousValue = select.value;
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(accounts.map(account => `<option value="${account.id}">${escapeHtml(account.name)}</option>`));

  select.innerHTML = options.join('');
  select.value = accounts.some(account => account.id === previousValue)
    ? previousValue
    : accounts[0]?.id || '';
}

function populateCategoryOptions(select, categories, placeholder) {
  if (!select) {
    return;
  }

  const previousValue = select.value;
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`));

  select.innerHTML = options.join('');
  select.value = categories.some(category => category.id === previousValue)
    ? previousValue
    : categories[0]?.id || '';
}

async function syncSubCategorySelect(categorySelectId, subCategorySelectId) {
  const categorySelect = document.getElementById(categorySelectId);
  const subCategorySelect = document.getElementById(subCategorySelectId);

  if (!categorySelect || !subCategorySelect) {
    return;
  }

  const selectedCategoryId = categorySelect.value;
  const previousValue = subCategorySelect.value;
  const subCategories = await cache.getAll('subCategories');
  const matchingSubCategories = subCategories.filter(subCategory => subCategory.categoryId === selectedCategoryId);
  const options = ['<option value="">No subcategory</option>']
    .concat(matchingSubCategories.map(subCategory => `<option value="${subCategory.id}">${escapeHtml(subCategory.name)}</option>`));

  subCategorySelect.innerHTML = options.join('');
  subCategorySelect.disabled = !selectedCategoryId || matchingSubCategories.length === 0;
  subCategorySelect.value = matchingSubCategories.some(subCategory => subCategory.id === previousValue)
    ? previousValue
    : '';
}

function buildCategoryPath(category, subCategory) {
  if (category && subCategory) {
    return `${category.name} / ${subCategory.name}`;
  }

  if (category) {
    return category.name;
  }

  if (subCategory) {
    return subCategory.name;
  }

  return 'Uncategorized';
}

async function resolveValidatedSubCategory(categoryId, subCategoryId) {
  if (!subCategoryId) {
    return null;
  }

  const subCategories = await cache.getAll('subCategories');
  const matchingSubCategory = subCategories.find(subCategory => subCategory.id === subCategoryId);

  if (!matchingSubCategory || matchingSubCategory.categoryId !== categoryId) {
    throw new Error('Selected subcategory does not belong to the chosen category.');
  }

  return matchingSubCategory;
}

function getTransactionEditorRow(transactionId = '') {
  const selector = transactionId
    ? `.transaction-editor-row[data-transaction-id="${transactionId}"]`
    : '.transaction-editor-row[data-row-mode="create"]';

  return document.querySelector(selector);
}

function updateTransactionRowSubcategories(row) {
  if (!row) {
    return;
  }

  const categorySelect = row.querySelector('.txn-category-select');
  const subCategorySelect = row.querySelector('.txn-subcategory-select');

  if (!categorySelect || !subCategorySelect) {
    return;
  }

  const categoryId = categorySelect.value;
  const matchingSubCategories = sortItemsForDisplay(
    transactionSubCategoriesCache.filter(subCategory => subCategory.categoryId === categoryId)
  );
  const previousValue = subCategorySelect.value;
  const options = ['<option value="">No subcategory</option>']
    .concat(matchingSubCategories.map(subCategory => `
      <option value="${subCategory.id}">${escapeHtml(subCategory.name)}</option>
    `))
    .join('');

  subCategorySelect.innerHTML = options;
  subCategorySelect.disabled = !categoryId || !matchingSubCategories.length;
  subCategorySelect.value = matchingSubCategories.some(subCategory => subCategory.id === previousValue) ? previousValue : '';
}

function readTransactionRowValues(row) {
  const inflowAmount = parseFloat(row.querySelector('[data-field="inflow"]').value);
  const outflowAmount = parseFloat(row.querySelector('[data-field="outflow"]').value);
  const normalizedInflow = Number.isFinite(inflowAmount) ? Math.abs(inflowAmount) : 0;
  const normalizedOutflow = Number.isFinite(outflowAmount) ? Math.abs(outflowAmount) : 0;

  return {
    date: row.querySelector('[data-field="date"]').value,
    accountId: row.querySelector('[data-field="accountId"]').value,
    payee: row.querySelector('[data-field="payee"]').value.trim(),
    categoryId: row.querySelector('[data-field="categoryId"]').value,
    subCategoryId: row.querySelector('[data-field="subCategoryId"]').value,
    memo: row.querySelector('[data-field="memo"]').value.trim(),
    amount: normalizedInflow > 0
      ? normalizedInflow
      : (normalizedOutflow > 0 ? -normalizedOutflow : Number.NaN),
    inflow: normalizedInflow,
    outflow: normalizedOutflow
  };
}

function compareTransactionsForRunningBalance(left, right) {
  const dateDifference = parseDateValue(left.date) - parseDateValue(right.date);

  if (dateDifference !== 0) {
    return dateDifference;
  }

  return String(left.id).localeCompare(String(right.id));
}

async function syncTransactionDerivedState(accountIds = null) {
  const [accounts, transactions] = await Promise.all([
    cache.getAll('accounts'),
    cache.getAll('transactions')
  ]);
  const targetAccountIds = accountIds
    ? new Set(accountIds.filter(Boolean))
    : new Set(accounts.map(account => account.id));
  const transactionUpdates = [];
  const accountUpdates = [];

  accounts
    .filter(account => targetAccountIds.has(account.id))
    .forEach(account => {
      const accountTransactions = transactions
        .filter(transaction => transaction.accountId === account.id)
        .slice()
        .sort(compareTransactionsForRunningBalance);
      let runningBalance = Number(account.startingBalance || 0);

      accountTransactions.forEach(transaction => {
        if (transaction.pending) {
          if (transaction.runningBalance !== null) {
            transactionUpdates.push(
              cache.update('transactions', { id: transaction.id }, { $set: { runningBalance: null } })
            );
          }
          return;
        }

        runningBalance += Number(transaction.amount || 0);

        if (Number(transaction.runningBalance) !== runningBalance) {
          transactionUpdates.push(
            cache.update('transactions', { id: transaction.id }, { $set: { runningBalance } })
          );
        }
      });

      if (Number(account.currentBalance) !== runningBalance) {
        accountUpdates.push(
          cache.update('accounts', { id: account.id }, { $set: { currentBalance: runningBalance } })
        );
      }
    });

  await Promise.all([...transactionUpdates, ...accountUpdates]);
}

function validateTransactionValues(values) {
  if (!values.date) {
    throw new Error('Transaction date is required.');
  }

  if (!values.accountId) {
    throw new Error('Please choose an account.');
  }

  if (!values.payee) {
    throw new Error('Payee is required.');
  }

  if (!values.categoryId) {
    throw new Error('Please choose a category.');
  }

  if (values.inflow > 0 && values.outflow > 0) {
    throw new Error('Enter a value in either inflow or outflow, not both.');
  }

  if (!Number.isFinite(values.amount) || Number(values.amount) === 0) {
    throw new Error('Please enter an inflow or outflow amount greater than zero.');
  }
}

function getTransferEditorRow(transferId = '') {
  const selector = transferId
    ? `.transfer-editor-row[data-transfer-id="${transferId}"]`
    : '.transfer-editor-row[data-row-mode="create"]';

  return document.querySelector(selector);
}

function readTransferRowValues(row) {
  return {
    transferDate: row.querySelector('[data-field="transferDate"]').value,
    originAccountId: row.querySelector('[data-field="originAccountId"]').value,
    destinationAccountId: row.querySelector('[data-field="destinationAccountId"]').value,
    amount: parseFloat(row.querySelector('[data-field="amount"]').value),
    status: normalizeTransferStatus(row.querySelector('[data-field="status"]').value),
    memo: row.querySelector('[data-field="memo"]').value.trim()
  };
}

function validateTransferValues(values) {
  if (!values.transferDate) {
    throw new Error('Transfer date is required.');
  }

  if (!values.originAccountId) {
    throw new Error('Please choose an origin account.');
  }

  if (!values.destinationAccountId) {
    throw new Error('Please choose a destination account.');
  }

  if (values.originAccountId === values.destinationAccountId) {
    throw new Error('Origin and destination accounts must be different.');
  }

  if (!Number.isFinite(values.amount) || Number(values.amount) <= 0) {
    throw new Error('Please enter a transfer amount greater than zero.');
  }
}

function buildTransferRecordPatch(values, overrides = {}) {
  return {
    originAccountId: values.originAccountId,
    destinationAccountId: values.destinationAccountId,
    amount: Math.abs(Number(values.amount) || 0),
    transferDate: values.transferDate,
    status: normalizeTransferStatus(values.status),
    memo: values.memo || '',
    ...overrides
  };
}

function buildTransferTransactionPatch(transaction, existingTransaction = null) {
  const isPending = transaction.pending === true;

  return {
    date: transaction.date,
    accountId: transaction.accountId,
    payee: transaction.payee,
    categoryId: null,
    subCategoryId: null,
    amount: transaction.amount,
    memo: transaction.memo,
    transferId: transaction.transferId || null,
    pending: isPending,
    cleared: isPending ? false : Boolean(existingTransaction?.cleared)
  };
}

function buildTransferSyncAccountIds(...transfers) {
  return [...new Set(
    transfers
      .flatMap(transfer => transfer ? [transfer.originAccountId, transfer.destinationAccountId] : [])
      .filter(Boolean)
  )];
}

function buildTransferTransactionRecords(transfer, accountMap) {
  const originAccount = accountMap.get(transfer.originAccountId);
  const destinationAccount = accountMap.get(transfer.destinationAccountId);

  if (!originAccount || !destinationAccount) {
    throw new Error('Both transfer accounts must exist before the transfer can be completed.');
  }

  const { originPayee, destinationPayee } = buildTransferTransactionPayees(originAccount, destinationAccount);
  const normalizedAmount = Math.abs(Number(transfer.amount || 0));
  const isPending = normalizeTransferStatus(transfer.status) !== 'completed';

  return {
    originTransaction: new Transaction(
      transfer.transferDate,
      transfer.originAccountId,
      originPayee,
      null,
      null,
      -normalizedAmount,
      transfer.memo || '',
      { transferId: transfer.id, cleared: false, pending: isPending }
    ),
    destinationTransaction: new Transaction(
      transfer.transferDate,
      transfer.destinationAccountId,
      destinationPayee,
      null,
      null,
      normalizedAmount,
      transfer.memo || '',
      { transferId: transfer.id, cleared: false, pending: isPending }
    )
  };
}

async function removeTransferTransactions(transfer) {
  if (transfer.originTransactionId) {
    await cache.remove('transactions', { id: transfer.originTransactionId });
  }

  if (transfer.destinationTransactionId) {
    await cache.remove('transactions', { id: transfer.destinationTransactionId });
  }

  if (editingTransactionId === transfer.originTransactionId || editingTransactionId === transfer.destinationTransactionId) {
    editingTransactionId = null;
  }
}

async function ensureTransferTransactions(nextTransfer, existingTransfer = null) {
  const accounts = await cache.getAll('accounts');
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const { originTransaction, destinationTransaction } = buildTransferTransactionRecords(nextTransfer, accountMap);
  const hasExistingPair = Boolean(existingTransfer?.originTransactionId && existingTransfer?.destinationTransactionId);

  if (hasExistingPair) {
    const [existingOriginTransaction, existingDestinationTransaction] = await Promise.all([
      cache.findOne('transactions', { id: existingTransfer.originTransactionId }),
      cache.findOne('transactions', { id: existingTransfer.destinationTransactionId })
    ]);

    await cache.update('transactions', { id: existingTransfer.originTransactionId }, { $set: buildTransferTransactionPatch(originTransaction, existingOriginTransaction) });
    await cache.update('transactions', { id: existingTransfer.destinationTransactionId }, { $set: buildTransferTransactionPatch(destinationTransaction, existingDestinationTransaction) });

    return {
      originTransactionId: existingTransfer.originTransactionId,
      destinationTransactionId: existingTransfer.destinationTransactionId
    };
  }

  if (existingTransfer) {
    await removeTransferTransactions(existingTransfer);
  }

  let savedOriginTransaction = null;

  try {
    savedOriginTransaction = await cache.insert('transactions', originTransaction);
    const savedDestinationTransaction = await cache.insert('transactions', destinationTransaction);

    return {
      originTransactionId: savedOriginTransaction.id,
      destinationTransactionId: savedDestinationTransaction.id
    };
  } catch (error) {
    if (savedOriginTransaction?.id) {
      await cache.remove('transactions', { id: savedOriginTransaction.id });
    }

    throw error;
  }
}

async function refreshTransferLinkedViews(accountIds = [], includeBudget = false) {
  const uniqueAccountIds = [...new Set(accountIds.filter(Boolean))];

  if (uniqueAccountIds.length) {
    await syncTransactionDerivedState(uniqueAccountIds);
  }

  await loadAccounts();
  await refreshDashboard();
  await loadTransactions();
  await loadTransfers();

  if (includeBudget && document.getElementById('budget').classList.contains('active') && !budgetDirtyToastActive) {
    await loadBudgetView();
  }
}

async function syncTransferTransactionState() {
  const [transfers, accounts, transactions] = await Promise.all([
    cache.getAll('transfers'),
    cache.getAll('accounts'),
    cache.getAll('transactions')
  ]);
  const accountMap = new Map(accounts.map(account => [account.id, account]));

  for (const transfer of transfers) {
    const normalizedStatus = normalizeTransferStatus(transfer.status);

    if (!accountMap.has(transfer.originAccountId) || !accountMap.has(transfer.destinationAccountId)) {
      continue;
    }

    const existingOriginTransaction = transfer.originTransactionId
      ? transactions.find(transaction => transaction.id === transfer.originTransactionId)
      : null;
    const existingDestinationTransaction = transfer.destinationTransactionId
      ? transactions.find(transaction => transaction.id === transfer.destinationTransactionId)
      : null;

    if (existingOriginTransaction && existingDestinationTransaction) {
      const nextTransfer = {
        ...transfer,
        status: normalizedStatus
      };
      const { originTransaction, destinationTransaction } = buildTransferTransactionRecords(nextTransfer, accountMap);
      await cache.update('transactions', { id: existingOriginTransaction.id }, { $set: buildTransferTransactionPatch(originTransaction, existingOriginTransaction) });
      await cache.update('transactions', { id: existingDestinationTransaction.id }, { $set: buildTransferTransactionPatch(destinationTransaction, existingDestinationTransaction) });

      if (transfer.status !== normalizedStatus) {
        await cache.update('transfers', { id: transfer.id }, { $set: { status: normalizedStatus } });
      }
      continue;
    }

    if (existingOriginTransaction?.id) {
      await cache.remove('transactions', { id: existingOriginTransaction.id });
    }

    if (existingDestinationTransaction?.id) {
      await cache.remove('transactions', { id: existingDestinationTransaction.id });
    }

    const nextTransfer = {
      ...transfer,
      status: normalizedStatus
    };
    const transactionIds = await ensureTransferTransactions(nextTransfer);
    await cache.update('transfers', { id: transfer.id }, { $set: {
      status: normalizedStatus,
      ...transactionIds
    } });
  }
}

function clearTransferDraft() {
  loadTransfers();
}

function normalizeImportHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '');
}

function parseCsvText(csvText) {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows.filter(row => row.some(cell => String(cell).trim() !== ''));
}

function resolveImportColumnIndex(headerMap, keys) {
  return keys.find(key => headerMap.has(key)) ? headerMap.get(keys.find(key => headerMap.has(key))) : -1;
}

function parseImportedAmount(rawValue) {
  const trimmed = String(rawValue || '').trim();

  if (!trimmed) {
    return Number.NaN;
  }

  const normalized = trimmed
    .replace(/[$,]/g, '')
    .replace(/^\((.*)\)$/, '-$1');

  return Number.parseFloat(normalized);
}

function parseImportedTransactionAmount({ inflowRaw = '', outflowRaw = '', amountRaw = '' }) {
  const inflow = parseImportedAmount(inflowRaw);
  const outflow = parseImportedAmount(outflowRaw);
  const amount = parseImportedAmount(amountRaw);
  const hasInflow = Number.isFinite(inflow) && inflow > 0;
  const hasOutflow = Number.isFinite(outflow) && outflow > 0;

  if (hasInflow && hasOutflow) {
    return { amount: Number.NaN, error: 'both inflow and outflow were provided' };
  }

  if (hasInflow) {
    return { amount: Math.abs(inflow), error: '' };
  }

  if (hasOutflow) {
    return { amount: -Math.abs(outflow), error: '' };
  }

  if (Number.isFinite(amount) && amount !== 0) {
    return { amount, error: '' };
  }

  return { amount: Number.NaN, error: 'no valid inflow or outflow amount was provided' };
}

function buildTransactionImportMaps(accounts, categories, subCategories) {
  return {
    accountsByName: new Map(accounts.map(account => [account.name.trim().toLowerCase(), account])),
    categoriesByName: new Map(categories.map(category => [category.name.trim().toLowerCase(), category])),
    subCategoriesByScopedName: new Map(
      subCategories.map(subCategory => [`${subCategory.categoryId}::${subCategory.name.trim().toLowerCase()}`, subCategory])
    )
  };
}

async function importTransactionsFromCsv() {
  const fileInput = document.getElementById('transaction-csv-file');
  const file = fileInput?.files?.[0];

  if (!file) {
    setStatus('Choose a CSV file to import.');
    return;
  }

  try {
    const csvText = await file.text();
    const rows = parseCsvText(csvText);

    if (rows.length < 2) {
      throw new Error('The CSV must include a header row and at least one transaction row.');
    }

    const headerMap = new Map(rows[0].map((header, index) => [normalizeImportHeader(header), index]));
    const columnIndexes = {
      date: resolveImportColumnIndex(headerMap, ['date']),
      account: resolveImportColumnIndex(headerMap, ['account', 'accountname']),
      payee: resolveImportColumnIndex(headerMap, ['payee']),
      category: resolveImportColumnIndex(headerMap, ['category', 'categoryname']),
      subCategory: resolveImportColumnIndex(headerMap, ['subcategory', 'subcat', 'subcategoryname']),
      inflow: resolveImportColumnIndex(headerMap, ['inflow', 'credit']),
      outflow: resolveImportColumnIndex(headerMap, ['outflow', 'debit']),
      amount: resolveImportColumnIndex(headerMap, ['amount']),
      memo: resolveImportColumnIndex(headerMap, ['memo', 'note', 'notes'])
    };
    const hasSplitFlowColumns = columnIndexes.inflow !== -1 || columnIndexes.outflow !== -1;

    const missingColumns = Object.entries(columnIndexes)
      .filter(([key, index]) => ['date', 'account', 'payee', 'category'].includes(key) && index === -1)
      .map(([key]) => key);

    if (missingColumns.length) {
      throw new Error(`Missing required CSV column(s): ${missingColumns.join(', ')}.`);
    }

    if (!hasSplitFlowColumns && columnIndexes.amount === -1) {
      throw new Error('Missing required CSV column(s): inflow and outflow.');
    }

    const [accounts, categories, subCategories] = await Promise.all([
      cache.getAll('accounts'),
      cache.getAll('categories'),
      cache.getAll('subCategories')
    ]);
    const { accountsByName, categoriesByName, subCategoriesByScopedName } = buildTransactionImportMaps(accounts, categories, subCategories);
    const transactionsToInsert = [];
    const errors = [];

    rows.slice(1).forEach((row, rowIndex) => {
      const csvRowNumber = rowIndex + 2;
      const date = String(row[columnIndexes.date] || '').trim();
      const accountName = String(row[columnIndexes.account] || '').trim().toLowerCase();
      const payee = String(row[columnIndexes.payee] || '').trim();
      const categoryName = String(row[columnIndexes.category] || '').trim().toLowerCase();
      const subCategoryName = columnIndexes.subCategory === -1 ? '' : String(row[columnIndexes.subCategory] || '').trim().toLowerCase();
      const inflowRaw = columnIndexes.inflow === -1 ? '' : String(row[columnIndexes.inflow] || '').trim();
      const outflowRaw = columnIndexes.outflow === -1 ? '' : String(row[columnIndexes.outflow] || '').trim();
      const amountRaw = columnIndexes.amount === -1 ? '' : String(row[columnIndexes.amount] || '').trim();
      const memo = columnIndexes.memo === -1 ? '' : String(row[columnIndexes.memo] || '').trim();
      const account = accountsByName.get(accountName);
      const category = categoriesByName.get(categoryName);
      const { amount, error: amountError } = parseImportedTransactionAmount({ inflowRaw, outflowRaw, amountRaw });

      if (!date || Number.isNaN(parseDateValue(date).getTime())) {
        errors.push(`Row ${csvRowNumber}: invalid date "${date}".`);
        return;
      }

      if (!account) {
        errors.push(`Row ${csvRowNumber}: account "${row[columnIndexes.account]}" was not found.`);
        return;
      }

      if (!payee) {
        errors.push(`Row ${csvRowNumber}: payee is required.`);
        return;
      }

      if (!category) {
        errors.push(`Row ${csvRowNumber}: category "${row[columnIndexes.category]}" was not found.`);
        return;
      }

      if (!Number.isFinite(amount)) {
        const flowLabel = hasSplitFlowColumns
          ? `inflow "${inflowRaw}" and outflow "${outflowRaw}"`
          : `amount "${amountRaw}"`;
        errors.push(`Row ${csvRowNumber}: ${flowLabel} is not valid because ${amountError}.`);
        return;
      }

      let subCategory = null;

      if (subCategoryName) {
        subCategory = subCategoriesByScopedName.get(`${category.id}::${subCategoryName}`);

        if (!subCategory) {
          errors.push(`Row ${csvRowNumber}: subcategory "${row[columnIndexes.subCategory]}" was not found under "${category.name}".`);
          return;
        }
      }

      transactionsToInsert.push(new Transaction(date, account.id, payee, category.id, subCategory?.id || null, amount, memo));
    });

    if (errors.length) {
      await Swal.fire({
        title: 'CSV Import Blocked',
        html: `<div class="import-error-list">${errors.slice(0, 8).map(error => `<p>${escapeHtml(error)}</p>`).join('')}${errors.length > 8 ? `<p>...and ${errors.length - 8} more.</p>` : ''}</div>`,
        icon: 'error',
        confirmButtonText: 'Close',
        background: '#fffdf8',
        color: '#163331',
        confirmButtonColor: '#af5d39',
        customClass: {
          popup: 'budget-alert-popup'
        }
      });
      return;
    }

    await Promise.all(transactionsToInsert.map(transaction => cache.insert('transactions', transaction)));
    await syncTransactionDerivedState([...new Set(transactionsToInsert.map(transaction => transaction.accountId))]);
    fileInput.value = '';
    await loadAccounts();
    await refreshDashboard();
    await loadTransactions();
    setStatus(`Imported ${transactionsToInsert.length} transaction${transactionsToInsert.length === 1 ? '' : 's'}.`);
  } catch (error) {
    setStatus(error.message);
  }
}

function buildCsvFileName(prefix) {
  const today = buildLocalDateValue(new Date());
  return `${prefix}-${today}.csv`;
}

function escapeCsvValue(value) {
  const normalized = value === null || typeof value === 'undefined'
    ? ''
    : String(value);

  if (/["\r\n,]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function downloadCsvFile(filename, headers, rows) {
  const csvLines = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map(row => row.map(escapeCsvValue).join(','))
  ];
  const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}

async function exportTransactionsCsv() {
  const [transactions, transfers, accounts, categories, subCategories] = await Promise.all([
    cache.getAll('transactions'),
    cache.getAll('transfers'),
    cache.getAll('accounts'),
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const subCategoryMap = new Map(subCategories.map(subCategory => [subCategory.id, subCategory]));
  const transferMap = new Map(transfers.map(transfer => [transfer.id, transfer]));
  const visibleTransactions = getFilteredAndSortedTransactions(transactions, accountMap, categoryMap, subCategoryMap, transferMap);

  downloadCsvFile(
    buildCsvFileName('transactions'),
    ['Date', 'Account', 'Payee', 'Category', 'Subcategory', 'Memo', 'Inflow', 'Outflow', 'Balance', 'Status', 'Cleared'],
    visibleTransactions.map(({ transaction, values }) => [
      transaction.date,
      values.account,
      values.payee,
      values.category,
      values.subCategory,
      values.memo,
      Number(transaction.amount || 0) > 0 ? Number(transaction.amount || 0).toFixed(2) : '',
      Number(transaction.amount || 0) < 0 ? Math.abs(Number(transaction.amount || 0)).toFixed(2) : '',
      transaction.pending ? 'Pending' : values.balance,
      transaction.pending ? 'Pending' : 'Posted',
      transaction.cleared ? 'Yes' : 'No'
    ])
  );

  setStatus(`Exported ${visibleTransactions.length} transaction row${visibleTransactions.length === 1 ? '' : 's'}.`);
}

async function exportTransfersCsv() {
  const [transfers, accounts] = await Promise.all([
    cache.getAll('transfers'),
    cache.getAll('accounts')
  ]);
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const visibleTransfers = getFilteredAndSortedTransfers(transfers, accountMap);

  downloadCsvFile(
    buildCsvFileName('transfers'),
    ['Date', 'From Account', 'To Account', 'Amount', 'Status', 'Memo'],
    visibleTransfers.map(({ transfer, values }) => [
      transfer.transferDate,
      values.fromAccount,
      values.toAccount,
      Number(transfer.amount || 0).toFixed(2),
      values.status,
      values.memo
    ])
  );

  setStatus(`Exported ${visibleTransfers.length} transfer row${visibleTransfers.length === 1 ? '' : 's'}.`);
}

async function exportAccountsCsv() {
  const rawAccounts = await cache.getAll('accounts');
  const accounts = sortItemsForDisplay(rawAccounts);

  if (!accounts.length) {
    setStatus('There are no accounts to export yet.');
    return;
  }

  downloadCsvFile(
    buildCsvFileName('accounts'),
    ['Account', 'Description', 'Account Type', 'Starting Balance', 'Current Balance', 'Budget Status', 'Active Status', 'Sort Order', 'Id'],
    accounts.map(account => [
      account.name || '',
      account.description || '',
      getAccountTypeLabel(account),
      Number(account.startingBalance || 0).toFixed(2),
      Number(account.currentBalance || 0).toFixed(2),
      account.offBudget ? 'Off Budget' : 'On Budget',
      account.active === false ? 'Inactive' : 'Active',
      Number.isFinite(account.sortOrder) ? account.sortOrder : '',
      account.id
    ])
  );

  setStatus(`Exported ${accounts.length} account row${accounts.length === 1 ? '' : 's'}.`);
}

async function exportCategoriesCsv() {
  const [rawCategories, rawSubCategories] = await Promise.all([
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);
  const categories = sortItemsForDisplay(rawCategories);
  const subCategories = rawSubCategories.slice();
  const rows = categories.flatMap(category => {
    const categoryRecurring = getBudgetRecurring(category);
    const categorySubCategories = sortItemsForDisplay(
      subCategories.filter(subCategory => subCategory.categoryId === category.id)
    );
    const categoryRow = [[
      category.name,
      '',
      'Category',
      category.offBudget ? 'Off Budget' : 'On Budget',
      BUDGET_BUCKET_MODE_LABELS[getBudgetBucketMode(category)] || BUDGET_BUCKET_MODE_LABELS.spend,
      Number(getSavingsGoalAmount(category) || 0).toFixed(2),
      Number(categoryRecurring.amount || 0).toFixed(2),
      categoryRecurring.enabled ? 'Yes' : 'No',
      RECURRING_CADENCE_LABELS[categoryRecurring.cadence] || categoryRecurring.cadence,
      category.note || '',
      Number.isFinite(category.sortOrder) ? category.sortOrder : '',
      category.id
    ]];

    const subCategoryRows = categorySubCategories.map(subCategory => {
      const recurring = getBudgetRecurring(subCategory);

      return [
        category.name,
        subCategory.name,
        'Subcategory',
        subCategory.offBudget ? 'Off Budget' : 'On Budget',
        BUDGET_BUCKET_MODE_LABELS[getBudgetBucketMode(subCategory)] || BUDGET_BUCKET_MODE_LABELS.spend,
        Number(getSavingsGoalAmount(subCategory) || 0).toFixed(2),
        Number(recurring.amount || 0).toFixed(2),
        recurring.enabled ? 'Yes' : 'No',
        RECURRING_CADENCE_LABELS[recurring.cadence] || recurring.cadence,
        subCategory.note || '',
        Number.isFinite(subCategory.sortOrder) ? subCategory.sortOrder : '',
        subCategory.id
      ];
    });

    return categoryRow.concat(subCategoryRows);
  });

  if (!rows.length) {
    setStatus('There are no categories to export yet.');
    return;
  }

  downloadCsvFile(
    buildCsvFileName('categories'),
    ['Category', 'Subcategory', 'Line Type', 'Budget Status', 'Bucket Type', 'Savings Goal Amount', 'Amount', 'Recurring Enabled', 'Recurring Cadence', 'Note', 'Sort Order', 'Id'],
    rows
  );

  setStatus(`Exported ${rows.length} category row${rows.length === 1 ? '' : 's'}.`);
}

function buildVisibleBudgetExportRows() {
  if (!budgetState.context) {
    return [];
  }

  return budgetState.visibleMonths.flatMap(month => {
    const draftState = getMonthDraftState(month);
    const model = buildBudgetPresentationModel(
      budgetState.context,
      month,
      draftState.draftAllocations
    );

    return model.groups.flatMap(group => group.rows.map(row => [
      month,
      formatMonthLabel(month),
      group.name,
      row.subCategoryName || '',
      row.isCategoryFallback ? 'Category' : 'Subcategory',
      Number(row.recurring.amount || 0).toFixed(2),
      RECURRING_CADENCE_LABELS[row.recurring.cadence] || row.recurring.cadence,
      Number(row.carryover || 0).toFixed(2),
      Number(row.assigned || 0).toFixed(2),
      Number(row.activity || 0).toFixed(2),
      Number(row.available || 0).toFixed(2),
      row.monthlyNote || ''
    ]));
  });
}

function exportVisibleBudgetMonthsCsv() {
  const rows = buildVisibleBudgetExportRows();

  if (!rows.length) {
    setStatus('There are no visible budget rows to export yet.');
    return;
  }

  downloadCsvFile(
    buildCsvFileName('budget-visible-months'),
    ['Month', 'Month Label', 'Category', 'Line', 'Line Type', 'Amount', 'Recurring Cadence', 'Carryover', 'Assigned', 'Activity', 'Available', 'Monthly Note'],
    rows
  );

  setStatus(`Exported ${rows.length} visible budget row${rows.length === 1 ? '' : 's'}.`);
}

function isOnBudgetCategoryReference(categoryId, subCategoryId, categoryMap, subCategoryMap) {
  const category = categoryMap.get(categoryId);

  if (!category || category.offBudget) {
    return false;
  }

  if (!subCategoryId) {
    return true;
  }

  const subCategory = subCategoryMap.get(subCategoryId);
  return !subCategory || !subCategory.offBudget;
}

function buildMonthlyReportSeries(year, transactions, budgetAllocations, categoryMap, subCategoryMap) {
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${padDatePart(index + 1)}`);

  return months.map(month => {
    const postedTransactions = transactions.filter(transaction => (
      !transaction.pending
      && !transaction.transferId
      && String(transaction.date || '').slice(0, 7) === month
    ));
    const inflow = postedTransactions
      .filter(transaction => Number(transaction.amount || 0) > 0)
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const outflow = postedTransactions
      .filter(transaction => Number(transaction.amount || 0) < 0)
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
    const budgeted = budgetAllocations
      .filter(allocation => (
        allocation.month === month
        && isOnBudgetCategoryReference(allocation.categoryId, allocation.subCategoryId, categoryMap, subCategoryMap)
      ))
      .reduce((sum, allocation) => sum + Number(allocation.assigned || 0), 0);
    const actual = postedTransactions
      .filter(transaction => (
        Number(transaction.amount || 0) < 0
        && transaction.categoryId
        && isOnBudgetCategoryReference(transaction.categoryId, transaction.subCategoryId, categoryMap, subCategoryMap)
      ))
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);

    return {
      month,
      label: formatMonthShortLabel(month),
      inflow,
      outflow,
      budgeted,
      actual
    };
  });
}

function buildCategorySpendBreakdown(selectedMonth, transactions, categoryMap, subCategoryMap) {
  const categoryTotals = new Map();

  transactions.forEach(transaction => {
    if (
      transaction.pending
      || transaction.transferId
      || Number(transaction.amount || 0) >= 0
      || String(transaction.date || '').slice(0, 7) !== selectedMonth
      || !transaction.categoryId
      || !isOnBudgetCategoryReference(transaction.categoryId, transaction.subCategoryId, categoryMap, subCategoryMap)
    ) {
      return;
    }

    const amount = Math.abs(Number(transaction.amount || 0));
    const category = categoryMap.get(transaction.categoryId);
    const subCategory = transaction.subCategoryId ? subCategoryMap.get(transaction.subCategoryId) : null;
    const categoryLabel = category ? category.name : 'Uncategorized';
    const subCategoryLabel = subCategory ? subCategory.name : 'Uncategorized';

    if (!categoryTotals.has(categoryLabel)) {
      categoryTotals.set(categoryLabel, {
        label: categoryLabel,
        value: 0,
        subCategories: new Map()
      });
    }

    const categoryEntry = categoryTotals.get(categoryLabel);
    categoryEntry.value += amount;
    categoryEntry.subCategories.set(
      subCategoryLabel,
      (categoryEntry.subCategories.get(subCategoryLabel) || 0) + amount
    );
  });

  return Array.from(categoryTotals.entries())
    .map(([, entry]) => ({
      label: entry.label,
      value: entry.value,
      subCategories: Array.from(entry.subCategories.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
    }))
    .sort((left, right) => right.value - left.value);
}

function buildBudgetAllocationBreakdown(selectedMonth, budgetAllocations, categoryMap, subCategoryMap) {
  const allocationTotals = new Map();

  budgetAllocations.forEach(allocation => {
    if (
      allocation.month !== selectedMonth
      || Number(allocation.assigned || 0) <= 0
      || !allocation.categoryId
      || !isOnBudgetCategoryReference(allocation.categoryId, allocation.subCategoryId, categoryMap, subCategoryMap)
    ) {
      return;
    }

    const amount = Number(allocation.assigned || 0);
    const category = categoryMap.get(allocation.categoryId);
    const subCategory = allocation.subCategoryId ? subCategoryMap.get(allocation.subCategoryId) : null;
    const categoryLabel = category ? category.name : 'Uncategorized';
    const lineLabel = subCategory ? subCategory.name : 'Category-Level';
    const key = `${allocation.categoryId}::${allocation.subCategoryId || 'root'}`;

    allocationTotals.set(key, {
      key,
      categoryLabel,
      lineLabel,
      value: (allocationTotals.get(key)?.value || 0) + amount
    });
  });

  return Array.from(allocationTotals.values()).sort((left, right) => right.value - left.value);
}

function aggregateAllocationBreakdownByCategory(allocationBreakdown) {
  const categoryTotals = new Map();

  allocationBreakdown.forEach(item => {
    const key = item.categoryLabel;

    categoryTotals.set(key, {
      key,
      categoryLabel: item.categoryLabel,
      value: (categoryTotals.get(key)?.value || 0) + Number(item.value || 0),
      lines: [
        ...(categoryTotals.get(key)?.lines || []),
        item
      ]
    });
  });

  return Array.from(categoryTotals.values())
    .sort((left, right) => right.value - left.value);
}

function hexToRgb(hexColor) {
  const normalized = String(hexColor || '').replace('#', '');
  if (normalized.length !== 6) {
    return null;
  }

  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return null;
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function adjustHexColor(hexColor, amount) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return hexColor;
  }

  const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[rgb.r, rgb.g, rgb.b].map(channel => clamp(channel + amount).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgba(hexColor, alpha) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return hexColor;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getSubCategoryColor(baseColor, index, totalCount) {
  if (totalCount <= 1) {
    return hexToRgba(adjustHexColor(baseColor, 28), 0.72);
  }

  const midpoint = (totalCount - 1) / 2;
  const offset = (index - midpoint) * 46;
  const alpha = 0.52 + ((index / Math.max(1, totalCount - 1)) * 0.32);
  return hexToRgba(adjustHexColor(baseColor, offset), alpha);
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const startX = cx + (radius * Math.cos(startAngle));
  const startY = cy + (radius * Math.sin(startAngle));
  const endX = cx + (radius * Math.cos(endAngle));
  const endY = cy + (radius * Math.sin(endAngle));
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${startX.toFixed(3)} ${startY.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX.toFixed(3)} ${endY.toFixed(3)}`;
}

function buildTreemapRects(items, x, y, width, height) {
  if (!items.length) {
    return [];
  }

  if (items.length === 1) {
    return [{ item: items[0], x, y, width, height }];
  }

  const total = items.reduce((sum, item) => sum + item.value, 0);
  let runningTotal = 0;
  let splitIndex = 0;

  for (let index = 0; index < items.length; index += 1) {
    runningTotal += items[index].value;
    splitIndex = index;

    if (runningTotal >= total / 2) {
      break;
    }
  }

  const firstItems = items.slice(0, splitIndex + 1);
  const secondItems = items.slice(splitIndex + 1);

  if (!secondItems.length) {
    const splitVertical = width >= height;
    let cursor = splitVertical ? x : y;

    return firstItems.map((item, index) => {
      const size = index === firstItems.length - 1
        ? (splitVertical ? (x + width) - cursor : (y + height) - cursor)
        : (item.value / total) * (splitVertical ? width : height);

      const rect = splitVertical
        ? { item, x: cursor, y, width: size, height }
        : { item, x, y: cursor, width, height: size };

      cursor += size;
      return rect;
    });
  }

  const firstTotal = firstItems.reduce((sum, item) => sum + item.value, 0);
  const splitVertical = width >= height;

  if (splitVertical) {
    const firstWidth = width * (firstTotal / total);
    return [
      ...buildTreemapRects(firstItems, x, y, firstWidth, height),
      ...buildTreemapRects(secondItems, x + firstWidth, y, width - firstWidth, height)
    ];
  }

  const firstHeight = height * (firstTotal / total);
  return [
    ...buildTreemapRects(firstItems, x, y, width, firstHeight),
    ...buildTreemapRects(secondItems, x, y + firstHeight, width, height - firstHeight)
  ];
}

function buildLineChartPath(values, maxValue, chartWidth, chartHeight) {
  if (!values.length || maxValue <= 0) {
    return '';
  }

  const xStep = values.length > 1 ? chartWidth / (values.length - 1) : chartWidth / 2;

  return values.map((value, index) => {
    const x = values.length > 1 ? index * xStep : chartWidth / 2;
    const y = chartHeight - ((value / maxValue) * chartHeight);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function renderInflowOutflowChart(monthlySeries) {
  const chartWidth = 640;
  const chartHeight = 160;
  const dataMaxValue = Math.max(1, ...monthlySeries.flatMap(item => [item.inflow, item.outflow]));
  const maxValue = Math.max(1, dataMaxValue * 1.14);
  const inflowPath = buildLineChartPath(monthlySeries.map(item => item.inflow), maxValue, chartWidth, chartHeight);
  const outflowPath = buildLineChartPath(monthlySeries.map(item => item.outflow), maxValue, chartWidth, chartHeight);
  const xStep = monthlySeries.length > 1 ? chartWidth / (monthlySeries.length - 1) : chartWidth / 2;

  return `
    <article class="report-card">
      <div class="report-card-copy">
        <p class="eyebrow">Cashflow</p>
        <h4>Inflow vs Outflow</h4>
        <p class="panel-hint">Monthly posted cash moving in and out, excluding transfers and pending rows.</p>
      </div>
      <div class="report-line-chart">
        <svg viewBox="0 0 ${chartWidth} ${chartHeight + 26}" role="img" aria-label="Inflow versus outflow line chart">
          ${Array.from({ length: 4 }, (_, index) => {
            const y = (chartHeight / 3) * index;
            return `<line x1="0" y1="${y.toFixed(2)}" x2="${chartWidth}" y2="${y.toFixed(2)}" class="report-grid-line" />`;
          }).join('')}
          ${inflowPath ? `<path d="${inflowPath}" class="report-line-path inflow" />` : ''}
          ${outflowPath ? `<path d="${outflowPath}" class="report-line-path outflow" />` : ''}
          ${monthlySeries.map((item, index) => {
            const x = monthlySeries.length > 1 ? index * xStep : chartWidth / 2;
            const inflowY = chartHeight - ((item.inflow / maxValue) * chartHeight);
            const outflowY = chartHeight - ((item.outflow / maxValue) * chartHeight);

            return `
              <circle cx="${x.toFixed(2)}" cy="${inflowY.toFixed(2)}" r="4" class="report-line-dot inflow">
                <title>${escapeHtml(`${item.label} inflow: ${formatCurrency(item.inflow)}`)}</title>
              </circle>
              <circle cx="${x.toFixed(2)}" cy="${outflowY.toFixed(2)}" r="4" class="report-line-dot outflow">
                <title>${escapeHtml(`${item.label} outflow: ${formatCurrency(item.outflow)}`)}</title>
              </circle>
              <text x="${x.toFixed(2)}" y="${(chartHeight + 18).toFixed(2)}" text-anchor="middle" class="report-axis-label">${escapeHtml(item.label)}</text>
            `;
          }).join('')}
        </svg>
      </div>
      <div class="report-legend">
        <span><i class="report-legend-swatch inflow"></i>Inflows ${formatCompactCurrency(monthlySeries.reduce((sum, item) => sum + item.inflow, 0))}</span>
        <span><i class="report-legend-swatch outflow"></i>Outflows ${formatCompactCurrency(monthlySeries.reduce((sum, item) => sum + item.outflow, 0))}</span>
      </div>
    </article>
  `;
}

function renderBudgetVsActualChart(monthlySeries, year) {
  const maxValue = Math.max(1, ...monthlySeries.flatMap(item => [item.budgeted, item.actual]));

  return `
    <article class="report-card">
      <div class="report-card-copy">
        <p class="eyebrow">Budget Performance</p>
        <h4>On-Budget Amount vs Actual</h4>
        <p class="panel-hint">Assigned dollars versus actual categorized spend for ${year}.</p>
      </div>
      <div class="report-bar-chart">
        ${monthlySeries.map(item => `
          <div class="report-bar-group">
            <div class="report-bar-pair">
              <span class="report-bar budgeted ${item.budgeted > 0 ? 'has-value' : ''}" style="height: ${item.budgeted > 0 ? Math.max(4, (item.budgeted / maxValue) * 100) : 0}%" title="${escapeHtml(`${item.label} budgeted: ${formatCurrency(item.budgeted)}`)}"></span>
              <span class="report-bar actual ${item.actual > 0 ? 'has-value' : ''}" style="height: ${item.actual > 0 ? Math.max(4, (item.actual / maxValue) * 100) : 0}%" title="${escapeHtml(`${item.label} actual: ${formatCurrency(item.actual)}`)}"></span>
            </div>
            <p class="report-axis-label">${escapeHtml(item.label)}</p>
          </div>
        `).join('')}
      </div>
      <div class="report-legend">
        <span><i class="report-legend-swatch budgeted"></i>Budgeted ${formatCompactCurrency(monthlySeries.reduce((sum, item) => sum + item.budgeted, 0))}</span>
        <span><i class="report-legend-swatch actual"></i>Actual ${formatCompactCurrency(monthlySeries.reduce((sum, item) => sum + item.actual, 0))}</span>
      </div>
    </article>
  `;
}

function renderBudgetAllocationTreemap(selectedMonth, allocationBreakdown) {
  const total = allocationBreakdown.reduce((sum, item) => sum + item.value, 0);

  if (!total) {
    return `
      <article class="report-card">
        <div class="report-card-copy">
          <p class="eyebrow">Budget Allocation</p>
          <h4>Assigned by Category</h4>
          <p class="panel-hint">No saved budget allocations were found for ${formatMonthLabel(selectedMonth)}.</p>
        </div>
        <div class="empty-state compact-empty-state">
          <h4>No assigned categories yet</h4>
          <p>Once you save budget allocations for the selected month, this chart will show where the money is going.</p>
        </div>
      </article>
    `;
  }

  const chartWidth = 480;
  const chartHeight = 280;
  const palette = ['#234d3f', '#3868b0', '#d08a3a', '#7d5ab5', '#bf5c4b', '#2f8f66', '#6c7f37', '#a75f41', '#4a8f90', '#5f6bc2'];
  const rects = buildTreemapRects(allocationBreakdown, 0, 0, chartWidth, chartHeight)
    .map((rect, index) => ({
      ...rect,
      color: palette[index % palette.length],
      percent: (rect.item.value / total) * 100
    }));

  return `
    <article class="report-card">
      <div class="report-card-copy">
        <p class="eyebrow">Budget Allocation</p>
        <h4>Assigned by Category</h4>
        <p class="panel-hint">A proportional view of saved budget allocations for ${formatMonthLabel(selectedMonth)}.</p>
      </div>
      <div class="report-treemap-layout">
        <div class="report-treemap-shell">
          <svg class="report-treemap" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Treemap showing budget allocation by category for ${escapeHtml(formatMonthLabel(selectedMonth))}">
            ${rects.map(rect => `
              <g>
                <rect
                  x="${rect.x.toFixed(2)}"
                  y="${rect.y.toFixed(2)}"
                  width="${Math.max(0, rect.width - 2).toFixed(2)}"
                  height="${Math.max(0, rect.height - 2).toFixed(2)}"
                  rx="14"
                  ry="14"
                  fill="${rect.color}"
                  class="report-treemap-rect"
                >
                  <title>${escapeHtml(`${rect.item.categoryLabel}: ${formatCurrency(rect.item.value)} (${rect.percent.toFixed(1)}%)`)}</title>
                </rect>
                ${rect.width >= 90 && rect.height >= 46 ? `
                  <text x="${(rect.x + 14).toFixed(2)}" y="${(rect.y + 22).toFixed(2)}" class="report-treemap-label">${escapeHtml(rect.item.categoryLabel)}</text>
                  <text x="${(rect.x + 14).toFixed(2)}" y="${(rect.y + 41).toFixed(2)}" class="report-treemap-value">${escapeHtml(`${formatCompactCurrency(rect.item.value)} · ${rect.percent.toFixed(1)}%`)}</text>
                ` : ''}
              </g>
            `).join('')}
          </svg>
        </div>
        <div class="report-treemap-legend">
          ${rects.map(rect => `
            <div class="report-treemap-legend-item">
              <span class="report-treemap-legend-color" style="background:${rect.color}"></span>
              <div>
                <strong>${escapeHtml(rect.item.categoryLabel)}</strong>
                <p>${formatCurrency(rect.item.value)} | ${rect.percent.toFixed(1)}%</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </article>
  `;
}

function renderCategorySpendPieChart(selectedMonth, breakdown) {
  const total = breakdown.reduce((sum, slice) => sum + slice.value, 0);

  if (!total) {
    return `
      <article class="report-card">
        <div class="report-card-copy">
          <p class="eyebrow">Category Mix</p>
          <h4>Spend by Category</h4>
          <p class="panel-hint">No posted spending was found for ${formatMonthLabel(selectedMonth)}.</p>
        </div>
        <div class="empty-state compact-empty-state">
          <h4>No category spend yet</h4>
          <p>Once spending lands in the selected month, the category mix will show up here.</p>
        </div>
      </article>
    `;
  }

  const palette = ['#1e7f74', '#d08a3a', '#3868b0', '#7d5ab5', '#bf5c4b', '#2f8f66', '#b36d3f', '#4e8f90'];
  const center = 50;
  const categoryRadius = 24;
  const subCategoryRadius = 43;
  const categoryStroke = 22;
  const subCategoryStroke = 13;
  let angleCursor = -(Math.PI / 2);

  const categorySegments = breakdown.map((category, categoryIndex) => {
    const categoryAngle = (category.value / total) * Math.PI * 2;
    const categoryStart = angleCursor;
    const categoryEnd = categoryStart + categoryAngle;
    const baseColor = palette[categoryIndex % palette.length];
    let subAngleCursor = categoryStart;

    const subCategories = category.subCategories.map((subCategory, subCategoryIndex) => {
      const subCategoryAngle = (subCategory.value / total) * Math.PI * 2;
      const subCategoryStart = subAngleCursor;
      const subCategoryEnd = subCategoryStart + subCategoryAngle;
      subAngleCursor = subCategoryEnd;

      return {
        ...subCategory,
        color: getSubCategoryColor(baseColor, subCategoryIndex, category.subCategories.length),
        percent: (subCategory.value / total) * 100,
        path: describeArc(center, center, subCategoryRadius, subCategoryStart, subCategoryEnd)
      };
    });

    angleCursor = categoryEnd;

    return {
      ...category,
      color: baseColor,
      percent: (category.value / total) * 100,
      path: describeArc(center, center, categoryRadius, categoryStart, categoryEnd),
      subCategories
    };
  });

  const segmentMarkup = `
    <circle class="report-pie-ring-base category" cx="${center}" cy="${center}" r="${categoryRadius}"></circle>
    <circle class="report-pie-ring-base subcategory" cx="${center}" cy="${center}" r="${subCategoryRadius}"></circle>
    ${categorySegments.map(category => `
      <path
        class="report-pie-ring category"
        d="${category.path}"
        stroke="${category.color}"
        stroke-width="${categoryStroke}"
      >
        <title>${escapeHtml(`${category.label}: ${formatCurrency(category.value)} (${category.percent.toFixed(1)}%)`)}</title>
      </path>
    `).join('')}
    ${categorySegments.flatMap(category => category.subCategories.map(subCategory => `
      <path
        class="report-pie-ring subcategory"
        d="${subCategory.path}"
        stroke="${subCategory.color}"
        stroke-width="${subCategoryStroke}"
      >
        <title>${escapeHtml(`${category.label} / ${subCategory.label}: ${formatCurrency(subCategory.value)} (${subCategory.percent.toFixed(1)}%)`)}</title>
      </path>
    `)).join('')}
  `;

  return `
    <article class="report-card">
      <div class="report-card-copy">
        <p class="eyebrow">Category Mix</p>
        <h4>Spend by Category and Subcategory</h4>
        <p class="panel-hint">The inner ring shows category totals and the outer ring breaks those totals into subcategories for ${formatMonthLabel(selectedMonth)}.</p>
      </div>
      <div class="report-pie-layout">
        <div class="report-pie-shell">
          <div class="report-pie-chart report-pie-chart-double">
            <svg class="report-pie-overlay" viewBox="0 0 100 100" role="img" aria-label="Double donut chart showing spending by category and subcategory">
              ${segmentMarkup}
            </svg>
            <div class="report-pie-hole">
              <strong>${formatCompactCurrency(total)}</strong>
              <span>Total spend</span>
            </div>
          </div>
        </div>
        <div class="report-pie-legend">
          ${categorySegments.map(category => `
            <div class="report-pie-legend-group">
              <div class="report-pie-legend-item is-category">
                <span class="report-pie-legend-color" style="background:${category.color}"></span>
                <div>
                  <strong>${escapeHtml(category.label)}</strong>
                  <p>${formatCurrency(category.value)} | ${category.percent.toFixed(1)}%</p>
                </div>
              </div>
              ${category.subCategories.map(subCategory => `
                <div class="report-pie-legend-item is-subcategory">
                  <span class="report-pie-legend-color" style="background:${subCategory.color}"></span>
                  <div>
                    <strong>${escapeHtml(subCategory.label)}</strong>
                    <p>${formatCurrency(subCategory.value)} | ${subCategory.percent.toFixed(1)}%</p>
                  </div>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    </article>
  `;
}

async function loadReports() {
  const [transactions, budgetAllocations, categories, subCategories] = await Promise.all([
    cache.getAll('transactions'),
    cache.getAll('budgetAllocations'),
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);
  const reportsView = document.getElementById('reports-view');
  const monthPicker = document.getElementById('reports-month-picker');
  const selectedMonth = reportsState.selectedMonth || getCurrentMonthValue();
  const reportYear = Number(selectedMonth.slice(0, 4));

  reportsState.selectedMonth = selectedMonth;
  monthPicker.value = selectedMonth;
  monthPicker.title = formatMonthLabel(selectedMonth);
  monthPicker.setAttribute('aria-label', `Selected report month: ${formatMonthLabel(selectedMonth)}`);

  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const subCategoryMap = new Map(subCategories.map(subCategory => [subCategory.id, subCategory]));
  const monthlySeries = buildMonthlyReportSeries(reportYear, transactions, budgetAllocations, categoryMap, subCategoryMap);
  const budgetAllocationBreakdown = buildBudgetAllocationBreakdown(selectedMonth, budgetAllocations, categoryMap, subCategoryMap);
  const budgetAllocationCategoryBreakdown = aggregateAllocationBreakdownByCategory(budgetAllocationBreakdown);
  const categorySpendBreakdown = buildCategorySpendBreakdown(selectedMonth, transactions, categoryMap, subCategoryMap);

  reportsView.innerHTML = `
    ${renderBudgetVsActualChart(monthlySeries, reportYear)}
    ${renderBudgetAllocationTreemap(selectedMonth, budgetAllocationCategoryBreakdown)}
    ${renderInflowOutflowChart(monthlySeries)}
    ${renderCategorySpendPieChart(selectedMonth, categorySpendBreakdown)}
  `;
}

async function createTransaction() {
  try {
    const row = getTransactionEditorRow();
    const values = readTransactionRowValues(row);
    validateTransactionValues(values);
    const matchingSubCategory = await resolveValidatedSubCategory(values.categoryId, values.subCategoryId);
    const transaction = new Transaction(
      values.date,
      values.accountId,
      values.payee,
      values.categoryId,
      matchingSubCategory?.id || null,
      values.amount,
      values.memo
    );

    await cache.insert('transactions', transaction);
    await syncTransactionDerivedState([values.accountId]);
    await loadAccounts();
    await refreshDashboard();
    await loadTransactions();
    setStatus(`Saved transaction: ${values.payee}`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function submitTransactionEditorRow(row) {
  if (!row) {
    return;
  }

  const rowMode = row.dataset.rowMode;
  const transactionId = row.dataset.transactionId;

  if (rowMode === 'edit' && transactionId) {
    await saveTransactionEdit(transactionId);
    return;
  }

  await createTransaction();
}

function clearTransactionDraft() {
  loadTransactions();
}

async function editTransaction(transactionId) {
  const transactions = await cache.getAll('transactions');
  const transaction = transactions.find(entry => entry.id === transactionId);

  if (!transaction) {
    setStatus('Transaction not found.');
    return;
  }

  if (transaction.transferId) {
    await manageTransfer(transaction.transferId);
    return;
  }

  editingTransactionId = transactionId;
  loadTransactions();
}

function cancelTransactionEdit() {
  editingTransactionId = null;
  loadTransactions();
}

async function saveTransactionEdit(transactionId) {
  try {
    const transactions = await cache.getAll('transactions');
    const existingTransaction = transactions.find(entry => entry.id === transactionId);

    if (!existingTransaction) {
      throw new Error('Transaction not found.');
    }

    const row = getTransactionEditorRow(transactionId);
    const values = readTransactionRowValues(row);
    validateTransactionValues(values);
    const matchingSubCategory = await resolveValidatedSubCategory(values.categoryId, values.subCategoryId);

    await cache.update('transactions', { id: transactionId }, { $set: {
      date: values.date,
      accountId: values.accountId,
      payee: values.payee,
      categoryId: values.categoryId,
      subCategoryId: matchingSubCategory?.id || null,
      amount: values.amount,
      memo: values.memo
    } });

    await syncTransactionDerivedState([existingTransaction.accountId, values.accountId]);
    editingTransactionId = null;
    await loadAccounts();
    await refreshDashboard();
    await loadTransactions();
    setStatus(`Updated transaction: ${values.payee}`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function setTransactionCleared(transactionId, cleared) {
  try {
    await cache.update('transactions', { id: transactionId }, { $set: { cleared: cleared === true } });
    await loadTransactions();
    setStatus(cleared ? 'Transaction marked cleared.' : 'Transaction marked uncleared.');
  } catch (error) {
    setStatus(error.message);
  }
}

async function confirmDeleteTransaction(transactionId) {
  const transactions = await cache.getAll('transactions');
  const transaction = transactions.find(entry => entry.id === transactionId);

  if (!transaction) {
    setStatus('Transaction not found.');
    return;
  }

  if (transaction.transferId) {
    await manageTransfer(transaction.transferId);
    return;
  }

  const shouldDelete = await confirmDestructiveAction(
    `Delete transaction "${transaction.payee}"?`,
    'This action cannot be undone.'
  );

  if (!shouldDelete) {
    setStatus(`Kept transaction: ${transaction.payee}`);
    return;
  }

  await cache.remove('transactions', { id: transactionId });
  await syncTransactionDerivedState([transaction.accountId]);

  if (editingTransactionId === transactionId) {
    editingTransactionId = null;
  }

  await loadAccounts();
  await refreshDashboard();
  await loadTransactions();
  setStatus(`Deleted transaction: ${transaction.payee}`);
}

async function createTransfer() {
  try {
    const row = getTransferEditorRow();
    const values = readTransferRowValues(row);
    validateTransferValues(values);
    const transfer = new Transfer(
      values.originAccountId,
      values.destinationAccountId,
      values.amount,
      values.transferDate,
      values.status,
      values.memo
    );

    await cache.insert('transfers', transfer);
    try {
      const transactionIds = await ensureTransferTransactions(transfer);
      await cache.update('transfers', { id: transfer.id }, { $set: transactionIds });
      Object.assign(transfer, transactionIds);
    } catch (error) {
      await cache.remove('transfers', { id: transfer.id });
      throw error;
    }

    editingTransferId = null;
    await refreshTransferLinkedViews(buildTransferSyncAccountIds(transfer), transfer.status === 'completed');
    setStatus(`Saved ${getTransferStatusLabel(transfer.status).toLowerCase()} transfer for ${formatCurrency(transfer.amount)}.`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function submitTransferEditorRow(row) {
  if (!row) {
    return;
  }

  const rowMode = row.dataset.rowMode;
  const transferId = row.dataset.transferId;

  if (rowMode === 'edit' && transferId) {
    await saveTransferEdit(transferId);
    return;
  }

  await createTransfer();
}

function cancelTransferEdit() {
  editingTransferId = null;
  loadTransfers();
}

async function editTransfer(transferId) {
  const transfers = await cache.getAll('transfers');
  const transfer = transfers.find(entry => entry.id === transferId);

  if (!transfer) {
    setStatus('Transfer not found.');
    return;
  }

  editingTransferId = transferId;
  await loadTransfers();
  setStatus(`Editing transfer for ${formatCurrency(transfer.amount)}.`);
}

async function manageTransfer(transferId) {
  const transfers = await cache.getAll('transfers');
  const transfer = transfers.find(entry => entry.id === transferId);

  if (!transfer) {
    setStatus('Transfer not found.');
    return;
  }

  editingTransferId = transferId;
  showSection('transfers');
  setStatus(`Managing ${getTransferStatusLabel(transfer.status).toLowerCase()} transfer.`);
}

async function saveTransferEdit(transferId) {
  try {
    const transfers = await cache.getAll('transfers');
    const existingTransfer = transfers.find(entry => entry.id === transferId);

    if (!existingTransfer) {
      throw new Error('Transfer not found.');
    }

    const row = getTransferEditorRow(transferId);
    const values = readTransferRowValues(row);
    validateTransferValues(values);
    const nextPatch = buildTransferRecordPatch(values);
    const nextTransfer = {
      ...existingTransfer,
      ...nextPatch
    };
    const syncAccountIds = buildTransferSyncAccountIds(existingTransfer, nextTransfer);
    const transactionIds = await ensureTransferTransactions(nextTransfer, existingTransfer);
    await cache.update('transfers', { id: transferId }, { $set: {
      ...nextPatch,
      ...transactionIds
    } });
    editingTransferId = null;
    await refreshTransferLinkedViews(syncAccountIds, nextTransfer.status === 'completed' || existingTransfer.status === 'completed');
    setStatus(`Updated ${getTransferStatusLabel(nextTransfer.status).toLowerCase()} transfer for ${formatCurrency(nextTransfer.amount)}.`);
  } catch (error) {
    setStatus(error.message);
  }
}

async function confirmDeleteTransfer(transferId) {
  const transfers = await cache.getAll('transfers');
  const transfer = transfers.find(entry => entry.id === transferId);

  if (!transfer) {
    setStatus('Transfer not found.');
    return;
  }

  const shouldDelete = await confirmDestructiveAction(
    `Delete ${getTransferStatusLabel(transfer.status).toLowerCase()} transfer?`,
    'This action cannot be undone.'
  );

  if (!shouldDelete) {
    setStatus(`Kept transfer for ${formatCurrency(transfer.amount)}.`);
    return;
  }

  const completedTransfer = normalizeTransferStatus(transfer.status) === 'completed';
  const syncAccountIds = buildTransferSyncAccountIds(transfer);
  await removeTransferTransactions(transfer);

  await cache.remove('transfers', { id: transferId });

  if (editingTransferId === transferId) {
    editingTransferId = null;
  }

  await refreshTransferLinkedViews(syncAccountIds, completedTransfer);

  setStatus(`Deleted transfer for ${formatCurrency(transfer.amount)}.`);
}

async function confirmDestructiveAction(title, text) {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    cancelButtonText: 'Cancel',
    reverseButtons: true,
    focusCancel: true,
    background: '#fffdf8',
    color: '#163331',
    confirmButtonColor: '#af5d39',
    cancelButtonColor: '#6d7e7b',
    customClass: {
      popup: 'budget-alert-popup'
    }
  });

  return result.isConfirmed;
}

async function editAccount(accountId) {
  const accounts = await cache.getAll('accounts');
  const account = accounts.find(entry => entry.id === accountId);

  if (!account) {
    setStatus('Account not found.');
    return;
  }

  editingAccountId = account.id;
  document.getElementById('acc-id').value = account.id;
  document.getElementById('acc-name').value = account.name || '';
  document.getElementById('acc-desc').value = account.description || '';
  document.getElementById('acc-type').value = inferAccountType(account);
  document.getElementById('acc-start').value = Number(account.startingBalance || 0);
  document.getElementById('acc-off').checked = Boolean(account.offBudget);
  document.getElementById('acc-active').checked = account.active !== false;
  setAccountFormMode(true);
  setStatus(`Editing account: ${account.name}`);
  document.getElementById('acc-name').focus();
}

async function confirmDeleteAccount(accountId) {
  const [accounts, transactions, transfers] = await Promise.all([
    cache.getAll('accounts'),
    cache.getAll('transactions'),
    cache.getAll('transfers')
  ]);
  const account = accounts.find(entry => entry.id === accountId);

  if (!account) {
    setStatus('Account not found.');
    return;
  }

  const linkedTransactions = transactions.filter(transaction => transaction.accountId === accountId);
  const linkedTransfers = transfers.filter(transfer => transfer.originAccountId === accountId || transfer.destinationAccountId === accountId);

  if (linkedTransactions.length || linkedTransfers.length) {
    setStatus(`Can't delete ${account.name} while transactions or transfers still reference it.`);
    return;
  }

  const shouldDelete = await confirmDestructiveAction(
    `Delete account "${account.name}"?`,
    'This action cannot be undone.'
  );

  if (!shouldDelete) {
    setStatus(`Kept account: ${account.name}`);
    return;
  }

  await cache.remove('accounts', { id: accountId });

  if (editingAccountId === accountId) {
    resetAccountForm();
  }

  await loadAccounts();
  await refreshDashboard();
  await loadTransactions();
  await loadTransfers();
  setStatus(`Deleted account: ${account.name}`);
}

async function editCategory(categoryId) {
  const categories = await cache.getAll('categories');
  const category = categories.find(entry => entry.id === categoryId);

  if (!category) {
    setStatus('Category not found.');
    return;
  }

  document.getElementById('cat-id').value = category.id;
  document.getElementById('subcat-id').value = '';
  document.getElementById('cat-name').value = category.name || '';
  document.getElementById('subcat-name').value = '';
  populateSavingsBucketFormValues(category);
  populateRecurringFormValues(getBudgetRecurring(category));
  document.getElementById('cat-note').value = category.note || '';
  document.getElementById('cat-off-budget').checked = Boolean(category.offBudget);
  setCategoryFormMode('edit-category');
  setStatus(`Editing category: ${category.name}`);
  document.getElementById('cat-name').focus();
}

async function startAddSubCategory(categoryId) {
  const categories = await cache.getAll('categories');
  const category = categories.find(entry => entry.id === categoryId);

  if (!category) {
    setStatus('Category not found.');
    return;
  }

  expandedCategoryIds.add(category.id);
  document.getElementById('cat-id').value = category.id;
  document.getElementById('subcat-id').value = '';
  document.getElementById('cat-name').value = category.name || '';
  document.getElementById('subcat-name').value = '';
  populateSavingsBucketFormValues({ bucketMode: 'spend', savingsGoalAmount: 0 });
  populateRecurringFormValues({ enabled: false, amount: 0, cadence: 'never' });
  document.getElementById('cat-note').value = '';
  document.getElementById('cat-off-budget').checked = Boolean(category.offBudget);
  setCategoryFormMode('add-subcategory', { categoryName: category.name });
  setStatus(`Adding a subcategory to ${category.name}`);
  document.getElementById('subcat-name').focus();
}

async function editSubCategory(subCategoryId) {
  const [subCategories, categories] = await Promise.all([
    cache.getAll('subCategories'),
    cache.getAll('categories')
  ]);
  const subCategory = subCategories.find(entry => entry.id === subCategoryId);

  if (!subCategory) {
    setStatus('Subcategory not found.');
    return;
  }

  const category = categories.find(entry => entry.id === subCategory.categoryId);
  document.getElementById('cat-id').value = subCategory.categoryId;
  document.getElementById('subcat-id').value = subCategory.id;
  document.getElementById('cat-name').value = category?.name || '';
  document.getElementById('subcat-name').value = subCategory.name || '';
  populateSavingsBucketFormValues(subCategory);
  populateRecurringFormValues(getBudgetRecurring(subCategory));
  document.getElementById('cat-note').value = subCategory.note || '';
  document.getElementById('cat-off-budget').checked = Boolean(subCategory.offBudget);
  setCategoryFormMode('edit-subcategory', {
    categoryName: category?.name,
    subCategoryName: subCategory.name
  });
  setStatus(`Editing subcategory: ${subCategory.name}`);
  document.getElementById('subcat-name').focus();
}

async function confirmDeleteCategory(categoryId) {
  const [categories, subCategories, transactions, budgetAllocations] = await Promise.all([
    cache.getAll('categories'),
    cache.getAll('subCategories'),
    cache.getAll('transactions'),
    cache.getAll('budgetAllocations')
  ]);
  const category = categories.find(entry => entry.id === categoryId);

  if (!category) {
    setStatus('Category not found.');
    return;
  }

  const childSubCategories = subCategories.filter(entry => entry.categoryId === categoryId);
  const linkedTransactions = transactions.filter(entry => entry.categoryId === categoryId);
  const linkedAllocations = budgetAllocations.filter(entry => entry.categoryId === categoryId);

  if (linkedTransactions.length) {
    setStatus(`Can't delete ${category.name} while transactions or allocations still reference it.`);
    return;
  }

  const warningParts = [];

  if (childSubCategories.length) {
    warningParts.push(`This will also delete ${childSubCategories.length} subcategory(ies).`);
  }

  if (linkedAllocations.length) {
    warningParts.push(`It will also remove ${linkedAllocations.length} saved budget allocation row(s).`);
  }

  warningParts.push('This action cannot be undone.');
  const warning = warningParts.join(' ');

  if (!await confirmDestructiveAction(`Delete category "${category.name}"?`, warning)) {
    setStatus(`Kept category: ${category.name}`);
    return;
  }

  if (linkedAllocations.length) {
    await cache.remove('budgetAllocations', { categoryId });
  }

  if (childSubCategories.length) {
    await cache.remove('subCategories', { categoryId });
  }

  await cache.remove('categories', { id: categoryId });

  if (document.getElementById('cat-id').value === categoryId) {
    resetCategoryForm();
  }

  await loadCategories();
  await loadTransactions();
  await loadBudgetView();
  await refreshDashboard();
  setStatus(`Deleted category: ${category.name}`);
}

async function confirmDeleteSubCategory(subCategoryId) {
  const [subCategories, transactions, budgetAllocations] = await Promise.all([
    cache.getAll('subCategories'),
    cache.getAll('transactions'),
    cache.getAll('budgetAllocations')
  ]);
  const subCategory = subCategories.find(entry => entry.id === subCategoryId);

  if (!subCategory) {
    setStatus('Subcategory not found.');
    return;
  }

  const linkedTransactions = transactions.filter(entry => entry.subCategoryId === subCategoryId);
  const linkedAllocations = budgetAllocations.filter(entry => entry.subCategoryId === subCategoryId);

  if (linkedTransactions.length) {
    setStatus(`Can't delete ${subCategory.name} while transactions or allocations still reference it.`);
    return;
  }

  if (!await confirmDestructiveAction(
    `Delete subcategory "${subCategory.name}"?`,
    `${linkedAllocations.length ? `This will also remove ${linkedAllocations.length} saved budget allocation row(s). ` : ''}This action cannot be undone.`
  )) {
    setStatus(`Kept subcategory: ${subCategory.name}`);
    return;
  }

  if (linkedAllocations.length) {
    await cache.remove('budgetAllocations', { subCategoryId });
  }

  await cache.remove('subCategories', { id: subCategoryId });

  if (document.getElementById('subcat-id').value === subCategoryId) {
    resetCategoryForm();
  }

  await loadCategories();
  await loadTransactions();
  await loadBudgetView();
  setStatus(`Deleted subcategory: ${subCategory.name}`);
}

// Load data on startup
window.onload = () => {
  window.editAccount = editAccount;
  window.confirmDeleteAccount = confirmDeleteAccount;
  window.editCategory = editCategory;
  window.toggleCategoryExpansion = toggleCategoryExpansion;
  window.startAddSubCategory = startAddSubCategory;
  window.editSubCategory = editSubCategory;
  window.confirmDeleteCategory = confirmDeleteCategory;
  window.confirmDeleteSubCategory = confirmDeleteSubCategory;
  window.createTransaction = createTransaction;
  window.clearTransactionDraft = clearTransactionDraft;
  window.editTransaction = editTransaction;
  window.cancelTransactionEdit = cancelTransactionEdit;
  window.saveTransactionEdit = saveTransactionEdit;
  window.confirmDeleteTransaction = confirmDeleteTransaction;
  window.createTransfer = createTransfer;
  window.clearTransferDraft = clearTransferDraft;
  window.editTransfer = editTransfer;
  window.cancelTransferEdit = cancelTransferEdit;
  window.saveTransferEdit = saveTransferEdit;
  window.confirmDeleteTransfer = confirmDeleteTransfer;
  window.manageTransfer = manageTransfer;
  document.getElementById('status-pill-close').addEventListener('click', clearStatus);
  resetWorkspaceState();
  resetDashboardDisplay();
  updateSessionChrome();
  document.getElementById('create-user-form').addEventListener('submit', async (event) => {
    try {
      await handleCreateUser(event);
    } catch (error) {
      setStatus(error.message);
    }
  });
  document.getElementById('sign-in-form').addEventListener('submit', async (event) => {
    try {
      await handleSignIn(event);
    } catch (error) {
      setStatus(error.message);
    }
  });
  document.getElementById('create-budget-form').addEventListener('submit', async (event) => {
    try {
      await handleCreateBudget(event);
    } catch (error) {
      setStatus(error.message);
    }
  });
  document.getElementById('reset-password-form').addEventListener('submit', async (event) => {
    try {
      await handleResetPassword(event);
    } catch (error) {
      setStatus(error.message);
    }
  });
  document.getElementById('forgot-password-form').addEventListener('submit', async (event) => {
    try {
      await handleForgotPassword(event);
    } catch (error) {
      setStatus(error.message);
    }
  });
  document.getElementById('user-list').addEventListener('click', event => {
    const userButton = event.target.closest('[data-user-id]');

    if (!userButton) {
      return;
    }

    selectSignInUser(userButton.dataset.userId);
  });
  document.getElementById('sign-in-user-id').addEventListener('change', event => {
    document.getElementById('reset-password-user-id').value = event.target.value;
    document.getElementById('forgot-password-user-id').value = event.target.value;
    syncResetPasswordRecoveryFields(event.target.value);
    syncForgotPasswordQuestion(event.target.value);
    renderUserList();
  });
  document.getElementById('reset-password-user-id').addEventListener('change', event => {
    document.getElementById('sign-in-user-id').value = event.target.value;
    document.getElementById('forgot-password-user-id').value = event.target.value;
    syncResetPasswordRecoveryFields(event.target.value);
    syncForgotPasswordQuestion(event.target.value);
    renderUserList();
  });
  document.getElementById('forgot-password-user-id').addEventListener('change', event => {
    document.getElementById('sign-in-user-id').value = event.target.value;
    document.getElementById('reset-password-user-id').value = event.target.value;
    syncForgotPasswordQuestion(event.target.value);
    renderUserList();
  });
  document.getElementById('budget-list').addEventListener('click', async event => {
    const renameButton = event.target.closest('[data-rename-budget-id]');
    const deleteButton = event.target.closest('[data-delete-budget-id]');
    const budgetButton = event.target.closest('[data-budget-id]');

    if (renameButton) {
      try {
        await promptRenameBudget(renameButton.dataset.renameBudgetId);
      } catch (error) {
        setStatus(error.message);
      }
      return;
    }

    if (deleteButton) {
      try {
        await confirmDeleteBudget(deleteButton.dataset.deleteBudgetId);
      } catch (error) {
        setStatus(error.message);
      }
      return;
    }

    if (!budgetButton) {
      return;
    }

    try {
      await handleBudgetSelection(budgetButton.dataset.budgetId);
    } catch (error) {
      setStatus(error.message);
    }
  });
  document.getElementById('show-create-user').addEventListener('click', () => {
    setAuthViewMode('create-user');
    document.getElementById('create-user-name').focus();
  });
  document.getElementById('show-reset-password').addEventListener('click', () => {
    setAuthViewMode('reset-password');
    document.getElementById('reset-password-current').focus();
  });
  document.getElementById('show-forgot-password').addEventListener('click', () => {
    setAuthViewMode('forgot-password');
    syncForgotPasswordQuestion(document.getElementById('forgot-password-user-id').value);
    document.getElementById('forgot-password-answer').focus();
  });
  document.getElementById('show-sign-in').addEventListener('click', () => {
    setAuthViewMode('sign-in');
    document.getElementById('sign-in-password').focus();
  });
  document.getElementById('show-sign-in-from-reset').addEventListener('click', () => {
    setAuthViewMode('sign-in');
    document.getElementById('sign-in-password').focus();
  });
  document.getElementById('show-sign-in-from-forgot').addEventListener('click', () => {
    setAuthViewMode('sign-in');
    document.getElementById('sign-in-password').focus();
  });
  document.getElementById('show-create-budget').addEventListener('click', () => {
    setBudgetManagerViewMode('create-budget');
    document.getElementById('create-budget-name').focus();
  });
  document.getElementById('show-budget-list').addEventListener('click', () => {
    setBudgetManagerViewMode('budget-list');
  });
  document.getElementById('manager-switch-budget').addEventListener('click', async () => {
    await switchBudgets();
  });
  document.getElementById('app-switch-budget').addEventListener('click', async () => {
    await switchBudgets();
  });
  document.getElementById('manager-sign-out').addEventListener('click', async () => {
    await signOut();
  });
  document.getElementById('app-sign-out').addEventListener('click', async () => {
    await signOut();
  });
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    toggleSidebarCollapsed();
  });
  window.addEventListener('resize', () => {
    setSidebarCollapsed(readSidebarCollapsedPreference());
  });
  document.addEventListener('click', event => {
    document.querySelectorAll('.user-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) {
        menu.removeAttribute('open');
      }
    });

    const toggleButton = event.target.closest('.password-toggle');

    if (!toggleButton) {
      return;
    }

    const input = document.getElementById(toggleButton.dataset.passwordTarget);

    if (!input) {
      return;
    }

    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    toggleButton.textContent = isVisible ? 'Show' : 'Hide';
    toggleButton.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
    toggleButton.setAttribute('aria-pressed', isVisible ? 'false' : 'true');
  });
  document.getElementById('account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('acc-id').value;
    const name = document.getElementById('acc-name').value;
    const desc = document.getElementById('acc-desc').value;
    const accountType = normalizeAccountType(document.getElementById('acc-type').value);
    const start = parseFloat(document.getElementById('acc-start').value);
    const off = document.getElementById('acc-off').checked;
    const active = document.getElementById('acc-active').checked;

    if (id) {
      await cache.update('accounts', { id }, { $set: {
        name,
        description: desc,
        accountType,
        startingBalance: start,
        currentBalance: start,
        offBudget: off,
        active
      } });
      await syncTransactionDerivedState([id]);
      await loadAccounts();
      await refreshDashboard();
      await loadTransactions();
      await loadTransfers();
      setStatus(`Updated account: ${name}`);
      resetAccountForm();
      return;
    }

    const sortOrder = await getNextSortOrder('accounts');
    const account = new Account(name, desc, start, off, sortOrder, active, accountType);
    await cache.insert('accounts', account);
    await loadAccounts();
    await refreshDashboard();
    await loadTransactions();
    await loadTransfers();
    setStatus(`Saved account: ${name}`);
    resetAccountForm();
  });
  document.getElementById('account-cancel').addEventListener('click', () => {
    resetAccountForm();
    setStatus('Account edit canceled');
  });
  document.getElementById('acc-type').addEventListener('change', () => {
    syncAccountTypeDefaultBudgeting();
  });
  document.getElementById('cat-bucket-mode').addEventListener('change', () => {
    syncSavingsBucketFormState();
  });
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.getElementById('category-form-mode').value;
    const categoryId = document.getElementById('cat-id').value;
    const subCategoryRecordId = document.getElementById('subcat-id').value;
    const name = document.getElementById('cat-name').value;
    const subCategoryName = document.getElementById('subcat-name').value.trim();
    const recurring = readRecurringFormValues();
    const savingsBucket = readSavingsBucketFormValues();
    const note = document.getElementById('cat-note').value;
    const offBudget = document.getElementById('cat-off-budget').checked;

      if (mode === 'edit-category') {
        await cache.update('categories', { id: categoryId }, {
          $set: {
            name,
            recurringAmount: recurring.amount,
            recurringCadence: recurring.cadence,
            bucketMode: savingsBucket.bucketMode,
            savingsGoalAmount: savingsBucket.savingsGoalAmount,
            note,
            offBudget
          },
          $unset: {
            targetType: true,
            targetAmount: true,
            goalType: true,
            goalAmount: true,
            recurringEnabled: true
          }
      });
      await loadCategories();
      await loadTransactions();
      await loadBudgetView();
      await refreshDashboard();
      setStatus(`Updated category group: ${name}`);
      resetCategoryForm();
      return;
    }

    if (mode === 'add-subcategory') {
      const sortOrder = await getNextGroupedSortOrder('subCategories', 'categoryId', categoryId);
      const subCategory = new SubCategory(
        categoryId,
        subCategoryName,
        recurring.amount,
        recurring.cadence,
        note,
        offBudget,
        sortOrder,
        savingsBucket.bucketMode,
        savingsBucket.savingsGoalAmount
      );
      await cache.insert('subCategories', subCategory);
      await loadCategories();
      await loadTransactions();
      await loadBudgetView();
      setStatus(`Saved subcategory: ${subCategoryName}`);
      resetCategoryForm();
      return;
    }

    if (mode === 'edit-subcategory') {
      await cache.update('subCategories', { id: subCategoryRecordId }, {
        $set: {
          name: subCategoryName,
          recurringAmount: recurring.amount,
          recurringCadence: recurring.cadence,
          bucketMode: savingsBucket.bucketMode,
          savingsGoalAmount: savingsBucket.savingsGoalAmount,
          note,
          offBudget
        },
        $unset: {
          targetType: true,
          targetAmount: true,
          goalType: true,
          goalAmount: true,
          recurringEnabled: true
        }
      });
      await loadCategories();
      await loadTransactions();
      await loadBudgetView();
      setStatus(`Updated subcategory: ${subCategoryName}`);
      resetCategoryForm();
      return;
    }

    const sortOrder = await getNextSortOrder('categories');
      const shouldApplyBudgetSettingsToCategory = !subCategoryName;
      const category = new Category(
        name,
        note,
        offBudget,
        sortOrder,
        shouldApplyBudgetSettingsToCategory ? recurring.amount : 0,
        shouldApplyBudgetSettingsToCategory ? recurring.cadence : 'never',
        shouldApplyBudgetSettingsToCategory ? savingsBucket.bucketMode : 'spend',
        shouldApplyBudgetSettingsToCategory ? savingsBucket.savingsGoalAmount : 0
      );
    const savedCategory = await cache.insert('categories', category);

    if (subCategoryName) {
      const subCategory = new SubCategory(
        savedCategory.id,
        subCategoryName,
        recurring.amount,
        recurring.cadence,
        note,
        offBudget,
        null,
        savingsBucket.bucketMode,
        savingsBucket.savingsGoalAmount
      );
      await cache.insert('subCategories', subCategory);
    }

    await loadCategories();
    await refreshDashboard();
    await loadTransactions();
    await loadBudgetView();
    setStatus(`Saved category group: ${name}`);
    resetCategoryForm();
  });
  document.getElementById('category-cancel').addEventListener('click', () => {
    resetCategoryForm();
    setStatus('Category edit canceled');
  });
    document.getElementById('transactions-list').addEventListener('change', async (e) => {
      if (e.target.classList.contains('txn-category-select')) {
        updateTransactionRowSubcategories(e.target.closest('.transaction-editor-row'));
        return;
      }

      if (e.target.classList.contains('transaction-cleared-checkbox') && e.target.dataset.transactionClearedId) {
        await setTransactionCleared(e.target.dataset.transactionClearedId, e.target.checked);
      }
    });
    document.getElementById('transactions-list').addEventListener('input', (e) => {
      if (!e.target.classList.contains('txn-filter-input')) {
        return;
      }

      transactionFilterFocusState = {
        key: e.target.dataset.filterKey,
        selectionStart: e.target.selectionStart,
        selectionEnd: e.target.selectionEnd
      };
      transactionTableState.filters[e.target.dataset.filterKey] = e.target.value;
      loadTransactions();
    });
    document.getElementById('transactions-list').addEventListener('keydown', async e => {
      if (!isPrimarySaveShortcut(e)) {
        return;
      }

      const editorRow = e.target.closest('.transaction-editor-row');

      if (!editorRow || e.target.classList.contains('txn-filter-input')) {
        return;
      }

      e.preventDefault();
      await submitTransactionEditorRow(editorRow);
    });
    document.getElementById('transactions-list').addEventListener('click', (e) => {
      if (e.target.closest('#transaction-filters-toggle')) {
        transactionTableState.filtersVisible = !transactionTableState.filtersVisible;
        transactionFilterFocusState = null;
        loadTransactions();
        return;
      }

      if (e.target.closest('#transaction-export-button')) {
        exportTransactionsCsv();
        return;
      }

      const sortButton = e.target.closest('.transaction-sort-button');

      if (sortButton) {
        const { sortKey } = sortButton.dataset;

        if (transactionTableState.sortKey === sortKey) {
          transactionTableState.sortDirection = transactionTableState.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          transactionTableState.sortKey = sortKey;
          transactionTableState.sortDirection = sortKey === 'date' ? 'desc' : 'asc';
        }

        loadTransactions();
        return;
      }

      if (e.target.closest('.transaction-clear-filters')) {
        transactionTableState.filters = { ...DEFAULT_TRANSACTION_FILTERS };
        transactionFilterFocusState = null;
        loadTransactions();
      }
    });
    document.getElementById('transaction-import-button').addEventListener('click', async () => {
      await importTransactionsFromCsv();
    });
    document.getElementById('account-export-button').addEventListener('click', async () => {
      await exportAccountsCsv();
    });
    document.getElementById('category-export-button').addEventListener('click', async () => {
      await exportCategoriesCsv();
    });
    document.getElementById('transfers-list').addEventListener('input', e => {
      if (!e.target.classList.contains('transfer-filter-input')) {
        return;
      }

      transferFilterFocusState = {
        key: e.target.dataset.filterKey,
        selectionStart: typeof e.target.selectionStart === 'number' ? e.target.selectionStart : null,
        selectionEnd: typeof e.target.selectionEnd === 'number' ? e.target.selectionEnd : null
      };
      transferTableState.filters[e.target.dataset.filterKey] = e.target.value;
      loadTransfers();
    });
    document.getElementById('transfers-list').addEventListener('change', e => {
      if (!e.target.classList.contains('transfer-filter-input')) {
        return;
      }

      transferFilterFocusState = {
        key: e.target.dataset.filterKey,
        selectionStart: typeof e.target.selectionStart === 'number' ? e.target.selectionStart : null,
        selectionEnd: typeof e.target.selectionEnd === 'number' ? e.target.selectionEnd : null
      };
      transferTableState.filters[e.target.dataset.filterKey] = e.target.value;
      loadTransfers();
    });
    document.getElementById('transfers-list').addEventListener('keydown', async e => {
      if (!isPrimarySaveShortcut(e)) {
        return;
      }

      const editorRow = e.target.closest('.transfer-editor-row');

      if (!editorRow || e.target.classList.contains('transfer-filter-input')) {
        return;
      }

      e.preventDefault();
      await submitTransferEditorRow(editorRow);
    });
    document.getElementById('transfers-list').addEventListener('click', e => {
      if (e.target.closest('#transfer-filters-toggle')) {
        transferTableState.filtersVisible = !transferTableState.filtersVisible;
        transferFilterFocusState = null;
        loadTransfers();
        return;
      }

      if (e.target.closest('#transfer-export-button')) {
        exportTransfersCsv();
        return;
      }

      const sortButton = e.target.closest('.transaction-sort-button[data-table-type="transfers"]');

      if (sortButton) {
        const { sortKey } = sortButton.dataset;

        if (transferTableState.sortKey === sortKey) {
          transferTableState.sortDirection = transferTableState.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          transferTableState.sortKey = sortKey;
          transferTableState.sortDirection = sortKey === 'date' ? 'desc' : 'asc';
        }

        loadTransfers();
        return;
      }

      if (e.target.closest('.transfer-clear-filters')) {
        transferTableState.filters = { ...DEFAULT_TRANSFER_FILTERS };
        transferFilterFocusState = null;
        loadTransfers();
      }
    });
  document.getElementById('budget-month-prev').addEventListener('click', async () => {
    budgetState.selectedMonth = shiftMonthValue(budgetState.selectedMonth || getCurrentMonthValue(), -1);
    await loadBudgetView({ month: budgetState.selectedMonth });
  });
  document.getElementById('budget-month-next').addEventListener('click', async () => {
    budgetState.selectedMonth = shiftMonthValue(budgetState.selectedMonth || getCurrentMonthValue(), 1);
    await loadBudgetView({ month: budgetState.selectedMonth });
  });
  document.getElementById('budget-month-picker').addEventListener('change', async event => {
    if (!event.target.value) {
      event.target.value = budgetState.selectedMonth || getCurrentMonthValue();
      return;
    }

    budgetState.selectedMonth = event.target.value;
    await loadBudgetView({ month: budgetState.selectedMonth });
  });
  document.getElementById('budget-copy-previous').addEventListener('click', async () => {
    if (!copyBudgetFromPreviousMonth()) {
      setStatus('No previous saved month was found for the active budget month.');
      return;
    }

    setStatus('Copied assigned amounts into the active budget month.');
  });
  document.getElementById('budget-apply-recurring').addEventListener('click', async () => {
    const appliedCount = applyRecurringBudgetDefaults();

    if (!appliedCount) {
      setStatus('No recurring rules were available for this budget.');
      return;
    }

    setStatus(`Staged ${appliedCount} recurring budget amount${appliedCount === 1 ? '' : 's'} for the visible months.`);
  });
  document.getElementById('budget-reset-draft').addEventListener('click', () => {
    resetBudgetDraftForVisibleMonths();
    setStatus('Reset the visible three-month budget draft.');
  });
  document.getElementById('budget-export-visible').addEventListener('click', () => {
    exportVisibleBudgetMonthsCsv();
  });
  document.getElementById('budget-save-month').addEventListener('click', async () => {
    await saveBudgetMonths();
    setStatus('Saved the visible three-month budget window.');
  });
  document.getElementById('reports-month-picker').addEventListener('change', async event => {
    if (!event.target.value) {
      event.target.value = reportsState.selectedMonth || getCurrentMonthValue();
      return;
    }

    reportsState.selectedMonth = event.target.value;
    await loadReports();
  });
  document.getElementById('budget-view').addEventListener('click', (e) => {
    const noteToggleButton = e.target.closest('[data-note-toggle-entry-key]');

    if (!noteToggleButton) {
      return;
    }

    toggleBudgetNoteEditor(noteToggleButton.dataset.month, noteToggleButton.dataset.noteToggleEntryKey);
  });
  document.getElementById('budget-view').addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('budget-assigned-input')) {
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      focusBudgetAssignedInput(e.target, 1);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      focusBudgetAssignedInput(e.target, e.shiftKey ? -1 : 1);
    }
  });
  document.getElementById('budget-view').addEventListener('input', (e) => {
    if (e.target.classList.contains('budget-assigned-input')) {
      updateBudgetDraftEntry(
        e.target.dataset.month,
        e.target.dataset.entryKey,
        { assigned: e.target.value === '' ? null : (parseFloat(e.target.value) || 0) }
      );
      refreshBudgetComputedDisplay();
      return;
    }

    if (e.target.classList.contains('budget-note-textarea')) {
      updateBudgetDraftEntry(
        e.target.dataset.month,
        e.target.dataset.noteEntryKey,
        { note: e.target.value }
      );
    }
  });
  initializeSidebarPreference();
  showAuthShell();
};

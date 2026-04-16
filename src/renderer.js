// renderer.js
const CacheService = require('./services/CacheService');
const Sortable = require('sortablejs');
const Swal = require('sweetalert2');
const Account = require('./models/Account');
const Category = require('./models/Category');
const SubCategory = require('./models/SubCategory');
const Transaction = require('./models/Transaction');
const BudgetAllocation = require('./models/BudgetAllocation');

const cache = new CacheService();
let editingAccountId = null;
let categoryFormMode = 'create-category';
let statusToastTimeoutId = null;
let accountsSortable = null;
let categoriesSortable = null;
let subCategorySortables = [];
let editingTransactionId = null;
let transactionSubCategoriesCache = [];
let budgetState = {
  selectedMonth: '',
  loadedMonth: '',
  visibleMonths: [],
  context: null,
  draftAllocationsByMonth: new Map(),
  draftMetaByMonth: new Map(),
  expandedNoteKey: null
};
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
  budget: {
    title: 'Monthly Budget',
    subtitle: 'Assign every dollar with confidence before the month gets busy.'
  }
};

function showSection(sectionId) {
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
    case 'budget':
      await loadBudgetView();
      break;
  }
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
    const budgetStatus = acc.offBudget ? 'Off Budget' : 'On Budget';
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
          <div class="pill ${acc.offBudget ? 'warn' : ''}">${budgetStatus}</div>
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

async function loadCategories() {
  const [rawCategories, subCategories] = await Promise.all([
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);
  const categories = sortItemsForDisplay(rawCategories);
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
    const subCategoryCount = `${categorySubCategories.length} ${categorySubCategories.length === 1 ? 'subcategory' : 'subcategories'}`;
    const noteMarkup = cat.note
      ? `<p class="data-card-note">${escapeHtml(cat.note)}</p>`
      : '';
    const subCategoryMarkup = categorySubCategories.length
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
              <div class="pill ${subCategory.offBudget ? 'warn' : ''}">${getGoalLabel(getSubCategoryTarget(subCategory).type, getSubCategoryTarget(subCategory).amount)}</div>
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
      : '<p class="empty-state">No subcategories yet. Add one from the form to start budgeting within this group.</p>';

    return `
      <article class="data-card category-card sortable-card" data-item-id="${cat.id}">
        <div class="data-card-header">
          <div class="data-card-copy">
            <div class="data-card-title-group">
              <div class="drag-handle" aria-hidden="true" title="Drag to reorder">
                ${getActionIcon('drag')}
              </div>
              <div>
                <h4>${escapeHtml(cat.name)}</h4>
                ${noteMarkup}
              </div>
            </div>
          </div>
          <div class="card-header-actions">
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
          <p>${categorySubCategories.filter(subCategory => !subCategory.offBudget).length} on-budget</p>
        </div>
        ${subCategoryMarkup}
      </article>
    `;
  }).join('');

  initializeCategoriesSortable();
  initializeSubCategorySortables();
  updateDashboardStats(null, categories, subCategories);
}

function syncData() {
  setStatus('Sync coming soon');
}

async function loadTransactions() {
  const [transactions, accounts, categories, subCategories] = await Promise.all([
    cache.getAll('transactions'),
    cache.getAll('accounts'),
    cache.getAll('categories'),
    cache.getAll('subCategories')
  ]);
  const list = document.getElementById('transactions-list');

  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const subCategoryMap = new Map(subCategories.map(subCategory => [subCategory.id, subCategory]));
  transactionSubCategoriesCache = subCategories;
  const sortedTransactions = transactions
    .slice()
    .sort((left, right) => parseDateValue(right.date) - parseDateValue(left.date));

  const emptyMarkup = !sortedTransactions.length
    ? `
      <div class="empty-state transaction-empty-state">
        <h4>No transactions yet</h4>
        <p>Use the first row to add your first transaction inline.</p>
      </div>
    `
    : '';

  list.innerHTML = `
    <div class="transaction-table">
      <div class="transaction-row transaction-head">
        <div>Date</div>
        <div>Account</div>
        <div>Payee</div>
        <div>Category</div>
        <div>Subcategory</div>
        <div>Memo</div>
        <div>Amount</div>
        <div>Balance</div>
        <div>Actions</div>
      </div>
      ${renderTransactionEditorRow({ rowMode: 'create', accounts, categories, subCategories })}
      ${sortedTransactions.map(transaction => {
        if (editingTransactionId === transaction.id) {
          return renderTransactionEditorRow({
            rowMode: 'edit',
            transaction,
            accounts,
            categories,
            subCategories
          });
        }

        return renderTransactionDisplayRow(transaction, accountMap, categoryMap, subCategoryMap);
      }).join('')}
    </div>
    ${emptyMarkup}
  `;
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
      const needsCategoryFallbackRow = visibleSubCategories.length && (
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
            target: getSubCategoryTarget(subCategory),
            recurring: getSubCategoryRecurring(subCategory),
            isCategoryFallback: false
          }))
        : [{
            entryKey: buildBudgetEntryKey(category.id, null),
            categoryId: category.id,
            subCategoryId: null,
            categoryName: category.name,
            subCategoryName: '',
            note: category.note || '',
            target: { type: '', amount: 0 },
            recurring: { enabled: false, amount: 0, cadence: 'monthly' },
            isCategoryFallback: true
          }];

      if (needsCategoryFallbackRow) {
        rows.unshift({
          entryKey: buildBudgetEntryKey(category.id, null),
          categoryId: category.id,
          subCategoryId: null,
          categoryName: category.name,
          subCategoryName: 'Category-Level Activity',
          note: 'Legacy or uncategorized entries in this group',
          target: { type: '', amount: 0 },
          recurring: { enabled: false, amount: 0, cadence: 'monthly' },
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

function getBudgetPrefillAmount(row, sourceAllocation = null) {
  if (Number(row.target.amount || 0) > 0) {
    return Number(row.target.amount || 0);
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
  const hasTargetPrefill = context.entries
    .flatMap(group => group.rows)
    .some(row => Number(row.target.amount || 0) > 0);
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
        suggestedAssigned: getBudgetPrefillAmount(row, sourceAllocation),
        note: ''
      }
    ];
  }));
  const draftSourceLabel = hasTargetPrefill
    ? 'category targets'
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
    return Number(draft.suggestedAssigned || 0);
  }

  return Number(draft.assigned || 0);
}

function getNoteForEntry(entry, draftAllocations) {
  return String(draftAllocations.get(entry.entryKey)?.note || '');
}

function getActivityAmountForEntry(context, month, entry) {
  return Number(context.activityLookup.get(
    buildBudgetMonthEntryKey(month, entry.categoryId, entry.subCategoryId)
  ) || 0);
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

      return {
        ...entry,
        carryover,
        committedAssigned,
        assigned,
        suggestedAssigned,
        isSuggestedOnly: assigned === suggestedAssigned && getAssignedAmountForEntry(entry, draftAllocations) === 0 && suggestedAssigned > 0,
        monthlyNote,
        activity,
        available
      };
    });
    const totals = rows.reduce((sum, row) => ({
      carryover: sum.carryover + row.carryover,
      assigned: sum.assigned + row.committedAssigned,
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

  const selectedMonthSavedAssigned = groups.reduce((sum, group) => sum + group.totals.assigned, 0);

  const totalAssignedAcrossSavedMonths = context.budgetAllocations.reduce(
    (sum, allocation) => sum + Number(allocation.assigned || 0),
    0
  );
  const assignedThisMonth = selectedMonthSavedAssigned;
  const activityThisMonth = groups.reduce((sum, group) => sum + group.totals.activity, 0);
  const reservedAssignedOutsideSelectedMonth = totalAssignedAcrossSavedMonths - selectedMonthSavedAssigned;
  const availableToBudget = context.availableCash - reservedAssignedOutsideSelectedMonth;
  const leftToAssign = availableToBudget - assignedThisMonth;

  return {
    groups,
    summary: {
      availableToBudget,
      cashOnHand: context.availableCash,
      assignedThisMonth,
      activityThisMonth,
      leftToAssign
    }
  };
}

function renderBudgetSummaryCards(summary, monthLabel) {
  const container = document.getElementById('budget-summary-cards');
  const remainingClass = summary.leftToAssign < 0 ? 'negative' : 'positive';
  const remainingLabel = summary.leftToAssign < 0 ? 'Overbudget' : 'Left To Assign';

  container.innerHTML = `
    <article class="hero-card budget-cash-card">
      <p class="hero-label">Available To Budget</p>
      <h3 id="available-to-budget">${formatCurrency(summary.availableToBudget)}</h3>
      <p class="hero-copy">Current cash after reserving assigned dollars from every other saved month.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">Assigned</p>
      <h3>${formatCurrency(summary.assignedThisMonth)}</h3>
      <p class="hero-copy">Money assigned in ${escapeHtml(monthLabel)}.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">Activity</p>
      <h3>${formatCurrency(summary.activityThisMonth)}</h3>
      <p class="hero-copy">Transaction-driven inflow and outflow for the selected month.</p>
    </article>
    <article class="hero-card">
      <p class="hero-label">${remainingLabel}</p>
      <h3 class="amount ${remainingClass}">${formatCurrency(summary.leftToAssign)}</h3>
      <p class="hero-copy">${summary.leftToAssign < 0 ? 'You have assigned more cash than is currently available.' : 'Every remaining dollar is still ready to be assigned.'}</p>
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
            draftMeta.isPrefilled && draftMeta.draftSourceLabel
              ? `Prefilled from ${draftMeta.draftSourceLabel}`
              : 'Monthly draft ready'
          )}</p>
        </div>
        <div class="budget-groups">
          ${model.groups.map(group => `
            <article class="budget-group-card">
              <div class="budget-group-header">
                <div>
                  <h4>${escapeHtml(group.name)}</h4>
                  <p>${escapeHtml(group.note || `${group.rows.length} ${group.rows.length === 1 ? 'budget row' : 'budget rows'}`)}</p>
                </div>
                <div class="budget-group-totals">
                  <span class="pill" data-category-assigned="${month}::${group.id}">Assigned ${formatCurrency(group.totals.assigned)}</span>
                  <span class="pill ${group.totals.activity < 0 ? 'warn' : ''}" data-category-activity="${month}::${group.id}">Activity ${formatCurrency(group.totals.activity)}</span>
                  <span class="pill ${group.totals.available < 0 ? 'warn' : ''}" data-category-total="${month}::${group.id}">${formatCurrency(group.totals.available)} Remaining</span>
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
                    <div class="budget-line-copy">
                      <strong>${escapeHtml(row.subCategoryName || row.categoryName)}</strong>
                      <p>${escapeHtml(
                        [
                          row.target.type ? `${TARGET_TYPE_LABELS[row.target.type]} target` : '',
                          row.target.amount ? formatCurrency(row.target.amount) : '',
                          row.recurring.enabled ? `Recurring ${row.recurring.cadence} ${formatCurrency(row.recurring.amount)}` : '',
                          row.note
                        ].filter(Boolean).join(' | ') || (row.isCategoryFallback ? 'Category-level budget row' : 'Flexible')
                      )}</p>
                    </div>
                    <div class="amount budget-row-carryover">${formatCurrency(row.carryover)}</div>
                    <div class="budget-assigned-field">
                      <div class="budget-amount-input-shell">
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

  document.getElementById('budget-month-label').textContent = formatMonthLabel(
    budgetState.selectedMonth || budgetState.visibleMonths[1] || budgetState.visibleMonths[0]
  );
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

  renderBudgetSummaryCards(focusedMonthModel.model.summary, formatMonthLabel(focusedMonthModel.month));
  renderBudgetWorkspaceGrid(monthModels);
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

  renderBudgetSummaryCards(focusedMonthModel.model.summary, formatMonthLabel(focusedMonthModel.month));
  monthModels.forEach(({ month, model }) => {
    model.groups.forEach(group => {
      const categoryAssigned = document.querySelector(`[data-category-assigned="${month}::${group.id}"]`);
      const categoryActivity = document.querySelector(`[data-category-activity="${month}::${group.id}"]`);
      const categoryTotal = document.querySelector(`[data-category-total="${month}::${group.id}"]`);

      if (categoryAssigned) {
        categoryAssigned.textContent = `Assigned ${formatCurrency(group.totals.assigned)}`;
      }

      if (categoryActivity) {
        categoryActivity.textContent = `Activity ${formatCurrency(group.totals.activity)}`;
        categoryActivity.classList.toggle('warn', group.totals.activity < 0);
      }

      if (categoryTotal) {
        categoryTotal.textContent = `${formatCurrency(group.totals.available)} Remaining`;
        categoryTotal.classList.toggle('warn', group.totals.available < 0);
      }

      group.rows.forEach(row => {
        const rowElement = document.querySelector(`[data-budget-row-key="${month}::${row.entryKey}"]`);

        if (!rowElement) {
          return;
        }

        const activityElement = rowElement.querySelector('.budget-row-activity');
        const availableElement = rowElement.querySelector('.budget-row-available');
        const carryoverElement = rowElement.querySelector('.budget-row-carryover');

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
      });
    });
  });
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

function materializeBudgetPrefillSuggestions(months = budgetState.visibleMonths) {
  let appliedCount = 0;

  months.forEach(month => {
    const draftAllocations = budgetState.draftAllocationsByMonth.get(month);

    if (!draftAllocations) {
      return;
    }

    draftAllocations.forEach((draft, entryKey) => {
      if ((draft.assigned === null || typeof draft.assigned === 'undefined') && Number(draft.suggestedAssigned || 0) > 0) {
        draftAllocations.set(entryKey, {
          ...draft,
          assigned: Number(draft.suggestedAssigned || 0)
        });
        appliedCount += 1;
      }
    });
  });

  return appliedCount;
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

  let applied = false;

  budgetState.visibleMonths.forEach(month => {
    const sourceMonth = getNearestPriorBudgetMonth(month, budgetState.context.budgetAllocations);

    if (!sourceMonth) {
      return;
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
    applied = true;
  });

  renderBudgetWorkspace();
  return applied;
}

function applyRecurringBudgetDefaults() {
  if (!budgetState.context) {
    return 0;
  }

  let appliedCount = 0;
  budgetState.visibleMonths.forEach(month => {
    budgetState.context.entries.forEach(group => {
      group.rows.forEach(row => {
        if (!row.recurring.enabled || row.recurring.cadence !== 'monthly') {
          return;
        }

        updateBudgetDraftEntry(month, row.entryKey, { assigned: row.recurring.amount });
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
  const availableCash = accounts
    .filter(account => !account.offBudget)
    .reduce((sum, account) => sum + Number(account.currentBalance || 0), 0);
  const entries = buildBudgetEntryDefinitions(categories, subCategories, transactions, budgetAllocations);
  const visibleMonths = getVisibleBudgetMonths(targetMonth);
  const centeredMonth = visibleMonths[1] || targetMonth;

  budgetState.selectedMonth = centeredMonth;
  budgetState.loadedMonth = centeredMonth;
  budgetState.visibleMonths = visibleMonths;
  budgetState.context = {
    availableCash,
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
    const totalCash = accounts.reduce((sum, acc) => sum + Number(acc.currentBalance || 0), 0);

    document.getElementById('total-cash').textContent = formatCurrency(totalCash);
    document.getElementById('account-count').textContent = accounts.length.toString();
  }

  if (categories) {
    document.getElementById('category-count').textContent = categories.length.toString();
  }

  if (subCategories) {
    const label = subCategories.length === 1 ? 'subcategory' : 'subcategories';
    document.getElementById('category-summary').textContent = `${subCategories.length} ${label} ready for assignment.`;
  }
}

function setStatus(message) {
  const statusPill = document.getElementById('status-pill');

  if (!statusPill) {
    return;
  }

  if (statusToastTimeoutId) {
    clearTimeout(statusToastTimeoutId);
  }

  statusPill.textContent = message;
  statusPill.classList.add('visible');

  statusToastTimeoutId = window.setTimeout(() => {
    statusPill.classList.remove('visible');
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
  setAccountFormMode(false);
}

function readRecurringFormValues() {
  return {
    enabled: document.getElementById('cat-recurring-enabled').checked,
    amount: parseFloat(document.getElementById('cat-recurring-amount').value) || 0,
    cadence: document.getElementById('cat-recurring-cadence').value || 'monthly'
  };
}

function populateRecurringFormValues(recurring = {}) {
  document.getElementById('cat-recurring-enabled').checked = Boolean(recurring.enabled);
  document.getElementById('cat-recurring-amount').value = Number(recurring.amount || 0) || '';
  document.getElementById('cat-recurring-cadence').value = recurring.cadence || 'monthly';
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

  if (mode === 'edit-category') {
    eyebrow.textContent = 'Edit Category';
    title.textContent = 'Update this category group';
    nameLabel.textContent = 'Category Group';
    noteLabel.textContent = 'Category Note';
    offBudgetLabel.textContent = 'Mark this category group as off budget';
    submitButton.textContent = 'Update Category';
    categoryNameInput.readOnly = false;
    subcatFields.classList.add('hidden');
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
  document.getElementById('subcat-name').required = false;
  populateRecurringFormValues({ enabled: false, amount: 0, cadence: 'monthly' });
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

function getTodayDateValue() {
  return buildLocalDateValue(new Date());
}

function getCurrentMonthValue() {
  return buildLocalMonthValue(new Date());
}

const TARGET_TYPE_LABELS = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom'
};

function normalizeTargetType(rawType) {
  if (rawType === 'target') {
    return 'custom';
  }

  if (Object.prototype.hasOwnProperty.call(TARGET_TYPE_LABELS, rawType)) {
    return rawType;
  }

  return '';
}

function getSubCategoryTarget(subCategory) {
  return {
    type: normalizeTargetType(subCategory.targetType || subCategory.goalType || ''),
    amount: Number(subCategory.targetAmount ?? subCategory.goalAmount ?? 0)
  };
}

function getGoalLabel(goalType, goalAmount) {
  const normalizedType = normalizeTargetType(goalType);

  if (normalizedType && goalAmount) {
    return `${TARGET_TYPE_LABELS[normalizedType]} ${formatCurrency(goalAmount)}`;
  }

  if (normalizedType) {
    return `${TARGET_TYPE_LABELS[normalizedType]} target`;
  }

  return 'Flexible';
}

function getSubCategoryMeta(subCategory) {
  const segments = [];
  const target = getSubCategoryTarget(subCategory);

  if (target.type) {
    segments.push(`${TARGET_TYPE_LABELS[target.type].toLowerCase()} target`);
  }

  if (target.amount) {
    segments.push(formatCurrency(target.amount));
  }

  const recurringLabel = getSubCategoryRecurringLabel(subCategory);

  if (recurringLabel) {
    segments.push(recurringLabel);
  }

  if (subCategory.note) {
    segments.push(subCategory.note);
  }

  return segments.join(' | ') || 'Flexible';
}

function getSubCategoryRecurring(subCategory) {
  return {
    enabled: Boolean(subCategory.recurringEnabled),
    amount: Number(subCategory.recurringAmount || 0),
    cadence: subCategory.recurringCadence || 'monthly'
  };
}

function getSubCategoryRecurringLabel(subCategory) {
  const recurring = getSubCategoryRecurring(subCategory);

  if (!recurring.enabled) {
    return '';
  }

  return `Recurring ${recurring.cadence} ${formatCurrency(recurring.amount)}`;
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
  const amount = transaction?.amount ?? '';
  const isEditRow = rowMode === 'edit';

  return `
    <div class="transaction-row transaction-editor-row ${isEditRow ? 'is-editing' : 'is-creating'}" data-row-mode="${rowMode}" data-transaction-id="${transactionId}">
      <div><input type="date" class="txn-input" data-field="date" value="${escapeHtml(dateValue)}"></div>
      <div><select class="txn-input" data-field="accountId">${buildSelectOptions(accounts, accountId, 'Select')}</select></div>
      <div><input type="text" class="txn-input" data-field="payee" value="${escapeHtml(payee)}" placeholder="Payee"></div>
      <div><select class="txn-input txn-category-select" data-field="categoryId">${buildSelectOptions(categories, categoryId, 'Select')}</select></div>
      <div><select class="txn-input txn-subcategory-select" data-field="subCategoryId" ${!categoryId || !matchingSubCategories.length ? 'disabled' : ''}>${subCategoryOptions}</select></div>
      <div><input type="text" class="txn-input" data-field="memo" value="${escapeHtml(memo)}" placeholder="Memo"></div>
      <div><input type="number" class="txn-input txn-amount-input" data-field="amount" value="${escapeHtml(String(amount))}" step="0.01" placeholder="0.00"></div>
      <div class="transaction-muted-cell">Auto</div>
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

function renderTransactionDisplayRow(transaction, accountMap, categoryMap, subCategoryMap) {
  const account = accountMap.get(transaction.accountId);
  const category = categoryMap.get(transaction.categoryId);
  const subCategory = transaction.subCategoryId ? subCategoryMap.get(transaction.subCategoryId) : null;
  const amountClass = Number(transaction.amount) >= 0 ? 'positive' : 'negative';
  const runningBalance = Number.isFinite(Number(transaction.runningBalance))
    ? formatCurrency(transaction.runningBalance)
    : '';

  return `
    <div class="transaction-row" data-transaction-id="${transaction.id}">
      <div>${escapeHtml(formatDate(transaction.date))}</div>
      <div>${escapeHtml(account ? account.name : 'Unknown account')}</div>
      <div class="transaction-primary-cell">${escapeHtml(transaction.payee)}</div>
      <div>${escapeHtml(category ? category.name : 'Uncategorized')}</div>
      <div>${escapeHtml(subCategory ? subCategory.name : '')}</div>
      <div class="transaction-muted-cell">${escapeHtml(transaction.memo || '')}</div>
      <div class="amount ${amountClass}">${formatCurrency(transaction.amount)}</div>
      <div class="amount">${runningBalance}</div>
      <div class="transaction-actions">
        <button type="button" class="icon-button" onclick="editTransaction('${transaction.id}')" aria-label="Edit transaction" title="Edit transaction">
          ${getActionIcon('edit')}
        </button>
        <button type="button" class="icon-button danger" onclick="confirmDeleteTransaction('${transaction.id}')" aria-label="Delete transaction" title="Delete transaction">
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
  return {
    date: row.querySelector('[data-field="date"]').value,
    accountId: row.querySelector('[data-field="accountId"]').value,
    payee: row.querySelector('[data-field="payee"]').value.trim(),
    categoryId: row.querySelector('[data-field="categoryId"]').value,
    subCategoryId: row.querySelector('[data-field="subCategoryId"]').value,
    memo: row.querySelector('[data-field="memo"]').value.trim(),
    amount: parseFloat(row.querySelector('[data-field="amount"]').value)
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

  if (!Number.isFinite(values.amount)) {
    throw new Error('Please enter a valid amount.');
  }
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
      amount: resolveImportColumnIndex(headerMap, ['amount']),
      memo: resolveImportColumnIndex(headerMap, ['memo', 'note', 'notes'])
    };

    const missingColumns = Object.entries(columnIndexes)
      .filter(([key, index]) => ['date', 'account', 'payee', 'category', 'amount'].includes(key) && index === -1)
      .map(([key]) => key);

    if (missingColumns.length) {
      throw new Error(`Missing required CSV column(s): ${missingColumns.join(', ')}.`);
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
      const amountRaw = String(row[columnIndexes.amount] || '').trim();
      const memo = columnIndexes.memo === -1 ? '' : String(row[columnIndexes.memo] || '').trim();
      const account = accountsByName.get(accountName);
      const category = categoriesByName.get(categoryName);
      const amount = parseImportedAmount(amountRaw);

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
        errors.push(`Row ${csvRowNumber}: amount "${row[columnIndexes.amount]}" is not valid.`);
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

function clearTransactionDraft() {
  loadTransactions();
}

function editTransaction(transactionId) {
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

async function confirmDeleteTransaction(transactionId) {
  const transactions = await cache.getAll('transactions');
  const transaction = transactions.find(entry => entry.id === transactionId);

  if (!transaction) {
    setStatus('Transaction not found.');
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
  document.getElementById('acc-start').value = Number(account.startingBalance || 0);
  document.getElementById('acc-current').value = Number(account.currentBalance || 0);
  document.getElementById('acc-off').checked = Boolean(account.offBudget);
  setAccountFormMode(true);
  setStatus(`Editing account: ${account.name}`);
  document.getElementById('acc-name').focus();
}

async function confirmDeleteAccount(accountId) {
  const [accounts, transactions] = await Promise.all([
    cache.getAll('accounts'),
    cache.getAll('transactions')
  ]);
  const account = accounts.find(entry => entry.id === accountId);

  if (!account) {
    setStatus('Account not found.');
    return;
  }

  const linkedTransactions = transactions.filter(transaction => transaction.accountId === accountId);

  if (linkedTransactions.length) {
    setStatus(`Can't delete ${account.name} while ${linkedTransactions.length} transaction(s) still reference it.`);
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
  document.getElementById('cat-goal-type').value = '';
  document.getElementById('cat-goal-amount').value = '';
  populateRecurringFormValues({ enabled: false, amount: 0, cadence: 'monthly' });
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

  document.getElementById('cat-id').value = category.id;
  document.getElementById('subcat-id').value = '';
  document.getElementById('cat-name').value = category.name || '';
  document.getElementById('subcat-name').value = '';
  document.getElementById('cat-goal-type').value = '';
  document.getElementById('cat-goal-amount').value = '';
  populateRecurringFormValues({ enabled: false, amount: 0, cadence: 'monthly' });
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
  document.getElementById('cat-goal-type').value = getSubCategoryTarget(subCategory).type;
  document.getElementById('cat-goal-amount').value = Number(subCategory.targetAmount ?? subCategory.goalAmount ?? 0) || '';
  populateRecurringFormValues(getSubCategoryRecurring(subCategory));
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

  if (linkedTransactions.length || linkedAllocations.length) {
    setStatus(`Can't delete ${category.name} while transactions or allocations still reference it.`);
    return;
  }

  const warning = childSubCategories.length
    ? `This will also delete ${childSubCategories.length} subcategory(ies). This action cannot be undone.`
    : 'This action cannot be undone.';

  if (!await confirmDestructiveAction(`Delete category "${category.name}"?`, warning)) {
    setStatus(`Kept category: ${category.name}`);
    return;
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

  if (linkedTransactions.length || linkedAllocations.length) {
    setStatus(`Can't delete ${subCategory.name} while transactions or allocations still reference it.`);
    return;
  }

  if (!await confirmDestructiveAction(
    `Delete subcategory "${subCategory.name}"?`,
    'This action cannot be undone.'
  )) {
    setStatus(`Kept subcategory: ${subCategory.name}`);
    return;
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
  budgetState.selectedMonth = getCurrentMonthValue();
  syncTransactionDerivedState()
    .then(async () => {
      showSection('accounts');
      await refreshDashboard();
    })
    .catch(error => {
      setStatus(error.message);
      showSection('accounts');
      refreshDashboard();
    });
  document.getElementById('account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('acc-id').value;
    const name = document.getElementById('acc-name').value;
    const desc = document.getElementById('acc-desc').value;
    const start = parseFloat(document.getElementById('acc-start').value);
    const current = parseFloat(document.getElementById('acc-current').value);
    const off = document.getElementById('acc-off').checked;

    if (id) {
      await cache.update('accounts', { id }, { $set: {
        name,
        description: desc,
        startingBalance: start,
        currentBalance: current,
        offBudget: off
      } });
      await loadAccounts();
      await refreshDashboard();
      await loadTransactions();
      setStatus(`Updated account: ${name}`);
      resetAccountForm();
      return;
    }

    const sortOrder = await getNextSortOrder('accounts');
    const account = new Account(name, desc, start, current, off, sortOrder);
    await cache.insert('accounts', account);
    await loadAccounts();
    await refreshDashboard();
    await loadTransactions();
    setStatus(`Saved account: ${name}`);
    resetAccountForm();
  });
  document.getElementById('account-cancel').addEventListener('click', () => {
    resetAccountForm();
    setStatus('Account edit canceled');
  });
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = document.getElementById('category-form-mode').value;
    const categoryId = document.getElementById('cat-id').value;
    const subCategoryRecordId = document.getElementById('subcat-id').value;
    const name = document.getElementById('cat-name').value;
    const subCategoryName = document.getElementById('subcat-name').value.trim();
    const targetType = normalizeTargetType(document.getElementById('cat-goal-type').value);
    const targetAmount = parseFloat(document.getElementById('cat-goal-amount').value) || 0;
    const recurring = readRecurringFormValues();
    const note = document.getElementById('cat-note').value;
    const offBudget = document.getElementById('cat-off-budget').checked;

    if (mode === 'edit-category') {
      await cache.update('categories', { id: categoryId }, { $set: {
        name,
        note,
        offBudget
      } });
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
      const subCategory = new SubCategory(categoryId, subCategoryName, targetType, targetAmount, note, offBudget, sortOrder, recurring);
      await cache.insert('subCategories', subCategory);
      await loadCategories();
      await loadTransactions();
      await loadBudgetView();
      setStatus(`Saved subcategory: ${subCategoryName}`);
      resetCategoryForm();
      return;
    }

    if (mode === 'edit-subcategory') {
      await cache.update('subCategories', { id: subCategoryRecordId }, { $set: {
        name: subCategoryName,
        targetType,
        targetAmount,
        goalType: targetType,
        goalAmount: targetAmount,
        recurringEnabled: recurring.enabled,
        recurringAmount: recurring.amount,
        recurringCadence: recurring.cadence,
        note,
        offBudget
      } });
      await loadCategories();
      await loadTransactions();
      await loadBudgetView();
      setStatus(`Updated subcategory: ${subCategoryName}`);
      resetCategoryForm();
      return;
    }

    const sortOrder = await getNextSortOrder('categories');
    const category = new Category(name, note, offBudget, sortOrder);
    const savedCategory = await cache.insert('categories', category);

    if (subCategoryName) {
      const subCategory = new SubCategory(savedCategory.id, subCategoryName, targetType, targetAmount, note, offBudget, null, recurring);
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
  document.getElementById('transactions-list').addEventListener('change', (e) => {
    if (e.target.classList.contains('txn-category-select')) {
      updateTransactionRowSubcategories(e.target.closest('.transaction-editor-row'));
    }
  });
  document.getElementById('transaction-import-button').addEventListener('click', async () => {
    await importTransactionsFromCsv();
  });
  document.getElementById('budget-month-prev').addEventListener('click', async () => {
    budgetState.selectedMonth = shiftMonthValue(budgetState.selectedMonth || getCurrentMonthValue(), -1);
    await loadBudgetView({ month: budgetState.selectedMonth });
  });
  document.getElementById('budget-month-next').addEventListener('click', async () => {
    budgetState.selectedMonth = shiftMonthValue(budgetState.selectedMonth || getCurrentMonthValue(), 1);
    await loadBudgetView({ month: budgetState.selectedMonth });
  });
  document.getElementById('budget-month-current').addEventListener('click', async () => {
    budgetState.selectedMonth = getCurrentMonthValue();
    await loadBudgetView({ month: budgetState.selectedMonth });
  });
  document.getElementById('budget-copy-previous').addEventListener('click', async () => {
    if (!copyBudgetFromPreviousMonth()) {
      setStatus('No previous saved month was found for the visible budget window.');
      return;
    }

    setStatus(`Copied assigned amounts into the visible three-month budget window.`);
  });
  document.getElementById('budget-apply-recurring').addEventListener('click', async () => {
    const appliedCount = applyRecurringBudgetDefaults();

    if (!appliedCount) {
      setStatus('No monthly recurring rules were available for this budget.');
      return;
    }

    setStatus(`Applied ${appliedCount} recurring budget amount${appliedCount === 1 ? '' : 's'}.`);
  });
  document.getElementById('budget-auto-apply').addEventListener('click', async () => {
    materializeBudgetPrefillSuggestions();
    await saveBudgetMonths();
    setStatus(`Saved the visible three-month budget window after applying the current prefills.`);
  });
  document.getElementById('budget-reset-draft').addEventListener('click', () => {
    resetBudgetDraftForVisibleMonths();
    setStatus('Reset the visible three-month budget draft.');
  });
  document.getElementById('budget-save-month').addEventListener('click', async () => {
    await saveBudgetMonths();
    setStatus('Saved the visible three-month budget window.');
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
};

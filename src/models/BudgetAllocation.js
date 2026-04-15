// src/models/BudgetAllocation.js
class BudgetAllocation {
  constructor(month, categoryId, subCategoryId, assigned, activity) {
    this.id = subCategoryId ? `${month}-${categoryId}-${subCategoryId}` : `${month}-${categoryId}`;
    this.month = month; // YYYY-MM
    this.categoryId = categoryId;
    this.subCategoryId = subCategoryId || null;
    this.assigned = parseFloat(assigned);
    this.activity = parseFloat(activity); // Spending, negative
    this.balance = this.assigned + this.activity;
  }
}

module.exports = BudgetAllocation;

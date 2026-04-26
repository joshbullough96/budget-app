// src/models/SubCategory.js
class SubCategory {
  constructor(categoryId, name, amount = 0, recurringCadence = 'never', note = '', offBudget = false, sortOrder = null, bucketMode = 'spend', savingsGoalAmount = 0) {
    this.id = `${categoryId}-${Date.now()}`;
    this.categoryId = categoryId;
    this.name = name;
    this.note = note;
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.balance = 0;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
    this.recurringAmount = parseFloat(amount) || 0;
    this.recurringCadence = recurringCadence || 'never';
    this.bucketMode = bucketMode === 'save' ? 'save' : 'spend';
    this.savingsGoalAmount = parseFloat(savingsGoalAmount) || 0;
  }
}

module.exports = SubCategory;

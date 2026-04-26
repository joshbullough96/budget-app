// src/models/Category.js
class Category {
  constructor(
    name,
    note = '',
    offBudget = false,
    sortOrder = null,
    amount = 0,
    recurringCadence = 'never',
    bucketMode = 'spend',
    savingsGoalAmount = 0
  ) {
    this.id = Date.now().toString();
    this.name = name;
    this.note = note;
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
    this.recurringAmount = parseFloat(amount) || 0;
    this.recurringCadence = recurringCadence || 'never';
    this.bucketMode = bucketMode === 'save' ? 'save' : 'spend';
    this.savingsGoalAmount = parseFloat(savingsGoalAmount) || 0;
  }
}

module.exports = Category;

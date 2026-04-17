// src/models/Category.js
class Category {
  constructor(
    name,
    note = '',
    offBudget = false,
    sortOrder = null,
    targetType = '',
    targetAmount = 0,
    recurringConfig = {}
  ) {
    this.id = Date.now().toString();
    this.name = name;
    this.note = note;
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
    this.targetType = targetType || '';
    this.targetAmount = parseFloat(targetAmount) || 0;
    this.goalType = this.targetType;
    this.goalAmount = this.targetAmount;
    this.recurringEnabled = recurringConfig.enabled === 'TRUE' || recurringConfig.enabled === true;
    this.recurringAmount = parseFloat(recurringConfig.amount) || 0;
    this.recurringCadence = recurringConfig.cadence || 'monthly';
  }
}

module.exports = Category;

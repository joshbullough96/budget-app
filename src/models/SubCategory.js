// src/models/SubCategory.js
class SubCategory {
  constructor(categoryId, name, targetType, targetAmount, note = '', offBudget = false, sortOrder = null, recurringConfig = {}) {
    this.id = `${categoryId}-${Date.now()}`;
    this.categoryId = categoryId;
    this.name = name;
    this.targetType = targetType || '';
    this.targetAmount = parseFloat(targetAmount) || 0;
    this.goalType = this.targetType;
    this.goalAmount = this.targetAmount;
    this.note = note;
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.balance = 0;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
    this.recurringEnabled = recurringConfig.enabled === 'TRUE' || recurringConfig.enabled === true;
    this.recurringAmount = parseFloat(recurringConfig.amount) || 0;
    this.recurringCadence = recurringConfig.cadence || 'monthly';
  }
}

module.exports = SubCategory;

// src/models/SubCategory.js
class SubCategory {
  constructor(categoryId, name, targetType, targetAmount, note = '', offBudget = false, sortOrder = null, recurringConfig = {}, bucketMode = 'spend', savingsGoalAmount = 0) {
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
    this.bucketMode = bucketMode === 'save' ? 'save' : 'spend';
    this.savingsGoalAmount = parseFloat(savingsGoalAmount) || 0;
  }
}

module.exports = SubCategory;

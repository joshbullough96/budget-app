// src/models/SubCategory.js
class SubCategory {
  constructor(categoryId, name, targetType, targetAmount, note = '', offBudget = false, sortOrder = null) {
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
  }
}

module.exports = SubCategory;

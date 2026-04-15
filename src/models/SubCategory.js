// src/models/SubCategory.js
class SubCategory {
  constructor(categoryId, name, goalType, goalAmount, note = '', offBudget = false, sortOrder = null) {
    this.id = `${categoryId}-${Date.now()}`;
    this.categoryId = categoryId;
    this.name = name;
    this.goalType = goalType;
    this.goalAmount = parseFloat(goalAmount) || 0;
    this.note = note;
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.balance = 0;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
  }
}

module.exports = SubCategory;

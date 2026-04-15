// src/models/Category.js
class Category {
  constructor(name, note = '', offBudget = false, sortOrder = null) {
    this.id = Date.now().toString();
    this.name = name;
    this.note = note;
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
  }
}

module.exports = Category;

// src/models/Account.js
class Account {
  constructor(name, description, startingBalance, currentBalance, offBudget, sortOrder = null) {
    this.id = Date.now().toString(); // Simple ID
    this.name = name;
    this.description = description;
    this.startingBalance = parseFloat(startingBalance);
    this.currentBalance = parseFloat(currentBalance);
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
  }
}

module.exports = Account;

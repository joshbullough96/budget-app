// src/models/Account.js
class Account {
  constructor(name, description, startingBalance, offBudget, sortOrder = null, active = true, accountType = 'checking') {
    this.id = Date.now().toString(); // Simple ID
    this.name = name;
    this.description = description;
    this.startingBalance = parseFloat(startingBalance);
    this.currentBalance = this.startingBalance;
    this.offBudget = offBudget === 'TRUE' || offBudget === true;
    this.sortOrder = Number.isFinite(sortOrder) ? sortOrder : null;
    this.active = active === 'FALSE' || active === false ? false : true;
    this.accountType = accountType || 'checking';
  }
}

module.exports = Account;

// src/models/Transaction.js
class Transaction {
  constructor(date, accountId, payee, categoryId, subCategoryId, amount, memo, options = {}) {
    this.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.date = date;
    this.accountId = accountId;
    this.payee = payee;
    this.categoryId = categoryId || null;
    this.subCategoryId = subCategoryId || null;
    this.amount = parseFloat(amount); // Negative for outflow
    this.memo = memo;
    this.transferId = options.transferId || null;
    this.cleared = options.cleared === true;
    this.pending = options.pending === true;
    this.runningBalance = null;
  }
}

module.exports = Transaction;

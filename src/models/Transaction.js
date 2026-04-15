// src/models/Transaction.js
class Transaction {
  constructor(date, accountId, payee, categoryId, subCategoryId, amount, memo) {
    this.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.date = date;
    this.accountId = accountId;
    this.payee = payee;
    this.categoryId = categoryId;
    this.subCategoryId = subCategoryId || null;
    this.amount = parseFloat(amount); // Negative for outflow
    this.memo = memo;
    this.cleared = false;
  }
}

module.exports = Transaction;

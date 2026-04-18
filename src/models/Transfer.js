// src/models/Transfer.js
class Transfer {
  constructor(originAccountId, destinationAccountId, amount, transferDate, status = 'scheduled', memo = '') {
    this.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.originAccountId = originAccountId;
    this.destinationAccountId = destinationAccountId;
    this.amount = Math.abs(parseFloat(amount) || 0);
    this.transferDate = transferDate;
    this.status = status === 'completed' ? 'completed' : 'scheduled';
    this.memo = String(memo || '').trim();
    this.originTransactionId = null;
    this.destinationTransactionId = null;
  }
}

module.exports = Transfer;

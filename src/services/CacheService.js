// src/services/CacheService.js
const Datastore = require('nedb');
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

class CacheService {
  constructor() {
    this.db = {};
    this.rootDataDirectory = this.resolveRootDataDirectory();
    this.dataDirectory = null;
    this.activeContext = null;
  }

  initDB() {
    if (!this.dataDirectory) {
      this.db = {};
      return;
    }

    this.db.accounts = new Datastore({ filename: this.getCollectionPath('accounts'), autoload: true });
    this.db.categories = new Datastore({ filename: this.getCollectionPath('categories'), autoload: true });
    this.db.subCategories = new Datastore({ filename: this.getCollectionPath('subCategories'), autoload: true });
    this.db.transactions = new Datastore({ filename: this.getCollectionPath('transactions'), autoload: true });
    this.db.transfers = new Datastore({ filename: this.getCollectionPath('transfers'), autoload: true });
    this.db.budgetAllocations = new Datastore({ filename: this.getCollectionPath('budgetAllocations'), autoload: true });
  }

  resolveRootDataDirectory() {
    const userDataPath = ipcRenderer.sendSync('app:get-user-data-path');
    const dataDirectory = path.join(userDataPath, 'data');

    fs.mkdirSync(dataDirectory, { recursive: true });

    return dataDirectory;
  }

  getLegacyDataDirectory() {
    return path.join(__dirname, '../../data');
  }

  setBudgetContext(userId, budgetId) {
    if (!userId || !budgetId) {
      throw new Error('A user and budget are required before loading data.');
    }

    this.activeContext = { userId, budgetId };
    this.dataDirectory = path.join(this.rootDataDirectory, 'users', userId, 'budgets', budgetId);
    fs.mkdirSync(this.dataDirectory, { recursive: true });
    this.migrateExistingData(this.dataDirectory);
    this.initDB();
  }

  clearBudgetContext() {
    this.activeContext = null;
    this.dataDirectory = null;
    this.db = {};
  }

  migrateExistingData(targetDirectory) {
    const legacyDirectory = this.getLegacyDataDirectory();
    const collections = ['accounts', 'categories', 'subCategories', 'transactions', 'transfers', 'budgetAllocations'];
    const targetIsEmpty = collections.every(collection => !fs.existsSync(path.join(targetDirectory, `${collection}.db`)));

    if (!targetIsEmpty) {
      return;
    }

    collections.forEach((collection) => {
      const legacyFile = path.join(legacyDirectory, `${collection}.db`);
      const targetFile = path.join(targetDirectory, `${collection}.db`);

      if (!fs.existsSync(targetFile) && fs.existsSync(legacyFile)) {
        fs.copyFileSync(legacyFile, targetFile);
      }
    });
  }

  getCollectionPath(collection) {
    return path.join(this.dataDirectory, `${collection}.db`);
  }

  ensureCollection(collection) {
    if (!this.dataDirectory || !this.db[collection]) {
      throw new Error('Select a budget before loading data.');
    }
  }

  async getAll(collection) {
    this.ensureCollection(collection);

    return new Promise((resolve, reject) => {
      this.db[collection].find({}, (err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    });
  }

  async insert(collection, doc) {
    this.ensureCollection(collection);

    return new Promise((resolve, reject) => {
      this.db[collection].insert(doc, (err, newDoc) => {
        if (err) reject(err);
        else resolve(newDoc);
      });
    });
  }

  async update(collection, query, update) {
    this.ensureCollection(collection);

    return new Promise((resolve, reject) => {
      this.db[collection].update(query, update, {}, (err, numReplaced) => {
        if (err) reject(err);
        else resolve(numReplaced);
      });
    });
  }

  async remove(collection, query) {
    this.ensureCollection(collection);

    return new Promise((resolve, reject) => {
      this.db[collection].remove(query, {}, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
  }
}

module.exports = CacheService;

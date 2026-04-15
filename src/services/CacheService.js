// src/services/CacheService.js
const Datastore = require('nedb');
const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

class CacheService {
  constructor() {
    this.db = {};
    this.dataDirectory = this.resolveDataDirectory();
    this.initDB();
  }

  initDB() {
    this.db.accounts = new Datastore({ filename: this.getCollectionPath('accounts'), autoload: true });
    this.db.categories = new Datastore({ filename: this.getCollectionPath('categories'), autoload: true });
    this.db.subCategories = new Datastore({ filename: this.getCollectionPath('subCategories'), autoload: true });
    this.db.transactions = new Datastore({ filename: this.getCollectionPath('transactions'), autoload: true });
    this.db.budgetAllocations = new Datastore({ filename: this.getCollectionPath('budgetAllocations'), autoload: true });
  }

  resolveDataDirectory() {
    const userDataPath = ipcRenderer.sendSync('app:get-user-data-path');
    const dataDirectory = path.join(userDataPath, 'data');

    fs.mkdirSync(dataDirectory, { recursive: true });
    this.migrateExistingData(dataDirectory);

    return dataDirectory;
  }

  migrateExistingData(targetDirectory) {
    const legacyDirectory = path.join(__dirname, '../../data');
    const collections = ['accounts', 'categories', 'subCategories', 'transactions', 'budgetAllocations'];

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

  async getAll(collection) {
    return new Promise((resolve, reject) => {
      this.db[collection].find({}, (err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    });
  }

  async insert(collection, doc) {
    return new Promise((resolve, reject) => {
      this.db[collection].insert(doc, (err, newDoc) => {
        if (err) reject(err);
        else resolve(newDoc);
      });
    });
  }

  async update(collection, query, update) {
    return new Promise((resolve, reject) => {
      this.db[collection].update(query, update, {}, (err, numReplaced) => {
        if (err) reject(err);
        else resolve(numReplaced);
      });
    });
  }

  async remove(collection, query) {
    return new Promise((resolve, reject) => {
      this.db[collection].remove(query, {}, (err, numRemoved) => {
        if (err) reject(err);
        else resolve(numRemoved);
      });
    });
  }
}

module.exports = CacheService;

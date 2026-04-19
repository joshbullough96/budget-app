const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ipcRenderer } = require('electron');

const PASSWORD_KEY_LENGTH = 64;

class ProfileService {
  constructor() {
    this.rootDataDirectory = this.resolveRootDataDirectory();
    this.usersDirectory = path.join(this.rootDataDirectory, 'users');
    fs.mkdirSync(this.usersDirectory, { recursive: true });
  }

  resolveRootDataDirectory() {
    const userDataPath = ipcRenderer.sendSync('app:get-user-data-path');
    const dataDirectory = path.join(userDataPath, 'data');

    fs.mkdirSync(dataDirectory, { recursive: true });

    return dataDirectory;
  }

  listDirectories(directory) {
    if (!fs.existsSync(directory)) {
      return [];
    }

    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  }

  getUserDirectory(userId) {
    return path.join(this.usersDirectory, userId);
  }

  getProfilePath(userId) {
    return path.join(this.getUserDirectory(userId), 'profile.json');
  }

  getBudgetsDirectory(userId) {
    return path.join(this.getUserDirectory(userId), 'budgets');
  }

  getBudgetDirectory(userId, budgetId) {
    return path.join(this.getBudgetsDirectory(userId), budgetId);
  }

  getBudgetMetaPath(userId, budgetId) {
    return path.join(this.getBudgetDirectory(userId, budgetId), 'budget.json');
  }

  readJson(filePath) {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  normalizeName(name) {
    return (name || '').trim().replace(/\s+/g, ' ');
  }

  slugify(value) {
    const slug = this.normalizeName(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'item';
  }

  ensureUniqueDirectoryName(parentDirectory, baseName) {
    let candidate = baseName;
    let counter = 2;

    while (fs.existsSync(path.join(parentDirectory, candidate))) {
      candidate = `${baseName}-${counter}`;
      counter += 1;
    }

    return candidate;
  }

  hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');

    return {
      salt,
      hash,
      algorithm: 'scrypt',
      keyLength: PASSWORD_KEY_LENGTH
    };
  }

  verifyPassword(password, passwordHash, passwordSalt) {
    const candidateHash = crypto.scryptSync(password, passwordSalt, PASSWORD_KEY_LENGTH);
    const savedHash = Buffer.from(passwordHash, 'hex');

    if (candidateHash.length !== savedHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateHash, savedHash);
  }

  sanitizeUser(profile) {
    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt || null,
      updatedAt: profile.updatedAt || null,
      lastSignedInAt: profile.lastSignedInAt || null
    };
  }

  sanitizeBudget(budget) {
    if (!budget) {
      return null;
    }

    return {
      id: budget.id,
      name: budget.name,
      createdAt: budget.createdAt || null,
      updatedAt: budget.updatedAt || null,
      lastOpenedAt: budget.lastOpenedAt || null
    };
  }

  getUsers() {
    return this.listDirectories(this.usersDirectory)
      .map(userId => this.readJson(this.getProfilePath(userId)))
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(profile => this.sanitizeUser(profile));
  }

  getUser(userId) {
    return this.sanitizeUser(this.readJson(this.getProfilePath(userId)));
  }

  createUser(name, password) {
    const normalizedName = this.normalizeName(name);
    const normalizedPassword = password || '';

    if (!normalizedName) {
      throw new Error('Enter a name for the new user.');
    }

    if (normalizedPassword.length < 8) {
      throw new Error('Passwords must be at least 8 characters long.');
    }

    const existingUsers = this.getUsers();

    if (existingUsers.some(user => user.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error(`A user named "${normalizedName}" already exists.`);
    }

    const baseUserId = this.slugify(normalizedName);
    const userId = this.ensureUniqueDirectoryName(this.usersDirectory, baseUserId);
    const now = new Date().toISOString();
    const passwordRecord = this.hashPassword(normalizedPassword);
    const profile = {
      id: userId,
      name: normalizedName,
      createdAt: now,
      updatedAt: now,
      lastSignedInAt: null,
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      passwordAlgorithm: passwordRecord.algorithm,
      passwordKeyLength: passwordRecord.keyLength
    };

    fs.mkdirSync(this.getBudgetsDirectory(userId), { recursive: true });
    this.writeJson(this.getProfilePath(userId), profile);

    return this.sanitizeUser(profile);
  }

  signIn(userId, password) {
    const profilePath = this.getProfilePath(userId);
    const profile = this.readJson(profilePath);

    if (!profile) {
      throw new Error('That user could not be found.');
    }

    if (!this.verifyPassword(password || '', profile.passwordHash, profile.passwordSalt)) {
      throw new Error('Invalid password.');
    }

    profile.lastSignedInAt = new Date().toISOString();
    profile.updatedAt = profile.lastSignedInAt;
    this.writeJson(profilePath, profile);

    return this.sanitizeUser(profile);
  }

  verifyCurrentPassword(userId, password) {
    const profile = this.readJson(this.getProfilePath(userId));

    if (!profile) {
      throw new Error('That user could not be found.');
    }

    if (!this.verifyPassword(password || '', profile.passwordHash, profile.passwordSalt)) {
      throw new Error('The current password did not match.');
    }

    return true;
  }

  resetPassword(userId, newPassword) {
    const profilePath = this.getProfilePath(userId);
    const profile = this.readJson(profilePath);
    const normalizedPassword = newPassword || '';

    if (!profile) {
      throw new Error('That user could not be found.');
    }

    if (normalizedPassword.length < 8) {
      throw new Error('Passwords must be at least 8 characters long.');
    }

    const passwordRecord = this.hashPassword(normalizedPassword);
    profile.passwordHash = passwordRecord.hash;
    profile.passwordSalt = passwordRecord.salt;
    profile.passwordAlgorithm = passwordRecord.algorithm;
    profile.passwordKeyLength = passwordRecord.keyLength;
    profile.updatedAt = new Date().toISOString();
    this.writeJson(profilePath, profile);

    return this.sanitizeUser(profile);
  }

  getBudgets(userId) {
    return this.listDirectories(this.getBudgetsDirectory(userId))
      .map(budgetId => this.readJson(this.getBudgetMetaPath(userId, budgetId)))
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(budget => this.sanitizeBudget(budget));
  }

  getBudget(userId, budgetId) {
    return this.sanitizeBudget(this.readJson(this.getBudgetMetaPath(userId, budgetId)));
  }

  createBudget(userId, name) {
    const normalizedName = this.normalizeName(name);

    if (!normalizedName) {
      throw new Error('Enter a name for the new budget.');
    }

    const userDirectory = this.getUserDirectory(userId);

    if (!fs.existsSync(userDirectory)) {
      throw new Error('Create or sign in to a user before creating budgets.');
    }

    const existingBudgets = this.getBudgets(userId);

    if (existingBudgets.some(budget => budget.name.toLowerCase() === normalizedName.toLowerCase())) {
      throw new Error(`A budget named "${normalizedName}" already exists.`);
    }

    const budgetsDirectory = this.getBudgetsDirectory(userId);
    const baseBudgetId = this.slugify(normalizedName);
    const budgetId = this.ensureUniqueDirectoryName(budgetsDirectory, baseBudgetId);
    const now = new Date().toISOString();
    const budget = {
      id: budgetId,
      name: normalizedName,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null
    };

    fs.mkdirSync(this.getBudgetDirectory(userId, budgetId), { recursive: true });
    this.writeJson(this.getBudgetMetaPath(userId, budgetId), budget);

    return this.sanitizeBudget(budget);
  }

  markBudgetOpened(userId, budgetId) {
    const budgetPath = this.getBudgetMetaPath(userId, budgetId);
    const budget = this.readJson(budgetPath);

    if (!budget) {
      throw new Error('That budget could not be found.');
    }

    budget.lastOpenedAt = new Date().toISOString();
    budget.updatedAt = budget.lastOpenedAt;
    this.writeJson(budgetPath, budget);

    return this.sanitizeBudget(budget);
  }
}

module.exports = ProfileService;

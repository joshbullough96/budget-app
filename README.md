# Budget App

`budget-app` is a local-first desktop budgeting application built with Electron, plain JavaScript, NeDB, and a single renderer-driven UI. It is designed for envelope-style or zero-based budgeting: track accounts, categorize transactions, schedule transfers, and assign money across budget categories by month.

Unlike a cloud budgeting tool, this app keeps profile and budget data on the local machine. Each user can have multiple budgets, and each budget gets its own local datastore.

## What The App Is For

This app is meant to help a user:

- create one or more local budgeting profiles
- protect profile access with a password and security-question-based recovery
- create multiple budgets under a profile
- manage on-budget and off-budget accounts
- organize category groups and subcategories
- record and import transactions
- schedule or complete transfers between accounts
- assign money to categories month by month
- compare assigned amounts against actual activity
- review reports for category mix, cashflow, and budget-vs-actual performance

The budgeting workflow is intentionally opinionated:

- accounts represent where money lives
- categories and subcategories represent where money is planned to go
- transactions drive activity
- monthly budget allocations represent assigned dollars
- transfers move money between accounts without treating that movement as spending

## Core Features

- Local profile management with password hashing
- Security-question-based recovery for forgotten passwords
- Multiple budgets per user
- Account management with active/inactive and on-budget/off-budget support
- Category groups and subcategories with targets, recurring settings, and notes
- Transaction entry, filtering, sorting, and CSV import/export
- Transfer scheduling and completion flow with linked transactions
- Three-month budget drafting workflow
- Monthly notes on budget lines
- Reporting for:
  - inflow vs outflow
  - budgeted vs actual
  - category and subcategory spending mix

## Tech Stack

- Electron
- Node.js
- Plain HTML/CSS/JavaScript
- NeDB for local persistent collections
- SortableJS for drag-and-drop ordering
- SweetAlert2 for confirmations and dialogs

## Running The App

Requirements:

- Node.js
- npm

Install dependencies:

```bash
npm install
```

Start the desktop app:

```bash
npm start
```

This launches Electron and loads [src/index.html](/c:/Users/joshb/OneDrive/Desktop/Coding%20Projects/budget-app/src/index.html).

## Project Structure

```text
budget-app/
├─ main.js
├─ package.json
├─ src/
│  ├─ index.html
│  ├─ styles.css
│  ├─ renderer.js
│  ├─ models/
│  │  ├─ Account.js
│  │  ├─ BudgetAllocation.js
│  │  ├─ Category.js
│  │  ├─ SubCategory.js
│  │  ├─ Transaction.js
│  │  └─ Transfer.js
│  └─ services/
│     ├─ CacheService.js
│     └─ ProfileService.js
```

## Architecture Overview

The app is intentionally simple and renderer-heavy.

### 1. Electron main process

[main.js](/c:/Users/joshb/OneDrive/Desktop/Coding%20Projects/budget-app/main.js) creates the browser window and exposes the Electron user data path through a small IPC bridge:

- `app:get-user-data-path`

That path is used by the renderer-side services to decide where profile and budget files live on disk.

### 2. Renderer-driven application

[renderer.js](/c:/Users/joshb/OneDrive/Desktop/Coding%20Projects/budget-app/src/renderer.js) is the application controller. It handles:

- bootstrapping the app
- auth screen state
- budget-selection state
- section navigation
- loading and rendering each major screen
- form submission
- sorting and filtering
- derived calculations for budgeting and reporting

There is no frontend framework here. Instead, the renderer:

- reads from services
- builds view models
- writes HTML strings into containers
- re-attaches event listeners
- recalculates derived values after writes

This is a pragmatic architecture for a small Electron app, but it also means `renderer.js` is the main “orchestrator” file and carries a lot of responsibility.

### 3. Services layer

#### `ProfileService`

[ProfileService.js](/c:/Users/joshb/OneDrive/Desktop/Coding%20Projects/budget-app/src/services/ProfileService.js) manages user profiles and budget metadata.

Responsibilities:

- create and read local user profiles
- hash and verify passwords using `crypto.scryptSync`
- hash and verify security-question answers
- reset passwords
- update security questions
- create and enumerate budgets for a user
- store profile metadata in `profile.json`
- store budget metadata in `budget.json`

Profiles are stored beneath Electron’s `userData` path, under a `data/users/...` structure.

#### `CacheService`

[CacheService.js](/c:/Users/joshb/OneDrive/Desktop/Coding%20Projects/budget-app/src/services/CacheService.js) manages the active budget datastore.

Responsibilities:

- switch the active data context to a specific `userId` and `budgetId`
- initialize NeDB collections for the active budget
- provide generic CRUD helpers:
  - `getAll`
  - `insert`
  - `update`
  - `remove`
- migrate legacy collection files into the active budget directory if needed

Collections currently include:

- `accounts`
- `categories`
- `subCategories`
- `transactions`
- `transfers`
- `budgetAllocations`

### 4. Data models

The model classes in [src/models](/c:/Users/joshb/OneDrive/Desktop/Coding%20Projects/budget-app/src/models) are lightweight constructors used to normalize newly created records before storage.

- `Account`: name, balances, budget status, sort order, active state
- `Category`: group-level planning metadata such as targets and recurring settings
- `SubCategory`: child budget lines beneath a category
- `Transaction`: dated cash movement tied to an account and optionally a category/subcategory
- `Transfer`: movement between two accounts with `scheduled` or `completed` status
- `BudgetAllocation`: assigned amount and activity for a month/category/subcategory combination

## Data Layout On Disk

At a high level, storage looks like this:

```text
<electron userData>/data/
└─ users/
   └─ <user-id>/
      ├─ profile.json
      └─ budgets/
         └─ <budget-id>/
            ├─ budget.json
            ├─ accounts.db
            ├─ categories.db
            ├─ subCategories.db
            ├─ transactions.db
            ├─ transfers.db
            └─ budgetAllocations.db
```

This separation is important:

- profile auth metadata lives at the user level
- budgeting data lives inside a budget-specific folder
- switching budgets means switching the NeDB context, not filtering one giant shared database

## How The Application Works

### Sign-in and recovery flow

- A user creates a profile with:
  - name
  - password
  - security question
  - security answer
- The password and security answer are hashed before being saved
- A signed-out user can:
  - sign in normally
  - reset a password if they know the current password
  - recover access through the saved security question if they forgot the password
- A signed-in or authenticated user can also update the recovery question from the reset-password flow

### Budget selection

- After sign-in, the user chooses or creates a budget
- Selecting a budget calls `CacheService.setBudgetContext(userId, budgetId)`
- That activates the correct NeDB files for the current budget session

### Accounts, categories, and transactions

- Accounts hold balances and determine whether dollars are on budget
- Categories and subcategories organize planned spending
- Transactions are categorized to produce activity
- Transfers create linked movements between two accounts and avoid counting the transfer as ordinary spending

### Monthly budgeting

The budget view combines:

- saved monthly allocations from `budgetAllocations`
- draft allocation state kept in memory while editing
- activity computed from transactions
- carryover/available calculations derived per row

The user works in a visible three-month draft window, then saves those visible months back to persistent storage.

### Reports

The reports screen derives analytics from transactions and saved allocations. Current reports include:

- inflow vs outflow over time
- budgeted vs actual
- category spend pie/donut breakdown with subcategory detail

These reports are computed in the renderer rather than stored as precomputed aggregates.

## Developer Notes

### Rendering pattern

Most screens follow this pattern:

1. Load raw records from one or more collections.
2. Build lookup maps and derived models.
3. Filter and sort the data.
4. Render HTML into the page.
5. Re-bind any event listeners needed for interactive controls.

That means when adding a feature, you usually want to find:

- the source collection in `CacheService`
- the domain model in `src/models`
- the view-model builder in `renderer.js`
- the render function that writes the HTML
- the event listener that persists edits

### State management

The renderer uses plain JavaScript state objects instead of a formal store. Examples include:

- auth view mode
- selected budget context
- transaction table sort/filter state
- transfer table sort/filter state
- budget draft state
- reports month selection

When making changes, be careful to update both:

- the persistent datastore state
- the in-memory UI state used to re-render the view

### Storage and migration

The app includes a small legacy migration path in `CacheService.migrateExistingData()`. If you change collection names or add new persistent record types, update migration behavior deliberately.

### Security model

This is a local desktop app, not a hosted service.

Important implications:

- passwords are hashed, not encrypted
- security answers are hashed, not stored in plaintext
- there is no remote email reset flow
- there is no server-side access control layer

Security here is primarily about local profile separation and avoiding obvious plaintext credential storage.

### Tradeoffs of the current architecture

Strengths:

- simple to run
- easy to inspect locally
- low infrastructure overhead
- direct data access for debugging

Tradeoffs:

- `renderer.js` is large and central
- logic, derived data, and DOM rendering are closely coupled
- there is minimal automated test coverage
- there is no strong module boundary between UI state and business logic

If this app grows further, good refactor targets would be:

- extracting budgeting calculations into dedicated utility modules
- extracting transaction and transfer table logic into smaller files
- moving reusable formatting/filter helpers into separate modules
- adding tests around budgeting math and auth/recovery flows

## Known Constraints

- The app is desktop/local only
- There is no cloud sync
- There is no multi-device collaboration
- There is no backend API
- Test coverage is currently minimal

## License

MIT

/**
 * models/index.js
 * Initializes all Sequelize models and sets up associations.
 *
 * RELATIONSHIPS (3NF design):
 *   Bank (1) ──< CreditCard (M)   [bank_id FK, CASCADE]
 *   Bank (1) ──< Loan (M)         [bank_id FK, CASCADE]
 *   Bank (1) ──< FixedDeposit (M) [bank_id FK, CASCADE]
 *   User (1) ──< SavedComparison (M) [user_id FK, CASCADE]
 */

const { sequelize } = require('../config/database');

// If DB not connected, export stubs
if (!sequelize) {
    module.exports = {
        sequelize: null,
        Bank: null, CreditCard: null,
        Loan: null, FixedDeposit: null,
        User: null, SavedComparison: null,
    };
    return;
}

const BankModel = require('./Bank');
const CreditCardModel = require('./CreditCard');
const LoanModel = require('./Loan');
const FixedDepositModel = require('./FixedDeposit');
const UserModel = require('./User');
const SavedComparisonModel = require('./SavedComparison');


const Bank = BankModel(sequelize);
const CreditCard = CreditCardModel(sequelize);
const Loan = LoanModel(sequelize);
const FixedDeposit = FixedDepositModel(sequelize);
const User = UserModel(sequelize);
const SavedComparison = SavedComparisonModel(sequelize);

// ─── Associations ──────────────────────────────────────────────────────────────

// One Bank → Many CreditCards
Bank.hasMany(CreditCard, {
    foreignKey: { name: 'bank_id', allowNull: false },
    as: 'creditCards',
    onDelete: 'CASCADE',
});
CreditCard.belongsTo(Bank, { foreignKey: 'bank_id', as: 'bank' });

// One Bank → Many Loans
Bank.hasMany(Loan, {
    foreignKey: { name: 'bank_id', allowNull: false },
    as: 'loans',
    onDelete: 'CASCADE',
});
Loan.belongsTo(Bank, { foreignKey: 'bank_id', as: 'bank' });

// One Bank → Many FixedDeposits
Bank.hasMany(FixedDeposit, {
    foreignKey: { name: 'bank_id', allowNull: false },
    as: 'fixedDeposits',
    onDelete: 'CASCADE',
});
FixedDeposit.belongsTo(Bank, { foreignKey: 'bank_id', as: 'bank' });

// One User → Many SavedComparisons
User.hasMany(SavedComparison, {
    foreignKey: { name: 'user_id', allowNull: false },
    as: 'savedComparisons',
    onDelete: 'CASCADE',
});
SavedComparison.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = { sequelize, Bank, CreditCard, Loan, FixedDeposit, User, SavedComparison };

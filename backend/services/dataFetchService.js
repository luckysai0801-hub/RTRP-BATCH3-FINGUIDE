/**
 * Mock External Data Fetch Service
 * Simulates fetching up-to-date financial rates from internet sources.
 * In production, replace fetchExternalData() with real API calls.
 */

const CreditCard = require('../models/CreditCard');
const Loan = require('../models/Loan');
const FixedDeposit = require('../models/FixedDeposit');

// Simulated external API data – mimics what a real internet scraper/API would return
function fetchExternalCreditCardRates() {
    return [
        { bankName: 'HDFC Bank', cardName: 'Regalia Gold', annualFee: 2500, joiningFee: 2500, interestRate: 43.2, cashback: 0, rewardsType: 'travel', rewardsDescription: '5X rewards on travel & dining', eligibility: 'Salaried, Income > ₹1L/mo', minIncome: 100000, rating: 4.7, features: ['5X reward points on travel', 'Complimentary airport lounge', '12 domestic lounge visits/year', 'Movie ticket offers'], applyUrl: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card' },
        { bankName: 'SBI Card', cardName: 'SimplyCLICK', annualFee: 499, joiningFee: 499, interestRate: 42.0, cashback: 1.25, rewardsType: 'shopping', rewardsDescription: '10X rewards on online shopping', eligibility: 'Salaried/Self-employed, Income > ₹20K/mo', minIncome: 20000, rating: 4.3, features: ['10X rewards on Amazon, BookMyShow', '1.25% cashback on all spends', 'Annual fee waiver on ₹1L spend', 'Contactless payments'], applyUrl: 'https://www.sbicard.com/en/personal/credit-cards/shopping/sbi-card-simply-click.page' },
        { bankName: 'Axis Bank', cardName: 'ACE Credit Card', annualFee: 499, joiningFee: 499, interestRate: 43.98, cashback: 2, rewardsType: 'cashback', rewardsDescription: '2% flat cashback on all spends', eligibility: 'Salaried, Income > ₹15K/mo', minIncome: 15000, rating: 4.5, features: ['2% cashback on all transactions', '5% cashback on bill payments', 'Google Pay integration', 'EDGE rewards program'], applyUrl: 'https://www.axisbank.com/retail/cards/credit-card/ace-credit-card' },
        { bankName: 'ICICI Bank', cardName: 'Amazon Pay ICICI', annualFee: 0, joiningFee: 0, interestRate: 40.8, cashback: 2, rewardsType: 'cashback', rewardsDescription: '5% cashback on Amazon for Prime members', eligibility: 'Salaried/Self-employed', minIncome: 25000, rating: 4.6, features: ['5% cashback on Amazon (Prime)', '2% cashback on Amazon (non-Prime)', '1% cashback on all other spends', 'No annual fee'], applyUrl: 'https://www.icicibank.com/card/credit-cards/amazon-pay-credit-card' },
        { bankName: 'HDFC Bank', cardName: 'Millennia Credit Card', annualFee: 1000, joiningFee: 1000, interestRate: 43.2, cashback: 5, rewardsType: 'cashback', rewardsDescription: '5% cashback on Amazon, Flipkart', eligibility: 'Salaried, Income > ₹35K/mo', minIncome: 35000, rating: 4.4, features: ['5% cashback on top online platforms', '2.5% cashback on wallets/PayZapp', '1% cashback on other spends', '8 CashPoints on ₹150 spent'], applyUrl: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card' },
        { bankName: 'Kotak Mahindra', cardName: '811 #DreamDifferent', annualFee: 0, joiningFee: 0, interestRate: 44.0, cashback: 2, rewardsType: 'general', rewardsDescription: '2 reward points per ₹100 spent', eligibility: 'Salaried/Self-employed', minIncome: 15000, rating: 4.0, features: ['No annual fee', '2 reward points/₹100', 'Fuel surcharge waiver', 'Online shopping offers'], applyUrl: 'https://www.kotak.com/en/personal-banking/cards/credit-cards/kotak-811-dreamdifferent-credit-card.html' },
        { bankName: 'Standard Chartered', cardName: 'Platinum Rewards', annualFee: 0, joiningFee: 0, interestRate: 41.5, cashback: 0, rewardsType: 'shopping', rewardsDescription: '5 reward points per ₹150 on dining', eligibility: 'Salaried, Income > ₹25K/mo', minIncome: 25000, rating: 4.1, features: ['5X reward points on dining', '1 reward point per ₹150', 'Fuel surcharge waiver', 'Movie discounts'], applyUrl: 'https://www.sc.com/in/credit-cards/standard-chartered-platinum-rewards-credit-card/' },
        { bankName: 'YES Bank', cardName: 'Marquee Credit Card', annualFee: 9999, joiningFee: 9999, interestRate: 39.6, cashback: 0, rewardsType: 'travel', rewardsDescription: '24 airport lounge visits per year', eligibility: 'Salaried, Income > ₹3L/mo', minIncome: 300000, rating: 4.5, features: ['24 domestic + international lounge visits', '10X reward points on travel', 'Concierge services', 'Golf privileges'], applyUrl: 'https://www.yesbank.in/personal-banking/yes-individual/cards/credit-cards/marquee-credit-card' },
        { bankName: 'RBL Bank', cardName: 'Shoprite Credit Card', annualFee: 0, joiningFee: 0, interestRate: 43.2, cashback: 5, rewardsType: 'shopping', rewardsDescription: '5% cashback on groceries', eligibility: 'Salaried/Self-employed', minIncome: 20000, rating: 3.9, features: ['5% cashback on grocery & utility bills', '10% cashback at select merchants', 'No annual fee', 'Contactless payments'], applyUrl: 'https://www.rblbank.com/credit-cards/shoprite' },
        { bankName: 'IndusInd Bank', cardName: 'Platinum Aura Edge', annualFee: 0, joiningFee: 0, interestRate: 42.5, cashback: 0, rewardsType: 'fuel', rewardsDescription: '1% fuel surcharge waiver', eligibility: 'Salaried/Self-employed', minIncome: 25000, rating: 4.0, features: ['1% fuel surcharge waiver', 'Reward points on every spend', 'Dining discounts', 'VISA offers'], applyUrl: 'https://www.indusind.com/in/en/personal/cards/credit-cards/platinum-aura-edge.html' }
    ];
}

function fetchExternalLoanRates() {
    return [
        // Personal Loans
        { bankName: 'HDFC Bank', loanName: 'Personal Loan', loanType: 'personal', interestRate: 10.50, processingFee: 2.50, minTenure: 12, maxTenure: 60, minAmount: 50000, maxAmount: 4000000, eligibility: 'Salaried, Age 21-60', minIncome: 25000, rating: 4.5, features: ['Quick disbursal in 24 hrs', 'No collateral required', 'Flexible repayment'], applyUrl: 'https://www.hdfcbank.com/personal/borrow/popular-loans/personal-loan' },
        { bankName: 'SBI', loanName: 'SBI Xpress Credit', loanType: 'personal', interestRate: 10.30, processingFee: 1.50, minTenure: 6, maxTenure: 72, minAmount: 25000, maxAmount: 2000000, eligibility: 'Govt employees, PSU, Corporate', minIncome: 15000, rating: 4.4, features: ['Lowest processing fee', 'Online application', 'No prepayment charges'], applyUrl: 'https://sbi.co.in/web/personal-banking/loans/personal-loans/xpress-credit' },
        { bankName: 'Axis Bank', loanName: 'Personal Loan', loanType: 'personal', interestRate: 10.49, processingFee: 2.00, minTenure: 12, maxTenure: 60, minAmount: 50000, maxAmount: 4000000, eligibility: 'Salaried, Age 21-60', minIncome: 15000, rating: 4.3, features: ['Instant approval', 'Minimal documentation', 'Prepayment allowed'], applyUrl: 'https://www.axisbank.com/retail/loans/personal-loan' },
        { bankName: 'ICICI Bank', loanName: 'Personal Loan', loanType: 'personal', interestRate: 10.65, processingFee: 2.25, minTenure: 12, maxTenure: 60, minAmount: 50000, maxAmount: 5000000, eligibility: 'Salaried, Age 23-61', minIncome: 25000, rating: 4.4, features: ['24-hr disbursal', 'Online tracking', 'Balance transfer facility'], applyUrl: 'https://www.icicibank.com/personal-banking/loans/personal-loan' },
        // Home Loans
        { bankName: 'SBI', loanName: 'SBI Home Loan', loanType: 'home', interestRate: 8.50, processingFee: 0.50, minTenure: 60, maxTenure: 360, minAmount: 1000000, maxAmount: 100000000, eligibility: 'Salaried/Self-employed, Age 18-70', minIncome: 25000, rating: 4.6, features: ['Lowest interest rates', 'No prepayment charges', 'Up to 30 years tenure', 'Balance transfer option'], applyUrl: 'https://sbi.co.in/web/personal-banking/loans/home-loans' },
        { bankName: 'HDFC Ltd', loanName: 'Home Loan', loanType: 'home', interestRate: 8.65, processingFee: 0.50, minTenure: 60, maxTenure: 360, minAmount: 1000000, maxAmount: 200000000, eligibility: 'Salaried/Self-employed, Age 21-65', minIncome: 30000, rating: 4.7, features: ['Wide network', '30-year max tenure', 'Online account management', 'Part prepayment allowed'], applyUrl: 'https://www.hdfc.com/home-loans' },
        { bankName: 'LIC Housing Finance', loanName: 'Home Loan', loanType: 'home', interestRate: 8.40, processingFee: 0.25, minTenure: 60, maxTenure: 300, minAmount: 1000000, maxAmount: 50000000, eligibility: 'Salaried/Self-employed, Age 21-60', minIncome: 25000, rating: 4.5, features: ['Low processing fee', 'Longer tenure available', 'Online application', 'Part prepayment'], applyUrl: 'https://www.lichousing.com/loan_products/home_loan' },
        // Car Loans
        { bankName: 'HDFC Bank', loanName: 'Car Loan', loanType: 'car', interestRate: 8.80, processingFee: 1.00, minTenure: 12, maxTenure: 84, minAmount: 100000, maxAmount: 15000000, eligibility: 'Salaried/Self-employed, Age 21-60', minIncome: 20000, rating: 4.5, features: ['90% funding on car value', 'Quick approval', 'Online EMI tracker', 'Doorstep service'], applyUrl: 'https://www.hdfcbank.com/personal/borrow/popular-loans/car-loan' },
        { bankName: 'SBI', loanName: 'Car Loan', loanType: 'car', interestRate: 8.75, processingFee: 0.51, minTenure: 12, maxTenure: 84, minAmount: 100000, maxAmount: 10000000, eligibility: 'Salaried/Self-employed, Age 21-67', minIncome: 20000, rating: 4.4, features: ['Lowest rate for Govt employees', 'No prepayment penalty', 'Online application', 'Used car loans too'], applyUrl: 'https://sbi.co.in/web/personal-banking/loans/auto-loans/sbi-car-loan' },
        { bankName: 'Axis Bank', loanName: 'Car Loan', loanType: 'car', interestRate: 9.10, processingFee: 1.00, minTenure: 12, maxTenure: 84, minAmount: 100000, maxAmount: 15000000, eligibility: 'Salaried/Self-employed, Age 21-60', minIncome: 20000, rating: 4.3, features: ['Up to 100% on-road funding', 'Minimal documentation', 'Online EMI calculator', 'Balance transfer'], applyUrl: 'https://www.axisbank.com/retail/loans/car-loan' }
    ];
}

function fetchExternalFDRates() {
    return [
        { bankName: 'SBI', schemeName: 'SBI Fixed Deposit', interestRate: 6.80, seniorCitizenRate: 7.30, minTenure: 7, maxTenure: 3650, minAmount: 1000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'public', rating: 4.5, applyUrl: 'https://sbi.co.in/web/personal-banking/investments-deposits/deposits/term-deposits/fixed-deposit' },
        { bankName: 'HDFC Bank', schemeName: 'HDFC Fixed Deposit', interestRate: 7.10, seniorCitizenRate: 7.60, minTenure: 7, maxTenure: 3650, minAmount: 5000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'private', rating: 4.7, applyUrl: 'https://www.hdfcbank.com/personal/save/deposits/fixed-deposit' },
        { bankName: 'ICICI Bank', schemeName: 'ICICI Fixed Deposit', interestRate: 7.10, seniorCitizenRate: 7.60, minTenure: 7, maxTenure: 3650, minAmount: 10000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'private', rating: 4.6, applyUrl: 'https://www.icicibank.com/personal-banking/deposits/fixed-deposit' },
        { bankName: 'Axis Bank', schemeName: 'Axis Fixed Deposit', interestRate: 7.10, seniorCitizenRate: 7.60, minTenure: 7, maxTenure: 3650, minAmount: 5000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'private', rating: 4.5, applyUrl: 'https://www.axisbank.com/retail/deposits/fixed-deposit' },
        { bankName: 'Kotak Mahindra Bank', schemeName: 'Kotak FD', interestRate: 7.25, seniorCitizenRate: 7.75, minTenure: 7, maxTenure: 3650, minAmount: 5000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'private', rating: 4.4, applyUrl: 'https://www.kotak.com/en/personal-banking/deposits/term-deposits/fixed-deposit.html' },
        { bankName: 'Punjab National Bank', schemeName: 'PNB Fixed Deposit', interestRate: 6.75, seniorCitizenRate: 7.25, minTenure: 7, maxTenure: 3650, minAmount: 1000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'public', rating: 4.2, applyUrl: 'https://www.pnbindia.in/fixed-deposit.html' },
        { bankName: 'Bank of Baroda', schemeName: 'BOB Fixed Deposit', interestRate: 6.85, seniorCitizenRate: 7.35, minTenure: 7, maxTenure: 3650, minAmount: 1000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'public', rating: 4.2, applyUrl: 'https://www.bankofbaroda.in/banking-mantra/savings/articles/fixed-deposit' },
        { bankName: 'Canara Bank', schemeName: 'Canara Fixed Deposit', interestRate: 6.80, seniorCitizenRate: 7.30, minTenure: 7, maxTenure: 3650, minAmount: 1000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'public', rating: 4.1, applyUrl: 'https://canarabank.com/User_page.aspx?othlink=9' },
        { bankName: 'YES Bank', schemeName: 'YES Bank FD', interestRate: 7.75, seniorCitizenRate: 8.25, minTenure: 7, maxTenure: 3650, minAmount: 10000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'private', rating: 3.8, applyUrl: 'https://www.yesbank.in/personal-banking/yes-individual/deposits/fixed-deposits' },
        { bankName: 'IndusInd Bank', schemeName: 'IndusInd FD', interestRate: 7.50, seniorCitizenRate: 8.00, minTenure: 7, maxTenure: 3650, minAmount: 10000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'private', rating: 4.2, applyUrl: 'https://www.indusind.com/in/en/personal/deposits/fixed-deposit.html' },
        { bankName: 'Shriram Finance', schemeName: 'Shriram Fixed Deposit', interestRate: 8.51, seniorCitizenRate: 8.76, minTenure: 180, maxTenure: 1825, minAmount: 5000, maxAmount: 999999999, compoundingFrequency: 'monthly', bankType: 'nbfc', rating: 4.0, applyUrl: 'https://www.shriramfinance.in/fixed-deposits' },
        { bankName: 'Utkarsh Small Finance Bank', schemeName: 'Utkarsh FD', interestRate: 8.50, seniorCitizenRate: 9.00, minTenure: 7, maxTenure: 1825, minAmount: 1000, maxAmount: 999999999, compoundingFrequency: 'quarterly', bankType: 'small_finance', rating: 4.0, applyUrl: 'https://www.utkarsh.bank/fixed-deposits' }
    ];
}

// Add slight random variation to simulate live rate changes (±0.25%)
function addRateVariation(rate) {
    const variation = (Math.random() - 0.5) * 0.5;
    return Math.round((rate + variation) * 100) / 100;
}

async function updateAllRates() {
    const results = { updated: { creditCards: 0, loans: 0, fds: 0 }, errors: [] };

    try {
        // Update Credit Cards
        const cards = fetchExternalCreditCardRates();
        for (const card of cards) {
            await CreditCard.findOneAndUpdate(
                { bankName: card.bankName, cardName: card.cardName },
                { ...card, interestRate: addRateVariation(card.interestRate), lastUpdated: new Date() },
                { upsert: true, new: true, runValidators: true }
            );
            results.updated.creditCards++;
        }
    } catch (err) {
        results.errors.push(`Credit cards: ${err.message}`);
    }

    try {
        // Update Loans
        const loans = fetchExternalLoanRates();
        for (const loan of loans) {
            await Loan.findOneAndUpdate(
                { bankName: loan.bankName, loanName: loan.loanName, loanType: loan.loanType },
                { ...loan, interestRate: addRateVariation(loan.interestRate), lastUpdated: new Date() },
                { upsert: true, new: true, runValidators: true }
            );
            results.updated.loans++;
        }
    } catch (err) {
        results.errors.push(`Loans: ${err.message}`);
    }

    try {
        // Update Fixed Deposits
        const fds = fetchExternalFDRates();
        for (const fd of fds) {
            await FixedDeposit.findOneAndUpdate(
                { bankName: fd.bankName, schemeName: fd.schemeName },
                { ...fd, interestRate: addRateVariation(fd.interestRate), seniorCitizenRate: addRateVariation(fd.seniorCitizenRate), lastUpdated: new Date() },
                { upsert: true, new: true, runValidators: true }
            );
            results.updated.fds++;
        }
    } catch (err) {
        results.errors.push(`FDs: ${err.message}`);
    }

    results.lastUpdated = new Date().toISOString();
    return results;
}

module.exports = { updateAllRates };

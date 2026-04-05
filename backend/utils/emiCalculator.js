/**
 * utils/emiCalculator.js
 * Standard EMI formula: EMI = P × r × (1+r)^n / ((1+r)^n – 1)
 * where r = monthly interest rate, n = tenure months
 */

const calcEMI = (principal, annualRate, tenureMonths) => {
    const r = annualRate / 100 / 12;  // monthly rate
    if (r === 0) return principal / tenureMonths;
    const emi = (principal * r * Math.pow(1 + r, tenureMonths)) / (Math.pow(1 + r, tenureMonths) - 1);
    return Math.round(emi * 100) / 100;
};

const calcLoanSummary = (principal, annualRate, tenureMonths) => {
    const emi = calcEMI(principal, annualRate, tenureMonths);
    const totalPayment = Math.round(emi * tenureMonths * 100) / 100;
    const totalInterest = Math.round((totalPayment - principal) * 100) / 100;

    // Monthly breakdown (first 12 months max for display)
    const r = annualRate / 100 / 12;
    let balance = principal;
    const schedule = [];
    for (let i = 1; i <= Math.min(tenureMonths, 12); i++) {
        const interestPaid = Math.round(balance * r * 100) / 100;
        const principalPaid = Math.round((emi - interestPaid) * 100) / 100;
        balance = Math.max(0, Math.round((balance - principalPaid) * 100) / 100);
        schedule.push({ month: i, emi, interest: interestPaid, principal: principalPaid, balance });
    }

    return { emi, totalPayment, totalInterest, schedule };
};

module.exports = { calcEMI, calcLoanSummary };

/**
 * utils/fdCalculator.js
 * FD Maturity calculation with 4 compounding modes.
 */

const calcMaturity = (principal, annualRate, tenureDays, frequency = 'quarterly', isSenior = false) => {
    const seniorBonus = isSenior ? 0.5 : 0;
    const effectiveRate = annualRate + seniorBonus;
    const r = effectiveRate / 100;
    const t = tenureDays / 365;

    let maturity;
    switch (frequency) {
        case 'monthly': maturity = principal * Math.pow(1 + r / 12, 12 * t); break;
        case 'quarterly': maturity = principal * Math.pow(1 + r / 4, 4 * t); break;
        case 'annually': maturity = principal * Math.pow(1 + r, t); break;
        case 'simple': maturity = principal * (1 + r * t); break;
        default: maturity = principal * Math.pow(1 + r / 4, 4 * t);
    }

    const maturityAmount = Math.round(maturity * 100) / 100;
    const interestEarned = Math.round((maturityAmount - principal) * 100) / 100;

    return {
        principal,
        annualRate,
        effectiveRate,
        isSeniorCitizen: isSenior,
        tenureDays,
        tenureYears: Math.round(t * 100) / 100,
        frequency,
        maturityAmount,
        interestEarned,
    };
};

module.exports = { calcMaturity };

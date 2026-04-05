/**
 * scripts/seed.js
 * Seeds PostgreSQL database with all banks, 55+ credit cards, 12 loans, 14 FDs.
 * Run: npm run seed
 *
 * ACADEMIC NOTE:
 * This script demonstrates the use of relational FKs:
 *   Banks are inserted first, then products reference bank.id via bank_id FK.
 *   ON DELETE CASCADE ensures removing a bank removes all its products.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Bank, CreditCard, Loan, FixedDeposit } = require('../models');
const { MOCK_BANKS, MOCK_CREDIT_CARDS, MOCK_LOANS, MOCK_FDS } = require('../config/mockData');

async function seed() {
    if (!sequelize) {
        console.error('❌ No DATABASE_URL configured. Cannot seed.');
        process.exit(1);
    }

    try {
        await sequelize.authenticate();
        console.log('✅ Connected to PostgreSQL');

        // Sync schema (create tables if not exist)
        await sequelize.sync({ alter: true });
        console.log('✅ Tables synchronized\n');



        // ── 2. Seed Banks ────────────────────────────────────────────────────
        console.log('\n🏦 Seeding banks...');
        const bankMap = {};  // name → DB record (to get real auto-increment IDs)
        for (const b of MOCK_BANKS) {
            const [bank, created] = await Bank.findOrCreate({
                where: { name: b.name },
                defaults: { name: b.name, bank_type: b.bank_type, established: b.established, headquarters: b.headquarters, website: b.website },
            });
            bankMap[b.id] = bank.id; // Map mock id → real PK
            if (created) process.stdout.write(`   ✅ Bank: ${b.name}\n`);
        }
        console.log(`   📊 ${Object.keys(bankMap).length} banks processed`);

        // ── 3. Seed Credit Cards ─────────────────────────────────────────────
        console.log('\n💳 Seeding credit cards...');
        let ccCreated = 0;
        for (const c of MOCK_CREDIT_CARDS) {
            const realBankId = bankMap[c.bank_id];
            if (!realBankId) { console.warn(`   ⚠️  No bank found for card ${c.card_name}`); continue; }
            const [, created] = await CreditCard.findOrCreate({
                where: { bank_id: realBankId, card_name: c.card_name },
                defaults: {
                    bank_id: realBankId, card_name: c.card_name, annual_fee: c.annual_fee,
                    joining_fee: c.joining_fee, interest_rate: c.interest_rate, cashback: c.cashback,
                    rewards_type: c.rewards_type, rewards_description: c.rewards_description,
                    min_income: c.min_income, rating: c.rating, features: c.features || [],
                    apply_url: c.apply_url, network: c.network, lounge_access: c.lounge_access || false,
                    fuel_surcharge_waiver: c.fuel_surcharge_waiver || false, is_active: true,
                    last_updated: new Date(),
                },
            });
            if (created) ccCreated++;
        }
        console.log(`   📊 ${ccCreated} new credit cards inserted (${MOCK_CREDIT_CARDS.length} total processed)`);

        // ── 4. Seed Loans ────────────────────────────────────────────────────
        console.log('\n🏠 Seeding loans...');
        let lnCreated = 0;
        for (const l of MOCK_LOANS) {
            const realBankId = bankMap[l.bank_id];
            if (!realBankId) continue;
            const [, created] = await Loan.findOrCreate({
                where: { bank_id: realBankId, loan_name: l.loan_name },
                defaults: {
                    bank_id: realBankId, loan_name: l.loan_name, loan_type: l.loan_type,
                    interest_rate: l.interest_rate, processing_fee: l.processing_fee,
                    min_tenure: l.min_tenure, max_tenure: l.max_tenure,
                    min_amount: l.min_amount, max_amount: l.max_amount,
                    min_income: l.min_income, features: l.features || [], rating: l.rating,
                    apply_url: l.apply_url, is_active: true,
                },
            });
            if (created) lnCreated++;
        }
        console.log(`   📊 ${lnCreated} new loans inserted`);

        // ── 5. Seed Fixed Deposits ───────────────────────────────────────────
        console.log('\n🏦 Seeding fixed deposits...');
        let fdCreated = 0;
        for (const f of MOCK_FDS) {
            const realBankId = bankMap[f.bank_id];
            if (!realBankId) continue;
            const [, created] = await FixedDeposit.findOrCreate({
                where: { bank_id: realBankId, scheme_name: f.scheme_name },
                defaults: {
                    bank_id: realBankId, scheme_name: f.scheme_name,
                    interest_rate: f.interest_rate, senior_citizen_rate: f.senior_citizen_rate,
                    min_tenure: f.min_tenure, max_tenure: f.max_tenure,
                    min_amount: f.min_amount, compounding_frequency: f.compounding_frequency,
                    rating: f.rating, apply_url: f.apply_url,
                    premature_withdrawal: f.premature_withdrawal !== false,
                    loan_against_fd: f.loan_against_fd !== false,
                    is_active: true,
                },
            });
            if (created) fdCreated++;
        }
        console.log(`   📊 ${fdCreated} new FDs inserted`);

        console.log('\n🌱 Seed completed successfully!');
        console.log(`\n📋 Summary:`);
        console.log(`   Banks: ${Object.keys(bankMap).length}`);
        console.log(`   Credit Cards: ${MOCK_CREDIT_CARDS.length}`);
        console.log(`   Loans: ${MOCK_LOANS.length}`);
        console.log(`   Fixed Deposits: ${MOCK_FDS.length}`);
        console.log(`\n🔐 Admin Login:`);
        console.log(`   Email: ${process.env.ADMIN_EMAIL}`);
        console.log(`   Password: ${process.env.ADMIN_PASSWORD}`);
        console.log('\n✨ Your FIN GUIDE database is ready!\n');

        await sequelize.close();
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Seed failed:', err.message);
        console.error(err);
        process.exit(1);
    }
}

seed();

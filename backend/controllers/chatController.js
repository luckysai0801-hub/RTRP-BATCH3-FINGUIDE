/**
 * controllers/chatController.js
 * AI Chatbot powered by Google Gemini (@google/generative-ai)
 * Context-aware: reads from PostgreSQL to answer live queries.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { CreditCard, Loan, FixedDeposit } = require('../models');

// We will initialize this inside the request handler to prevent 
// synchronous crashes on server startup if the key is missing in .env
let genAI = null;

const SYSTEM_PROMPT = `You are FinBot, an expert financial advisor for the "FIN GUIDE" Indian comparison platform.
Your job is to help users find the best credit cards, loans, and fixed deposits.
Be concise, friendly, and use markdown for formatting (bullet points, bold text).
Never invent data. Use ONLY the live data provided in the system context below to answer questions.
If you don't know the answer based on the context, ask the user to clarify or check the main product pages.`;

const chat = async (req, res) => {
    try {
        const { message, history } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        // 1. Fetch live data context from DB
        const [cards, loans, fds] = await Promise.all([
            CreditCard.findAll({ where: { is_active: true }, limit: 15, attributes: ['card_name', 'bank_id', 'annual_fee', 'cashback', 'interest_rate', 'rewards_type', 'rating'], include: ['bank'] }),
            Loan.findAll({ where: { is_active: true }, limit: 10, attributes: ['loan_name', 'bank_id', 'interest_rate', 'loan_type', 'max_amount'], include: ['bank'] }),
            FixedDeposit.findAll({ where: { is_active: true }, limit: 10, attributes: ['scheme_name', 'bank_id', 'interest_rate', 'senior_citizen_rate', 'max_tenure'], include: ['bank'] })
        ]);

        if (!process.env.GEMINI_API_KEY) {
            // MOCK AI ENGINE: Intelligent Rule-Based Fallback
            const msg = message.toLowerCase();
            let reply = "I'm FinBot! How can I help you today?";
            
            if (msg.includes('credit card') || msg.includes('card')) {
                const bestCards = cards.slice(0,3).map(c => `- **${c.card_name}** (${c.bank?.name}): ₹${c.annual_fee} fee, ${c.cashback}% cashback.`).join('\n');
                reply = `Here are some highly rated credit cards right now:\n${bestCards}\n\nExplore more on our **Credit Cards** page!`;
            } else if (msg.includes('loan')) {
                const bestLoans = loans.slice(0,3).map(l => `- **${l.loan_name}** (${l.bank?.name}): Starts at ${l.interest_rate}% p.a.`).join('\n');
                reply = `Looking for a loan? Here are top current offers:\n${bestLoans}\n\nCheck our **Loans** page to calculate your EMI.`;
            } else if (msg.includes('fd') || msg.includes('fixed deposit')) {
                const bestFDs = fds.slice(0,3).map(f => `- **${f.scheme_name}** (${f.bank?.name}): Up to ${f.interest_rate}% p.a. (Senior: ${f.senior_citizen_rate}%)`).join('\n');
                reply = `Here are the top Fixed Deposit rates:\n${bestFDs}\n\nYou can use the FD calculator on the **Fixed Deposits** page.`;
            } else if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
                reply = `Hello there! 👋 I'm FinBot, your personal financial assistant. You can ask me about the best **credit cards**, latest **loans**, or top **fixed deposits**! What are you looking for today?`;
            } else {
                reply = `That's an interesting question! My expertise is strictly in financial products. Based on our live database, we cover ${cards.length} cards, ${loans.length} loans, and ${fds.length} FDs. Try asking me "What is the best credit card?" or "Tell me about loans".`;
            }
            return res.json({ success: true, reply, timestamp: new Date().toISOString() });
        }

        const dbContext = `
        LIVE DATABASE CONTEXT:
        Credit Cards: ${JSON.stringify(cards.map(c => ({ name: c.card_name, bank: c.bank?.name, fee: c.annual_fee, cashback: c.cashback, type: c.rewards_type })))}
        Loans: ${JSON.stringify(loans.map(l => ({ name: l.loan_name, bank: l.bank?.name, rate: l.interest_rate, type: l.loan_type })))}
        FDs: ${JSON.stringify(fds.map(f => ({ name: f.scheme_name, bank: f.bank?.name, rate: f.interest_rate, senior_rate: f.senior_citizen_rate })))}
        `;

        if (!genAI) {
            genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        }

        // 2. Prepare conversation
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: SYSTEM_PROMPT + '\n' + dbContext
        });

        const chatSession = model.startChat({
            generationConfig: { temperature: 0.3 },
            history: [] // Passing empty history here for simplicity, appending contexts handles single turns.
        });

        const result = await chatSession.sendMessage(message);
        const responseText = result.response.text();

        res.json({ success: true, reply: responseText, timestamp: new Date().toISOString() });

    } catch (err) {
        console.error('Gemini API Error:', err);
        res.status(500).json({ success: false, message: 'AI generation failed. Please try again.' });
    }
};

module.exports = { chat };

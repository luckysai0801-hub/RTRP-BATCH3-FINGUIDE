/**
 * server.js
 * FIN GUIDE – Express Server (PostgreSQL + Sequelize)
 * Serves both the REST API and frontend static files.
 */

console.log("--- STARTING SERVER.JS ---");
require('dotenv').config();
console.log("--- DOTENV LOADED ---");
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { connectDB } = require('./config/database');
console.log("--- DB CONFIG LOADED ---");

const app = express();

// ── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts in HTML pages
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ── Static Frontend Files ─────────────────────────────────────────────────────
const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND));

// ── API Routes ────────────────────────────────────────────────────────────────
// Unified data routes (filtering / pagination / stats) — registered FIRST so
// GET /api/cards, /api/loans, /api/fds, /api/banks, /api/stats are handled here.
app.use('/api', require('./routes/dataRoutes'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/banks', require('./routes/banks'));
app.use('/api/credit-cards', require('./routes/creditCards'));
app.use('/api/cards',        require('./routes/cards'));        // multi-source aggregator
app.use('/api/loans', require('./routes/loans'));
app.use('/api/fds', require('./routes/fds'));

app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/saved-comparisons', require('./routes/savedComparisons'));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const { sequelize } = require('./models');
  res.json({
    success: true,
    status: 'ok',
    database: sequelize ? 'postgresql' : 'mock-data',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// ── SPA Fallback – Serve index.html for unknown routes ───────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: `Route ${req.path} not found` });
  }
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
  console.error('FATAL UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('FATAL UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const startServer = async () => {
  try {
    // Connect to PostgreSQL (may fail gracefully → mock-data mode)
    const dbConnected = await connectDB();

    if (dbConnected) {
      // Sync Sequelize models — alter tables if schema changed (safe in dev)
      try {
        const { sequelize } = require('./models');
        await sequelize.sync({ alter: true });
        console.log('✅ Sequelize models synced to MySQL');
        
        // Start weekly auto-update scheduler
        const { startScheduler } = require('./scraper/scheduler');
        startScheduler();
        
      } catch (syncErr) {
        console.warn('⚠️  Sequelize sync warning:', syncErr.message);
      }
    }

    app.listen(PORT, () => {
      console.log(`\n🚀 FIN GUIDE v2.0 running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      console.log(`🌐 Frontend: http://localhost:${PORT}`);
      console.log(`📡 API Base: http://localhost:${PORT}/api`);
      console.log(`💾 Database: ${dbConnected ? 'PostgreSQL (Sequelize)' : 'Mock Data Mode'}\n`);
    });
  } catch (err) {
    console.error('FATAL ERROR DURING STARTUP:', err);
  }
};

startServer();

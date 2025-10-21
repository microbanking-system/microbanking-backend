// =============================================================================
// DEPENDENCIES
// =============================================================================
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

// =============================================================================
// ROUTE IMPORTS
// =============================================================================
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');
const managerRoutes = require('./routes/manager');
const publicRoutes = require('./routes/public');

// =============================================================================
// MIDDLEWARE IMPORTS
// =============================================================================
const { verifyToken } = require('./middleware/auth');

// =============================================================================
// SCHEDULER IMPORTS
// =============================================================================
const { startInterestSchedulers } = require('./schedulers/interestScheduler');

// =============================================================================
// LOGGING UTILITY (Optional - for cleaner console output)
// =============================================================================
// Uncomment the lines below to suppress general logs and only show interest logs
// const { getMorganFormat, setupConsoleOverride } = require('./utils/logger');
// setupConsoleOverride(); // Suppress non-interest console.log calls

// =============================================================================
// APPLICATION CONFIGURATION
// =============================================================================
const app = express();
const PORT = process.env.PORT || 5000;

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Morgan logging - use 'dev' format or suppress completely
// To suppress HTTP logs, set SUPPRESS_GENERAL_LOGS=1 in .env
if (process.env.SUPPRESS_GENERAL_LOGS !== '1') {
  app.use(morgan('dev'));
}

// =============================================================================
// API ROUTES
// =============================================================================
// Public routes (no authentication required)
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// Convenience alias for login (redirect /api/login to /api/auth/login)
const authController = require('./controllers/authController');
app.post('/api/login', authController.login);

// Protected routes (JWT authentication required)
app.use('/api/agent', verifyToken, agentRoutes);
app.use('/api/admin', verifyToken, adminRoutes);
app.use('/api/manager', verifyToken, managerRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'B-Trust Microbanking System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================
// 404 handler - catch all unmatched routes
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });

  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// =============================================================================
// SERVER INITIALIZATION
// =============================================================================
const pool = require('./config/database');

app.listen(PORT, async () => {
  console.log('='.repeat(60));
  console.log('🚀 B-Trust Microbanking System API Server');
  console.log('='.repeat(60));
  console.log(`📍 Server running on port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  // Test database connection
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection verified');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }

  // =============================================================================
  // START INTEREST SCHEDULERS
  // =============================================================================
  try {
    startInterestSchedulers();
    console.log('✅ Interest schedulers initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize interest schedulers:', error.message);
    console.error('   Interest processing will not run automatically.');
    console.error('   Check that node-cron is installed: npm install node-cron');
  }
  
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM signal received: closing HTTP server');
  pool.end(() => {
    console.log('💤 Database pool closed');
  });
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT signal received: closing HTTP server');
  pool.end(() => {
    console.log('💤 Database pool closed');
    process.exit(0);
  });
});

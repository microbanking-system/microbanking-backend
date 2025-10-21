// =============================================================================
// AGENT ROUTES - Protected agent endpoints
// =============================================================================
const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const agentController = require('../controllers/agentController');

// All routes here require JWT authentication (applied in index.js)
// Additional role check for Agent/Admin
router.use(authorize('Agent', 'Admin'));

/**
 * POST /api/agent/transactions/process
 * Process a transaction (deposit/withdrawal)
 */
router.post('/transactions/process', agentController.processTransaction);

/**
 * POST /api/agent/customers/register
 * Register a new customer
 */
router.post('/customers/register', agentController.registerCustomer);

/**
 * GET /api/agent/customers
 * Get all customers
 */
router.get('/customers', agentController.getCustomers);

/**
 * GET /api/agent/customers/by-nic/:nic
 * Get a single customer by NIC/Birth Certificate number (exact)
 */
router.get('/customers/by-nic/:nic', agentController.getCustomerByNic);

/**
 * GET /api/agent/customers/:id
 * Get customer details by ID
 */
router.get('/customers/:id', agentController.getCustomerById);

/**
 * PUT /api/agent/customers/:id
 * Update customer details
 */
router.put('/customers/:id', agentController.updateCustomer);

/**
 * PUT /api/agent/customers/:id/contact
 * Update customer contact details only
 */
router.put('/customers/:id/contact', agentController.updateCustomerContact);

/**
 * POST /api/agent/accounts/create
 * Create a new account for customer
 */
router.post('/accounts/create', agentController.createAccount);

/**
 * GET /api/agent/accounts
 * Get active accounts for transaction processing
 */
router.get('/accounts', agentController.getAccounts);

/**
 * GET /api/agent/accounts/:id/details
 * Get full details for a specific account
 */
router.get('/accounts/:id/details', agentController.getAccountDetails);

/**
 * GET /api/agent/performance
 * Get agent performance metrics
 */
router.get('/performance', agentController.getPerformance);

/**
 * GET /api/agent/transactions/recent
 * Get recent transactions
 */
router.get('/transactions/recent', agentController.getRecentTransactions);

/**
 * POST /api/agent/fixed-deposits/create
 * Create a new fixed deposit
 */
router.post('/fixed-deposits/create', agentController.createFixedDeposit);

/**
 * GET /api/agent/fixed-deposits/search
 * Search fixed deposits
 */
router.get('/fixed-deposits/search', agentController.searchFixedDeposits);

/**
 * GET /api/agent/fixed-deposits/by-nic/:nic
 * Get fixed deposits by exact NIC/Birth Certificate number
 */
router.get('/fixed-deposits/by-nic/:nic', agentController.getFixedDepositsByNic);

/**
 * POST /api/agent/fixed-deposits/deactivate
 * Deactivate a fixed deposit
 */
router.post('/fixed-deposits/deactivate', agentController.deactivateFixedDeposit);

/**
 * POST /api/agent/accounts/deactivate
 * Deactivate an account
 */
router.post('/accounts/deactivate', agentController.deactivateAccount);

/**
 * GET /api/agent/accounts/search/:searchTerm
 * Search accounts by term
 */
router.get('/accounts/search/:searchTerm', agentController.searchAccounts);

/**
 * POST /api/agent/accounts/change-plan
 * Change account saving plan
 */
router.post('/accounts/change-plan', agentController.changeAccountPlan);

/**
 * GET /api/agent/all-accounts
 * Get all accounts with full details (for management/viewing)
 */
router.get('/all-accounts', agentController.getAllAccounts);

/**
 * GET /api/agent/accounts/by-nic/:nic
 * Get accounts for a customer by NIC/Birth Certificate number (exact)
 */
router.get('/accounts/by-nic/:nic', agentController.getAccountsByCustomerNic);

/**
 * GET /api/agent/accounts-with-fd
 * Get accounts eligible for FD creation (active, no existing FD)
 */
router.get('/accounts-with-fd', agentController.getAccountsWithFd);

/**
 * GET /api/agent/fixed-deposits
 * Get all fixed deposits
 */
router.get('/fixed-deposits', agentController.getFixedDeposits);

/**
 * GET /api/agent/analytics/transaction-types
 * Get transaction analytics by account type
 */
router.get('/analytics/transaction-types', agentController.getTransactionTypeAnalytics);

/**
 * GET /api/agent/analytics/transaction-trend
 * Get last 30 days transaction trend
 */
router.get('/analytics/transaction-trend', agentController.getTransactionTrend);

module.exports = router;

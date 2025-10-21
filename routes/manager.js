// =============================================================================
// MANAGER ROUTES - Protected manager endpoints
// =============================================================================
const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const managerController = require('../controllers/managerController');

// All routes here require JWT authentication (applied in index.js)
// Additional role check for Manager/Admin
router.use(authorize('Manager', 'Admin'));

/**
 * GET /api/manager/customers/search
 * Search customers within manager's branch
 */
router.get('/customers/search', managerController.searchCustomers);

/**
 * GET /api/manager/customers/by-nic/:nic
 * Get customers by exact NIC/Birth Certificate number within manager's branch
 */
router.get('/customers/by-nic/:nic', managerController.getCustomersByNic);

/**
 * GET /api/manager/team/agents
 * Get agents in manager's branch with performance data
 */
router.get('/team/agents', managerController.getTeamAgents);

/**
 * GET /api/manager/team/agents/:agentId/transactions
 * Get specific agent's transactions
 */
router.get('/team/agents/:agentId/transactions', managerController.getAgentTransactions);

/**
 * GET /api/manager/transactions
 * Get branch transactions with filters
 */
router.get('/transactions', managerController.getBranchTransactions);

/**
 * GET /api/manager/accounts
 * Get customer accounts for manager's branch
 */
router.get('/accounts', managerController.getBranchAccounts);

// TODO: Add more manager routes as needed

module.exports = router;

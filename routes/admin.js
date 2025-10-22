// =============================================================================
// ADMIN ROUTES - Protected admin endpoints
// =============================================================================
const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');

const adminController = require('../controllers/adminController');

// All routes here require JWT authentication (applied in index.js)
// Additional role check for Admin only
router.use(authorize('Admin'));

/**
 * POST /api/admin/register
 * Register a new employee (Admin, Manager, Agent)
 */
router.post('/register', adminController.registerEmployee);

/**
 * GET /api/admin/users
 * Get all users/employees
 */
router.get('/users', adminController.getUsers);

/**
 * DELETE /api/admin/users/:id
 * Delete a user/employee
 */
router.delete('/users/:id', adminController.deleteUser);

/**
 * PATCH /api/admin/users/:id/status
 * Activate/Deactivate a user (soft delete/restore)
 */
router.patch('/users/:id/status', adminController.updateUserStatus);

/**
 * GET /api/admin/branches
 * Get all branches
 */
router.get('/branches', adminController.getBranches);

/**
 * POST /api/admin/branches
 * Create a new branch
 */
router.post('/branches', adminController.createBranch);

/**
 * DELETE /api/admin/branches/:id
 * Delete a branch
 */
router.delete('/branches/:id', adminController.deleteBranch);

/**
 * POST /api/admin/refresh-views
 * Refresh materialized views
 */
router.post('/refresh-views', adminController.refreshViews);

/**
 * GET /api/admin/reports/*
 * Various admin reports
 */
router.get('/reports/agent-transactions', adminController.getAgentTransactionsReport);
router.get('/reports/account-summaries', adminController.getAccountSummariesReport);
router.get('/reports/active-fds', adminController.getActiveFDsReport);
router.get('/reports/interest-summary', adminController.getInterestSummaryReport);
router.get('/reports/customer-activity', adminController.getCustomerActivityReport);

/**
 * GET /api/admin/savings-interest/summary
 * Savings interest automation summary for Admin UI
 */
router.get('/savings-interest/summary', adminController.getSavingsInterestSummary);

/**
 * GET /api/admin/fd-interest/summary
 * Fixed Deposit interest automation summary for Admin UI
 */
router.get('/fd-interest/summary', adminController.getFDInterestSummary);

// TODO: Add more admin routes as needed

module.exports = router;

// =============================================================================
// PUBLIC ROUTES - No authentication required
// =============================================================================
const express = require('express');
const router = express.Router();
const { getSavingPlans, getBranches, getFDPlans, getAbout } = require('../controllers/publicController');

/**
 * GET /api/public/saving-plans
 * Get all saving plans (public)
 */
router.get('/saving-plans', getSavingPlans);

/**
 * GET /api/public/branches
 * Get all branches (public)
 */
router.get('/branches', getBranches);

/**
 * GET /api/public/fd-plans
 * Get all fixed deposit plans (public)
 */
router.get('/fd-plans', getFDPlans);

/**
 * GET /api/public/about
 * Get bank information
 */
router.get('/about', getAbout);

module.exports = router;

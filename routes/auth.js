// =============================================================================
// AUTH ROUTES - Public authentication endpoints
// =============================================================================
const express = require('express');
const router = express.Router();
const { login, register, refreshToken } = require('../controllers/authController');

/**
 * POST /api/auth/login
 * Public endpoint for user login
 * Body: { username, password }
 * Returns: { token, user: { id, username, role, ... } }
 */
router.post('/login', login);

/**
 * POST /api/auth/register
 * Public endpoint for user registration (disabled - use admin registration)
 * Body: { username, password, email, ... }
 */
router.post('/register', register);

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', refreshToken);

module.exports = router;

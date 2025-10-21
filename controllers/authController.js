// =============================================================================
// AUTH CONTROLLER - Authentication Business Logic
// =============================================================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

/**
 * Login user
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  const { username, password } = req.body;

  console.log('Login attempt:', username);

  // Validation
  if (!username || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Username and password are required'
    });
  }

  const client = await pool.connect();

  try {
    const query = 'SELECT * FROM employee WHERE username = $1';
    const result = await client.query(query, [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];
    
    // Compare password with bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log('Password does not match');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Create token using required secret
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set in environment');
      return res.status(500).json({ status: 'error', message: 'Server configuration error' });
    }
    const token = jwt.sign(
      { id: user.employee_id, role: user.role },
      secret,
      { expiresIn: '1h' }
    );

    res.json({
      status: 'success',
      token,
      user: {
        id: user.employee_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database error'
    });
  } finally {
    client.release();
  }
};

/**
 * Register new user (placeholder - to be implemented if needed)
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  res.status(501).json({
    status: 'error',
    message: 'Public registration is not enabled. Use admin registration endpoint.'
  });
};

/**
 * Refresh token (placeholder - to be implemented if needed)
 * POST /api/auth/refresh
 */
exports.refreshToken = async (req, res) => {
  res.status(501).json({
    status: 'error',
    message: 'Token refresh not yet implemented'
  });
};

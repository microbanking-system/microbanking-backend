// =============================================================================
// PUBLIC CONTROLLER - Public API Endpoints (No authentication required)
// =============================================================================
const pool = require('../config/database');

/**
 * Get all saving plans
 * GET /api/public/saving-plans
 */
exports.getSavingPlans = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT saving_plan_id, plan_type, interest, min_balance 
      FROM savingplan 
      ORDER BY plan_type
    `);
    
    res.json({
      status: 'success',
      saving_plans: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database error'
    });
  } finally {
    client.release();
  }
};

/**
 * Get all branches
 * GET /api/public/branches
 */
exports.getBranches = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT branch_id, name 
      FROM branch 
      ORDER BY name
    `);
    
    res.json({
      status: 'success',
      branches: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database error'
    });
  } finally {
    client.release();
  }
};

/**
 * Get all FD plans
 * GET /api/public/fd-plans
 */
exports.getFDPlans = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT fd_plan_id, fd_options, interest 
      FROM fdplan 
      ORDER BY fd_options
    `);
    
    res.json({
      status: 'success',
      fd_plans: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database error'
    });
  } finally {
    client.release();
  }
};

/**
 * Get bank information
 * GET /api/public/about
 */
exports.getAbout = (req, res) => {
  res.json({
    status: 'success',
    data: {
      name: 'B-Trust Microbanking System',
      version: '1.0.0',
      description: 'Professional microbanking solution',
      features: [
        'Customer account management',
        'Fixed deposit accounts',
        'Transaction processing',
        'Interest calculation',
        'Multi-branch support'
      ]
    }
  });
};

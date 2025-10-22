// =============================================================================
// ADMIN CONTROLLER - Admin Business Logic
// =============================================================================
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

/**
 * Register new employee (Admin, Manager, Agent)
 * POST /api/admin/register
 */
exports.registerEmployee = async (req, res) => {
  const { 
    role, 
    username, 
    password, 
    first_name, 
    last_name, 
    nic, 
    gender, 
    date_of_birth, 
    branch_id,
    contact_no_1,
    contact_no_2,
    address,
    email
  } = req.body;

  // Validation
  if (!username || !password || !first_name || !last_name || !nic || !gender || !date_of_birth || !branch_id) {
    return res.status(400).json({
      status: 'error',
      message: 'All basic fields are required'
    });
  }

  if (!contact_no_1 || !address || !email) {
    return res.status(400).json({
      status: 'error',
      message: 'All contact fields are required'
    });
  }

  // Note: 18+ age restriction is enforced by DB trigger (trg_employee_min_age)

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create contact record
    const contactResult = await client.query(
      `INSERT INTO contact (type, contact_no_1, contact_no_2, address, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING contact_id`,
      ['employee', contact_no_1, contact_no_2 || null, address, email]
    );
    
    const contact_id = contactResult.rows[0].contact_id;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new employee
    const insertResult = await client.query(
      `INSERT INTO employee (role, username, password, first_name, last_name, nic, gender, date_of_birth, branch_id, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING employee_id`,
      [role, username, hashedPassword, first_name, last_name, nic, gender, date_of_birth, branch_id, contact_id]
    );

    await client.query('COMMIT');
    
    res.status(201).json({
      status: 'success',
      message: 'User created successfully',
      employee_id: insertResult.rows[0].employee_id,
      contact_id: contact_id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    // Handle unique violation on username (PostgreSQL code 23505)
    if (error && error.code === '23505' && String(error.detail || '').includes('(username)')) {
      return res.status(409).json({
        status: 'error',
        message: 'Username already exists'
      });
    }
    res.status(500).json({
      status: 'error',
      message: 'Database error: ' + error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Get all users/employees
 * GET /api/admin/users
 */
exports.getUsers = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT employee_id, username, first_name, last_name, role, nic, gender, date_of_birth, branch_id, contact_id, employee_status, created_at FROM employee ORDER BY created_at DESC'
    );
    
    res.json({
      status: 'success',
      users: result.rows
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
 * Deactivate a user/employee (soft-delete)
 * DELETE /api/admin/users/:id
 */
exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    // Prevent self-deactivation via DELETE
    if (req.user && parseInt(id, 10) === parseInt(req.user.id, 10)) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot deactivate your own account.'
      });
    }

    // Ensure user exists
    const userRes = await client.query('SELECT employee_status FROM employee WHERE employee_id = $1', [id]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // Use DB procedure to deactivate (prevents self-deactivation and validates existence)
    await client.query('CALL proc_deactivate_employee($1, $2)', [id, req.user?.id]);

    res.json({ status: 'success', message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Update user status (Activate/Deactivate)
 * PATCH /api/admin/users/:id/status
 * Body: { status: 'Active' | 'Inactive' }
 */
exports.updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const client = await pool.connect();

  try {
    if (!status || !['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid status. Use Active or Inactive.' });
    }
    // Delegate to DB procedures which enforce self-deactivation guard and existence checks
    if (status === 'Inactive') {
      await client.query('CALL proc_deactivate_employee($1, $2)', [id, req.user?.id]);
    } else {
      await client.query('CALL proc_activate_employee($1)', [id]);
    }

    res.json({ status: 'success', message: `User ${status === 'Active' ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Get all branches
 * GET /api/admin/branches
 */
exports.getBranches = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        b.branch_id,
        b.name,
        b.created_at,
        c.contact_id,
        c.contact_no_1,
        c.contact_no_2,
        c.address,
        c.email
      FROM branch b
      JOIN contact c ON b.contact_id = c.contact_id
      ORDER BY b.created_at DESC
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
 * Create a new branch
 * POST /api/admin/branches
 */
exports.createBranch = async (req, res) => {
  const { name, contact_no_1, contact_no_2, address, email } = req.body;

  // Validation - branch_id is auto-generated by DB, so it's not required from client
  if (!name || !contact_no_1 || !address || !email) {
    return res.status(400).json({
      status: 'error',
      message: 'All required fields must be provided'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Optional: prevent duplicate branch names (case-insensitive)
    const existingByName = await client.query(
      'SELECT 1 FROM branch WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [name]
    );
    if (existingByName.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Branch name already exists'
      });
    }

    // Create contact record
    const contactResult = await client.query(
      `INSERT INTO contact (type, contact_no_1, contact_no_2, address, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING contact_id`,
      ['branch', contact_no_1, contact_no_2 || null, address, email]
    );

    const contactId = contactResult.rows[0].contact_id;

    // Create branch record
    const branchResult = await client.query(
      `INSERT INTO branch (name, contact_id)
       VALUES ($1, $2)
       RETURNING branch_id`,
      [name, contactId]
    );

    const newBranchId = branchResult.rows[0].branch_id;

    await client.query('COMMIT');
    
    res.status(201).json({
      status: 'success',
      message: 'Branch created successfully',
      branch_id: newBranchId
    });
  } catch (error) {
    await client.query('ROLLBACK');
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
 * Delete a branch
 * DELETE /api/admin/branches/:id
 */
exports.deleteBranch = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get contact_id for the branch
    const branchResult = await client.query('SELECT contact_id FROM branch WHERE branch_id = $1', [id]);
    if (branchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'error',
        message: 'Branch not found'
      });
    }

    const contactId = branchResult.rows[0].contact_id;

    // Check if branch has employees
    const employeesCheck = await client.query('SELECT COUNT(*) as count FROM employee WHERE branch_id = $1', [id]);
    if (parseInt(employeesCheck.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete branch with assigned employees. Reassign employees first.'
      });
    }

    // Check if branch has accounts
    const accountsCheck = await client.query('SELECT COUNT(*) as count FROM account WHERE branch_id = $1', [id]);
    if (parseInt(accountsCheck.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete branch with associated accounts. Transfer accounts first.'
      });
    }

    // Delete branch
    await client.query('DELETE FROM branch WHERE branch_id = $1', [id]);
    
    // Delete contact
    await client.query('DELETE FROM contact WHERE contact_id = $1', [contactId]);

    await client.query('COMMIT');
    
    res.json({
      status: 'success',
      message: 'Branch deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database error'
    });
  } finally {
    client.release();
  }
};

// Removed: refreshViews endpoint (materialized views were removed)

/**
 * Get agent transactions report
 * GET /api/admin/reports/agent-transactions?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
exports.getAgentTransactionsReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({
      status: 'error',
      message: 'startDate and endDate are required'
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        e.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        COUNT(v.transaction_id) AS total_transactions,
        COALESCE(SUM(v.deposit_amount), 0) AS total_deposits,
        COALESCE(SUM(v.withdrawal_amount), 0) AS total_withdrawals,
        COALESCE(SUM(v.net_value), 0) AS net_value
      FROM employee e
      LEFT JOIN v_transaction_enriched v ON e.employee_id = v.employee_id
        AND DATE(v.time) BETWEEN $1 AND $2
      WHERE e.role = 'Agent'
      GROUP BY e.employee_id, e.first_name, e.last_name
      ORDER BY total_transactions DESC
    `, [startDate, endDate]);

    res.json({
      status: 'success',
      data: result.rows
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
 * Get account summaries report
 * GET /api/admin/reports/account-summaries?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
exports.getAccountSummariesReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({
      status: 'error',
      message: 'startDate and endDate are required'
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        a.account_id,
        ac.customer_names,
        COUNT(v.transaction_id) AS transaction_count,
        COALESCE(SUM(v.deposit_amount), 0) AS total_deposits,
        COALESCE(SUM(v.withdrawal_amount), 0) AS total_withdrawals,
        a.balance AS current_balance
      FROM account a
      JOIN v_account_customers ac ON ac.account_id = a.account_id
      LEFT JOIN v_transaction_enriched v ON a.account_id = v.account_id
        AND DATE(v.time) BETWEEN $1 AND $2
      WHERE a.account_status = 'Active'
      GROUP BY a.account_id, a.balance, ac.customer_names
      ORDER BY a.account_id
    `, [startDate, endDate]);

    res.json({
      status: 'success',
      data: result.rows
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
 * Get active fixed deposits report
 * GET /api/admin/reports/active-fds
 */
exports.getActiveFDsReport = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT *
      FROM v_active_fd_overview
      ORDER BY open_date DESC
    `);

    res.json({
      status: 'success',
      data: result.rows
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
 * Get interest summary report by month and year
 * GET /api/admin/reports/interest-summary?month=1&year=2024
 */
exports.getInterestSummaryReport = async (req, res) => {
  const { month, year } = req.query;
  
  if (!month || !year) {
    return res.status(400).json({
      status: 'error',
      message: 'month and year are required'
    });
  }

  const client = await pool.connect();
  try {
    const summary = await client.query(`
      SELECT plan_type, account_type, total_interest, account_count, average_interest
      FROM v_monthly_interest_summary
      WHERE month = $1 AND year = $2
    `, [month, year]);
    res.json({
      status: 'success',
      data: summary.rows
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
 * Get customer activity report
 * GET /api/admin/reports/customer-activity?startDate=2024-01-01&endDate=2024-12-31
 */
exports.getCustomerActivityReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({
      status: 'error',
      message: 'startDate and endDate are required'
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        v.customer_id,
        v.customer_name,
        COALESCE(SUM(v.deposit_amount), 0) AS total_deposits,
        COALESCE(SUM(v.withdrawal_amount), 0) AS total_withdrawals,
        COALESCE(SUM(v.net_value), 0) AS net_balance,
        COUNT(DISTINCT v.account_id) AS account_count,
        MAX(v.transaction_date) AS last_activity
      FROM v_customer_transaction_enriched v
      WHERE v.transaction_date BETWEEN $1 AND $2
      GROUP BY v.customer_id, v.customer_name
      HAVING COUNT(v.transaction_id) > 0
      ORDER BY net_balance DESC
    `, [startDate, endDate]);

    res.json({
      status: 'success',
      data: result.rows
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
 * Savings Interest Summary for Admin UI
 * GET /api/admin/savings-interest/summary
 */
exports.getSavingsInterestSummary = async (req, res) => {
  const client = await pool.connect();
  try {
    // Monthly interest credited this month
    const monthlyRes = await client.query(
      `SELECT COALESCE(SUM(interest_amount), 0) AS total
       FROM savings_interest_calculations
       WHERE status = 'credited'
         AND date_trunc('month', credited_at) = date_trunc('month', now())`
    );

    // Active savings accounts and total balance
    const activeRes = await client.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(balance), 0)::numeric AS total_balance
       FROM account
       WHERE account_status = 'Active' AND saving_plan_id IS NOT NULL`
    );

    // Recent processed periods (group by calculation_date)
    const recentRes = await client.query(
      `WITH per_day AS (
         SELECT calculation_date::date AS calc_date,
                MAX(credited_at) AS processed_at
         FROM savings_interest_calculations
         WHERE status = 'credited'
         GROUP BY calculation_date
       )
       SELECT 
         (calc_date - INTERVAL '30 days')::date AS period_start,
         calc_date AS period_end,
         processed_at
       FROM per_day
       ORDER BY calc_date DESC
       LIMIT 5`
    );

    // Next scheduled run (based on env / defaults)
    const debug = process.env.INTEREST_CRON_DEBUG === '1';
    const cronExpr = debug ? '* * * * *' : (process.env.SAVINGS_INTEREST_CRON || '30 3 * * *');
    let nextScheduledRun = '';
    if (debug) {
      nextScheduledRun = 'Every minute (DEBUG)';
    } else if (cronExpr === '30 3 * * *') {
      nextScheduledRun = 'Daily at 3:30 AM';
    } else {
      nextScheduledRun = `Cron: ${cronExpr}`;
    }

    res.json({
      monthly_interest: parseFloat(monthlyRes.rows[0].total) || 0,
      active_savings_accounts: {
        count: activeRes.rows[0].count || 0,
        total_balance: parseFloat(activeRes.rows[0].total_balance) || 0
      },
      recent_periods: recentRes.rows.map(r => ({
        period_start: r.period_start,
        period_end: r.period_end,
        processed_at: r.processed_at
      })),
      next_scheduled_run: nextScheduledRun
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
 * Fixed Deposit Interest Summary for Admin UI
 * GET /api/admin/fd-interest/summary
 */
exports.getFDInterestSummary = async (req, res) => {
  const client = await pool.connect();
  try {
    // Monthly FD interest credited this month
    const monthlyRes = await client.query(
      `SELECT COALESCE(SUM(interest_amount), 0) AS total
       FROM fd_interest_calculations
       WHERE status = 'credited'
         AND date_trunc('month', credited_at) = date_trunc('month', now())`
    );

    // Active FDs and total value
    const activeRes = await client.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(fd_balance), 0)::numeric AS total_value
       FROM fixeddeposit
       WHERE fd_status = 'Active'`
    );

    // Recent processed periods (group by calculation_date)
    const recentRes = await client.query(
      `WITH per_day AS (
         SELECT calculation_date::date AS calc_date,
                MAX(credited_at) AS processed_at
         FROM fd_interest_calculations
         WHERE status = 'credited'
         GROUP BY calculation_date
       )
       SELECT 
         (calc_date - INTERVAL '30 days')::date AS period_start,
         calc_date AS period_end,
         processed_at
       FROM per_day
       ORDER BY calc_date DESC
       LIMIT 5`
    );

    // Next scheduled run based on env / defaults
    const debug = process.env.INTEREST_CRON_DEBUG === '1';
    const cronExpr = debug ? '* * * * *' : (process.env.FD_INTEREST_CRON || '0 3 * * *');
    let nextScheduledRun = '';
    if (debug) {
      nextScheduledRun = 'Every minute (DEBUG)';
    } else if (cronExpr === '0 3 * * *') {
      nextScheduledRun = 'Daily at 3:00 AM';
    } else {
      nextScheduledRun = `Cron: ${cronExpr}`;
    }

    res.json({
      monthly_interest: parseFloat(monthlyRes.rows[0].total) || 0,
      active_fds: {
        count: activeRes.rows[0].count || 0,
        total_value: parseFloat(activeRes.rows[0].total_value) || 0
      },
      recent_periods: recentRes.rows.map(r => ({
        period_start: r.period_start,
        period_end: r.period_end,
        processed_at: r.processed_at
      })),
      next_scheduled_run: nextScheduledRun
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};
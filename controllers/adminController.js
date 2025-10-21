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

  // Age validation (18+)
  try {
    const dob = new Date(date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    if (age < 18) {
      return res.status(400).json({
        status: 'error',
        message: 'Employee must be at least 18 years old'
      });
    }
  } catch (e) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid date_of_birth'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if username exists
    const userResult = await client.query('SELECT * FROM employee WHERE username = $1', [username]);
    if (userResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Username already exists'
      });
    }

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
      'SELECT employee_id, username, first_name, last_name, role, nic, gender, date_of_birth, branch_id, contact_id, created_at FROM employee ORDER BY created_at DESC'
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
 * Delete a user/employee
 * DELETE /api/admin/users/:id
 */
exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  
  try {
    const result = await client.query('DELETE FROM employee WHERE employee_id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    res.json({
      status: 'success',
      message: 'User deleted successfully'
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

/**
 * Refresh materialized views
 * POST /api/admin/refresh-views
 */
exports.refreshViews = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('SELECT refresh_materialized_views()');
    res.json({
      status: 'success',
      message: 'Materialized views refreshed successfully'
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
        e.first_name || ' ' || e.last_name as employee_name,
        COUNT(t.transaction_id) as total_transactions,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Deposit' THEN t.amount ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Withdrawal' THEN t.amount ELSE 0 END), 0) as total_withdrawals,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Deposit' THEN t.amount ELSE -t.amount END), 0) as net_value
      FROM employee e
      LEFT JOIN transaction t ON e.employee_id = t.employee_id
        AND DATE(t.time) BETWEEN $1 AND $2
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
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names,
        COUNT(t.transaction_id) as transaction_count,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Deposit' THEN t.amount ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Withdrawal' THEN t.amount ELSE 0 END), 0) as total_withdrawals,
        a.balance as current_balance
      FROM account a
      JOIN takes tk ON a.account_id = tk.account_id
      JOIN customer c ON tk.customer_id = c.customer_id
      LEFT JOIN transaction t ON a.account_id = t.account_id
        AND DATE(t.time) BETWEEN $1 AND $2
      WHERE a.account_status = 'Active'
      GROUP BY a.account_id, a.balance
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
      WITH last_credited AS (
        SELECT fd_id, MAX(calculation_date) AS last_date
        FROM fd_interest_calculations
        WHERE status = 'credited'
        GROUP BY fd_id
      )
      SELECT 
        fd.fd_id,
        a.account_id,
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names,
        fd.fd_balance,
        fp.interest as interest_rate,
        fd.open_date,
        fd.maturity_date,
        fd.auto_renewal_status,
        (COALESCE(l.last_date, fd.open_date) + INTERVAL '30 days')::date AS next_interest_date
      FROM fixeddeposit fd
      JOIN fdplan fp ON fd.fd_plan_id = fp.fd_plan_id
      JOIN account a ON fd.fd_id = a.fd_id
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      LEFT JOIN last_credited l ON l.fd_id = fd.fd_id
      WHERE fd.fd_status = 'Active'
      GROUP BY fd.fd_id, a.account_id, fd.fd_balance, fp.interest, fd.open_date, fd.maturity_date, fd.auto_renewal_status, l.last_date
      ORDER BY fd.open_date DESC
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
    // FD Interest Summary
    const fdInterest = await client.query(`
      SELECT 
        'Fixed Deposit' as plan_type,
        fp.fd_options as account_type,
        COALESCE(SUM(fic.interest_amount), 0) as total_interest,
        COUNT(DISTINCT fic.fd_id) as account_count,
        COALESCE(ROUND(AVG(fic.interest_amount), 2), 0) as average_interest
      FROM fd_interest_calculations fic
      JOIN fixeddeposit fd ON fic.fd_id = fd.fd_id
      JOIN fdplan fp ON fd.fd_plan_id = fp.fd_plan_id
      WHERE fic.status = 'credited'
        AND EXTRACT(MONTH FROM fic.credited_at) = $1
        AND EXTRACT(YEAR FROM fic.credited_at) = $2
      GROUP BY fp.fd_options
    `, [month, year]);

    // Savings Interest Summary
    const savingsInterest = await client.query(`
      SELECT 
        'Savings' as plan_type,
        sic.plan_type as account_type,
        COALESCE(SUM(sic.interest_amount), 0) as total_interest,
        COUNT(DISTINCT sic.account_id) as account_count,
        COALESCE(ROUND(AVG(sic.interest_amount), 2), 0) as average_interest
      FROM savings_interest_calculations sic
      WHERE sic.status = 'credited'
        AND EXTRACT(MONTH FROM sic.credited_at) = $1
        AND EXTRACT(YEAR FROM sic.credited_at) = $2
      GROUP BY sic.plan_type
    `, [month, year]);

    const combinedResults = [...fdInterest.rows, ...savingsInterest.rows];
    res.json({
      status: 'success',
      data: combinedResults
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
        c.customer_id,
        c.first_name || ' ' || c.last_name as customer_name,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Deposit' THEN t.amount ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Withdrawal' THEN t.amount ELSE 0 END), 0) as total_withdrawals,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Deposit' THEN t.amount ELSE -t.amount END), 0) as net_balance,
        COUNT(DISTINCT a.account_id) as account_count,
        MAX(t.time)::date as last_activity
      FROM customer c
      LEFT JOIN takes tk ON c.customer_id = tk.customer_id
      LEFT JOIN account a ON tk.account_id = a.account_id
      LEFT JOIN transaction t ON a.account_id = t.account_id
        AND DATE(t.time) BETWEEN $1 AND $2
      GROUP BY c.customer_id, c.first_name, c.last_name
      HAVING COUNT(t.transaction_id) > 0
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

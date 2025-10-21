// =============================================================================
// MANAGER CONTROLLER - Manager Business Logic
// =============================================================================
const pool = require('../config/database');

/**
 * Search customers in manager's branch
 * GET /api/manager/customers/search?query=searchTerm
 */
exports.searchCustomers = async (req, res) => {
  const { query } = req.query;
  
  if (!query || String(query).trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Search query is required'
    });
  }

  const client = await pool.connect();
  try {
    // Determine manager's branch
    const managerResult = await client.query(
      'SELECT branch_id FROM employee WHERE employee_id = $1',
      [req.user.id]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Manager not found'
      });
    }

    const branchId = managerResult.rows[0].branch_id;

    // Search customers linked to accounts in this branch
    const q = `%${query}%`;
    const result = await client.query(
      `SELECT 
          c.customer_id, c.first_name, c.last_name, c.gender, c.nic, c.date_of_birth,
          ct.contact_no_1, ct.contact_no_2, ct.email, ct.address,
          COUNT(DISTINCT a.account_id) AS accounts_count,
          ARRAY_AGG(DISTINCT a.account_id) AS account_ids
       FROM customer c
       JOIN contact ct ON c.contact_id = ct.contact_id
       JOIN takes t ON c.customer_id = t.customer_id
       JOIN account a ON t.account_id = a.account_id
       WHERE a.branch_id = $1
         AND (
           c.first_name ILIKE $2 OR 
           c.last_name ILIKE $2 OR 
           (c.first_name || ' ' || c.last_name) ILIKE $2 OR
           (c.last_name || ' ' || c.first_name) ILIKE $2 OR
           c.nic ILIKE $2
         )
       GROUP BY c.customer_id, ct.contact_no_1, ct.contact_no_2, ct.email, ct.address
       ORDER BY c.last_name, c.first_name
       LIMIT 50`,
      [branchId, q]
    );

    res.json({
      status: 'success',
      customers: result.rows
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
 * Get team agents in manager's branch
 * GET /api/manager/team/agents
 */
exports.getTeamAgents = async (req, res) => {
  const client = await pool.connect();
  try {
    // Get manager's branch
    const managerResult = await client.query(
      'SELECT branch_id FROM employee WHERE employee_id = $1',
      [req.user.id]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Manager not found'
      });
    }

    const branchId = managerResult.rows[0].branch_id;

    // Get agents in the same branch
    const agentsResult = await client.query(`
      SELECT 
        e.employee_id, e.username, e.first_name, e.last_name, e.role,
        e.nic, e.gender, e.date_of_birth, e.branch_id, e.contact_id, e.created_at,
        c.contact_no_1, c.contact_no_2, c.email, c.address
      FROM employee e
      LEFT JOIN contact c ON e.contact_id = c.contact_id
      WHERE e.branch_id = $1 AND e.role = 'Agent'
      ORDER BY e.first_name, e.last_name
    `, [branchId]);

    // Get performance data for each agent
    const performanceData = {};
    for (const agent of agentsResult.rows) {
      const performanceResult = await client.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(amount), 0) as total_volume,
          COUNT(DISTINCT t.customer_id) as customers_registered,
          COUNT(DISTINCT a.account_id) as accounts_created,
          MAX(tr.time) as last_activity
        FROM transaction tr
        LEFT JOIN account a ON tr.account_id = a.account_id
        LEFT JOIN takes t ON a.account_id = t.account_id
        WHERE tr.employee_id = $1
      `, [agent.employee_id]);

      performanceData[agent.employee_id] = {
        total_transactions: parseInt(performanceResult.rows[0].total_transactions),
        total_volume: parseFloat(performanceResult.rows[0].total_volume),
        customers_registered: parseInt(performanceResult.rows[0].customers_registered),
        accounts_created: parseInt(performanceResult.rows[0].accounts_created),
        last_activity: performanceResult.rows[0].last_activity
      };
    }

    res.json({
      status: 'success',
      agents: agentsResult.rows,
      performance: performanceData
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
 * Get specific agent's transactions
 * GET /api/manager/team/agents/:agentId/transactions
 */
exports.getAgentTransactions = async (req, res) => {
  const { agentId } = req.params;
  
  const client = await pool.connect();
  try {
    const transactionsResult = await client.query(`
      SELECT 
        transaction_id, transaction_type, amount, time, description, account_id, employee_id
      FROM transaction 
      WHERE employee_id = $1
      ORDER BY time DESC
      LIMIT 50
    `, [agentId]);

    res.json({
      status: 'success',
      transactions: transactionsResult.rows
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
 * Get branch transactions with filters
 * GET /api/manager/transactions?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
exports.getBranchTransactions = async (req, res) => {
  const { start, end } = req.query;
  
  const client = await pool.connect();
  try {
    // Get manager's branch
    const managerResult = await client.query(
      'SELECT branch_id FROM employee WHERE employee_id = $1',
      [req.user.id]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Manager not found'
      });
    }

    const branchId = managerResult.rows[0].branch_id;

    // Get transactions for the branch
    const transactionsResult = await client.query(`
      SELECT 
        t.transaction_id, t.transaction_type, t.amount, t.time, t.description,
        t.account_id, t.employee_id,
        e.first_name || ' ' || e.last_name as employee_name
      FROM transaction t
      JOIN employee e ON t.employee_id = e.employee_id
      JOIN account a ON t.account_id = a.account_id
      WHERE a.branch_id = $1 
      AND DATE(t.time) BETWEEN $2 AND $3
      ORDER BY t.time DESC
      LIMIT 100
    `, [branchId, start, end]);

    // Get summary data
    const summaryResult = await client.query(`
      SELECT 
        COUNT(*) as transaction_count,
        COALESCE(SUM(CASE WHEN transaction_type = 'Deposit' THEN amount ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN transaction_type = 'Withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawals,
        COALESCE(SUM(CASE WHEN transaction_type = 'Deposit' THEN amount ELSE -amount END), 0) as net_flow
      FROM transaction t
      JOIN account a ON t.account_id = a.account_id
      WHERE a.branch_id = $1 AND DATE(t.time) BETWEEN $2 AND $3
    `, [branchId, start, end]);

    const summary = {
      total_deposits: parseFloat(summaryResult.rows[0].total_deposits),
      total_withdrawals: parseFloat(summaryResult.rows[0].total_withdrawals),
      net_flow: parseFloat(summaryResult.rows[0].net_flow),
      transaction_count: parseInt(summaryResult.rows[0].transaction_count)
    };

    res.json({
      status: 'success',
      transactions: transactionsResult.rows,
      summary: summary
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
 * Get customer accounts for manager's branch
 * GET /api/manager/accounts
 */
exports.getBranchAccounts = async (req, res) => {
  const client = await pool.connect();
  try {
    // Get manager's branch
    const managerResult = await client.query(
      'SELECT branch_id FROM employee WHERE employee_id = $1',
      [req.user.id]
    );

    if (managerResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Manager not found'
      });
    }

    const branchId = managerResult.rows[0].branch_id;

    // Get accounts with customer and saving plan details
    const accountsResult = await client.query(`
      SELECT 
        a.account_id, a.open_date, a.account_status, a.balance, a.branch_id, a.saving_plan_id,
        c.customer_id, c.first_name, c.last_name, c.nic, c.gender, c.date_of_birth,
        ct.contact_no_1, ct.email, ct.address,
        sp.plan_type, sp.interest, sp.min_balance
      FROM account a
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      JOIN contact ct ON c.contact_id = ct.contact_id
      LEFT JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id
      WHERE a.branch_id = $1
      ORDER BY a.balance DESC
    `, [branchId]);

    // Calculate summary statistics
    const activeAccounts = accountsResult.rows.filter(acc => acc.account_status === 'Active');
    const totalBalance = activeAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
    
    const summary = {
      total_accounts: accountsResult.rows.length,
      active_accounts: activeAccounts.length,
      total_balance: totalBalance,
      average_balance: activeAccounts.length > 0 ? totalBalance / activeAccounts.length : 0
    };

    res.json({
      status: 'success',
      accounts: accountsResult.rows,
      summary: summary
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
 * Get customers by exact NIC within manager's branch
 * GET /api/manager/customers/by-nic/:nic
 */
exports.getCustomersByNic = async (req, res) => {
  const rawNic = (req.params.nic || '').toString().trim();
  const nic = rawNic.toUpperCase();

  if (!/^([0-9]{12}|[0-9]{9}V)$/.test(nic)) {
    return res.status(400).json({ status: 'error', message: 'Invalid NIC/BC format. Use 12 digits or 9 digits followed by V' });
  }

  const client = await pool.connect();
  try {
    // Manager's branch
    const mgr = await client.query('SELECT branch_id FROM employee WHERE employee_id = $1', [req.user.id]);
    if (mgr.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Manager not found' });
    const branchId = mgr.rows[0].branch_id;

    // Exact NIC within this branch; include accounts count and IDs
    const result = await client.query(`
      SELECT 
        c.customer_id, c.first_name, c.last_name, c.gender, c.nic, c.date_of_birth,
        ct.contact_no_1, ct.contact_no_2, ct.email, ct.address,
        COALESCE(COUNT(DISTINCT a.account_id), 0) AS accounts_count,
        COALESCE(ARRAY_AGG(DISTINCT a.account_id) FILTER (WHERE a.account_id IS NOT NULL), ARRAY[]::int[]) AS account_ids
      FROM customer c
      JOIN contact ct ON c.contact_id = ct.contact_id
      LEFT JOIN takes t ON c.customer_id = t.customer_id
      LEFT JOIN account a ON t.account_id = a.account_id AND a.branch_id = $1
      WHERE c.nic = $2
      GROUP BY c.customer_id, ct.contact_no_1, ct.contact_no_2, ct.email, ct.address
      ORDER BY c.last_name, c.first_name
      LIMIT 50
    `, [branchId, nic]);

    return res.json({ status: 'success', customers: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

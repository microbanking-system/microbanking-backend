// =============================================================================
// AGENT CONTROLLER - Agent Business Logic (Part 1 of 2)
// =============================================================================
const pool = require('../config/database');

/**
 * Process a transaction (deposit/withdrawal)
 * POST /api/agent/transactions/process
 */
exports.processTransaction = async (req, res) => {
  const { account_id, transaction_type, amount, description } = req.body;
  const employeeId = req.user.id;

  // Validation
  if (!account_id || !transaction_type || amount === undefined || !description) {
    return res.status(400).json({
      status: 'error',
      message: 'All fields are required'
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Amount must be positive'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    // Set actor id for downstream DB audit triggers
    await client.query("SELECT set_config('app.actor_employee_id', $1, true)", [employeeId.toString()]);

    // Check if account exists and is active
    const accountResult = await client.query(
      'SELECT * FROM account WHERE account_id = $1 AND account_status = $2',
      [account_id, 'Active']
    );

    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Account not found or closed'
      });
    }

    // Use database function for transaction processing
    const transactionResult = await client.query(
      'SELECT create_transaction_with_validation($1, $2, $3, $4, $5) as transaction_id',
      [transaction_type, amount, description, account_id, employeeId]
    );

    // Get updated balance
    const balanceResult = await client.query(
      'SELECT balance FROM account WHERE account_id = $1',
      [account_id]
    );

    await client.query('COMMIT');
    
    res.status(201).json({
      status: 'success',
      message: 'Transaction processed successfully',
      transaction_id: transactionResult.rows[0].transaction_id,
      new_balance: parseFloat(balanceResult.rows[0].balance)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    
    // Handle specific database function errors
    if (error.message.includes('Insufficient balance') || 
        error.message.includes('Minimum balance required')) {
      return res.status(400).json({
        status: 'error',
        message: error.message
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
 * Register a new customer
 * POST /api/agent/customers/register
 */
exports.registerCustomer = async (req, res) => {
  const { first_name, last_name, nic, gender, date_of_birth, contact_no_1, contact_no_2, address, email } = req.body;

  // Validation
  if (!first_name || !last_name || !nic || !gender || !date_of_birth || !contact_no_1 || !address || !email) {
    return res.status(400).json({
      status: 'error',
      message: 'All required fields must be provided'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if customer with NIC already exists
    const customerCheck = await client.query('SELECT * FROM customer WHERE nic = $1', [nic]);
    if (customerCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Customer with this NIC already exists'
      });
    }

    // Create contact record
    const contactResult = await client.query(
      `INSERT INTO contact (type, contact_no_1, contact_no_2, address, email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING contact_id`,
      ['customer', contact_no_1, contact_no_2 || null, address, email]
    );

    const contactId = contactResult.rows[0].contact_id;

    // Create customer record
    const customerResult = await client.query(
      `INSERT INTO customer (first_name, last_name, gender, nic, date_of_birth, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING customer_id`,
      [first_name, last_name, gender, nic, date_of_birth, contactId]
    );

    const customerId = customerResult.rows[0].customer_id;

    await client.query('COMMIT');
    
    res.status(201).json({
      status: 'success',
      message: 'Customer registered successfully',
      customer_id: customerId
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
 * Get all customers
 * GET /api/agent/customers
 */
exports.getCustomers = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT customer_id, first_name, last_name, nic, date_of_birth 
      FROM customer 
      ORDER BY first_name, last_name
    `);
    
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
 * Get single customer by NIC/Birth Certificate number (exact match)
 * GET /api/agent/customers/by-nic/:nic
 */
exports.getCustomerByNic = async (req, res) => {
  const rawNic = (req.params.nic || '').toString().trim();
  const nic = rawNic.toUpperCase();

  // Validate NIC/BC format: 12 digits or 9 digits + 'V'
  if (!/^([0-9]{12}|[0-9]{9}V)$/.test(nic)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid NIC/BC format. Use 12 digits or 9 digits followed by V'
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT customer_id, first_name, last_name, nic, date_of_birth
       FROM customer
       WHERE nic = $1`,
      [nic]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    return res.json({ status: 'success', customer: result.rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Get customer details by ID
 * GET /api/agent/customers/:id
 */
exports.getCustomerById = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        c.customer_id,
        c.first_name,
        c.last_name,
        c.gender,
        c.nic,
        c.date_of_birth,
        ct.contact_id,
        ct.contact_no_1,
        ct.contact_no_2,
        ct.address,
        ct.email
      FROM customer c
      JOIN contact ct ON c.contact_id = ct.contact_id
      WHERE c.customer_id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Customer not found'
      });
    }

    res.json({
      status: 'success',
      customer: result.rows[0]
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
 * Update customer details
 * PUT /api/agent/customers/:id
 */
exports.updateCustomer = async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, nic, gender, date_of_birth, contact_no_1, contact_no_2, address, email } = req.body;

  // Validation
  if (!first_name || !last_name || !nic || !gender || !date_of_birth || !contact_no_1 || !address || !email) {
    return res.status(400).json({
      status: 'error',
      message: 'All required fields must be provided'
    });
  }

  // Note: No global age restriction here. Age constraints are enforced when creating
  // or changing accounts based on the selected saving plan (e.g., Children/Teen/Adult/Senior).

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get existing to retrieve contact_id and current NIC
    const existing = await client.query('SELECT customer_id, contact_id, nic FROM customer WHERE customer_id = $1', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'error',
        message: 'Customer not found'
      });
    }
    const { contact_id, nic: currentNic } = existing.rows[0];

    // If NIC changed, check uniqueness
    if (nic !== currentNic) {
      const nicCheck = await client.query('SELECT 1 FROM customer WHERE nic = $1 AND customer_id <> $2', [nic, id]);
      if (nicCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: 'Another customer with this NIC already exists'
        });
      }
    }

    // Update contact
    await client.query(
      `UPDATE contact SET contact_no_1 = $1, contact_no_2 = $2, address = $3, email = $4 WHERE contact_id = $5`,
      [contact_no_1, contact_no_2 || null, address, email, contact_id]
    );

    // Update customer
    await client.query(
      `UPDATE customer SET first_name = $1, last_name = $2, gender = $3, nic = $4, date_of_birth = $5 WHERE customer_id = $6`,
      [first_name, last_name, gender, nic, date_of_birth, id]
    );

    await client.query('COMMIT');

    res.json({
      status: 'success',
      message: 'Customer updated successfully'
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
 * Update customer contact details
 * PUT /api/agent/customers/:id/contact
 */
exports.updateCustomerContact = async (req, res) => {
  const { id } = req.params;
  const { contact_no_1, contact_no_2, address, email } = req.body;

  // Validation
  if (!contact_no_1 || !address || !email) {
    return res.status(400).json({
      status: 'error',
      message: 'Contact number, address, and email are required'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get existing contact_id
    const existing = await client.query('SELECT contact_id FROM customer WHERE customer_id = $1', [id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: 'error',
        message: 'Customer not found'
      });
    }
    const { contact_id } = existing.rows[0];

    // Update contact
    await client.query(
      `UPDATE contact SET contact_no_1 = $1, contact_no_2 = $2, address = $3, email = $4 WHERE contact_id = $5`,
      [contact_no_1, contact_no_2 || null, address, email, contact_id]
    );

    await client.query('COMMIT');

    res.json({
      status: 'success',
      message: 'Customer contact updated successfully'
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
 * Create account for customer (with joint account support)
 * POST /api/agent/accounts/create
 */
exports.createAccount = async (req, res) => {
  const { customer_id, saving_plan_id, initial_deposit, branch_id, joint_holders = [] } = req.body;
  const employeeId = req.user.id;

  // Coerce numeric inputs
  const customerIdNum = Number(customer_id);
  const savingPlanIdNum = Number(saving_plan_id);
  const branchIdNum = Number(branch_id);
  const initialDeposit = Number(initial_deposit);

  // Validation
  if (!customerIdNum || !savingPlanIdNum || !branchIdNum || initial_deposit === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'All required fields must be provided'
    });
  }

  if (isNaN(initialDeposit)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid initial deposit amount'
    });
  }

  if (initialDeposit < 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Initial deposit cannot be negative'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get saving plan details
    const planResult = await client.query('SELECT * FROM savingplan WHERE saving_plan_id = $1', [savingPlanIdNum]);
    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Invalid saving plan'
      });
    }

    const savingPlan = planResult.rows[0];
    
    // Joint account validation
    if (savingPlan.plan_type === 'Joint' && joint_holders.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Joint account requires at least one joint holder'
      });
    }

    if (initialDeposit < savingPlan.min_balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `Minimum deposit for ${savingPlan.plan_type} plan is LKR ${savingPlan.min_balance}`
      });
    }

    // Verify primary customer and age
    const customerResult = await client.query(
      'SELECT *, EXTRACT(YEAR FROM AGE(date_of_birth)) as age FROM customer WHERE customer_id = $1',
      [customerIdNum]
    );
    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Primary customer not found'
      });
    }

    const primaryCustomer = customerResult.rows[0];
    const planType = savingPlan.plan_type;
    let requiredAge = 18;
    if (planType === 'Senior') requiredAge = 60;
    else if (planType === 'Joint') requiredAge = 18;
    else if (planType === 'Children') requiredAge = 0;
    else if (planType === 'Teen') requiredAge = 12;
    else if (planType === 'Adult') requiredAge = 18;

    if (parseInt(primaryCustomer.age) < requiredAge) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `${planType} account requires account holder to be at least ${requiredAge} years old`
      });
    }

    // Verify joint holders
    if (joint_holders.length > 0) {
      const jointHoldersResult = await client.query(
        `SELECT customer_id, first_name, last_name, EXTRACT(YEAR FROM AGE(date_of_birth)) as age 
         FROM customer WHERE customer_id = ANY($1)`,
        [joint_holders]
      );

      if (jointHoldersResult.rows.length !== joint_holders.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: 'One or more joint holders not found'
        });
      }

      const underageJointHolder = jointHoldersResult.rows.find(holder => parseInt(holder.age) < 18);
      if (underageJointHolder) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: `Joint holder ${underageJointHolder.first_name} ${underageJointHolder.last_name} must be at least 18 years old`
        });
      }
    }

    // Verify branch
    const branchResult = await client.query('SELECT * FROM branch WHERE branch_id = $1', [branch_id]);
    if (branchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Branch not found'
      });
    }

    // Create account
    const accountResult = await client.query(
      `INSERT INTO account (open_date, account_status, balance, saving_plan_id, branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING account_id`,
      [new Date().toISOString().split('T')[0], 'Active', 0, savingPlanIdNum, branchIdNum]
    );

    const accountId = accountResult.rows[0].account_id;

    // Create takes relationship for primary customer
    await client.query(
      `INSERT INTO takes (customer_id, account_id) VALUES ($1, $2)`,
      [customerIdNum, accountId]
    );

    // Create takes relationships for joint holders
    for (const jointCustomerId of joint_holders) {
      await client.query(
        `INSERT INTO takes (customer_id, account_id) VALUES ($1, $2)`,
        [jointCustomerId, accountId]
      );
    }

    // Create initial deposit transaction if amount > 0
    if (initialDeposit > 0) {
      await client.query(
        'SELECT create_transaction_with_validation($1, $2, $3, $4, $5)',
        ['Deposit', initialDeposit, 'Initial Deposit', accountId, employeeId]
      );
    }

    await client.query('COMMIT');
    
    res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      account_id: accountId,
      joint_holders_count: joint_holders.length
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
 * Get accounts for transaction processing
 * GET /api/agent/accounts
 */
exports.getAccounts = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT
        a.account_id,
        a.balance,
        a.account_status,
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names
      FROM account a
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      WHERE a.account_status = 'Active'
      GROUP BY a.account_id, a.balance, a.account_status
      ORDER BY a.account_id
    `);
    
    res.json({
      status: 'success',
      accounts: result.rows
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
 * Get agent performance metrics
 * GET /api/agent/performance
 */
exports.getPerformance = async (req, res) => {
  const employeeId = req.user.id;
  const client = await pool.connect();
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    // Today's transactions count
    const todayTransactions = await client.query(
      `SELECT COUNT(*) as count FROM transaction 
       WHERE employee_id = $1 AND DATE(time) = $2`,
      [employeeId, today]
    );

    // Total customers registered
    const totalCustomers = await client.query(
      `SELECT COUNT(DISTINCT t.customer_id) as count 
       FROM takes t
       JOIN account a ON t.account_id = a.account_id
       JOIN transaction tr ON a.account_id = tr.account_id
       WHERE tr.employee_id = $1 AND tr.transaction_type = 'Deposit'`,
      [employeeId]
    );

    // Monthly accounts created
    const monthlyAccounts = await client.query(
      `SELECT COUNT(DISTINCT a.account_id) as count 
       FROM account a
       JOIN transaction tr ON a.account_id = tr.account_id
       WHERE tr.employee_id = $1 AND EXTRACT(MONTH FROM tr.time) = $2 
       AND EXTRACT(YEAR FROM tr.time) = $3`,
      [employeeId, currentMonth, currentYear]
    );

    // Total transaction volume
    const transactionVolume = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM transaction 
       WHERE employee_id = $1`,
      [employeeId]
    );

    // Recent activity (last 10 transactions)
    const recentActivity = await client.query(
      `SELECT 
        transaction_type,
        amount,
        account_id,
        description,
        time
       FROM transaction 
       WHERE employee_id = $1 
       ORDER BY time DESC 
       LIMIT 10`,
      [employeeId]
    );

    // Format recent activity for frontend
    const formattedActivity = recentActivity.rows.map(row => ({
      type: 'transaction',
      description: `${row.transaction_type} of LKR ${parseFloat(row.amount).toLocaleString()} - ${row.description || 'Account ' + row.account_id}`,
      time: row.time
    }));

    res.json({
      status: 'success',
      data: {
        today_transactions: parseInt(todayTransactions.rows[0].count),
        total_customers: parseInt(totalCustomers.rows[0].count),
        monthly_accounts: parseInt(monthlyAccounts.rows[0].count),
        transaction_volume: parseFloat(transactionVolume.rows[0].total),
        recent_activity: formattedActivity
      }
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
 * Get recent transactions
 * GET /api/agent/transactions/recent
 */
exports.getRecentTransactions = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        transaction_id,
        transaction_type,
        amount,
        time,
        description,
        account_id,
        employee_id
      FROM transaction 
      ORDER BY time DESC 
      LIMIT 50
    `);
    
    res.json({
      status: 'success',
      transactions: result.rows
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
 * Get full account details for view panel
 * GET /api/agent/accounts/:id/details
 */
exports.getAccountDetails = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    // Basic account + branch + plan
    const accountResult = await client.query(
      `SELECT 
         a.account_id,
         a.balance,
         a.account_status,
         a.open_date,
         COALESCE(b.name, 'Unknown') AS branch_name,
         COALESCE(sp.plan_type::text, 'Unknown') AS plan_type,
         COALESCE(sp.interest, 0) AS interest,
         COALESCE(sp.min_balance, 0) AS min_balance
       FROM account a
       LEFT JOIN branch b ON a.branch_id = b.branch_id
       LEFT JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id
       WHERE a.account_id = $1`,
      [id]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Account not found' });
    }

    const base = accountResult.rows[0];

    // Customers linked to account
    const customersResult = await client.query(
      `SELECT c.customer_id, c.first_name, c.last_name, c.nic, c.date_of_birth
       FROM takes t
       JOIN customer c ON t.customer_id = c.customer_id
       WHERE t.account_id = $1
       ORDER BY c.last_name, c.first_name`,
      [id]
    );

    // Recent transactions (last 20)
    const txResult = await client.query(
      `SELECT transaction_id, transaction_type, amount, time, description
       FROM transaction
       WHERE account_id = $1
       ORDER BY time DESC
       LIMIT 20`,
      [id]
    );

    const account = {
      account_id: base.account_id,
      balance: parseFloat(base.balance),
      account_status: base.account_status,
      open_date: base.open_date,
      branch_name: base.branch_name,
      plan_type: base.plan_type,
      interest: parseFloat(base.interest),
      min_balance: parseFloat(base.min_balance),
      customers: customersResult.rows,
      transactions: txResult.rows.map(r => ({
        transaction_id: r.transaction_id,
        transaction_type: r.transaction_type,
        amount: parseFloat(r.amount),
        time: r.time,
        description: r.description
      }))
    };

    res.json({ status: 'success', account });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Create a fixed deposit
 * POST /api/agent/fixed-deposits/create
 */
exports.createFixedDeposit = async (req, res) => {
  const { customer_id, account_id, fd_plan_id, principal_amount, auto_renewal_status } = req.body;

  if (!customer_id || !account_id || !fd_plan_id || principal_amount === undefined) {
    return res.status(400).json({ status: 'error', message: 'All required fields must be provided' });
  }

  if (principal_amount <= 0) {
    return res.status(400).json({ status: 'error', message: 'Principal amount must be greater than 0' });
  }

  // Normalize auto_renewal to DB enum ('True' | 'False')
  let autoRenewalStr;
  if (typeof auto_renewal_status === 'boolean') {
    autoRenewalStr = auto_renewal_status ? 'True' : 'False';
  } else if (typeof auto_renewal_status === 'string') {
    autoRenewalStr = auto_renewal_status.toLowerCase() === 'true' ? 'True' : 'False';
  } else {
    autoRenewalStr = 'False';
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      'SELECT *, EXTRACT(YEAR FROM AGE(date_of_birth)) as age FROM customer WHERE customer_id = $1',
      [customer_id]
    );
    if (customerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Customer not found' });
    }

    const customer = customerResult.rows[0];
    if (parseInt(customer.age) < 18) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Customer must be at least 18 years old for Fixed Deposit' });
    }

    const accountResult = await client.query(
      `SELECT a.*, sp.min_balance, sp.plan_type 
       FROM account a 
       JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id 
       WHERE a.account_id = $1 AND a.account_status = $2`,
      [account_id, 'Active']
    );
    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Account not found or closed' });
    }

    const account = accountResult.rows[0];
    const minBalance = parseFloat(account.min_balance);
    const availableForFD = parseFloat(account.balance) - minBalance;

    if (parseFloat(principal_amount) > availableForFD) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: `Insufficient balance. Maximum FD amount: LKR ${availableForFD.toFixed(2)}`
      });
    }

    const planResult = await client.query('SELECT * FROM fdplan WHERE fd_plan_id = $1', [fd_plan_id]);
    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Invalid FD plan' });
    }

    const fdPlan = planResult.rows[0];
    const openDate = new Date();
    const maturityDate = new Date(openDate);
    
    switch (fdPlan.fd_options) {
      case '6 months':
        maturityDate.setMonth(openDate.getMonth() + 6);
        break;
      case '1 year':
        maturityDate.setFullYear(openDate.getFullYear() + 1);
        break;
      case '3 years':
        maturityDate.setFullYear(openDate.getFullYear() + 3);
        break;
    }

    const fdResult = await client.query(
      `INSERT INTO fixeddeposit (fd_balance, auto_renewal_status, fd_status, open_date, maturity_date, fd_plan_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING fd_id`,
      [principal_amount, autoRenewalStr, 'Active', openDate, maturityDate, fd_plan_id]
    );

    const fdId = fdResult.rows[0].fd_id;

    await client.query(
      'SELECT create_transaction_with_validation($1, $2, $3, $4, $5)',
      ['Withdrawal', principal_amount, `Fixed Deposit Creation - ${fdPlan.fd_options} Plan`, account_id, req.user.id]
    );

    await client.query('UPDATE account SET fd_id = $1 WHERE account_id = $2', [fdId, account_id]);

    const updatedAccount = await client.query('SELECT balance FROM account WHERE account_id = $1', [account_id]);

    await client.query('COMMIT');
    
    res.status(201).json({
      status: 'success',
      message: 'Fixed Deposit created successfully',
      fd_id: fdId,
      maturity_date: maturityDate.toISOString().split('T')[0],
      new_savings_balance: parseFloat(updatedAccount.rows[0].balance)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error: ' + error.message });
  } finally {
    client.release();
  }
};

/**
 * Search fixed deposits
 * GET /api/agent/fixed-deposits/search?query=searchTerm
 */
exports.searchFixedDeposits = async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ status: 'error', message: 'Search query is required' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        fd.fd_id, fd.fd_balance, fd.fd_status, fd.open_date, fd.maturity_date, fd.auto_renewal_status,
        fp.fd_options, fp.interest, a.account_id,
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names,
        STRING_AGG(DISTINCT c.nic, ',') as customer_nics
      FROM fixeddeposit fd
      JOIN fdplan fp ON fd.fd_plan_id = fp.fd_plan_id
      JOIN account a ON fd.fd_id = a.fd_id
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      WHERE CAST(fd.fd_id AS TEXT) ILIKE $1 OR c.nic ILIKE $1
      GROUP BY fd.fd_id, fd.fd_balance, fd.fd_status, fd.open_date, fd.maturity_date, 
               fd.auto_renewal_status, fp.fd_options, fp.interest, a.account_id
      ORDER BY fd.open_date DESC
    `, [`%${query}%`]);
    
    res.json({ status: 'success', fixed_deposits: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Get fixed deposits by exact customer NIC/Birth Certificate number
 * GET /api/agent/fixed-deposits/by-nic/:nic
 */
exports.getFixedDepositsByNic = async (req, res) => {
  const rawNic = (req.params.nic || '').toString().trim();
  const nic = rawNic.toUpperCase();

  if (!/^([0-9]{12}|[0-9]{9}V)$/.test(nic)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid NIC/BC format. Use 12 digits or 9 digits followed by V'
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT
        fd.fd_id,
        fd.fd_balance,
        fd.fd_status,
        fd.open_date,
        fd.maturity_date,
        fd.auto_renewal_status,
        fp.fd_options,
        fp.interest,
        a.account_id,
        STRING_AGG(DISTINCT c2.first_name || ' ' || c2.last_name, ', ') as customer_names,
        STRING_AGG(DISTINCT c2.nic, ', ') as customer_nics
      FROM fixeddeposit fd
      JOIN fdplan fp ON fd.fd_plan_id = fp.fd_plan_id
      JOIN account a ON fd.fd_id = a.fd_id
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      -- Filter by requested NIC on any holder of the linked savings account
      JOIN takes t2 ON a.account_id = t2.account_id
      JOIN customer c2 ON t2.customer_id = c2.customer_id
      WHERE c.nic = $1
      GROUP BY fd.fd_id, fd.fd_balance, fd.fd_status, fd.open_date, fd.maturity_date,
               fd.auto_renewal_status, fp.fd_options, fp.interest, a.account_id
      ORDER BY fd.fd_id DESC
    `, [nic]);

    return res.json({ status: 'success', fixed_deposits: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Deactivate fixed deposit
 * POST /api/agent/fixed-deposits/deactivate
 */
exports.deactivateFixedDeposit = async (req, res) => {
  const { fd_id } = req.body;

  if (!fd_id) {
    return res.status(400).json({ status: 'error', message: 'FD ID is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const fdResult = await client.query(
      'SELECT * FROM fixeddeposit WHERE fd_id = $1 AND fd_status = $2',
      [fd_id, 'Active']
    );

    if (fdResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Active fixed deposit not found' });
    }

    const fd = fdResult.rows[0];

    const accountResult = await client.query('SELECT account_id FROM account WHERE fd_id = $1', [fd_id]);
    
    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Linked savings account not found' });
    }

    const accountId = accountResult.rows[0].account_id;

    await client.query(
      'SELECT create_transaction_with_validation($1, $2, $3, $4, $5)',
      ['Deposit', fd.fd_balance, `FD Deactivation - Principal Return (${fd_id})`, accountId, req.user.id]
    );

    await client.query('UPDATE fixeddeposit SET fd_status = $1 WHERE fd_id = $2', ['Closed', fd_id]);
    await client.query('UPDATE account SET fd_id = NULL WHERE fd_id = $1', [fd_id]);

    await client.query('COMMIT');
    
    res.json({
      status: 'success',
      message: 'Fixed deposit deactivated successfully. Principal amount returned to savings account.',
      fd_id: fd_id,
      principal_returned: fd.fd_balance,
      account_id: accountId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error: ' + error.message });
  } finally {
    client.release();
  }
};

/**
 * Deactivate account
 * POST /api/agent/accounts/deactivate
 */
exports.deactivateAccount = async (req, res) => {
  const { account_id, reason } = req.body;

  if (!account_id) {
    return res.status(400).json({ status: 'error', message: 'Account ID is required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const accountResult = await client.query(
      'SELECT * FROM account WHERE account_id = $1 AND account_status = $2',
      [account_id, 'Active']
    );

    if (accountResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: 'error', message: 'Active account not found' });
    }

    const account = accountResult.rows[0];

    if (account.fd_id) {
      const fdResult = await client.query(
        'SELECT * FROM fixeddeposit WHERE fd_id = $1 AND fd_status = $2',
        [account.fd_id, 'Active']
      );
      
      if (fdResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          status: 'error',
          message: 'Cannot deactivate account with active Fixed Deposit. Please deactivate the FD first.'
        });
      }
    }

    let withdrawalAmount = parseFloat(account.balance);
    let withdrawalTransactionId = null;

    if (withdrawalAmount > 0) {
      await client.query("SELECT set_config('app.balance_update_allowed','true', true)");
      await client.query("SELECT set_config('app.balance_update_account_id', $1, true)", [account_id.toString()]);
      
      await client.query('UPDATE account SET balance = $1 WHERE account_id = $2', [0, account_id]);

      const txResult = await client.query(
        `INSERT INTO transaction (transaction_type, amount, time, description, account_id, employee_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING transaction_id`,
        ['Withdrawal', withdrawalAmount, new Date(), 
         `Account Closure - Full Balance Withdrawal - ${reason || 'No reason provided'}`,
         account_id, req.user.id]
      );
      withdrawalTransactionId = txResult.rows[0].transaction_id;
    }

    await client.query(
      'UPDATE account SET account_status = $1, closed_at = $2 WHERE account_id = $3',
      ['Closed', new Date(), account_id]
    );

    await client.query('COMMIT');
    
    const responseData = {
      status: 'success',
      message: withdrawalAmount > 0 
        ? `Account deactivated successfully. Full balance of LKR ${withdrawalAmount.toLocaleString()} withdrawn and account closed.`
        : 'Account deactivated successfully. Account closed with zero balance.',
      account_id,
      withdrawal_amount: withdrawalAmount,
      withdrawal_transaction_id: withdrawalTransactionId
    };

    res.json(responseData);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error: ' + error.message });
  } finally {
    client.release();
  }
};

/**
 * Search accounts
 * GET /api/agent/accounts/search/:searchTerm
 */
exports.searchAccounts = async (req, res) => {
  const { searchTerm } = req.params;
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        a.account_id, a.balance, a.account_status, a.open_date, a.branch_id,
        a.saving_plan_id, a.fd_id, sp.plan_type, sp.interest, sp.min_balance,
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names,
        COUNT(DISTINCT t.customer_id) as customer_count, b.name as branch_name
      FROM account a
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id
      JOIN branch b ON a.branch_id = b.branch_id
      WHERE a.account_id ILIKE $1 OR c.first_name ILIKE $1 OR c.last_name ILIKE $1
      GROUP BY a.account_id, a.balance, a.account_status, a.open_date, a.branch_id, 
               a.saving_plan_id, a.fd_id, sp.plan_type, sp.interest, sp.min_balance, b.name
      ORDER BY a.open_date DESC
    `, [`%${searchTerm}%`]);
    
    res.json({ status: 'success', accounts: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Change account saving plan
 * POST /api/agent/accounts/change-plan
 */
exports.changeAccountPlan = async (req, res) => {
  const { account_id, new_saving_plan_id, reason, new_nic } = req.body || {};

  if (!account_id || !new_saving_plan_id || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'account_id, new_saving_plan_id and non-empty reason are required'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query("SELECT set_config('app.actor_employee_id', $1, true)", [req.user.id.toString()]);

    // Fetch current and target plan types to validate Teen -> Adult NIC requirement
    const planInfoCurrent = await client.query(
      `SELECT sp.plan_type
       FROM account a
       JOIN savingplan sp ON sp.saving_plan_id = a.saving_plan_id
       WHERE a.account_id = $1`,
      [Number(account_id)]
    );
    const planInfoTarget = await client.query(
      'SELECT plan_type FROM savingplan WHERE saving_plan_id = $1',
      [Number(new_saving_plan_id)]
    );
    if (planInfoCurrent.rows.length && planInfoTarget.rows.length) {
      const oldType = planInfoCurrent.rows[0].plan_type;
      const newType = planInfoTarget.rows[0].plan_type;
      if (oldType === 'Teen' && newType === 'Adult') {
        if (!new_nic || !/^([0-9]{12}|[0-9]{9}V)$/.test(String(new_nic).trim())) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            status: 'error',
            message: 'Valid NIC is required when upgrading Teen plan to Adult (use 12 digits or 9 digits followed by V)'
          });
        }
      }
    }

    await client.query('SELECT change_account_saving_plan($1, $2, $3, $4, $5)', [
      Number(account_id),
      Number(new_saving_plan_id),
      Number(req.user.id),
      reason,
      new_nic ?? null
    ]);

    const planInfo = await client.query(
      'SELECT saving_plan_id, plan_type, interest, min_balance FROM savingplan WHERE saving_plan_id = $1',
      [Number(new_saving_plan_id)]
    );

    await client.query('COMMIT');

    res.json({
      status: 'success',
      message: 'Plan changed successfully',
      new_plan: planInfo.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Change plan error:', error);
    return res.status(400).json({ status: 'error', message: error.message || 'Failed to change plan' });
  } finally {
    client.release();
  }
};

/**
 * Get all accounts (including inactive) with full details
 * GET /api/agent/all-accounts
 */
exports.getAllAccounts = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT
        a.account_id,
        a.balance,
        a.account_status,
        a.open_date,
        a.branch_id,
        a.saving_plan_id,
        a.fd_id,
        sp.plan_type,
        sp.interest,
        sp.min_balance,
        b.name as branch_name,
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names,
        STRING_AGG(DISTINCT c.nic, ', ') as customer_nics,
        COUNT(DISTINCT t.customer_id) as customer_count
      FROM account a
      JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id
      JOIN branch b ON a.branch_id = b.branch_id
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      GROUP BY a.account_id, a.balance, a.account_status, a.open_date, 
               a.branch_id, a.saving_plan_id, a.fd_id,
               sp.plan_type, sp.interest, sp.min_balance, b.name
      ORDER BY a.account_id DESC
    `);
    
    res.json({
      status: 'success',
      accounts: result.rows
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
 * Get accounts by exact customer NIC/Birth Certificate number
 * GET /api/agent/accounts/by-nic/:nic
 */
exports.getAccountsByCustomerNic = async (req, res) => {
  const rawNic = (req.params.nic || '').toString().trim();
  const nic = rawNic.toUpperCase();

  if (!/^([0-9]{12}|[0-9]{9}V)$/.test(nic)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid NIC/BC format. Use 12 digits or 9 digits followed by V'
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT
        a.account_id,
        a.balance,
        a.account_status,
        a.open_date,
        a.branch_id,
        a.saving_plan_id,
        a.fd_id,
        sp.plan_type,
        sp.interest,
        sp.min_balance,
        b.name as branch_name,
        STRING_AGG(DISTINCT c2.first_name || ' ' || c2.last_name, ', ') as customer_names,
        STRING_AGG(DISTINCT c2.nic, ', ') as customer_nics,
        COUNT(DISTINCT t.customer_id) as customer_count
      FROM account a
      JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id
      JOIN branch b ON a.branch_id = b.branch_id
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      -- Filter by the requested NIC on any customer of the account
      JOIN takes t2 ON a.account_id = t2.account_id
      JOIN customer c2 ON t2.customer_id = c2.customer_id
      WHERE c.nic = $1
      GROUP BY a.account_id, a.balance, a.account_status, a.open_date, 
               a.branch_id, a.saving_plan_id, a.fd_id,
               sp.plan_type, sp.interest, sp.min_balance, b.name
      ORDER BY a.account_id DESC
    `, [nic]);

    return res.json({ status: 'success', accounts: result.rows });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ status: 'error', message: 'Database error' });
  } finally {
    client.release();
  }
};

/**
 * Get accounts with FD information
 * GET /api/agent/accounts-with-fd
 */
exports.getAccountsWithFd = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT
        a.account_id,
        a.balance,
        a.fd_id,
        sp.min_balance,
        sp.interest,
        sp.plan_type,
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names,
        COUNT(DISTINCT t.customer_id) as customer_count
      FROM account a
      JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      WHERE a.account_status = 'Active' AND a.fd_id IS NULL
      GROUP BY a.account_id, a.balance, a.fd_id, sp.min_balance, sp.interest, sp.plan_type
      ORDER BY a.account_id
    `);
    
    res.json({
      status: 'success',
      accounts: result.rows
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
 * Get all fixed deposits
 * GET /api/agent/fixed-deposits
 */
exports.getFixedDeposits = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT
        fd.fd_id,
        fd.fd_balance,
        fd.fd_status,
        fd.open_date,
        fd.maturity_date,
        fd.auto_renewal_status,
        fdp.fd_options,
        fdp.interest,
        a.account_id,
        STRING_AGG(DISTINCT c.first_name || ' ' || c.last_name, ', ') as customer_names,
        STRING_AGG(DISTINCT c.nic, ', ') as customer_nics
      FROM fixeddeposit fd
      JOIN fdplan fdp ON fd.fd_plan_id = fdp.fd_plan_id
      JOIN account a ON fd.fd_id = a.fd_id
      JOIN takes t ON a.account_id = t.account_id
      JOIN customer c ON t.customer_id = c.customer_id
      GROUP BY fd.fd_id, fd.fd_balance, fd.fd_status, fd.open_date, fd.maturity_date,
               fd.auto_renewal_status, fdp.fd_options, fdp.interest, a.account_id
      ORDER BY fd.fd_id DESC
    `);
    
    res.json({
      status: 'success',
      fixed_deposits: result.rows
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
 * Get agent transaction analytics by account type
 * GET /api/agent/analytics/transaction-types
 */
exports.getTransactionTypeAnalytics = async (req, res) => {
  const employeeId = req.user.id;
  const client = await pool.connect();
  
  try {
    // Get transaction counts by account plan type for this agent
    // Only include: Children, Teen, Adult, Senior
    const result = await client.query(`
      SELECT 
        sp.plan_type,
        COUNT(t.transaction_id) as transaction_count
      FROM transaction t
      JOIN account a ON t.account_id = a.account_id
      JOIN savingplan sp ON a.saving_plan_id = sp.saving_plan_id
      WHERE t.employee_id = $1
        AND sp.plan_type IN ('Children', 'Teen', 'Adult', 'Senior')
      GROUP BY sp.plan_type
      ORDER BY transaction_count DESC
    `, [employeeId]);
    
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
 * Get agent last 30 days transaction trend
 * GET /api/agent/analytics/transaction-trend
 */
exports.getTransactionTrend = async (req, res) => {
  const employeeId = req.user.id;
  const client = await pool.connect();
  
  try {
    // Get daily transaction counts for the last 30 days
    const result = await client.query(`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '29 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS date
      )
      SELECT 
        ds.date,
        COALESCE(COUNT(t.transaction_id), 0) as transaction_count
      FROM date_series ds
      LEFT JOIN transaction t ON DATE(t.time) = ds.date AND t.employee_id = $1
      GROUP BY ds.date
      ORDER BY ds.date ASC
    `, [employeeId]);
    
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

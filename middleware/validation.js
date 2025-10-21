// =============================================================================
// INPUT VALIDATION MIDDLEWARE - Express Validator
// =============================================================================
const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// =============================================================================
// AUTH VALIDATION
// =============================================================================
exports.validateLogin = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate
];

// =============================================================================
// CUSTOMER VALIDATION
// =============================================================================
exports.validateCustomerRegistration = [
  body('first_name')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2 }).withMessage('First name must be at least 2 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name can only contain letters'),
  body('last_name')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name can only contain letters'),
  // NIC or Birth Certificate number (both stored in `nic` field)
  body('nic')
    .trim()
    .notEmpty().withMessage('NIC/Birth Certificate number is required')
    .matches(/^([0-9]{12}|[0-9]{9}V)$/).withMessage('Invalid NIC/Birth Certificate format (use 12 digits or 9 digits followed by V)'),
  body('gender')
    .notEmpty().withMessage('Gender is required')
    .isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
  body('date_of_birth')
    .notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Date of birth must be a valid date (YYYY-MM-DD)')
    .custom((value) => {
      const birthDate = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 0 || age > 150) {
        throw new Error('Invalid date of birth');
      }
      return true;
    }),
  body('contact_no_1')
    .trim()
    .notEmpty().withMessage('Primary contact number is required')
    .matches(/^0[0-9]{9}$/).withMessage('Contact number must be 10 digits starting with 0'),
  body('contact_no_2')
    .optional()
    .trim()
    .matches(/^0[0-9]{9}$/).withMessage('Contact number must be 10 digits starting with 0'),
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  validate
];

exports.validateCustomerUpdate = [
  param('id').isInt({ min: 1 }).withMessage('Invalid customer ID'),
  body('contact_no_1')
    .optional()
    .trim()
    .matches(/^0[0-9]{9}$/).withMessage('Contact number must be 10 digits starting with 0'),
  body('contact_no_2')
    .optional()
    .trim()
    .matches(/^0[0-9]{9}$/).withMessage('Contact number must be 10 digits starting with 0'),
  body('address')
    .optional()
    .trim()
    .isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  validate
];

// =============================================================================
// ACCOUNT VALIDATION
// =============================================================================
exports.validateAccountCreation = [
  body('customer_ids')
    .isArray({ min: 1, max: 2 }).withMessage('Customer IDs must be an array with 1-2 elements')
    .custom((value) => {
      if (value.length === 2 && value[0] === value[1]) {
        throw new Error('Cannot use the same customer ID twice for joint account');
      }
      return true;
    }),
  body('customer_ids.*')
    .isInt({ min: 1 }).withMessage('Each customer ID must be a positive integer'),
  body('branch_id')
    .isInt({ min: 1 }).withMessage('Branch ID must be a positive integer'),
  body('saving_plan_id')
    .isInt({ min: 1 }).withMessage('Saving plan ID must be a positive integer'),
  body('initial_deposit')
    .isFloat({ min: 0.01 }).withMessage('Initial deposit must be greater than 0'),
  body('account_type')
    .isIn(['single', 'joint']).withMessage('Account type must be either single or joint')
    .custom((value, { req }) => {
      if (value === 'joint' && req.body.customer_ids?.length !== 2) {
        throw new Error('Joint account requires exactly 2 customer IDs');
      }
      if (value === 'single' && req.body.customer_ids?.length !== 1) {
        throw new Error('Single account requires exactly 1 customer ID');
      }
      return true;
    }),
  validate
];

// =============================================================================
// TRANSACTION VALIDATION
// =============================================================================
exports.validateTransaction = [
  body('account_id')
    .trim()
    .notEmpty().withMessage('Account ID is required'),
  body('transaction_type')
    .notEmpty().withMessage('Transaction type is required')
    .isIn(['Deposit', 'Withdrawal']).withMessage('Transaction type must be Deposit or Withdrawal'),
  body('amount')
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0')
    .custom((value) => {
      if (value > 10000000) {
        throw new Error('Amount exceeds maximum limit of LKR 10,000,000');
      }
      return true;
    }),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Description must not exceed 255 characters'),
  validate
];

// =============================================================================
// FIXED DEPOSIT VALIDATION
// =============================================================================
exports.validateFDCreation = [
  body('customer_id')
    .isInt({ min: 1 }).withMessage('Customer ID must be a positive integer'),
  body('account_id')
    .trim()
    .notEmpty().withMessage('Account ID is required'),
  body('fd_plan_id')
    .isInt({ min: 1 }).withMessage('FD plan ID must be a positive integer'),
  body('principal_amount')
    .isFloat({ min: 1000 }).withMessage('Principal amount must be at least LKR 1,000')
    .custom((value) => {
      if (value > 50000000) {
        throw new Error('Principal amount exceeds maximum limit of LKR 50,000,000');
      }
      return true;
    }),
  body('auto_renewal_status')
    .custom((val) => {
      if (typeof val === 'boolean') return true;
      if (typeof val === 'string') {
        const v = val.toLowerCase();
        if (v === 'true' || v === 'false') return true;
      }
      throw new Error('Auto renewal status must be boolean true/false or "True"/"False"');
    }),
  validate
];

// =============================================================================
// EMPLOYEE VALIDATION
// =============================================================================
exports.validateEmployeeRegistration = [
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['Admin', 'Manager', 'Agent']).withMessage('Role must be Admin, Manager, or Agent'),
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 4, max: 50 }).withMessage('Username must be 4-50 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('first_name')
    .trim()
    .notEmpty().withMessage('First name is required')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name can only contain letters'),
  body('last_name')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name can only contain letters'),
  body('nic')
    .trim()
    .notEmpty().withMessage('NIC is required')
    .matches(/^([0-9]{9}V|[0-9]{12})$/).withMessage('Invalid NIC format (must be 12 digits or 9 digits followed by V)'),
  body('gender')
    .notEmpty().withMessage('Gender is required')
    .isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
  body('date_of_birth')
    .notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Date of birth must be a valid date'),
  body('branch_id')
    .isInt({ min: 1 }).withMessage('Branch ID must be a positive integer'),
  body('contact_no_1')
    .trim()
    .notEmpty().withMessage('Primary contact number is required')
    .matches(/^0[0-9]{9}$/).withMessage('Contact number must be 10 digits starting with 0'),
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  validate
];

// =============================================================================
// BRANCH VALIDATION
// =============================================================================
exports.validateBranchCreation = [
  body('branch_id')
    .trim()
    .notEmpty().withMessage('Branch ID is required')
    .matches(/^BR[0-9]{3}$/).withMessage('Branch ID must be in format BR### (e.g., BR001)'),
  body('name')
    .trim()
    .notEmpty().withMessage('Branch name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Branch name must be 3-100 characters'),
  body('contact_no_1')
    .trim()
    .notEmpty().withMessage('Primary contact number is required')
    .matches(/^0[0-9]{9}$/).withMessage('Contact number must be 10 digits starting with 0'),
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  validate
];

// =============================================================================
// QUERY VALIDATION
// =============================================================================
exports.validateSearchQuery = [
  query('query')
    .trim()
    .notEmpty().withMessage('Search query is required')
    .isLength({ min: 1, max: 100 }).withMessage('Search query must be 1-100 characters'),
  validate
];

exports.validateDateRange = [
  query('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Start date must be a valid date (YYYY-MM-DD)'),
  query('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('End date must be a valid date (YYYY-MM-DD)')
    .custom((endDate, { req }) => {
      if (new Date(endDate) < new Date(req.query.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  validate
];

exports.validateMonthYear = [
  query('month')
    .notEmpty().withMessage('Month is required')
    .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  query('year')
    .notEmpty().withMessage('Year is required')
    .isInt({ min: 2000, max: 2100 }).withMessage('Year must be between 2000 and 2100'),
  validate
];

// =============================================================================
// PARAM VALIDATION
// =============================================================================
exports.validateId = [
  param('id').isInt({ min: 1 }).withMessage('Invalid ID parameter'),
  validate
];

exports.validateSearchTerm = [
  param('searchTerm')
    .trim()
    .notEmpty().withMessage('Search term is required')
    .isLength({ min: 1, max: 100 }).withMessage('Search term must be 1-100 characters'),
  validate
];

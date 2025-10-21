// =============================================================================
// INTEREST SCHEDULER
// =============================================================================
// Automated cron jobs for processing interest calculations
// =============================================================================

const cron = require('node-cron');
const { processDailyFDInterest, processDailySavingsInterest } = require('../services/interest');

/**
 * Initialize and start interest processing schedulers
 * 
 * Environment Variables:
 * - INTEREST_CRON_DEBUG=1 : Run every 10 seconds for testing (overrides all other settings)
 * - FD_INTEREST_CRON : Custom cron schedule for FD interest (default: '0 3 * * *' - 3:00 AM daily)
 * - SAVINGS_INTEREST_CRON : Custom cron schedule for savings interest (default: '30 3 * * *' - 3:30 AM daily)
 * 
 * Cron Format: minute hour day month weekday
 * Optional seconds field supported by node-cron when using 6 fields: second minute hour day month weekday
 * Examples:
 * - '0 3 * * *'    : Every day at 3:00 AM
 * - '30 3 * * *'   : Every day at 3:30 AM
 * - '0,10,20,30,40,50 * * * * *' : Every 10 seconds (DEBUG mode)
**/
const startInterestSchedulers = () => {
  const debug = process.env.INTEREST_CRON_DEBUG === '1';

  // In DEBUG mode, force both jobs to run every 10 seconds regardless of explicit env
  // Use 6-field cron with seconds when in debug: every 10 seconds
  const FD_CRON = debug ? '*/10 * * * * *' : (process.env.FD_INTEREST_CRON || '0 3 * * *');
  const SAVINGS_CRON = debug ? '*/10 * * * * *' : (process.env.SAVINGS_INTEREST_CRON || '30 3 * * *');

  // Schedule FD interest processing
  cron.schedule(FD_CRON, async () => {
    try {
      await processDailyFDInterest();
    } catch (error) {
      console.error('❌ FD Interest Scheduler Error:', error);
    }
  });

  // Schedule Savings interest processing
  cron.schedule(SAVINGS_CRON, async () => {
    try {
      await processDailySavingsInterest();
    } catch (error) {
      console.error('❌ Savings Interest Scheduler Error:', error);
    }
  });

  // Log scheduler initialization
  console.log('');
  console.log('⏰ INTEREST SCHEDULERS INITIALIZED');
  console.log('='.repeat(60));
  if (debug) {
  console.warn('⚠️  DEBUG MODE: Interest processors set to run EVERY 10 SECONDS');
    console.warn('⚠️  Set INTEREST_CRON_DEBUG=0 in production!');
  }
  console.log(`✅ FD Interest Processor: Scheduled at '${FD_CRON}'`);
  console.log(`✅ Savings Interest Processor: Scheduled at '${SAVINGS_CRON}'`);
  console.log('='.repeat(60));
  console.log('');
};

module.exports = { startInterestSchedulers };

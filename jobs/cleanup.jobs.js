import prisma from "../database/postgresql.js";
import logger from "../utils/logger.js";

/**
 * Cleanup Jobs
 * Scheduled tasks to remove expired and stale data from the database
 */

/**
 * Clean up expired password reset tokens
 * Removes tokens that have passed their expiration date
 */
export const cleanupExpiredResetTokens = async () => {
    try {
        const result = await prisma.user.updateMany({
            where: {
                resetPasswordExpires: {
                    lt: new Date()
                },
                resetPasswordToken: {
                    not: null
                }
            },
            data: {
                resetPasswordToken: null,
                resetPasswordExpires: null
            }
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} expired password reset tokens`);
        }
    } catch (error) {
        logger.error('Error cleaning up expired reset tokens:', error);
    }
};

/**
 * Clean up expired verification OTPs
 * Removes OTPs that have passed their expiration date
 */
export const cleanupExpiredOTPs = async () => {
    try {
        const result = await prisma.user.updateMany({
            where: {
                verificationOTPExpires: {
                    lt: new Date()
                },
                verificationOTP: {
                    not: null
                }
            },
            data: {
                verificationOTP: null,
                verificationOTPExpires: null
            }
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} expired verification OTPs`);
        }
    } catch (error) {
        logger.error('Error cleaning up expired OTPs:', error);
    }
};

/**
 * Clean up expired premium subscriptions
 * Resets premium status for users whose subscription has expired
 */
export const cleanupExpiredPremium = async () => {
    try {
        const result = await prisma.user.updateMany({
            where: {
                isPremium: true,
                premiumUntil: {
                    lt: new Date()
                }
            },
            data: {
                isPremium: false,
                premiumPlan: null
            }
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} expired premium subscriptions`);
        }
    } catch (error) {
        logger.error('Error cleaning up expired premium subscriptions:', error);
    }
};


/**
 * Clean up old guest cart items
 * Removes cart items older than 30 days for better database hygiene
 */
export const cleanupOldCarts = async () => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const result = await prisma.cart.deleteMany({
            where: {
                updatedAt: {
                    lt: thirtyDaysAgo
                }
            }
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} old cart records`);
        }
    } catch (error) {
        logger.error('Error cleaning up old carts:', error);
    }
};

/**
 * Clean up old activity logs
 * Removes activity logs older than 90 days to manage database size
 */
export const cleanupOldActivities = async () => {
    try {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const result = await prisma.activity.deleteMany({
            where: {
                createdAt: {
                    lt: ninetyDaysAgo
                }
            }
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} old activity records`);
        }
    } catch (error) {
        logger.error('Error cleaning up old activities:', error);
    }
};

/**
 * Run all cleanup jobs
 * Executes all cleanup tasks in sequence
 */
export const runAllCleanupJobs = async () => {
    logger.info('Starting scheduled cleanup jobs...');
    
    await cleanupExpiredResetTokens();
    await cleanupExpiredOTPs();
    await cleanupExpiredPremium();
    await cleanupOldCarts();
    await cleanupOldActivities();
    
    logger.info('Completed all cleanup jobs');
};

/**
 * Initialize cleanup job scheduler
 * Runs cleanup jobs at specified intervals
 */
export const initializeCleanupJobs = () => {
    // Run immediately on startup
    runAllCleanupJobs();
    
    // Schedule cleanup jobs
    // Run every 6 hours (21600000 ms)
    setInterval(runAllCleanupJobs, 6 * 60 * 60 * 1000);
    
    logger.info('Cleanup jobs scheduler initialized (runs every 6 hours)');
};

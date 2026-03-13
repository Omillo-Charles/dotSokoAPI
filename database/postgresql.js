import { PrismaClient } from '../generated/prisma/index.js';
import logger from '../utils/logger.js';

const globalForPrisma = global;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL }
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Connect to PostgreSQL with retry logic
 * @param {number} retries - Number of retry attempts
 * @param {number} delay - Initial delay in ms
 */
export const connectPostgres = async (retries = 5, delay = 2000) => {
  for (let i = 1; i <= retries; i++) {
    try {
      await prisma.$connect();
      logger.info('Successfully connected to PostgreSQL database');
      return prisma;
    } catch (err) {
      const isLastAttempt = i === retries;
      const errorMessage = `Attempt ${i} to connect to PostgreSQL failed: ${err.message}`;
      
      if (isLastAttempt) {
        logger.error(`FATAL: Could not connect to PostgreSQL after ${retries} attempts.`);
        throw err;
      }
      
      logger.warn(`${errorMessage}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
};

export default prisma;


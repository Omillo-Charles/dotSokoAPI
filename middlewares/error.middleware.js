import { Prisma } from '@prisma/client';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

const errorMiddleware = (err, req, res, next) => {
    try {
        let statusCode = err.statusCode || 500;
        let message = err.message || 'An unexpected error occurred';
        let status = err.status || 'error';
        let errors = err.errors || null;

        // Categorize Prisma Errors
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
            status = 'fail';
            switch (err.code) {
                case 'P2002': // Unique constraint violation
                    statusCode = 400;
                    const target = err.meta?.target || 'field';
                    message = `Constraint violation: A record with this ${target} already exists.`;
                    break;
                case 'P2025': // Not found
                    statusCode = 404;
                    message = err.meta?.cause || 'Resource not found';
                    break;
                case 'P2003': // Foreign key constraint violation
                    statusCode = 400;
                    message = 'Constraint violation: This operation would break database integrity.';
                    break;
                default:
                    statusCode = 500;
                    message = `Database Error: ${err.code}`;
            }
        } else if (err instanceof Prisma.PrismaClientValidationError) {
            statusCode = 400;
            status = 'fail';
            message = 'Information provided is invalid for this resource.';
        } else if (err instanceof Prisma.PrismaClientInitializationError) {
            statusCode = 503;
            message = 'Service temporarily unavailable (Database connection)';
        }

        // Handle Zod Validation Errors
        if (err.name === 'ZodError') {
            statusCode = 400;
            status = 'fail';
            message = 'Validation failed';
            errors = err.errors.map(e => ({
                path: e.path.join('.'),
                message: e.message
            }));
        }

        // Handle JWT Errors
        if (err.name === 'JsonWebTokenError') {
            statusCode = 401;
            status = 'fail';
            message = 'Invalid token. Please log in again.';
        } else if (err.name === 'TokenExpiredError') {
            statusCode = 401;
            status = 'fail';
            message = 'Your session has expired. Please log in again.';
        }

        // Log the error with full context
        logger.error(`[${req.method}] ${req.originalUrl} - ${statusCode} - ${err.name}: ${err.message}`, {
            requestId: req.headers['x-request-id'],
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            errors,
            statusCode
        });

        // Send response
        return res.status(statusCode).json({
            success: false,
            status: status,
            message: message,
            ...(errors && { errors }),
            // Only send stack trace in development
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack, details: err })
        });
    } catch (fatalError) {
        // Fallback for when the error middleware itself fails
        console.error('CRITICAL: Error in error middleware:', fatalError);
        return res.status(500).json({
            success: false,
            message: 'A critical server error occurred'
        });
    }
};

export default errorMiddleware;


/**
 * Utility to send a standardized success response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {any} data - Data to send in the response
 * @param {Object} meta - Optional metadata (e.g., pagination info)
 */
export const sendSuccess = (res, statusCode = 200, message = "Success", data = null, meta = {}) => {
    const response = {
        success: true,
        message,
    };

    if (data !== null) {
        response.data = data;
    }

    if (Object.keys(meta).length > 0) {
        response.meta = meta;
    }

    return res.status(statusCode).json(response);
};

/**
 * Utility to send a standardized created response (201)
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {any} data - Created resource data
 */
export const sendCreated = (res, message = "Resource created successfully", data = null) => {
    return sendSuccess(res, 201, message, data);
};

/**
 * Utility to send a standardized paginated response
 * @param {Object} res - Express response object
 * @param {any} data - Array of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 */
export const sendPaginated = (res, data, page, limit, total) => {
    const totalPages = Math.ceil(total / limit);
    return sendSuccess(res, 200, "Data retrieved successfully", data, {
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages
        }
    });
};

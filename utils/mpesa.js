import axios from "axios";
import logger from "../utils/logger.js";
import { 
    MPESA_CONSUMER_KEY, 
    MPESA_CONSUMER_SECRET, 
    MPESA_ENVIRONMENT 
} from "../config/env.js";

/**
 * Generates a Safaricom Daraja API access token with retry logic
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<string>} The access token
 */
export const getMpesaAccessToken = async (retries = 3) => {
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString("base64");
    const url = MPESA_ENVIRONMENT === "sandbox" 
        ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
        : "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

    const attemptRequest = async (attempt) => {
        try {
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Basic ${auth}`,
                },
                timeout: 10000 // 10 second timeout for Safaricom API
            });
            return response.data.access_token;
        } catch (error) {
            const errorMessage = error.response?.data || error.message;
            
            if (attempt < retries) {
                const delay = attempt * 1000;
                logger.warn(`M-Pesa auth attempt ${attempt} failed: ${JSON.stringify(errorMessage)}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return attemptRequest(attempt + 1);
            }
            
            logger.error("M-Pesa Access Token Fatal Error:", {
                message: errorMessage,
                status: error.response?.status,
                url
            });
            throw new Error(`Failed to generate M-Pesa access token after ${retries} attempts`);
        }
    };

    return attemptRequest(1);
};

/**
 * Generates a timestamp in the format YYYYMMDDHHmmss
 * @returns {string} The formatted timestamp
 */
export const getMpesaTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

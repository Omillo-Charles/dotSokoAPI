import ImageKit from "imagekit";
import multer from "multer";
import { nanoid } from "nanoid";
import dns from "node:dns";
import https from "node:https";
import logger from "../utils/logger.js";
import { 
    IMAGEKIT_PUBLIC_KEY, 
    IMAGEKIT_PRIVATE_KEY, 
    IMAGEKIT_URL_ENDPOINT 
} from "./env.js";

// DNS FIX: Force IPv4 first to avoid IPv6 ETIMEDOUT issues in Node.js 18+
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Ensure HTTPS requests prefer IPv4
https.globalAgent.options.family = 4;

// NULCEAR FIX: Override dns.lookup to strictly use IPv4 if family is not specified
// This prevents any attempt to connect via IPv6 which is the root cause of ETIMEDOUT
const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === "function") {
    callback = options;
    options = { family: 4 };
  } else if (typeof options === "number") {
    options = { family: 4 };
  } else {
    options = { ...options, family: 4 };
  }
  return originalLookup(hostname, options, callback);
};

// Initialize ImageKit with official SDK
const imagekit = new ImageKit({
    publicKey: IMAGEKIT_PUBLIC_KEY || "placeholder",
    privateKey: IMAGEKIT_PRIVATE_KEY || "placeholder",
    urlEndpoint: IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/placeholder"
});

// Use memory storage to avoid writing files to disk
// We will upload to ImageKit manually in the controllers
const storage = multer.memoryStorage();

export const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit (optimized for images)
    }
});

/**
 * Helper to upload a single file to ImageKit with retry logic
 * @param {Object} file - The file object from multer (req.file or req.files[i])
 * @param {String} folder - The ImageKit folder path
 * @param {Number} retries - Number of retry attempts
 * @returns {Promise<Object>} - ImageKit upload response
 */
export const uploadToImageKit = async (file, folder = "duuka/others", retries = 5) => {
    if (!file) return null;
    
    const attemptUpload = (attempt) => {
        return new Promise((resolve, reject) => {
            // Set a higher timeout for the upload itself if possible
            // ImageKit SDK doesn't expose timeout easily, so we rely on global fixes
            imagekit.upload({
                file: file.buffer, // Buffer from memoryStorage
                fileName: `${nanoid()}-${file.originalname.replace(/\s+/g, '_')}`,
                folder: folder,
                useUniqueFileName: "true" 
            }, function(error, result) {
                if(error) {
                    const errorMessage = error.message || error.code || "Unknown ImageKit Error";
                    const isTimeout = errorMessage.includes("ETIMEDOUT") || error.code === "ETIMEDOUT";
                    
                    if (attempt <= retries) {
                        // Increase delay progressively: 2s, 4s, 8s, 16s...
                        const delay = Math.pow(2, attempt) * 1000; 
                        
                        logger.warn(`ImageKit upload attempt ${attempt} failed (${errorMessage}). Retrying in ${delay}ms...`, {
                            fileName: file.originalname,
                            attempt,
                            isTimeout
                        });

                        setTimeout(() => {
                            resolve(attemptUpload(attempt + 1));
                        }, delay);
                    } else {
                        logger.error("--- IMAGEKIT UPLOAD FATAL ERROR ---", {
                            code: error.code,
                            message: errorMessage,
                            fileName: file.originalname,
                            response: error.response?.data,
                            status: error.response?.status,
                            cause: error.cause ? String(error.cause) : undefined
                        });
                        reject(new Error(`Failed to upload to ImageKit after ${retries} attempts: ${errorMessage}`));
                    }
                } else {
                    resolve(result);
                }
            });
        });
    };

    return attemptUpload(1);
};

export { imagekit };

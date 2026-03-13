import { config } from "dotenv";
import { z } from "zod";

config({ path: '.env' });

const envSchema = z.object({
    PORT: z.string().default("5500"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_EXPIRY: z.string().default("1d"),
    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
    JWT_REFRESH_EXPIRY: z.string().default("7d"),
    FRONTEND_URL: z.string().url().default("http://localhost:3000"),
    MONGODB_URI_USERS: z.string().optional(),
    MONGODB_URI_PRODUCTS: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GITHUB_CALLBACK_URL: z.string().optional(),
    EMAIL_USER: z.string().email().optional(),
    EMAIL_PASSWORD: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    IMAGEKIT_PUBLIC_KEY: z.string().min(1, "IMAGEKIT_PUBLIC_KEY is required"),
    IMAGEKIT_PRIVATE_KEY: z.string().min(1, "IMAGEKIT_PRIVATE_KEY is required"),
    IMAGEKIT_URL_ENDPOINT: z.string().url("IMAGEKIT_URL_ENDPOINT must be a valid URL"),
    MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    MPESA_CONSUMER_KEY: z.string().optional(),
    MPESA_CONSUMER_SECRET: z.string().optional(),
    MPESA_PASSKEY: z.string().optional(),
    MPESA_SHORTCODE: z.string().optional(),
    MPESA_CALLBACK_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

const envParsed = envSchema.safeParse(process.env);

if (!envParsed.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(envParsed.error.format(), null, 2));
    process.exit(1);
}

export const {
    PORT,
    MONGODB_URI_USERS,
    MONGODB_URI_PRODUCTS,
    DATABASE_URL,
    JWT_SECRET,
    JWT_EXPIRY,
    JWT_REFRESH_SECRET,
    JWT_REFRESH_EXPIRY,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL,
    FRONTEND_URL,
    EMAIL_USER,
    EMAIL_PASSWORD,
    NODE_ENV,
    IMAGEKIT_PUBLIC_KEY,
    IMAGEKIT_PRIVATE_KEY,
    IMAGEKIT_URL_ENDPOINT,
    MPESA_ENVIRONMENT,
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_PASSKEY,
    MPESA_SHORTCODE,
    MPESA_CALLBACK_URL,
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
} = envParsed.data;


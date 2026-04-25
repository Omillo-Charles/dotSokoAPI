import dns from "node:dns";
import https from "node:https";

// DNS FIX: Force IPv4 first to avoid IPv6 ETIMEDOUT issues in Node.js 18+
// This is applied globally at the very start of the app
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Ensure HTTPS requests prefer IPv4
https.globalAgent.options.family = 4;

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "./utils/logger.js";
import limiter from "./middlewares/limit.middleware.js";
import requestIdMiddleware from "./middlewares/requestId.middleware.js";
import { PORT, FRONTEND_URL } from "./config/env.js";
import authRouter from "./routes/auth.routes.js";
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';
import userRouter from "./routes/user.routes.js";
import contactRouter from "./routes/contact.routes.js";
import shopRouter from "./routes/shop.routes.js";
import productRouter from "./routes/product.routes.js";
import cartRouter from "./routes/cart.routes.js";
import wishlistRouter from "./routes/wishlist.routes.js";
import statsRouter from "./routes/stats.routes.js";
import commentRouter from "./routes/comment.routes.js";
import orderRouter from "./routes/order.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import errorMiddleware from "./middlewares/error.middleware.js";
import passport from "./config/passport.js";
import { connectPostgres } from "./database/postgresql.js";
import { initializeCleanupJobs } from "./jobs/cleanup.jobs.js";

const app = express();

// Request ID middleware - must be first to track all requests
app.use(requestIdMiddleware);

app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(cors({ 
  origin: [
    FRONTEND_URL, 
    'http://localhost:3000', 
    'http://127.0.0.1:3000', 
    'https://dotsoko.vercel.app', 
    'https://dotsoko.vercel.app/',
    'http://localhost:8081', // Default Expo/React Native port
    'http://127.0.0.1:8081'
  ], 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
app.use(passport.initialize());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/contacts", contactRouter);
app.use("/api/v1/shops", shopRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/carts", cartRouter);
app.use("/api/v1/wishlist", wishlistRouter);
app.use("/api/v1/stats", statsRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/payments", paymentRouter);

app.get("/", (req, res) => res.redirect("/api-docs"));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 404 handler for unknown routes
app.use((req, res) => {
  console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found on this server`
  });
});

app.use(errorMiddleware);

app.listen(PORT, async ()=>{
  logger.info(`The .soko Backend API is running on http://localhost:${PORT}`);
  connectPostgres().catch(err => logger.error('PostgreSQL connection error:', { message: err.message }));
  
  // Initialize cleanup jobs after database connection
  initializeCleanupJobs();
});

export default app;

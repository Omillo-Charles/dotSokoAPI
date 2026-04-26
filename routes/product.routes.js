import { Router } from "express";
import { createProduct, getProducts, getProductById, getMyProducts, updateProduct, deleteProduct, getProductsByShopId, rateProduct, getPersonalizedFeed, trackActivity, getProductsByShopHandle } from "../controllers/product.controller.js";
import authorize from "../middlewares/auth.middleware.js";
import { upload } from "../config/imagekit.js";
import cacheMiddleware from "../middlewares/cache.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { createProductSchema, rateProductSchema, updateProductSchema } from "../validations/product.validation.js";
import { createLimiter } from "../middlewares/limit.middleware.js";
import { validateImageUpload } from "../middlewares/fileValidation.middleware.js";

const productRouter = Router();

// Feed and Tracking
productRouter.get("/feed", (req, res, next) => {
    if (req.headers.authorization) {
        return authorize(req, res, next);
    }
    next();
}, getPersonalizedFeed);

productRouter.post("/track", (req, res, next) => {
    if (req.headers.authorization) {
        return authorize(req, res, next);
    }
    next();
}, trackActivity);

productRouter.post("/", authorize, createLimiter, upload.array('image', 10), validateImageUpload, validate(createProductSchema), createProduct);
productRouter.post("/:id/rate", authorize, createLimiter, validate(rateProductSchema), rateProduct);
productRouter.get("/", getProducts);
productRouter.get("/shop/:id", cacheMiddleware(300), getProductsByShopId); // Cache for 5 minutes
productRouter.get("/shop/handle/:username", cacheMiddleware(300), getProductsByShopHandle); // Cache for 5 minutes
productRouter.get("/my-products", authorize, getMyProducts);
productRouter.get("/:id", cacheMiddleware(600), getProductById); // Cache for 10 minutes
productRouter.put("/:id", authorize, upload.array('image', 10), validateImageUpload, validate(updateProductSchema), updateProduct);
productRouter.delete("/:id", authorize, deleteProduct);

export default productRouter;

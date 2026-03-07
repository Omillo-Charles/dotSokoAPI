import { Router } from "express";
import { 
    createShop, 
    getMyShop, 
    getShopById, 
    updateShop, 
    deleteShop, 
    getShops, 
    toggleFollowShop, 
    getShopFollowers, 
    getShopFollowing,
    checkUsernameAvailability,
    rateShop,
    getShopReviews,
    getShopByHandle,
    getShopReviewsByHandle,
    getShopFollowersByHandle,
    getShopFollowingByHandle,
    rateShopByHandle
} from "../controllers/shop.controller.js";
import authorize from "../middlewares/auth.middleware.js";
import { upload } from "../config/imagekit.js";
import cacheMiddleware from "../middlewares/cache.middleware.js";

const shopRouter = Router();

shopRouter.get("/", cacheMiddleware(300), getShops);
shopRouter.post("/", authorize, upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
]), createShop);
shopRouter.get("/my-shop", authorize, getMyShop);
shopRouter.get("/:id", cacheMiddleware(600), getShopById);
shopRouter.get("/handle/:username", cacheMiddleware(600), getShopByHandle);
shopRouter.get("/check-username/:username", checkUsernameAvailability);
shopRouter.put("/my-shop", authorize, updateShop);
shopRouter.put("/my-shop/branding", authorize, upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
]), updateShop);
shopRouter.delete("/my-shop", authorize, deleteShop);
shopRouter.post("/:id/follow", authorize, toggleFollowShop);
shopRouter.get("/:id/followers", cacheMiddleware(300), getShopFollowers);
shopRouter.get("/:id/following", cacheMiddleware(300), getShopFollowing);
shopRouter.get("/:id/reviews", cacheMiddleware(300), getShopReviews);
shopRouter.get("/handle/:username/reviews", cacheMiddleware(300), getShopReviewsByHandle);
shopRouter.get("/handle/:username/followers", cacheMiddleware(300), getShopFollowersByHandle);
shopRouter.get("/handle/:username/following", cacheMiddleware(300), getShopFollowingByHandle);
shopRouter.post("/:id/rate", authorize, rateShop);
shopRouter.post("/handle/:username/rate", authorize, rateShopByHandle);

export default shopRouter;

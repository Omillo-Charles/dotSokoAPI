import prisma from "../database/postgresql.js";

export const deleteAccount = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id?.toString();

        const shop = await prisma.shop.findUnique({ where: { ownerId: userId } });
        
        if (shop) {
            try {
                await prisma.product.deleteMany({ where: { shopId: shop.id } });
            } catch (_) {}
            await prisma.shop.delete({ where: { id: shop.id } });
        }

        await prisma.cart.deleteMany({ where: { userId } });
        await prisma.wishlist.deleteMany({ where: { userId } });
        await prisma.address.deleteMany({ where: { userId } });

        await prisma.user.delete({ where: { id: userId } });

        res.status(200).json({
            success: true,
            message: "Account and all associated data deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

export const getCurrentUser = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id?.toString();
        const user = await prisma.user.findUnique({ 
            where: { id: userId },
            include: {
                shop: {
                    select: {
                        id: true,
                        name: true,
                        username: true
                    }
                }
            }
        });
        
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        const followingCount = await prisma.shop.count({ where: { followers: { some: { id: userId } } } });
        const { password, ...safe } = user;
        const userWithFollowing = { ...safe, followingCount };

        res.status(200).json({
            success: true,
            data: userWithFollowing
        });
    } catch (error) {
        next(error);
    }
}

export const getUsers = async (req, res, next) => {
    try {
        const users = await prisma.user.findMany();

        res.status(200).json({
            success: true,
            data: users
        });
    } catch (error) {
        next(error);
    }
}

export const getUser = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });

        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        const followingCount = await prisma.shop.count({ where: { followers: { some: { id: user.id } } } });
        const { password, ...safe } = user;
        const userWithFollowing = { ...safe, followingCount };

        res.status(200).json({
            success: true,
            data: userWithFollowing
        });
    } catch (error) {
        next(error);
    }
}

export const getUserFollowing = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const following = await prisma.shop.findMany({
            where: { followers: { some: { id } } },
            select: { id: true, name: true, avatar: true, description: true, username: true, isVerified: true }
        });

        res.status(200).json({
            success: true,
            data: following
        });
    } catch (error) {
        next(error);
    }
};

export const getUserFollowers = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: []
        });
    } catch (error) {
        next(error);
    }
};

export const updateAccountType = async (req, res, next) => {
    try {
        const { accountType } = req.body;
        const userId = req.user?.id || req.user?._id?.toString();
        const user = await prisma.user.update({
            where: { id: userId },
            data: { accountType }
        });
        const { password, ...safe } = user;

        res.status(200).json({
            success: true,
            message: `Account switched to ${accountType}`,
            data: safe
        });
    } catch (error) {
        next(error);
    }
}

export const addAddress = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id?.toString();
        const { name, type, phone, city, street, isDefault } = req.body;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        const addressCount = await prisma.address.count({ where: { userId } });
        const shouldBeDefault = addressCount === 0 ? true : !!isDefault;

        if (shouldBeDefault) {
            await prisma.address.updateMany({
                where: { userId },
                data: { isDefault: false }
            });
        }

        const created = await prisma.address.create({
            data: { userId, name, type, phone, city, street, isDefault: shouldBeDefault }
        });

        res.status(201).json({
            success: true,
            message: "Address added successfully",
            data: created
        });
    } catch (error) {
        next(error);
    }
};

export const updateAddress = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id?.toString();
        const { addressId } = req.params;
        const { name, type, phone, city, street, isDefault } = req.body;

        const address = await prisma.address.findUnique({ where: { id: addressId } });
        if (!address || address.userId !== userId) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        if (isDefault) {
            await prisma.address.updateMany({
                where: { userId },
                data: { isDefault: false }
            });
        }

        const updated = await prisma.address.update({
            where: { id: addressId },
            data: {
                name: name ?? undefined,
                type: type ?? undefined,
                phone: phone ?? undefined,
                city: city ?? undefined,
                street: street ?? undefined,
                isDefault: isDefault ?? undefined
            }
        });

        res.status(200).json({
            success: true,
            message: "Address updated successfully",
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

export const deleteAddress = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id?.toString();
        const { addressId } = req.params;

        const address = await prisma.address.findUnique({ where: { id: addressId } });
        if (!address || address.userId !== userId) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        const wasDefault = address.isDefault;
        await prisma.address.delete({ where: { id: addressId } });
        if (wasDefault) {
            const remaining = await prisma.address.findMany({ where: { userId }, take: 1 });
            if (remaining.length > 0) {
                await prisma.address.update({ where: { id: remaining[0].id }, data: { isDefault: true } });
            }
        }

        res.status(200).json({
            success: true,
            message: "Address deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

export const setDefaultAddress = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user?._id?.toString();
        const { addressId } = req.params;

        const address = await prisma.address.findUnique({ where: { id: addressId } });
        if (!address || address.userId !== userId) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
        await prisma.address.update({ where: { id: addressId }, data: { isDefault: true } });
        const addresses = await prisma.address.findMany({ where: { userId } });

        res.status(200).json({
            success: true,
            message: "Default address updated",
            data: addresses
        });
    } catch (error) {
        next(error);
    }
};

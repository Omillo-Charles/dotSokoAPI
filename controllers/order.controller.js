import prisma from "../database/postgresql.js";
import { sendEmail } from "../config/nodemailer.js";
import { getOrderConfirmationEmailTemplate, getNewOrderSellerEmailTemplate, getOrderStatusUpdateEmailTemplate } from "../utils/emailTemplates.js";
import { calculateShippingFee } from "../utils/shipping.js";

export const createOrder = async (req, res, next) => {
    try {
        const { shippingAddress, items } = req.body;
        const userId = req.user?.id || req.user?._id?.toString();

        if (!items || items.length === 0) {
            const error = new Error('No items in order');
            error.statusCode = 400;
            throw error;
        }

        // Step 1: Validate all products and check stock availability
        let subtotal = 0;
        const shopOrders = {};
        const stockUpdates = []; // Track stock updates for transaction

        for (const item of items) {
            const product = await prisma.product.findUnique({ 
                where: { id: item.productId }, 
                include: { shop: true } 
            });
            
            if (!product) {
                const error = new Error(`Product ${item.productId} not found`);
                error.statusCode = 404;
                throw error;
            }

            // Check stock availability
            if (product.stock < item.quantity) {
                const error = new Error(
                    `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`
                );
                error.statusCode = 400;
                throw error;
            }

            const itemTotal = product.price * item.quantity;
            subtotal += itemTotal;

            const shopId = product.shopId;
            if (!shopOrders[shopId]) {
                shopOrders[shopId] = { shop: product.shop, items: [] };
            }
            shopOrders[shopId].items.push({
                name: product.name,
                price: product.price,
                quantity: item.quantity,
                image: item.image || product.image,
                size: item.size,
                color: item.color,
                shopId,
                productId: product.id
            });

            // Track stock update for transaction
            stockUpdates.push({
                productId: product.id,
                quantity: item.quantity
            });
        }

        const shippingFee = calculateShippingFee(subtotal);
        const totalAmount = subtotal + shippingFee;

        // Step 2: Create order and update stock in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Create the order
            const order = await tx.order.create({
                data: {
                    userId,
                    subtotal,
                    shippingFee,
                    totalAmount,
                    status: 'pending',
                    paymentStatus: req.body.paymentMethod === 'M-Pesa' ? 'pending' : 'pending',
                    paymentMethod: req.body.paymentMethod || 'Cash on Delivery',
                    shippingName: shippingAddress?.name || '',
                    shippingPhone: shippingAddress?.phone || '',
                    shippingCity: shippingAddress?.city || '',
                    shippingStreet: shippingAddress?.street || ''
                }
            });

            // Create order items
            for (const shopId in shopOrders) {
                for (const it of shopOrders[shopId].items) {
                    await tx.orderItem.create({
                        data: {
                            orderId: order.id,
                            productId: it.productId,
                            shopId: it.shopId,
                            name: it.name,
                            price: it.price,
                            quantity: it.quantity,
                            image: it.image,
                            size: it.size,
                            color: it.color
                        }
                    });
                }
            }

            // Decrement stock for all products
            for (const update of stockUpdates) {
                await tx.product.update({
                    where: { id: update.productId },
                    data: { stock: { decrement: update.quantity } }
                });
            }

            // Clear user's cart
            const cart = await tx.cart.findUnique({ where: { userId } });
            if (cart) {
                await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            }

            return order;
        });

        // Step 3: Send Email to User (outside transaction - non-critical)
        const user = await prisma.user.findUnique({ where: { id: userId } });
        try {
            const orderItems = Object.values(shopOrders).flatMap(s => s.items);
            const emailOrder = {
                _id: result.id,
                items: orderItems.map(i => ({ 
                    name: i.name, 
                    price: i.price, 
                    quantity: i.quantity, 
                    image: i.image, 
                    size: i.size, 
                    color: i.color 
                })),
                totalAmount: result.totalAmount,
                paymentMethod: result.paymentMethod,
                shippingAddress: {
                    name: result.shippingName,
                    phone: result.shippingPhone,
                    city: result.shippingCity,
                    street: result.shippingStreet
                }
            };
            const template = getOrderConfirmationEmailTemplate(emailOrder, user);
            await sendEmail({
                to: user.email,
                subject: template.subject,
                text: template.text,
                html: template.html
            });
        } catch (emailError) {
            console.error('Failed to send order confirmation email to user:', emailError);
        }

        // Step 4: Send Emails to Shops (outside transaction - non-critical)
        for (const shopId in shopOrders) {
            const { shop } = shopOrders[shopId];
            try {
                const emailOrder = {
                    _id: result.id,
                    items: shopOrders[shopId].items.map(i => ({ 
                        name: i.name, 
                        price: i.price, 
                        quantity: i.quantity, 
                        image: i.image, 
                        size: i.size, 
                        color: i.color,
                        shop: { toString: () => shopId }
                    })),
                    totalAmount: result.totalAmount,
                    paymentMethod: result.paymentMethod,
                    shippingAddress: {
                        name: result.shippingName,
                        phone: result.shippingPhone,
                        city: result.shippingCity,
                        street: result.shippingStreet
                    }
                };
                const template = getNewOrderSellerEmailTemplate(emailOrder, shop, user);
                await sendEmail({
                    to: shop.email,
                    subject: template.subject,
                    text: template.text,
                    html: template.html
                });
            } catch (emailError) {
                console.error(`Failed to send order notification to shop ${shopId}:`, emailError);
            }
        }

        res.status(201).json({
            success: true,
            message: "Order placed successfully",
            data: result
        });
    } catch (error) {
        next(error);
    }
};

export const getMyOrders = async (req, res, next) => {
    try {
        const { limit, page = 1, status } = req.query;
        const limitValue = parseInt(limit) || 20;
        const pageValue = parseInt(page) || 1;
        const skipValue = (pageValue - 1) * limitValue;

        const where = { userId: req.user?.id || req.user?._id?.toString() };
        if (status && status !== 'all') {
            where.status = status;
        }

        const orders = await prisma.order.findMany({
            where,
            include: { items: true },
            orderBy: { createdAt: 'desc' },
            take: limitValue,
            skip: skipValue
        });

        const mappedOrders = orders.map(order => ({
            ...order,
            shippingAddress: {
                name: order.shippingName,
                phone: order.shippingPhone,
                city: order.shippingCity,
                street: order.shippingStreet
            }
        }));

        const total = await prisma.order.count({ where });

        res.status(200).json({
            success: true,
            data: mappedOrders,
            pagination: {
                total,
                page: pageValue,
                limit: limitValue,
                pages: Math.ceil(total / limitValue)
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getOrderById = async (req, res, next) => {
    try {
        const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
        if (!order) {
            const error = new Error(`Order with ID ${req.params.id} not found`);
            error.statusCode = 404;
            throw error;
        }
        res.status(200).json({
            success: true,
            data: {
                ...order,
                shippingAddress: {
                    name: order.shippingName,
                    phone: order.shippingPhone,
                    city: order.shippingCity,
                    street: order.shippingStreet
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getSellerOrders = async (req, res, next) => {
    try {
        const { limit, page = 1, status } = req.query;
        const limitValue = parseInt(limit) || 20;
        const pageValue = parseInt(page) || 1;
        const skipValue = (pageValue - 1) * limitValue;

        const shop = await prisma.shop.findUnique({ where: { ownerId: req.user?.id || req.user?._id?.toString() } });
        if (!shop) {
            return res.status(200).json({
                success: true,
                data: [],
                pagination: {
                    total: 0,
                    page: 1,
                    limit: limitValue,
                    pages: 0
                }
            });
        }

        const where = { items: { some: { shopId: shop.id } } };
        if (status && status !== 'all') {
            where.status = status;
        }

        const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { 
                user: { select: { name: true, email: true } },
                items: { where: { shopId: shop.id } }
            },
            take: limitValue,
            skip: skipValue
        });

        const mappedOrders = orders.map(order => ({
            ...order,
            shippingAddress: {
                name: order.shippingName,
                phone: order.shippingPhone,
                city: order.shippingCity,
                street: order.shippingStreet
            }
        }));

        const total = await prisma.order.count({ where });

        res.status(200).json({
            success: true,
            data: mappedOrders,
            pagination: {
                total,
                page: pageValue,
                limit: limitValue,
                pages: Math.ceil(total / limitValue)
            }
        });
    } catch (error) {
        next(error);
    }
};

export const trackOrder = async (req, res, next) => {
    try {
        let { id } = req.params;
        id = id.trim().replace(/^#/, "").toLowerCase();
        let order;
        if (id.length > 12) {
            order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
        } else {
            order = await prisma.order.findFirst({ where: { id: { endsWith: id } }, include: { items: true } });
        }

        if (!order) {
            const error = new Error(`Order with ID #${id} not found. Please make sure you've entered the correct ID from your email.`);
            error.statusCode = 404;
            throw error;
        }

        res.status(200).json({
            success: true,
            data: {
                _id: order.id,
                status: order.status,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                items: order.items.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    image: item.image
                })),
                totalAmount: order.totalAmount,
                shippingAddress: {
                    city: order.shippingCity,
                    street: order.shippingStreet
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

export const updateOrderStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        const shop = await prisma.shop.findUnique({ where: { ownerId: req.user?.id || req.user?._id?.toString() } });
        if (!shop) {
            const error = new Error('Unauthorized: Only shop owners can update order status');
            error.statusCode = 403;
            throw error;
        }

        const order = await prisma.order.findUnique({ 
            where: { id }, 
            include: { 
                items: true,
                user: true 
            } 
        });
        
        if (!order) {
            const error = new Error(`Order with ID ${id} not found`);
            error.statusCode = 404;
            throw error;
        }

        const hasItemFromShop = order.items.some(item => item.shopId === shop.id);
        if (!hasItemFromShop) {
            const error = new Error('Unauthorized: Order does not belong to your shop');
            error.statusCode = 403;
            throw error;
        }

        // If order is being cancelled, restore stock
        const previousStatus = order.status;
        const isCancelling = status === 'cancelled' && previousStatus !== 'cancelled';

        let updated;
        if (isCancelling) {
            // Use transaction to restore stock atomically
            updated = await prisma.$transaction(async (tx) => {
                // Update order status
                const updatedOrder = await tx.order.update({ 
                    where: { id }, 
                    data: { status },
                    include: { user: true }
                });

                // Restore stock for all items in the order
                for (const item of order.items) {
                    await tx.product.update({
                        where: { id: item.productId },
                        data: { stock: { increment: item.quantity } }
                    });
                }

                return updatedOrder;
            });

            console.log(`Order ${id} cancelled. Stock restored for ${order.items.length} items.`);
        } else {
            // Normal status update without stock changes
            updated = await prisma.order.update({ 
                where: { id }, 
                data: { status },
                include: { user: true }
            });
        }

        // Send email notification to buyer about status change
        try {
            const template = getOrderStatusUpdateEmailTemplate(updated, order.user, status);
            await sendEmail({
                to: order.user.email,
                subject: template.subject,
                text: template.text,
                html: template.html
            });
            console.log(`Order status update email sent to ${order.user.email}`);
        } catch (emailError) {
            console.error('Failed to send order status update email:', emailError);
            // Don't fail the request if email fails
        }

        res.status(200).json({
            success: true,
            message: `Order status updated to ${status}`,
            data: {
                ...updated,
                shippingAddress: {
                    name: updated.shippingName,
                    phone: updated.shippingPhone,
                    city: updated.shippingCity,
                    street: updated.shippingStreet
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

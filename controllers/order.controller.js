import prisma from "../database/postgresql.js";
import { sendEmail } from "../config/nodemailer.js";
import { getOrderConfirmationEmailTemplate, getNewOrderSellerEmailTemplate } from "../utils/emailTemplates.js";
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

        let subtotal = 0;
        const shopOrders = {};

        for (const item of items) {
            const product = await prisma.product.findUnique({ where: { id: item.product }, include: { shop: true } });
            if (!product) {
                const error = new Error(`Product ${item.product} not found`);
                error.statusCode = 404;
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
        }

        const shippingFee = calculateShippingFee(subtotal);
        const totalAmount = subtotal + shippingFee;

        const order = await prisma.order.create({
            data: {
                userId,
                subtotal,
                shippingFee,
                totalAmount,
                status: 'pending',
                paymentStatus: 'pending',
                paymentMethod: 'Cash on Delivery',
                shippingName: shippingAddress?.name || '',
                shippingPhone: shippingAddress?.phone || '',
                shippingCity: shippingAddress?.city || '',
                shippingStreet: shippingAddress?.street || ''
            }
        });
        for (const shopId in shopOrders) {
            for (const it of shopOrders[shopId].items) {
                await prisma.orderItem.create({
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

        // 3. Send Email to User
        const user = await prisma.user.findUnique({ where: { id: userId } });
        try {
            const orderItems = Object.values(shopOrders).flatMap(s => s.items);
            const emailOrder = {
                _id: order.id,
                items: orderItems.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, image: i.image, size: i.size, color: i.color })),
                totalAmount: order.totalAmount,
                paymentMethod: order.paymentMethod,
                shippingAddress: {
                    name: order.shippingName,
                    phone: order.shippingPhone,
                    city: order.shippingCity,
                    street: order.shippingStreet
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

        // 4. Send Emails to Shops
        for (const shopId in shopOrders) {
            const { shop } = shopOrders[shopId];
            try {
                const emailOrder = {
                    _id: order.id,
                    items: shopOrders[shopId].items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, image: i.image, size: i.size, color: i.color })),
                    totalAmount: order.totalAmount,
                    paymentMethod: order.paymentMethod,
                    shippingAddress: {
                        name: order.shippingName,
                        phone: order.shippingPhone,
                        city: order.shippingCity,
                        street: order.shippingStreet
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

        // 5. Clear user's cart
        const cart = await prisma.cart.findUnique({ where: { userId } });
        if (cart) {
            await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
        }

        res.status(201).json({
            success: true,
            message: "Order placed successfully",
            data: order
        });
    } catch (error) {
        next(error);
    }
};

export const getMyOrders = async (req, res, next) => {
    try {
        const orders = await prisma.order.findMany({
            where: { userId: req.user?.id || req.user?._id?.toString() },
            include: { items: true },
            orderBy: { createdAt: 'desc' }
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

        res.status(200).json({
            success: true,
            data: mappedOrders
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
        const shop = await prisma.shop.findUnique({ where: { ownerId: req.user?.id || req.user?._id?.toString() } });
        if (!shop) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        const orders = await prisma.order.findMany({
            where: { items: { some: { shopId: shop.id } } },
            orderBy: { createdAt: 'desc' },
            include: { 
                user: { select: { name: true, email: true } },
                items: { where: { shopId: shop.id } }
            }
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

        res.status(200).json({
            success: true,
            data: mappedOrders
        });
    } catch (error) {
        next(error);
    }
};

export const trackOrder = async (req, res, next) => {
    try {
        let { id } = req.params;
        id = id.trim().replace(/^#/, "");
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

        const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
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

        const updated = await prisma.order.update({ where: { id }, data: { status } });

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

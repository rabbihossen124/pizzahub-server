import express from 'express';
import { ObjectId } from 'mongodb';
import { ordersCollection, menuItemsCollection, usersCollection } from '../config/db.js';
import { verifyJWT, requireRole } from '../middlewares/auth.js';

const router = express.Router();

/**
 * POST /api/orders
 * Protected: Customer places a new order
 * Validations:
 * 1. Admin cannot order (only customers and vendors ordering others' food)
 * 2. Item must exist and be approved & active
 * 3. Vendor cannot order their own items
 * 4. Prevent duplicate active orders for the same item and delivery date
 */
router.post('/', verifyJWT, async (req, res) => {
  try {
    const { itemId, deliveryDate, deliveryAddress, message, quantity = 1 } = req.body;

    // Rule: Admins cannot place customer orders
    if (req.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Administrators are not permitted to place food orders.',
      });
    }

    // Input validation
    if (!itemId || !deliveryDate || !deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: itemId, deliveryDate, and deliveryAddress.',
      });
    }

    if (!ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid menu item ID format.',
      });
    }

    const parsedQty = Math.max(1, parseInt(quantity, 10) || 1);

    // Delivery date validation (must not be in the past)
    const selectedDate = new Date(deliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(selectedDate.getTime()) || selectedDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Delivery date cannot be in the past.',
      });
    }

    // Fetch the menu item
    const item = await menuItemsCollection.findOne({ _id: new ObjectId(itemId) });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    // Only approved and active items can be ordered
    if (item.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'This menu item is currently not available for ordering.',
      });
    }

    const customerId = req.user.userId;
    const customerEmail = req.user.email;
    const customerName = req.user.name || 'Valued Customer';

    // Rule: Vendors cannot order their own items
    const isOwner = item.vendorId === customerId || item.vendorEmail === customerEmail;
    if (isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You cannot place an order for your own menu item.',
      });
    }

    // Rule: Prevent duplicate active orders for the same item and delivery date
    const formattedDeliveryDate = selectedDate.toISOString().split('T')[0];

    const duplicateOrder = await ordersCollection.findOne({
      $or: [{ customerId }, { customerEmail }],
      itemId: new ObjectId(itemId),
      deliveryDate: formattedDeliveryDate,
      status: { $in: ['pending', 'accepted'] },
    });

    if (duplicateOrder) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active order for this item on the selected delivery date.',
      });
    }

    // Construct the new order document
    const newOrder = {
      itemId: new ObjectId(itemId),
      itemName: item.itemName,
      itemImage: Array.isArray(item.images) ? item.images[0] : item.images || '',
      itemPrice: item.price,
      quantity: parsedQty,
      totalPrice: Number((item.price * parsedQty).toFixed(2)),
      vendorId: item.vendorId,
      vendorEmail: item.vendorEmail,
      vendorName: item.vendorName,
      customerId,
      customerEmail,
      customerName,
      deliveryDate: formattedDeliveryDate,
      deliveryAddress: deliveryAddress.trim(),
      message: (message || '').trim(),
      status: 'pending', // Default status is always Pending
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await ordersCollection.insertOne(newOrder);

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully! Awaiting restaurant confirmation.',
      orderId: result.insertedId,
      order: { _id: result.insertedId, ...newOrder },
    });
  } catch (error) {
    console.error('[Orders Route] Order creation error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while placing your order. Please try again.',
    });
  }
});

/**
 * GET /api/orders/my-orders
 * Protected: Customer retrieves their order history
 * Supports status filtering and search
 */
router.get('/my-orders', verifyJWT, async (req, res) => {
  try {
    const customerId = req.user.userId;
    const customerEmail = req.user.email;
    const { status, search } = req.query;

    const query = {
      $or: [{ customerId }, { customerEmail }],
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$and = [
        {
          $or: [
            { itemName: { $regex: sanitized, $options: 'i' } },
            { vendorName: { $regex: sanitized, $options: 'i' } },
          ],
        },
      ];
    }

    // Summary counts & order records fetched in parallel
    const customerBaseQuery = { $or: [{ customerId }, { customerEmail }] };
    const [orders, total, pending, accepted, rejected, cancelled] = await Promise.all([
      ordersCollection.find(query).sort({ createdAt: -1 }).toArray(),
      ordersCollection.countDocuments(customerBaseQuery),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'pending' }),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'accepted' }),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'rejected' }),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'cancelled' }),
    ]);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
      summary: {
        total,
        pending,
        accepted,
        rejected,
        cancelled,
      },
    });
  } catch (error) {
    console.error('[Orders Route] Fetch my-orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve your orders.',
    });
  }
});

/**
 * GET /api/orders/customer/stats
 * Protected: Customer Dashboard Overview metrics
 * Returns: total, pending, accepted, and rejected orders
 */
router.get('/customer/stats', verifyJWT, async (req, res) => {
  try {
    const customerId = req.user.userId;
    const customerEmail = req.user.email;
    const customerBaseQuery = { $or: [{ customerId }, { customerEmail }] };

    const [total, pending, accepted, rejected, cancelled] = await Promise.all([
      ordersCollection.countDocuments(customerBaseQuery),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'pending' }),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'accepted' }),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'rejected' }),
      ordersCollection.countDocuments({ ...customerBaseQuery, status: 'cancelled' }),
    ]);

    // Calculate total spent on accepted orders
    const spentStats = await ordersCollection
      .aggregate([
        { $match: { ...customerBaseQuery, status: 'accepted' } },
        { $group: { _id: null, totalSpent: { $sum: '$totalPrice' } } },
      ])
      .toArray();

    const totalSpent = spentStats[0]?.totalSpent || 0;

    return res.status(200).json({
      success: true,
      stats: {
        total,
        pending,
        accepted,
        rejected,
        cancelled,
        totalSpent: Number(totalSpent.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('[Orders Route] Customer stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve customer statistics.',
    });
  }
});

/**
 * PATCH /api/orders/:id/cancel
 * Protected: Customer cancels a pending order
 * Rules:
 * 1. Customers cannot change or cancel another customer's order (403 Forbidden)
 * 2. Cannot cancel an order that is already accepted, rejected, or cancelled (400 Bad Request)
 */
router.patch('/:id/cancel', verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format.',
      });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // Rule: Customers cannot change or cancel another customer's order
    const isOwnerCustomer =
      order.customerId === req.user.userId || order.customerEmail === req.user.email;

    if (!isOwnerCustomer) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You cannot cancel another customer's order.",
      });
    }

    // Rule: Cannot cancel an order that is already accepted, rejected, or cancelled
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `You cannot cancel an order that is already ${order.status}. Only pending orders can be cancelled.`,
      });
    }

    await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'cancelled',
          updatedAt: new Date(),
        },
      }
    );

    const updatedOrder = await ordersCollection.findOne({ _id: new ObjectId(id) });

    return res.status(200).json({
      success: true,
      message: 'Order successfully cancelled.',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('[Orders Route] Cancel order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel order.',
    });
  }
});

/**
 * GET /api/orders/vendor
 * Protected: Fetch all incoming orders for the authenticated vendor
 * Supports status filtering and search
 */
router.get('/vendor', verifyJWT, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const vendorEmail = req.user.email;
    const { status, search } = req.query;

    const query = {
      $or: [{ vendorId }, { vendorEmail }],
    };

    // Filter by order status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search by customer name, customer email, or item name
    if (search && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$and = [
        {
          $or: [
            { customerName: { $regex: sanitized, $options: 'i' } },
            { customerEmail: { $regex: sanitized, $options: 'i' } },
            { itemName: { $regex: sanitized, $options: 'i' } },
          ],
        },
      ];
    }

    // Run order fetch & status counts in parallel
    const vendorBaseQuery = { $or: [{ vendorId }, { vendorEmail }] };
    const [orders, total, pending, accepted, rejected, cancelled] = await Promise.all([
      ordersCollection.find(query).sort({ createdAt: -1 }).toArray(),
      ordersCollection.countDocuments(vendorBaseQuery),
      ordersCollection.countDocuments({ ...vendorBaseQuery, status: 'pending' }),
      ordersCollection.countDocuments({ ...vendorBaseQuery, status: 'accepted' }),
      ordersCollection.countDocuments({ ...vendorBaseQuery, status: 'rejected' }),
      ordersCollection.countDocuments({ ...vendorBaseQuery, status: 'cancelled' }),
    ]);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
      summary: {
        total,
        pending,
        accepted,
        rejected,
        cancelled,
      },
    });
  } catch (error) {
    console.error('[Orders Route] Fetch vendor orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor orders.',
    });
  }
});

/**
 * PATCH /api/orders/:id/status
 * Protected: Vendor accepts or rejects a pending order
 * Rules:
 * 1. Only owner vendor can accept/reject
 * 2. Only pending orders can be modified, and only once
 */
router.patch('/:id/status', verifyJWT, requireRole('vendor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format.',
      });
    }

    // Only 'accepted' or 'rejected' are allowed actions for vendors
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Status must be either 'accepted' or 'rejected'.",
      });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // Rule: Vendors cannot modify orders that belong to other vendors
    const isOwnerVendor =
      order.vendorId === req.user.userId || order.vendorEmail === req.user.email;

    if (!isOwnerVendor) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot modify orders that belong to other restaurants.',
      });
    }

    // Rule: Only pending orders can be accepted or rejected, and only once
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Only pending orders can be accepted or rejected. This order has already been ${order.status}.`,
      });
    }

    await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    const updatedOrder = await ordersCollection.findOne({ _id: new ObjectId(id) });

    return res.status(200).json({
      success: true,
      message: `Order successfully ${status}.`,
      order: updatedOrder,
    });
  } catch (error) {
    console.error('[Orders Route] Update order status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status.',
    });
  }
});

/**
 * GET /api/orders/:id
 * Protected: View order details
 * Accessible by: Customer who ordered, Vendor of the item, or Admin
 */
router.get('/:id', verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format.',
      });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    const isCustomer = order.customerId === req.user.userId || order.customerEmail === req.user.email;
    const isVendor = order.vendorId === req.user.userId || order.vendorEmail === req.user.email;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isVendor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to view this order.',
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Orders Route] Fetch single order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order details.',
    });
  }
});

export default router;

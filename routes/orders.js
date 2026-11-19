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

export default router;

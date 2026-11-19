import express from 'express';
import { ObjectId } from 'mongodb';
import { menuItemsCollection, ordersCollection, usersCollection } from '../config/db.js';
import { verifyJWT, requireRole } from '../middlewares/auth.js';

const router = express.Router();

/**
 * Helper: Check vendor subscription plan and menu item limits
 * Free Tier: Max 3 active menu items
 * Premium Tier: Unlimited active menu items
 */
export async function checkVendorMenuLimit(vendorId, vendorEmail) {
  // Find vendor in users collection
  const vendor = await usersCollection.findOne({
    $or: [
      { _id: ObjectId.isValid(vendorId) ? new ObjectId(vendorId) : null },
      { email: vendorEmail },
    ],
  });

  const isPremium = vendor && vendor.subscriptionPlan === 'premium';

  // Count active / approved items (and pending items waiting for approval)
  const activeCount = await menuItemsCollection.countDocuments({
    $or: [{ vendorId }, { vendorEmail }],
    status: { $in: ['approved', 'pending'] },
  });

  const maxAllowed = isPremium ? Infinity : 3;
  const canAddMore = isPremium || activeCount < 3;
  const remainingSlots = isPremium ? 'unlimited' : Math.max(0, 3 - activeCount);

  return {
    isPremium,
    activeCount,
    maxAllowed: isPremium ? 'unlimited' : 3,
    canAddMore,
    remainingSlots,
    subscriptionPlan: isPremium ? 'premium' : 'free',
  };
}

/**
 * GET /api/vendor/limit-check
 * Protected: Checks if authenticated vendor is allowed to add more menu items
 */
router.get('/limit-check', verifyJWT, requireRole('vendor'), async (req, res) => {
  try {
    const limitInfo = await checkVendorMenuLimit(req.user.userId, req.user.email);

    res.status(200).json({
      success: true,
      ...limitInfo,
    });
  } catch (error) {
    console.error('[Vendor Route] Limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify vendor menu limit.',
    });
  }
});

/**
 * GET /api/vendor/stats
 * Protected: Overview stats for Vendor Dashboard
 * Returns: total menu items, active items, pending orders, accepted orders, current plan
 */
router.get('/stats', verifyJWT, requireRole('vendor'), async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const vendorEmail = req.user.email;

    // Filter by either vendorId or vendorEmail
    const vendorMatch = { $or: [{ vendorId }, { vendorEmail }] };

    // 1. Menu items counts
    const totalMenuItems = await menuItemsCollection.countDocuments(vendorMatch);
    const activeMenuItems = await menuItemsCollection.countDocuments({
      ...vendorMatch,
      status: 'approved',
    });
    const pendingMenuItems = await menuItemsCollection.countDocuments({
      ...vendorMatch,
      status: 'pending',
    });

    // 2. Orders counts for this vendor
    const totalOrders = await ordersCollection.countDocuments(vendorMatch);
    const pendingOrders = await ordersCollection.countDocuments({
      ...vendorMatch,
      status: 'pending',
    });
    const acceptedOrders = await ordersCollection.countDocuments({
      ...vendorMatch,
      status: 'accepted',
    });
    const rejectedOrders = await ordersCollection.countDocuments({
      ...vendorMatch,
      status: 'rejected',
    });

    // 3. Subscription & limits
    const limitInfo = await checkVendorMenuLimit(vendorId, vendorEmail);

    res.status(200).json({
      success: true,
      stats: {
        menu: {
          total: totalMenuItems,
          active: activeMenuItems,
          pending: pendingMenuItems,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          accepted: acceptedOrders,
          rejected: rejectedOrders,
        },
        subscription: {
          plan: limitInfo.subscriptionPlan,
          isPremium: limitInfo.isPremium,
          canAddMore: limitInfo.canAddMore,
          remainingSlots: limitInfo.remainingSlots,
          maxAllowed: limitInfo.maxAllowed,
        },
      },
    });
  } catch (error) {
    console.error('[Vendor Route] Fetch stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve vendor dashboard statistics.',
    });
  }
});

export default router;

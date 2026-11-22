import express from 'express';
import { ObjectId } from 'mongodb';
import { usersCollection, menuItemsCollection, ordersCollection, transactionsCollection } from '../config/db.js';
import { verifyJWT, requireRole } from '../middlewares/auth.js';

const router = express.Router();

// Apply verifyJWT and requireRole('admin') to all admin routes
router.use(verifyJWT, requireRole('admin'));

/**
 * GET /api/admin/stats
 * Overview: total registered users, total vendors, total customers,
 * total menu items, pending menu items, total transactions, total platform revenue.
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalMenuItems,
      pendingMenuItems,
      approvedMenuItems,
      totalOrders,
      totalTransactions,
    ] = await Promise.all([
      usersCollection.countDocuments(),
      usersCollection.countDocuments({ role: 'vendor' }),
      usersCollection.countDocuments({ role: 'customer' }),
      menuItemsCollection.countDocuments(),
      menuItemsCollection.countDocuments({ status: 'pending' }),
      menuItemsCollection.countDocuments({ status: 'approved' }),
      ordersCollection.countDocuments(),
      transactionsCollection.countDocuments(),
    ]);

    // Calculate total platform revenue from subscription transactions
    const revenueStats = await transactionsCollection
      .aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, totalRevenue: { $sum: '$amount' } } },
      ])
      .toArray();

    const totalRevenue = revenueStats[0]?.totalRevenue || 0;

    // Recent 5 transactions
    const recentTransactions = await transactionsCollection
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    return res.status(200).json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          vendors: totalVendors,
          customers: totalCustomers,
        },
        menu: {
          total: totalMenuItems,
          pending: pendingMenuItems,
          approved: approvedMenuItems,
        },
        orders: {
          total: totalOrders,
        },
        transactions: {
          total: totalTransactions,
          revenue: Number(totalRevenue.toFixed(2)),
          recent: recentTransactions,
        },
      },
    });
  } catch (error) {
    console.error('[Admin Route] Fetch stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve administrator statistics.',
    });
  }
});

/**
 * GET /api/admin/users
 * View all users with search (name, email) and filter (role, isBlocked)
 */
router.get('/users', async (req, res) => {
  try {
    const { search, role, isBlocked, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
      ];
    }

    if (role && role !== 'all') {
      query.role = role.toLowerCase();
    }

    if (isBlocked !== undefined && isBlocked !== 'all') {
      query.isBlocked = isBlocked === 'true';
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [totalUsers, users] = await Promise.all([
      usersCollection.countDocuments(query),
      usersCollection
        .find(query, { projection: { password: 0 } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
    ]);
    const totalPages = Math.ceil(totalUsers / limitNum) || 1;

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
      pagination: {
        totalUsers,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('[Admin Route] Fetch users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user list.',
    });
  }
});

/**
 * PATCH /api/admin/users/:id/block
 * Block and Unblock users (blocked users cannot access protected features)
 */
router.patch('/users/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format.',
      });
    }

    if (typeof isBlocked !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "'isBlocked' must be a boolean (true or false).",
      });
    }

    const targetUser = await usersCollection.findOne({ _id: new ObjectId(id) });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Security: Admin cannot block their own account
    if (targetUser.email === req.user.email) {
      return res.status(400).json({
        success: false,
        message: 'Security error: You cannot block your own administrative account.',
      });
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isBlocked,
          updatedAt: new Date(),
        },
      }
    );

    const updatedUser = await usersCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0 } }
    );

    return res.status(200).json({
      success: true,
      message: `User successfully ${isBlocked ? 'blocked' : 'unblocked'}.`,
      user: updatedUser,
    });
  } catch (error) {
    console.error('[Admin Route] Block user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user block status.',
    });
  }
});

/**
 * GET /api/admin/menu
 * View, search, and filter all submitted menu items across platform
 */
router.get('/menu', async (req, res) => {
  try {
    const { search, status, category, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { itemName: { $regex: sanitized, $options: 'i' } },
        { vendorName: { $regex: sanitized, $options: 'i' } },
        { location: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [totalItems, items] = await Promise.all([
      menuItemsCollection.countDocuments(query),
      menuItemsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
    ]);
    const totalPages = Math.ceil(totalItems / limitNum) || 1;

    return res.status(200).json({
      success: true,
      count: items.length,
      items,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('[Admin Route] Fetch menu error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve menu items for review.',
    });
  }
});

/**
 * PATCH /api/admin/menu/:id/status
 * Review pending items: approve, reject, or change status
 */
router.patch('/menu/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid menu item ID format.',
      });
    }

    const validStatuses = ['approved', 'rejected', 'pending', 'inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: [${validStatuses.join(', ')}]`,
      });
    }

    const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          reviewedAt: new Date(),
          reviewedBy: req.user.email,
          updatedAt: new Date(),
        },
      }
    );

    const updated = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    return res.status(200).json({
      success: true,
      message: `Menu item status updated to '${status}'.`,
      item: updated,
    });
  } catch (error) {
    console.error('[Admin Route] Update menu status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update menu item status.',
    });
  }
});

/**
 * DELETE /api/admin/menu/:id
 * Delete inappropriate menu items
 */
router.delete('/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid menu item ID format.',
      });
    }

    const item = await menuItemsCollection.findOne({ _id: new ObjectId(id) });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    await menuItemsCollection.deleteOne({ _id: new ObjectId(id) });

    return res.status(200).json({
      success: true,
      message: 'Inappropriate menu item deleted successfully by administrator.',
    });
  } catch (error) {
    console.error('[Admin Route] Delete menu item error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete menu item.',
    });
  }
});

/**
 * GET /api/admin/transactions
 * Read-only view of all platform transactions (Admin cannot modify payment records)
 */
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const totalTransactions = await transactionsCollection.countDocuments();
    const totalPages = Math.ceil(totalTransactions / limitNum) || 1;

    const transactions = await transactionsCollection
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    return res.status(200).json({
      success: true,
      count: transactions.length,
      transactions,
      pagination: {
        totalTransactions,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('[Admin Route] Fetch transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transactions.',
    });
  }
});

export default router;

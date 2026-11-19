import express from 'express';
import { ObjectId } from 'mongodb';
import { menuItemsCollection, usersCollection } from '../config/db.js';
import { verifyJWT, requireRole } from '../middlewares/auth.js';

const router = express.Router();

// Supported standard categories
export const MENU_CATEGORIES = [
  'Classic Pizzas',
  'Vegetarian Pizzas',
  'Meat Lovers',
  'Specialty / Gourmet Pizzas',
  'Sides & Appetizers',
  'Beverages & Desserts',
];

/**
 * GET /api/menu/categories
 * Returns official pizza categories
 */
router.get('/categories', (req, res) => {
  res.status(200).json({
    success: true,
    categories: MENU_CATEGORIES,
  });
});

/**
 * GET /api/menu/featured
 * Returns at least 6 approved and active items for the homepage
 */
router.get('/featured', async (req, res) => {
  try {
    const items = await menuItemsCollection
      .find({ status: 'approved' })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();

    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('[Menu Route] Fetch featured error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured menu items.',
    });
  }
});

/**
 * GET /api/menu
 * Public browse: Fetch all approved menu items
 */
router.get('/', async (req, res) => {
  try {
    const query = { status: 'approved' };

    // Optional category filter
    if (req.query.category && req.query.category !== 'All') {
      query.category = req.query.category;
    }

    // Optional location filter
    if (req.query.location) {
      query.location = { $regex: req.query.location, $options: 'i' };
    }

    // Optional search by name
    if (req.query.search) {
      query.itemName = { $regex: req.query.search, $options: 'i' };
    }

    // Sorting (price asc/desc or newest)
    let sortOption = { createdAt: -1 };
    if (req.query.sort === 'price_asc') {
      sortOption = { price: 1 };
    } else if (req.query.sort === 'price_desc') {
      sortOption = { price: -1 };
    }

    const items = await menuItemsCollection.find(query).sort(sortOption).toArray();

    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('[Menu Route] Fetch items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu items.',
    });
  }
});

/**
 * GET /api/menu/vendor/my-items
 * Protected: Fetch all items belonging to the authenticated vendor
 */
router.get('/vendor/my-items', verifyJWT, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const vendorEmail = req.user.email;

    // Match either by vendorId or vendorEmail for backwards/forwards compatibility
    const items = await menuItemsCollection
      .find({
        $or: [{ vendorId }, { vendorEmail }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('[Menu Route] Fetch vendor items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor menu items.',
    });
  }
});

/**
 * GET /api/menu/:id
 * Fetch single menu item by ID
 */
router.get('/:id', async (req, res) => {
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

    // If item is rejected or inactive, only owner vendor or admin can view
    if (item.status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'This menu item is not available.',
      });
    }

    res.status(200).json({
      success: true,
      item,
    });
  } catch (error) {
    console.error('[Menu Route] Fetch single item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve menu item details.',
    });
  }
});

/**
 * POST /api/menu
 * Protected: Vendor adds a new menu item (default status: pending)
 * Enforces 3-item limit for free tier vendors
 */
router.post('/', verifyJWT, requireRole('vendor'), async (req, res) => {
  try {
    const { itemName, category, description, price, location, images } = req.body;

    // Required fields validation
    if (!itemName || !category || !description || price === undefined || !location || !images) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: itemName, category, description, price, location, and images.',
      });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid positive number.',
      });
    }

    const vendorId = req.user.userId;
    const vendorEmail = req.user.email;

    // Fetch vendor profile to check subscription plan
    const vendor = await usersCollection.findOne({
      $or: [
        { _id: ObjectId.isValid(vendorId) ? new ObjectId(vendorId) : null },
        { email: vendorEmail },
      ],
    });

    const isPremium = vendor && vendor.subscriptionPlan === 'premium';

    // Free tier limitation check (Maximum 3 active/pending items)
    if (!isPremium) {
      const activeCount = await menuItemsCollection.countDocuments({
        $or: [{ vendorId }, { vendorEmail }],
        status: { $in: ['approved', 'pending'] },
      });

      if (activeCount >= 3) {
        return res.status(403).json({
          success: false,
          message: 'Free tier limit reached: You can have a maximum of 3 active menu items. Please upgrade to Premium for unlimited items.',
        });
      }
    }

    const newItem = {
      vendorId,
      vendorEmail,
      vendorName: req.user.name || vendor?.name || 'PizzaHub Vendor',
      itemName: itemName.trim(),
      category: category.trim(),
      description: description.trim(),
      price: parsedPrice,
      location: location.trim(),
      images: Array.isArray(images) ? images : [images],
      status: 'pending', // Default status is always 'pending' until Admin reviews
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await menuItemsCollection.insertOne(newItem);

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully and submitted for admin review.',
      itemId: result.insertedId,
      item: { _id: result.insertedId, ...newItem },
    });
  } catch (error) {
    console.error('[Menu Route] Create item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create menu item.',
    });
  }
});

/**
 * PUT /api/menu/:id
 * Protected: Vendor or Admin updates a menu item
 * Enforces resource ownership
 */
router.put('/:id', verifyJWT, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid menu item ID format.',
      });
    }

    const existingItem = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    // Ownership check: Only owner vendor or admin can update
    const isOwner =
      existingItem.vendorId === req.user.userId || existingItem.vendorEmail === req.user.email;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only update your own menu items.',
      });
    }

    const { itemName, category, description, price, location, images, status } = req.body;
    const updateFields = { updatedAt: new Date() };

    if (itemName) updateFields.itemName = itemName.trim();
    if (category) updateFields.category = category.trim();
    if (description) updateFields.description = description.trim();
    if (price !== undefined) {
      const parsed = parseFloat(price);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid price value.' });
      }
      updateFields.price = parsed;
    }
    if (location) updateFields.location = location.trim();
    if (images) updateFields.images = Array.isArray(images) ? images : [images];

    // Status changes: Admin can set any status. Vendor can only toggle between approved/inactive.
    if (status) {
      if (isAdmin) {
        updateFields.status = status;
      } else if (isOwner) {
        if (['approved', 'inactive'].includes(status) && existingItem.status === 'approved') {
          updateFields.status = status;
        } else if (status === 'inactive') {
          updateFields.status = 'inactive';
        }
      }
    }

    await menuItemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    const updated = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    res.status(200).json({
      success: true,
      message: 'Menu item updated successfully.',
      item: updated,
    });
  } catch (error) {
    console.error('[Menu Route] Update item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update menu item.',
    });
  }
});

/**
 * DELETE /api/menu/:id
 * Protected: Vendor or Admin deletes a menu item
 * Enforces resource ownership
 */
router.delete('/:id', verifyJWT, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid menu item ID format.',
      });
    }

    const existingItem = await menuItemsCollection.findOne({ _id: new ObjectId(id) });

    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found.',
      });
    }

    // Ownership check
    const isOwner =
      existingItem.vendorId === req.user.userId || existingItem.vendorEmail === req.user.email;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only delete your own menu items.',
      });
    }

    await menuItemsCollection.deleteOne({ _id: new ObjectId(id) });

    res.status(200).json({
      success: true,
      message: 'Menu item deleted successfully.',
    });
  } catch (error) {
    console.error('[Menu Route] Delete item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete menu item.',
    });
  }
});

export default router;

import express from 'express';
import { ObjectId } from 'mongodb';
import { menuItemsCollection, usersCollection } from '../config/db.js';
import { verifyJWT, requireRole } from '../middlewares/auth.js';
import { checkVendorMenuLimit } from './vendor.js';

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

// In-memory cache for fast metadata and featured items
let metaCache = null;
let metaCacheTime = 0;
let featuredCache = null;
let featuredCacheTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache

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
 * GET /api/menu/meta
 * Returns filter metadata (unique locations, price range min/max, available categories)
 */
router.get('/meta', async (req, res) => {
  try {
    const now = Date.now();
    if (metaCache && now - metaCacheTime < CACHE_TTL_MS) {
      return res.status(200).json(metaCache);
    }

    const approvedFilter = { status: 'approved' };

    // Run distinct locations and price aggregation in parallel
    const [locations, priceStats] = await Promise.all([
      menuItemsCollection.distinct('location', approvedFilter),
      menuItemsCollection
        .aggregate([
          { $match: approvedFilter },
          {
            $group: {
              _id: null,
              minPrice: { $min: '$price' },
              maxPrice: { $max: '$price' },
              totalApproved: { $sum: 1 },
            },
          },
        ])
        .toArray(),
    ]);

    const stats = priceStats[0] || { minPrice: 0, maxPrice: 100, totalApproved: 0 };

    const responsePayload = {
      success: true,
      categories: MENU_CATEGORIES,
      locations: locations.filter(Boolean).sort(),
      priceRange: {
        min: stats.minPrice || 0,
        max: stats.maxPrice || 100,
      },
      totalItems: stats.totalApproved || 0,
    };

    metaCache = responsePayload;
    metaCacheTime = now;

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[Menu Meta] Error fetching metadata:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve menu metadata.',
    });
  }
});

/**
 * GET /api/menu/featured
 * Returns at least 6 approved and active items for the homepage
 */
router.get('/featured', async (req, res) => {
  try {
    const now = Date.now();
    if (featuredCache && now - featuredCacheTime < CACHE_TTL_MS) {
      return res.status(200).json(featuredCache);
    }

    const items = await menuItemsCollection
      .find({ status: 'approved' })
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray();

    const responsePayload = {
      success: true,
      count: items.length,
      items,
    };

    featuredCache = responsePayload;
    featuredCacheTime = now;

    res.status(200).json(responsePayload);
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
 * Advanced Browse & Search:
 * Query parameters:
 * - search: Keyword matching name or description
 * - category: Exact category or 'All'
 * - location: Filter by area/city
 * - minPrice / maxPrice: Price range
 * - sort: 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc' | 'newest'
 * - page & limit: Pagination support
 */
router.get('/', async (req, res) => {
  try {
    const {
      search,
      category,
      location,
      minPrice,
      maxPrice,
      sort,
      page = 1,
      limit = 12,
    } = req.query;

    const query = { status: 'approved' };

    // 1. Search filter (Item name or description)
    if (search && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { itemName: { $regex: sanitized, $options: 'i' } },
        { description: { $regex: sanitized, $options: 'i' } },
        { location: { $regex: sanitized, $options: 'i' } },
      ];
    }

    // 2. Category filter
    if (category && category !== 'All' && category.trim()) {
      query.category = category.trim();
    }

    // 3. Location filter
    if (location && location !== 'All' && location.trim()) {
      const sanitizedLoc = location.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.location = { $regex: sanitizedLoc, $options: 'i' };
    }

    // 4. Price range filter
    const parsedMin = parseFloat(minPrice);
    const parsedMax = parseFloat(maxPrice);
    if (!isNaN(parsedMin) || !isNaN(parsedMax)) {
      query.price = {};
      if (!isNaN(parsedMin)) query.price.$gte = parsedMin;
      if (!isNaN(parsedMax)) query.price.$lte = parsedMax;
    }

    // 5. Sorting options (Challenge Requirement 1)
    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'price_asc':
        sortOption = { price: 1 };
        break;
      case 'price_desc':
        sortOption = { price: -1 };
        break;
      case 'name_asc':
        sortOption = { itemName: 1 };
        break;
      case 'name_desc':
        sortOption = { itemName: -1 };
        break;
      case 'newest':
      default:
        sortOption = { createdAt: -1 };
        break;
    }

    // 6. Pagination calculation
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    // Run count and query in parallel for maximum performance
    const [totalItems, items] = await Promise.all([
      menuItemsCollection.countDocuments(query),
      menuItemsCollection
        .find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
    ]);

    const totalPages = Math.ceil(totalItems / limitNum) || 1;

    res.status(200).json({
      success: true,
      items,
      count: items.length,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('[Menu Route] Advanced search error:', error);
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

    // Check vendor subscription plan and menu item limits (Free: 3 items, Premium: unlimited)
    const limitInfo = await checkVendorMenuLimit(vendorId, vendorEmail);
    if (!limitInfo.canAddMore) {
      return res.status(403).json({
        success: false,
        message: 'Free tier limit reached: You can have a maximum of 3 active menu items. Please upgrade to Premium for unlimited items.',
        limitInfo,
      });
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

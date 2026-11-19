import express from 'express';
import { generateToken, verifyJWT, requireRole } from '../middlewares/auth.js';
import { usersCollection } from '../config/db.js';

const router = express.Router();

/**
 * POST /api/auth/token
 * Issue or renew a JWT token for an authenticated user
 */
router.post('/token', async (req, res) => {
  try {
    const { email, name, role, image } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required to generate a token.',
      });
    }

    // Lookup user in DB to check existing role and block status
    let user = await usersCollection.findOne({ email });

    if (!user) {
      // First-time record if syncing from Better Auth
      const newUser = {
        name: name || '',
        email,
        image: image || '',
        role: role || 'customer', // Default role: customer
        isBlocked: false,
        subscriptionPlan: 'free',
        subscriptionExpiresAt: null,
        createdAt: new Date(),
      };
      const result = await usersCollection.insertOne(newUser);
      user = { _id: result.insertedId, ...newUser };
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked by an administrator.',
      });
    }

    // Token payload
    const payload = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      subscriptionPlan: user.subscriptionPlan || 'free',
    };

    const token = generateToken(payload);

    return res.status(200).json({
      success: true,
      message: 'Token issued successfully.',
      token,
      user: payload,
    });
  } catch (error) {
    console.error('[Auth Route] Token generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to issue token.',
    });
  }
});

/**
 * GET /api/auth/me
 * Retrieve current user profile using JWT token
 */
router.get('/me', verifyJWT, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ email: req.user.email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        isBlocked: user.isBlocked || false,
        businessName: user.businessName || '',
        subscriptionPlan: user.subscriptionPlan || 'free',
        subscriptionExpiresAt: user.subscriptionExpiresAt || null,
      },
    });
  } catch (error) {
    console.error('[Auth Route] Fetch user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile.',
    });
  }
});

/**
 * Role Verification Test Endpoints
 */
router.get('/admin-check', verifyJWT, requireRole('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authorized: You are recognized as an Administrator.',
    user: req.user,
  });
});

router.get('/vendor-check', verifyJWT, requireRole('vendor'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authorized: You are recognized as a Vendor.',
    user: req.user,
  });
});

router.get('/customer-check', verifyJWT, requireRole('customer'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authorized: You are recognized as a Customer.',
    user: req.user,
  });
});

export default router;

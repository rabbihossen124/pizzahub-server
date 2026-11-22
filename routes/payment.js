import express from 'express';
import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { usersCollection, transactionsCollection } from '../config/db.js';
import { verifyJWT, requireRole } from '../middlewares/auth.js';
import { activatePremiumSubscription } from './webhook.js';

const router = express.Router();

// Initialize Stripe with secret key
const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  console.warn('[Stripe] STRIPE_SECRET_KEY is not defined in .env');
}

const stripe = new Stripe(stripeSecret || 'dummy_stripe_key');

// Subscription plan details
export const SUBSCRIPTION_PLAN = {
  name: 'PizzaHub Premium Vendor Plan',
  description: 'Unlimited active menu items, Premium vendor badge, and featured homepage placement.',
  priceUsd: 29.0, // $29.00 USD
  priceInCents: 2900,
  currency: 'usd',
};

/**
 * POST /api/payment/create-checkout-session
 * Protected: Vendor initiates a Stripe Checkout Session for Premium subscription
 * Security:
 * - Only vendors can subscribe
 * - Prevents creating sessions for other vendors (vendor details locked to authenticated user)
 */
router.post('/create-checkout-session', verifyJWT, requireRole('vendor'), async (req, res) => {
  try {
    const vendorId = req.user.userId;
    const vendorEmail = req.user.email;
    const vendorName = req.user.name || 'Vendor';

    // Verify vendor in database
    const vendor = await usersCollection.findOne({
      $or: [
        { _id: ObjectId.isValid(vendorId) ? new ObjectId(vendorId) : null },
        { email: vendorEmail },
      ],
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor account not found in database.',
      });
    }

    const clientUrl = req.headers.origin || process.env.CLIENT_URL || 'https://pizzahub-orcin.vercel.app';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: vendorEmail,
      client_reference_id: vendorId,
      line_items: [
        {
          price_data: {
            currency: SUBSCRIPTION_PLAN.currency,
            product_data: {
              name: SUBSCRIPTION_PLAN.name,
              description: SUBSCRIPTION_PLAN.description,
              images: ['https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500'],
            },
            unit_amount: SUBSCRIPTION_PLAN.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        vendorId,
        vendorEmail,
        vendorName,
        plan: 'premium',
      },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
    });

    return res.status(200).json({
      success: true,
      message: 'Checkout session created successfully.',
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('[Stripe Route] Checkout session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment checkout session.',
      error: error.message,
    });
  }
});

/**
 * GET /api/payment/session/:sessionId
 * Protected: Retrieve Stripe session details for payment confirmation screen
 */
router.get('/session/:sessionId', verifyJWT, async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required.',
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total ? session.amount_total / 100 : SUBSCRIPTION_PLAN.priceUsd,
        currency: session.currency,
        metadata: session.metadata,
      },
    });
  } catch (error) {
    console.error('[Stripe Route] Retrieve session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve session details.',
      error: error.message,
    });
  }
});

/**
 * GET /api/payment/transactions
 * Protected: Fetch transaction records
 * - Vendors view their own transactions
 * - Admins view all transactions across platform
 */
router.get('/transactions', verifyJWT, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const query = isAdmin
      ? {}
      : {
          $or: [{ vendorId: req.user.userId }, { vendorEmail: req.user.email }],
        };

    const transactions = await transactionsCollection.find(query).sort({ createdAt: -1 }).toArray();

    return res.status(200).json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error('[Payment Route] Fetch transactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction records.',
    });
  }
});

/**
 * POST /api/payment/confirm-session
 * Protected: Verified session confirmation fallback
 * Direct server-to-Stripe verification if webhook is delayed or testing locally
 */
router.post('/confirm-session', verifyJWT, requireRole('vendor'), async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required for verification.',
      });
    }

    // Retrieve directly from Stripe API to ensure authenticity
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found in Stripe.',
      });
    }

    // Security check: Vendor can only confirm their own session
    const sessionEmail = session.metadata?.vendorEmail || session.customer_email;
    if (sessionEmail && sessionEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot verify another vendor\'s payment session.',
      });
    }

    if (session.payment_status === 'paid') {
      await activatePremiumSubscription(session);
      return res.status(200).json({
        success: true,
        message: 'Payment verified and Premium subscription successfully activated!',
        session: {
          id: session.id,
          amount: session.amount_total / 100,
          plan: 'premium',
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Payment not completed yet. Current payment status: ${session.payment_status}`,
      });
    }
  } catch (error) {
    console.error('[Payment Route] Confirm session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify payment session with Stripe.',
      error: error.message,
    });
  }
});

export default router;

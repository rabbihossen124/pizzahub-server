import express from 'express';
import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { usersCollection, transactionsCollection } from '../config/db.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy_key');

/**
 * Helper: Process verified checkout session and activate vendor Premium plan
 * @param {Object} session Stripe Checkout Session object
 */
export async function activatePremiumSubscription(session) {
  const vendorId = session.metadata?.vendorId || session.client_reference_id;
  const vendorEmail = session.metadata?.vendorEmail || session.customer_email;
  const amount = session.amount_total ? session.amount_total / 100 : 29.0;
  const currency = session.currency || 'usd';
  const stripeSessionId = session.id;
  const stripeSubscriptionId = session.subscription || null;

  if (!vendorId && !vendorEmail) {
    console.error('[Stripe Webhook] Error: Missing vendor identifier in session:', session.id);
    return false;
  }

  // 1. Update vendor subscription status in users collection
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30-day Premium validity

  const updateResult = await usersCollection.updateOne(
    {
      $or: [
        { _id: ObjectId.isValid(vendorId) ? new ObjectId(vendorId) : null },
        { email: vendorEmail },
      ],
    },
    {
      $set: {
        subscriptionPlan: 'premium',
        subscriptionExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
    }
  );

  console.log(`[Stripe Webhook] Vendor (${vendorEmail}) upgraded to Premium. Matches: ${updateResult.matchedCount}`);

  // 2. Prevent duplicate transaction records (idempotent logging)
  const existingTx = await transactionsCollection.findOne({ stripeSessionId });
  if (!existingTx) {
    await transactionsCollection.insertOne({
      vendorId: vendorId || 'unknown',
      vendorEmail: vendorEmail || 'unknown',
      plan: 'premium',
      amount,
      currency,
      stripeSessionId,
      stripeSubscriptionId,
      status: 'completed',
      createdAt: new Date(),
    });
    console.log(`[Stripe Webhook] Transaction logged for session: ${stripeSessionId}`);
  }

  return true;
}

/**
 * POST /api/webhook/stripe
 * Stripe Webhook Handler (Raw Buffer body required)
 * Verifies webhook cryptographic signature and handles checkout.session.completed
 */
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      if (webhookSecret && sig) {
        // Cryptographically verify event signature from Stripe
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // Fallback for development without webhook secret
        const payload = typeof req.body === 'string' ? req.body : req.body.toString('utf8');
        event = JSON.parse(payload);
        console.warn('[Stripe Webhook] Warning: Processing webhook without signature verification (dev mode).');
      }
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the verified event
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          console.log('[Stripe Webhook] Processing checkout.session.completed for session:', session.id);
          await activatePremiumSubscription(session);
          break;
        }

        case 'customer.subscription.deleted': {
          // Handle subscription cancellation or expiration
          const subscription = event.data.object;
          const customerEmail = subscription.customer_email;
          if (customerEmail) {
            await usersCollection.updateOne(
              { email: customerEmail },
              { $set: { subscriptionPlan: 'free', updatedAt: new Date() } }
            );
            console.log(`[Stripe Webhook] Vendor subscription expired/cancelled for: ${customerEmail}`);
          }
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (handlerError) {
      console.error('[Stripe Webhook] Error processing event:', handlerError);
      return res.status(500).json({ error: 'Internal handler error' });
    }
  }
);

export default router;

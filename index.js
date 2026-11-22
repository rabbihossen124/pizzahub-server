import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import vendorRoutes from './routes/vendor.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payment.js';
import webhookRoutes from './routes/webhook.js';
import adminRoutes from './routes/admin.js';

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly fallback
    },
    credentials: true,
  })
);

// Stripe Webhook MUST be mounted before express.json() to preserve raw Buffer body
app.use('/api/webhook/stripe', webhookRoutes);

app.use(express.json());

// Database connection middleware (Ensures MongoDB is ready for serverless requests)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('[Database Connection Error]:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed. Please ensure MongoDB Atlas IP is whitelisted (0.0.0.0/0).',
    });
  }
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Basic Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PizzaHub Server is up and running!',
    timestamp: new Date().toISOString(),
  });
});

// Start Express server and connect to MongoDB (Local development only)
async function startServer() {
  try {
    await connectDB();
    app.listen(port, () => {
      console.log(`[PizzaHub Server] Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('[PizzaHub Server] Failed to start:', error);
  }
}

// In Vercel serverless environment, Vercel manages the HTTP server lifecycle
if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;

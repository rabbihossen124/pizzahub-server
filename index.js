import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';

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

app.use(express.json());

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);

// Basic Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PizzaHub Server is up and running!',
    timestamp: new Date().toISOString(),
  });
});

// Start Express server and connect to MongoDB
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

startServer();

export { app };

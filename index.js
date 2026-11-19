import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ServerApiVersion } from 'mongodb';

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

// MongoDB Client Initialization
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('[CRITICAL] MONGODB_URI is not defined in .env file!');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

export async function connectToMongoDB() {
  try {
    if (!db) {
      await client.connect();
      const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'PizzaHub';
      db = client.db(dbName);
      console.log(`[MongoDB] Successfully connected to database: ${dbName}`);
    }
    return db;
  } catch (err) {
    console.error('[MongoDB] Connection error:', err);
    throw err;
  }
}

// Basic Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PizzaHub Server is up and running!',
    timestamp: new Date().toISOString(),
  });
});

// Start Express server and connect to DB
async function startServer() {
  try {
    await connectToMongoDB();
    app.listen(port, () => {
      console.log(`[PizzaHub Server] Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('[PizzaHub Server] Failed to start:', error);
  }
}

startServer();

export { app, client };

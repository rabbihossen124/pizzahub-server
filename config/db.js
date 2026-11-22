import { MongoClient, ServerApiVersion } from 'mongodb';
import 'dotenv/config';

let client = null;
let clientPromise = null;
let dbInstance = null;

const uri = process.env.MONGODB_URI;
if (uri) {
  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  });
}

// Collections
export let usersCollection;
export let menuItemsCollection;
export let ordersCollection;
export let transactionsCollection;
export { client };

/**
 * Connect to MongoDB and initialize collections & indexes
 */
export async function connectDB() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!clientPromise) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('[CRITICAL] MONGODB_URI is not defined in environment variables!');
    }

    if (!client) {
      client = new MongoClient(mongoUri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: false,
          deprecationErrors: true,
        },
      });
    }

    clientPromise = client
      .connect()
      .then(async (connectedClient) => {
        const dbName = process.env.MONGODB_DB || process.env.DB_NAME || 'PizzaHub';
        dbInstance = connectedClient.db(dbName);
        console.log(`[MongoDB] Connected successfully to database: ${dbName}`);

        // Initialize collections
        usersCollection = dbInstance.collection('users');
        menuItemsCollection = dbInstance.collection('menuItems');
        ordersCollection = dbInstance.collection('orders');
        transactionsCollection = dbInstance.collection('transactions');

        // Setup performance and validation indexes
        await setupDatabaseIndices();

        return dbInstance;
      })
      .catch((error) => {
        clientPromise = null; // Reset so retry can be attempted on next request
        console.error('[MongoDB] Connection failure:', error);
        throw error;
      });
  }

  await clientPromise;
  return dbInstance;
}

/**
 * Configure database indexes for high performance and fast querying
 */
async function setupDatabaseIndices() {
  try {
    // 1. Users collection indexes
    await usersCollection.createIndex({ email: 1 }, { unique: true, sparse: true });
    await usersCollection.createIndex({ role: 1 });
    await usersCollection.createIndex({ isBlocked: 1 });

    // 2. Menu Items collection indexes (Text search, sorting, filtering)
    await menuItemsCollection.createIndex(
      { itemName: 'text', description: 'text', location: 'text' },
      { name: 'menu_search_index' }
    );
    await menuItemsCollection.createIndex({ vendorId: 1 });
    await menuItemsCollection.createIndex({ status: 1 });
    await menuItemsCollection.createIndex({ category: 1 });
    await menuItemsCollection.createIndex({ price: 1 });
    await menuItemsCollection.createIndex({ createdAt: -1 });

    // 3. Orders collection indexes
    await ordersCollection.createIndex({ customerId: 1 });
    await ordersCollection.createIndex({ vendorId: 1 });
    await ordersCollection.createIndex({ itemId: 1 });
    await ordersCollection.createIndex({ status: 1 });
    await ordersCollection.createIndex({ customerId: 1, itemId: 1, deliveryDate: 1, status: 1 });
    await ordersCollection.createIndex({ createdAt: -1 });

    // 4. Transactions collection indexes
    await transactionsCollection.createIndex({ vendorId: 1 });
    await transactionsCollection.createIndex({ stripeSessionId: 1 });
    await transactionsCollection.createIndex({ createdAt: -1 });

    console.log('[MongoDB] Collections and indexes initialized successfully.');
  } catch (indexError) {
    // If index already exists with different name/options, log warning and continue
    console.warn('[MongoDB] Index setup notice:', indexError.message);
  }
}

export function getDB() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return dbInstance;
}

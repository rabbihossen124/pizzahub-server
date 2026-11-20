import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('PizzaHub');
    const itemsCollection = db.collection('menuItems');
    const usersCollection = db.collection('users');

    const demoVendorId = new ObjectId('655000000000000000000001');
    await usersCollection.updateOne(
      { _id: demoVendorId },
      {
        $set: {
          _id: demoVendorId,
          name: 'Bella Napoli Kitchen',
          email: 'bellanapoli@pizzahub.com',
          role: 'vendor',
          subscriptionPlan: 'premium',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    const demoVendor2Id = new ObjectId('655000000000000000000002');
    await usersCollection.updateOne(
      { _id: demoVendor2Id },
      {
        $set: {
          _id: demoVendor2Id,
          name: 'Artisan Woodfire Pizzeria',
          email: 'woodfire@pizzahub.com',
          role: 'vendor',
          subscriptionPlan: 'premium',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    const sampleItems = [
      {
        vendorId: demoVendorId.toString(),
        vendorEmail: 'bellanapoli@pizzahub.com',
        vendorName: 'Bella Napoli Kitchen',
        itemName: 'Classic Margherita Rustica',
        category: 'Classic Pizzas',
        description: 'San Marzano tomato sauce, fresh buffalo mozzarella, aromatic sweet basil leaves, and a drizzle of extra virgin cold-pressed olive oil baked in an authentic stone oven.',
        price: 14.99,
        location: 'Downtown Manhattan, NY',
        images: ['https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000 * 24 * 7),
        updatedAt: new Date(),
      },
      {
        vendorId: demoVendorId.toString(),
        vendorEmail: 'bellanapoli@pizzahub.com',
        vendorName: 'Bella Napoli Kitchen',
        itemName: 'Double Pepperoni Inferno',
        category: 'Meat Lovers',
        description: 'Loaded with double crispy-cupped spicy Italian beef pepperoni, aged Wisconsin mozzarella cheese, smoked provolone, and our signature slow-simmered marinara.',
        price: 18.50,
        location: 'Downtown Manhattan, NY',
        images: ['https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000 * 24 * 6),
        updatedAt: new Date(),
      },
      {
        vendorId: demoVendor2Id.toString(),
        vendorEmail: 'woodfire@pizzahub.com',
        vendorName: 'Artisan Woodfire Pizzeria',
        itemName: 'Smoked Truffle & Wild Mushroom',
        category: 'Specialty / Gourmet Pizzas',
        description: 'Roasted cremini, shiitake and oyster mushrooms infused with white truffle olive oil, creamy taleggio cheese, fresh thyme, and roasted garlic cream base.',
        price: 21.99,
        location: 'Brooklyn Heights, NY',
        images: ['https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000 * 24 * 5),
        updatedAt: new Date(),
      },
      {
        vendorId: demoVendor2Id.toString(),
        vendorEmail: 'woodfire@pizzahub.com',
        vendorName: 'Artisan Woodfire Pizzeria',
        itemName: 'Smoky BBQ Pulled Chicken',
        category: 'Meat Lovers',
        description: 'Tender hickory smoked barbecue pulled chicken, sweet caramelized red onions, sharp aged cheddar blend, fresh cilantro, and a smoky drizzle of bourbon BBQ sauce.',
        price: 19.25,
        location: 'Brooklyn Heights, NY',
        images: ['https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000 * 24 * 4),
        updatedAt: new Date(),
      },
      {
        vendorId: demoVendorId.toString(),
        vendorEmail: 'bellanapoli@pizzahub.com',
        vendorName: 'Bella Napoli Kitchen',
        itemName: 'Mediterranean Garden Feast',
        category: 'Vegetarian Pizzas',
        description: 'Baby spinach, kalamata olives, fire-roasted sweet bell peppers, marinated artichoke hearts, sundried cherry tomatoes, and crumbled Greek feta over crispy hand-tossed dough.',
        price: 16.75,
        location: 'Downtown Manhattan, NY',
        images: ['https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000 * 24 * 3),
        updatedAt: new Date(),
      },
      {
        vendorId: demoVendor2Id.toString(),
        vendorEmail: 'woodfire@pizzahub.com',
        vendorName: 'Artisan Woodfire Pizzeria',
        itemName: 'Fiery Calabrian Salami',
        category: 'Meat Lovers',
        description: 'Spicy Calabrian soppressata, crushed red hot chili flakes, roasted red peppers, creamy ricotta dollops, hot honey drizzle, and fresh melted mozzarella.',
        price: 20.50,
        location: 'Brooklyn Heights, NY',
        images: ['https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000 * 24 * 2),
        updatedAt: new Date(),
      },
      {
        vendorId: demoVendorId.toString(),
        vendorEmail: 'bellanapoli@pizzahub.com',
        vendorName: 'Bella Napoli Kitchen',
        itemName: 'Parmesan Herb Garlic Knots',
        category: 'Sides & Appetizers',
        description: 'Freshly baked golden dough knots tossed in rich garlic butter, toasted Italian herbs, grated aged Parmigiano-Reggiano, served with warm marinara dipping sauce.',
        price: 8.99,
        location: 'Downtown Manhattan, NY',
        images: ['https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(Date.now() - 3600000 * 24 * 1),
        updatedAt: new Date(),
      },
      {
        vendorId: demoVendor2Id.toString(),
        vendorEmail: 'woodfire@pizzahub.com',
        vendorName: 'Artisan Woodfire Pizzeria',
        itemName: 'Classic Espresso Tiramisu',
        category: 'Beverages & Desserts',
        description: 'Traditional layered Italian dessert featuring delicate ladyfinger biscuits soaked in rich roasted espresso, sweet mascarpone cream, and dusted with dark cocoa.',
        price: 7.50,
        location: 'Brooklyn Heights, NY',
        images: ['https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80'],
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const item of sampleItems) {
      await itemsCollection.updateOne(
        { itemName: item.itemName },
        { $set: item },
        { upsert: true }
      );
    }

    const count = await itemsCollection.countDocuments({ status: 'approved' });
    console.log(`Successfully seeded! Total approved menu items: ${count}`);
    await client.close();
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();

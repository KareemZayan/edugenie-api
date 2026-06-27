const mongoose = require('mongoose');

const mongoUri = "mongodb://edugenie2026_db_user:YueWoDCkvaBCRnAK@ac-w0t3kwv-shard-00-00.mmg0juj.mongodb.net:27017,ac-w0t3kwv-shard-00-01.mmg0juj.mongodb.net:27017,ac-w0t3kwv-shard-00-02.mmg0juj.mongodb.net:27017/edugenie_db?ssl=true&replicaSet=atlas-ppnonn-shard-0&authSource=admin&appName=Edugenie0";

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Let's find carts
  const db = mongoose.connection.db;
  const carts = await db.collection('carts').find({}).toArray();
  console.log('--- CARTS ---');
  console.log(JSON.stringify(carts, null, 2));

  // Let's find recent orders
  const orders = await db.collection('orders').find({}).sort({ createdAt: -1 }).limit(5).toArray();
  console.log('--- RECENT ORDERS ---');
  console.log(JSON.stringify(orders, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);

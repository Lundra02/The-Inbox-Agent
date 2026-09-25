import "dotenv/config";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";

// Run once with the backend stopped. Only the phone index is replaced; records remain intact.
try {
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const collection = Customer.collection;
  await Customer.createCollection();
  const indexes = await collection.indexes();
  const phoneIndex = indexes.find(index => index.key.phone === 1 && Object.keys(index.key).length === 1);
  if (phoneIndex && !phoneIndex.sparse) await collection.dropIndex(phoneIndex.name);
  await collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
  console.log("Messenger customer phone index ready");
} catch {
  console.error("Phone index migration failed. Inspect existing phone duplicates/null values and database access before starting Messenger.");
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }

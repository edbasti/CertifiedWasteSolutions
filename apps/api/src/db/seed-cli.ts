import { migrateDatabase, openDatabase } from "./client";
import { demoPassword, resetAndSeed } from "./seed";

const { client, db } = openDatabase();
await migrateDatabase(db);
await resetAndSeed(db);
await client.end();

console.log("Seeded the Supabase database in DATABASE_URL.");
console.log(
  `Demo password for jordan@cws.local, chino@cws.local, alex.rivera@cws.local, and sam.thompson@cws.local: ${demoPassword}`,
);

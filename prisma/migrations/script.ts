require('dotenv').config()
const { execSync } = require('child_process');

console.log("Running migration...");
try {
  execSync('npx prisma migrate dev --name "add_driver_wallet_and_cod"', { stdio: 'inherit' });
  console.log("Migration successful");
} catch(e) {}

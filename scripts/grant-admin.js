#!/usr/bin/env node
/**
 * scripts/grant-admin.js
 *
 * Usage:
 *   node scripts/grant-admin.js <firebase_uid|email>
 *
 * Looks up a user by firebase_uid OR email and promotes them to the 'admin' role.
 * This is the ONLY safe way to create an admin user — there is no HTTP endpoint
 * for this operation.
 *
 * Exits with code 1 on failure (missing arg, user not found, DB error).
 */

'use strict';

// Ensure we do NOT run the in-memory test DB — this script always targets the real DB.
// NODE_ENV must not be 'test'.
if (process.env.NODE_ENV === 'test') {
  console.error('ERROR: Do not run this script with NODE_ENV=test. It requires a real database.');
  process.exit(1);
}

const { query, close } = require('../db');

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error('Usage: node scripts/grant-admin.js <firebase_uid|email>');
    console.error('ERROR: No firebase_uid or email provided.');
    process.exit(1);
  }

  let result;
  try {
    // Determine whether the argument looks like an email or a firebase UID.
    const isEmail = arg.includes('@');

    if (isEmail) {
      // pg-mem and real pg both support this query form.
      // We match on the stored email column if present, or fall back to firebase_uid.
      result = await query(
        `UPDATE users
         SET role = 'admin', updated_at = CURRENT_TIMESTAMP
         WHERE email = $1
         RETURNING firebase_uid, email, name, role`,
        [arg]
      );
    } else {
      result = await query(
        `UPDATE users
         SET role = 'admin', updated_at = CURRENT_TIMESTAMP
         WHERE firebase_uid = $1
         RETURNING firebase_uid, email, name, role`,
        [arg]
      );
    }
  } catch (err) {
    console.error('ERROR: Database query failed:', err.message);
    await close();
    process.exit(1);
  }

  if (!result || result.rows.length === 0) {
    const field = arg.includes('@') ? 'email' : 'firebase_uid';
    console.error(`ERROR: No user found with ${field} = '${arg}'.`);
    await close();
    process.exit(1);
  }

  const user = result.rows[0];
  console.log('SUCCESS: User promoted to admin.');
  console.log(`  firebase_uid : ${user.firebase_uid}`);
  if (user.email) {
    console.log(`  email        : ${user.email}`);
  }
  if (user.name) {
    console.log(`  name         : ${user.name}`);
  }
  console.log(`  role         : ${user.role}`);

  await close();
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

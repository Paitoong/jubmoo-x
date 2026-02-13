const bcrypt = require('bcrypt');
const db = require('../db');

/**
 * Offline script to add a user to the database.
 * Usage: node scripts/add-user.js <username> <password> <email> <name> [avatar]
 */

async function addUser() {
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.log('Usage: node scripts/add-user.js <username> <password> <email> <name> [avatar]');
        console.log('Example: node scripts/add-user.js player1 secret123 player1@example.com "Player One" 🐼');
        process.exit(1);
    }

    const [username, password, email, name, avatar] = args;

    try {
        console.log(`Checking if user "${username}" or email "${email}" exists...`);

        const existingUser = await db.getUserByUsername(username);
        if (existingUser) {
            console.error('Error: Username already taken.');
            process.exit(1);
        }

        const existingEmail = await db.getUserByEmail(email);
        if (existingEmail) {
            console.error('Error: Email already registered.');
            process.exit(1);
        }

        console.log('Hashing password...');
        const passwordHash = await bcrypt.hash(password, 10);

        console.log('Creating user...');
        const user = await db.createUser(email, name, null, avatar || '😀', username, passwordHash);

        console.log('-----------------------------------');
        console.log('User created successfully!');
        console.log('ID:', user.id);
        console.log('Username:', user.username);
        console.log('Name:', user.name);
        console.log('Email:', user.email);
        console.log('-----------------------------------');

    } catch (error) {
        console.error('An unexpected error occurred:', error.message);
    } finally {
        // Close the database pool so the script can exit
        if (db.pool) {
            await db.pool.end();
        }
        process.exit(0);
    }
}

addUser();

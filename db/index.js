const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.DB_CONFIG);

module.exports = {
    query: (text, params) => pool.query(text, params),

    // User helpers
    createUser: async (email, name, facebookId, avatar, username, passwordHash) => {
        const query = `
            INSERT INTO users (email, name, facebook_id, avatar, username, password_hash)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const values = [email, name, facebookId, avatar, username, passwordHash];
        const res = await pool.query(query, values);
        return res.rows[0];
    },

    getUserByUsername: async (username) => {
        const query = 'SELECT * FROM users WHERE username = $1';
        const res = await pool.query(query, [username]);
        return res.rows[0];
    },

    getUserByEmail: async (email) => {
        const query = 'SELECT * FROM users WHERE email = $1';
        const res = await pool.query(query, [email]);
        return res.rows[0];
    },

    getUserByFacebookId: async (facebookId) => {
        const query = 'SELECT * FROM users WHERE facebook_id = $1';
        const res = await pool.query(query, [facebookId]);
        return res.rows[0];
    },

    updateUser: async (id, name, avatar) => {
        const query = `
            UPDATE users 
            SET name = $1, avatar = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `;
        const res = await pool.query(query, [name, avatar, id]);
        return res.rows[0];
    },
    pool: pool
};

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

    // Feature flags helpers
    getFeatureFlags: async () => {
        const query = 'SELECT flag_key, enabled FROM feature_flags';
        const res = await pool.query(query);
        const flags = {};
        for (const row of res.rows) {
            flags[row.flag_key] = row.enabled;
        }
        return flags;
    },

    getFeatureFlag: async (flagKey) => {
        const query = 'SELECT enabled FROM feature_flags WHERE flag_key = $1';
        const res = await pool.query(query, [flagKey]);
        return res.rows[0]?.enabled ?? false;
    },

    setFeatureFlag: async (flagKey, enabled) => {
        const query = `
            UPDATE feature_flags
            SET enabled = $1, updated_at = CURRENT_TIMESTAMP
            WHERE flag_key = $2
            RETURNING *
        `;
        const res = await pool.query(query, [enabled, flagKey]);
        return res.rows[0];
    },

    pool: pool
};

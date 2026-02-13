module.exports = {
    EMOTION_DELAY: 5000,
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || '',
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || '',
    DB_CONFIG: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'jubmoo',
        port: process.env.DB_PORT || 5432
    }
};

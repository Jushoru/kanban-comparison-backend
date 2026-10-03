// Never accidentally use a developer's .env/real database in the ordinary test suite.
process.env.DATABASE_URL = 'postgres://test:test@database.invalid:5432/test?sslmode=require';
process.env.NODE_ENV = 'test';
process.env.DB_POOL_MAX = '2';
process.env.CORS_ORIGINS = 'https://client.example,capacitor://localhost';
process.env.DB_SSL_CA = '';
process.env.PORT = '3000';

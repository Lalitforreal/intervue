import pg from 'pg';
import dotenv from 'dotenv';

//In ESM, all imports run before any code in the importing file. So db.ts runs before dotenv.config() in server.ts — env vars are never set when the pool initializes.
//The fix is simple — call dotenv.config() inside db.ts itself, before the pool:
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    host: process.env.HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.PGPASSWORD
});

export default pool;
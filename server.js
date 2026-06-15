import express from 'express';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';
import 'dotenv/config';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const parser = new Parser({ 
    timeout: 10000, 
    headers: { 'User-Agent': 'Mozilla/5.0' } 
});

// Configuración de conexión a PostgreSQL (Neon)
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

client.connect()
    .then(() => console.log('✅ Conectado a PostgreSQL en Neon'))
    .catch(err => console.error('❌ Error de conexión BD:', err));

async function updateNews() {
    console.log("🔄 Sincronizando noticias...");
    try {
        const rawData = fs.readFileSync(path.join(__dirname, 'feeds.json'), 'utf8');
        const { feeds } = JSON.parse(rawData);
        let allResults = [];

        for (const feed of feeds) {
            try {
                const data = await parser.parseURL(feed.url);
                const items = data.items.slice(0, 3).map(item => [feed.cat, feed.name, item.title, item.link]);
                allResults.push(...items);
            } catch (e) { console.log(`⚠️ Skip: ${feed.name}`); }
        }

        // Transacción para vaciar y rellenar
        await client.query('BEGIN');
        await client.query('DELETE FROM news');
        const query = 'INSERT INTO news (category, name, title, link) VALUES ($1, $2, $3, $4)';
        for (const row of allResults) {
            await client.query(query, row);
        }
        await client.query('COMMIT');
        console.log(`✅ ${allResults.length} artículos actualizados.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error en sincronización:", e);
    }
}

app.get('/api/news', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM news');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

app.use(express.static('.'));

app.listen(4000, () => {
    console.log('🌍 Servidor activo en puerto 4000');
    updateNews();
    setInterval(updateNews, 3600000); // Actualiza cada hora
});
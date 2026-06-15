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

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

client.connect();

async function updateNews() {
    console.log("🔄 Sincronizando...");
    try {
        const rawData = fs.readFileSync(path.join(__dirname, 'feeds.json'), 'utf8');
        const { feeds } = JSON.parse(rawData);
        let allResults = [];

        for (const feed of feeds) {
            try {
                const data = await parser.parseURL(feed.url);
                // Extraemos imagen si existe (o enclosure o media:content)
                const items = data.items.slice(0, 3).map(item => {
                    const img = item.enclosure?.url || item.image?.url || null;
                    return [feed.cat, feed.name, item.title, item.link, img];
                });
                allResults.push(...items);
            } catch (e) { console.log(`❌ Error ${feed.name}: ${e.message}`); }
        }

        await client.query('BEGIN');
        await client.query('DELETE FROM news');
        const query = 'INSERT INTO news (category, name, title, link, image_url) VALUES ($1, $2, $3, $4, $5)';
        for (const row of allResults) {
            await client.query(query, row);
        }
        await client.query('COMMIT');
        console.log(`✅ ${allResults.length} artículos actualizados con imágenes.`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error BD:", e);
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
    console.log('🌍 Servidor activo');
    updateNews();
    // 900,000ms = 15 minutos
    setInterval(updateNews, 900000); 
});
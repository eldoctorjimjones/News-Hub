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
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const customParser = new Parser({ 
    timeout: 10000,
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' 
    } 
});

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
client.connect();

async function updateNews() {
    console.log("🔄 Sincronizando noticias...");
    try {
        const rawData = fs.readFileSync(path.join(__dirname, 'feeds.json'), 'utf8');
        const { feeds } = JSON.parse(rawData);
        let allResults = [];

        for (const feed of feeds) {
            try {
                await wait(600); // Evita bloqueos por exceso de peticiones
                const data = await customParser.parseURL(feed.url);
                const items = data.items.slice(0, 3).map(item => [feed.cat, feed.name, item.title, item.link, item.enclosure?.url || item.image?.url || null]);
                allResults.push(...items);
            } catch (e) { console.log(`❌ Error ${feed.name}: ${e.message}`); }
        }

        if (allResults.length > 0) {
            await client.query('BEGIN');
            await client.query('DELETE FROM news');
            for (const row of allResults) {
                await client.query('INSERT INTO news (category, name, title, link, image_url) VALUES ($1, $2, $3, $4, $5)', row);
            }
            await client.query('COMMIT');
            console.log(`✅ ${allResults.length} artículos guardados.`);
        }
    } catch (e) { console.error("Error BD:", e); }
}

app.get('/api/news', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM news');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

app.use(express.static('.'));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🌍 Servidor activo en puerto ${PORT}`);
    updateNews();
    setInterval(updateNews, 1800000); // Cada 30 min
});
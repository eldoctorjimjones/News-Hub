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

// Configuración del parser con headers de navegador real
const customParser = new Parser({ 
    timeout: 15000, 
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, application/rss+xml, application/atom+xml'
    } 
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
                const data = await customParser.parseURL(feed.url);
                // Extraemos información de manera más segura
                const items = data.items.slice(0, 3).map(item => {
                    const img = item.enclosure?.url || 
                                item.image?.url || 
                                item.media?.content?.$.url || 
                                item['media:content']?.$?.url || null;
                    return [feed.cat, feed.name, item.title, item.link, img];
                });
                allResults.push(...items);
            } catch (e) { 
                console.log(`❌ Error ${feed.name}: ${e.message}`); 
            }
        }

        if (allResults.length === 0) {
            console.log("⚠️ No se obtuvieron artículos, manteniendo los datos actuales.");
            return;
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
        console.error("Error BD:", e.message);
    }
}

app.get('/api/news', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM news');
        res.json(result.rows);
    } catch (e) { 
        res.status(500).send(e.message); 
    }
});

app.use(express.static('.'));

app.listen(4000, () => {
    console.log('🌍 Servidor activo');
    updateNews();
    // 900,000ms = 15 minutos
    setInterval(updateNews, 900000); 
});
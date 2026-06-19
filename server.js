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

app.use(express.json());

const customParser = new Parser({ 
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' } 
});

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function connectDB() {
    try {
        await client.connect();
        console.log("✅ Conectado a Postgres");
    } catch (e) {
        console.error("❌ Error BD, reintentando...", e);
        setTimeout(connectDB, 5000);
    }
}
connectDB();

async function updateNews() {
    console.log("🔄 Iniciando ciclo de noticias...");
    
    // 1. Borrar noticias antiguas (excepto Horny Report)
    try {
        await client.query("DELETE FROM news WHERE category != 'Horny Report'");
    } catch (e) { console.error("Error limpiando:", e); return; }

    // 2. Leer fuentes
    const rawData = fs.readFileSync(path.join(__dirname, 'feeds.json'), 'utf8');
    const { feeds } = JSON.parse(rawData);

    // 3. Procesar uno por uno con pausas
    for (const feed of feeds) {
        try {
            console.log(`📡 Procesando: ${feed.name}`);
            const data = await customParser.parseURL(feed.url);
            const items = data.items.slice(0, 3);
            
            for (const item of items) {
                await client.query(
                    'INSERT INTO news (category, name, title, link, image_url) VALUES ($1, $2, $3, $4, $5)',
                    [feed.cat, feed.name, item.title, item.link, null]
                );
            }
            await wait(3000); // Pausa de 3 segundos entre webs
        } catch (e) { 
            console.log(`⚠️ Saltando ${feed.name}: ${e.message}`); 
        }
    }
    console.log("✅ Ciclo de noticias finalizado.");
}

// RUTA ADMIN
app.post('/api/news/bulk', async (req, res) => {
    const { news } = req.body;
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer MiClaveUltraSecreta123`) {
        return res.status(401).json({ message: "Acceso denegado." });
    }

    try {
        for (const item of news) {
            await client.query(
                'INSERT INTO news (category, name, title, link, image_url) VALUES ($1, $2, $3, $4, $5)',
                [item.category, item.name, item.title, item.link, null]
            );
        }
        res.status(200).json({ success: true, message: "Inyección exitosa." });
    } catch (error) {
        res.status(500).json({ message: "Error al guardar." });
    }
});

app.get('/api/news', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM news ORDER BY id DESC');
        res.json(result.rows);
    } catch (e) { res.status(500).send(e.message); }
});

app.use(express.static('.'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🌍 Servidor activo en puerto ${PORT}`);
    // Ejecutar inmediatamente al arrancar
    updateNews();
    // Ejecutar cada 2 horas (evita saturación)
    setInterval(updateNews, 7200000); 
});
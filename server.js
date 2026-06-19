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

// Habilitamos que Express pueda leer JSON en las peticiones POST
app.use(express.json()); 

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
    console.log("🔄 Sincronizando noticias RSS...");
    try {
        const rawData = fs.readFileSync(path.join(__dirname, 'feeds.json'), 'utf8');
        const { feeds } = JSON.parse(rawData);
        let allResults = [];

        for (const feed of feeds) {
            try {
                await wait(600); 
                const data = await customParser.parseURL(feed.url);
                const items = data.items.slice(0, 3).map(item => [feed.cat, feed.name, item.title, item.link, item.enclosure?.url || item.image?.url || null]);
                allResults.push(...items);
            } catch (e) { console.log(`❌ Error ${feed.name}: ${e.message}`); }
        }

        if (allResults.length > 0) {
            await client.query('BEGIN');
            
            // 🔥 Mantenemos a salvo los enlaces de Horny Report borrando solo lo demás
            await client.query("DELETE FROM news WHERE category != 'Horny Report'");
            
            for (const row of allResults) {
                await client.query('INSERT INTO news (category, name, title, link, image_url) VALUES ($1, $2, $3, $4, $5)', row);
            }
            await client.query('COMMIT');
            console.log(`✅ ${allResults.length} artículos RSS actualizados.`);
        }
    } catch (e) { console.error("Error BD:", e); }
}

// 🚀 RUTA DEL PANEL DE ADMINISTRACIÓN (Inyección masiva)
app.post('/api/news/bulk', async (req, res) => {
    const { news } = req.body;
    const authHeader = req.headers['authorization'];

    // 🔒 CAMBIA ESTO por la contraseña que tú quieras usar
    const CLAVE_SECRETA = "MiClaveUltraSecreta123"; 
    
    if (!authHeader || authHeader !== `Bearer ${CLAVE_SECRETA}`) {
        return res.status(401).json({ message: "Acceso denegado. Clave incorrecta." });
    }

    if (!news || !Array.isArray(news) || news.length === 0) {
        return res.status(400).json({ message: "No hay datos válidos para insertar." });
    }

    try {
        await client.query('BEGIN');
        
        // Guardamos uno a uno los enlaces procesados del texto plano
        for (const item of news) {
            await client.query(
                'INSERT INTO news (category, name, title, link, image_url) VALUES ($1, $2, $3, $4, $5)',
                [item.category, item.name, item.title, item.link, null]
            );
        }
        
        await client.query('COMMIT');
        console.log(`[📡 RADAR] Se han guardado ${news.length} enlaces en la base de datos.`);
        
        res.status(200).json({ success: true, message: `¡Éxito! ${news.length} enlaces guardados.` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al inyectar enlaces:", error);
        res.status(500).json({ message: "Error interno al guardar en Postgres." });
    }
});

// Obtener todas las noticias (RSS + Horny Report) para la web principal
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
    setInterval(updateNews, 1800000); 
});
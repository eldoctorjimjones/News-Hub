import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const parser = new Parser({ 
    timeout: 8000, 
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
});

// Crear tabla si no existe
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS news (category TEXT, name TEXT, title TEXT, link TEXT)");
});

// Lógica de actualización masiva
async function updateNews() {
    console.log(`🔄 Iniciando actualización...`);
    
    // Leer el archivo de fuentes
    const rawData = fs.readFileSync(path.join(__dirname, 'feeds.json'), 'utf8');
    const { feeds } = JSON.parse(rawData);
    const allResults = [];

    for (const feed of feeds) {
        try {
            const data = await parser.parseURL(feed.url);
            const items = data.items.slice(0, 3).map(item => ({
                cat: feed.cat, name: feed.name, title: item.title, link: item.link
            }));
            allResults.push(...items);
            console.log(`✅ ${feed.name} OK`);
        } catch (e) {
            console.error(`❌ Fallo en ${feed.name}: ${e.message}`);
        }
    }

    // Guardado eficiente (transacción atómica)
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM news");
        const stmt = db.prepare("INSERT INTO news (category, name, title, link) VALUES (?, ?, ?, ?)");
        allResults.forEach(i => stmt.run(i.cat, i.name, i.title, i.link));
        stmt.finalize();
        db.run("COMMIT");
    });
    console.log(`🎉 ¡Éxito! Base de datos actualizada con ${allResults.length} noticias.`);
}

app.get('/api/news', (req, res) => {
    db.all("SELECT * FROM news", (err, rows) => res.json(rows || []));
});

app.use(express.static('.'));

app.listen(4000, () => {
    console.log('🌍 Servidor activo en http://localhost:4000');
    updateNews(); // Ejecutar al arrancar
    setInterval(updateNews, 3600000); // Actualización automática cada hora
});
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const manualNews = require('./manual_news');

async function run() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        // 1. Limpiamos todo
        console.log("Limpiando base de datos...");
        await client.query("TRUNCATE TABLE news;");

        // 2. Cargamos feeds.json
        const feedsData = JSON.parse(fs.readFileSync('feeds.json', 'utf8'));

        // 3. Unimos ambas listas
        const allNews = [...manualNews, ...feedsData];

        // 4. Insertamos todo
        console.log(`Insertando ${allNews.length} noticias...`);
        for (const n of allNews) {
            await client.query(
                "INSERT INTO news (category, name, title, link) VALUES ($1, $2, $3, $4)",
                [n.category, n.name || 'Feed', n.title, n.link]
            );
        }
        console.log("¡Éxito! Base de datos actualizada.");

    } catch (err) {
        console.error("Error crítico:", err);
    } finally {
        await client.end();
    }
}

run();
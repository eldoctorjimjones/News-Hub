const { Client } = require('pg');
const manualNews = require('./manual_news'); // Importamos tus datos
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function fullUpdate() {
    await client.connect();
    
    try {
        // 1. Borramos todo
        await client.query("TRUNCATE TABLE news;");
        
        // 2. Insertamos los manuales
        for (const item of manualNews) {
            await client.query(
                "INSERT INTO news (category, name, title, link) VALUES ($1, 'Manual', $2, $3)",
                [item.category, item.title, item.link]
            );
        }
        
        // 3. AQUÍ INSERTARÍAS TUS FEEDS (La lógica que ya tengas)
        console.log("Base de datos actualizada al completo con Manuales + Feeds");
        
    } catch (e) {
        console.error("Error al actualizar", e);
    } finally {
        await client.end();
    }
}

fullUpdate();
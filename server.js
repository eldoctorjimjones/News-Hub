// Añade esto al principio de tu server.js
import { getMetadata } from 'metadata-scraper';

// ... (resto de tu código igual) ...

// RUTA MODIFICADA con extracción de imagen
app.post('/api/news/bulk', async (req, res) => {
    const { news } = req.body;
    const authHeader = req.headers['authorization'];
    const CLAVE_SECRETA = "MiClaveUltraSecreta123"; 
    
    if (!authHeader || authHeader !== `Bearer ${CLAVE_SECRETA}`) {
        return res.status(401).json({ message: "Acceso denegado." });
    }

    try {
        await client.query('BEGIN');
        
        for (const item of news) {
            let imageUrl = null;
            try {
                // 🔥 "Ojo Mágico": Extrae la imagen automáticamente
                const data = await getMetadata(item.link);
                imageUrl = data.image || null;
            } catch (e) {
                console.log("No pude sacar imagen de:", item.link);
            }

            await client.query(
                'INSERT INTO news (category, name, title, link, image_url) VALUES ($1, $2, $3, $4, $5)',
                [item.category, item.name, item.title, item.link, imageUrl]
            );
        }
        
        await client.query('COMMIT');
        res.status(200).json({ success: true, message: `Inyectados ${news.length} enlaces con sus miniaturas.` });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: "Error al inyectar." });
    }
});
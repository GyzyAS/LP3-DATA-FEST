const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

async function prepareDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL no está configurada. La API de nube no estará disponible.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS datafest_asistencias (
      id TEXT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      informacion VARCHAR(250) DEFAULT '',
      estado VARCHAR(20) NOT NULL DEFAULT 'other',
      verificado BOOLEAN NOT NULL DEFAULT FALSE,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'postgresql' }); }
  catch { res.status(503).json({ ok: false, error: 'Base de datos no conectada' }); }
});

app.get('/api/asistencias', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM datafest_asistencias ORDER BY fecha DESC');
    res.json(rows.map(row => ({ id: row.id, name: row.nombre, content: row.informacion, type: row.estado, location: 'cloud', size: row.informacion.length, date: row.fecha, favorite: row.verificado })));
  } catch (error) { next(error); }
});

app.post('/api/asistencias', async (req, res, next) => {
  try {
    const item = req.body;
    const { rows } = await pool.query(
      `INSERT INTO datafest_asistencias (id,nombre,informacion,estado,verificado,fecha) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [item.id, item.name, item.content || '', item.type || 'other', Boolean(item.favorite), item.date || new Date()]
    );
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});

app.put('/api/asistencias/:id', async (req, res, next) => {
  try {
    const item = req.body;
    const { rows } = await pool.query(
      `UPDATE datafest_asistencias SET nombre=$1, informacion=$2, estado=$3, verificado=$4, fecha=$5 WHERE id=$6 RETURNING *`,
      [item.name, item.content || '', item.type || 'other', Boolean(item.favorite), item.date || new Date(), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.delete('/api/asistencias/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM datafest_asistencias WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'No se pudo acceder a PostgreSQL' });
});

prepareDatabase()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`Data Fest activo en puerto ${port}`)))
  .catch(error => { console.error('Error preparando PostgreSQL:', error); process.exit(1); });

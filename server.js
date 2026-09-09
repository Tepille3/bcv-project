require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const consulta = require('./api/consulta');
const ratesByDate = require('./api/rates-by-date');

const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/api/consulta', (req, res) => consulta(req, res));

// Endpoint: tasas para una fecha específica (YYYY-MM-DD)
app.get('/api/rates-by-date', (req, res) => ratesByDate(req, res));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
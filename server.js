const express = require('express');
const cors = require('cors');
const path = require('path');
const consulta = require('./api/consulta');

const app = express();
app.use(cors());
app.use(express.static('public'));

app.get('/api/consulta', (req, res) => consulta(req, res));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
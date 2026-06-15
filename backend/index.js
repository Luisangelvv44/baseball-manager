require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/newgame', require('./routes/newgame'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/players', require('./routes/players'));
app.use('/api/stadium', require('./routes/stadium'));
app.use('/api/season', require('./routes/season'));
app.use('/api/games', require('./routes/games'));
app.use('/api/finances', require('./routes/finances'));
app.use('/api/scouts', require('./routes/scouts'));
app.use('/api/auctions', require('./routes/auctions'));
app.use('/api/lineup', require('./routes/lineup'));
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/playoffs', require('./routes/playoffs'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Baseball Manager API corriendo en http://localhost:${PORT}`));

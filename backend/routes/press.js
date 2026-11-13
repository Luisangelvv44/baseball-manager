const express = require('express');
const router = express.Router();
const {
  getPressOverview,
  getConference,
  answerConference,
  skipConference,
} = require('../services/pressConferenceService');

const ERROR_STATUS = { PRESS_NOT_FOUND: 404, PRESS_NOT_PENDING: 400, PRESS_INVALID_ANSWER: 400 };

function handleError(res, err, fallback) {
  const status = ERROR_STATUS[err.code];
  if (status) return res.status(status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallback });
}

// GET /api/press -> audiencia, satisfaccion por cadena, rueda pendiente e historial de la temporada
router.get('/', async (req, res) => {
  try {
    res.json(await getPressOverview());
  } catch (err) {
    handleError(res, err, 'Error al obtener la sala de prensa');
  }
});

// GET /api/press/:id -> detalle de una rueda de prensa
router.get('/:id', async (req, res) => {
  try {
    const conference = await getConference(Number(req.params.id));
    if (!conference) return res.status(404).json({ error: 'Rueda de prensa no encontrada' });
    res.json(conference);
  } catch (err) {
    handleError(res, err, 'Error al obtener la rueda de prensa');
  }
});

// POST /api/press/:id/answer { answers: [{ questionId, tone }] }
router.post('/:id/answer', async (req, res) => {
  try {
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    await answerConference(Number(req.params.id), answers);
    res.json(await getConference(Number(req.params.id)));
  } catch (err) {
    handleError(res, err, 'Error al responder la rueda de prensa');
  }
});

// POST /api/press/:id/skip -> no comparecer (resta audiencia)
router.post('/:id/skip', async (req, res) => {
  try {
    await skipConference(Number(req.params.id));
    res.json(await getConference(Number(req.params.id)));
  } catch (err) {
    handleError(res, err, 'Error al omitir la rueda de prensa');
  }
});

module.exports = router;

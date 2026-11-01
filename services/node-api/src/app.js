const express = require('express');

// The repository is injected so unit tests can use a fake and need no database.
function createApp(repo) {
  const app = express();
  app.use(express.json());

  app.get('/health', async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ok' });
    } catch (err) {
      console.error('database ping failed:', err.message);
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/items', async (req, res, next) => {
    try {
      res.json(await repo.listItems());
    } catch (err) {
      next(err);
    }
  });

  app.post('/items', async (req, res, next) => {
    const name = req.body && req.body.name;
    if (typeof name !== 'string' || name.trim() === '' || name.length > 100) {
      return res.status(400).json({ error: 'name must be a non-empty string up to 100 characters' });
    }
    try {
      res.status(201).json(await repo.addItem(name.trim()));
    } catch (err) {
      next(err);
    }
  });

  // Malformed JSON bodies and repository errors end up here.
  app.use((err, req, res, next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'internal error' : 'bad request' });
  });

  return app;
}

module.exports = { createApp };

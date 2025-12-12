import express from 'express';
import bodyParser from 'body-parser';
import { config } from 'dotenv';
import { initQueue } from './queue.js';
import { setupOAuthRoutes } from './oauth/routes.js';

config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Initialize BullMQ
const queue = await initQueue();

// OAuth endpoints
setupOAuthRoutes(app);

// Job submission endpoint
app.post('/publish/youtube', async (req, res) => {
  const { accountId, filePath, thumbnailPath, metadata, idempotencyKey } = req.body;

  try {
    const job = await queue.add('youtube-upload', {
      accountId,
      filePath,
      thumbnailPath,
      metadata,
      idempotencyKey,
      uploadedBytes: 0,
      chunkSize: parseInt(process.env.CHUNK_SIZE || '8388608'),
    }, {
      attempts: parseInt(process.env.MAX_RETRIES || '5'),
      backoff: { type: 'exponential', delay: 2000 },
    });

    res.json({ jobId: job.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get job status
app.get('/jobs/:id', async (req, res) => {
  const job = await queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const progress = await job.progress();
  res.json({
    id: job.id,
    state: await job.getState(),
    progress: progress || 0,
    data: job.data,
  });
});

app.listen(PORT, () => {
  console.log(`YouTube Publisher Worker listening on port ${PORT}`);
});

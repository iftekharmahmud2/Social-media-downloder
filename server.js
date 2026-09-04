const express = require('express');
const cors = require('cors');
const youtubedl = require('yt-dlp-exec');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch video info endpoint
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
    });

    res.json({
      title: output.title || 'video',
      thumbnail: output.thumbnail || '',
      duration: output.duration || 0,
    });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ 
      error: 'Failed to extract video data. Platform might require cookies or link is private.' 
    });
  }
});

// Direct stream download endpoint
app.get('/api/download', (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).send('URL query parameter missing');
  }

  res.header('Content-Disposition', 'attachment; filename="downloaded_video.mp4"');
  res.header('Content-Type', 'video/mp4');

  const subprocess = youtubedl.exec(videoUrl, {
    output: '-',
    format: 'best[ext=mp4]/best',
  });

  subprocess.stdout.pipe(res);

  subprocess.on('error', (err) => {
    console.error('Download stream error:', err);
    if (!res.headersSent) {
      res.status(500).send('Download failed');
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

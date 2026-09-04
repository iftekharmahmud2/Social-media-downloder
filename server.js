const express = require('express');
const cors = require('cors');
const youtubedl = require('yt-dlp-exec');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
});

// Video info endpoint with realistic browser emulation
app.post('/api/info', async (req, res) => {
  let { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      referer: 'https://www.facebook.com/',
      addHeader: [
        'Accept-Language:en-US,en;q=0.9',
        'Sec-Fetch-Mode:navigate'
      ]
    });

    res.json({
      title: output.title || output.description?.substring(0, 50) || 'Video',
      thumbnail: output.thumbnail || '',
      duration: output.duration || 0,
    });
  } catch (error) {
    console.error('Extraction error:', error.message || error);
    res.status(500).json({ 
      error: 'Failed to extract video data. Platform might require cookies or link is private.' 
    });
  }
});

// Stream download endpoint
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    referer: 'https://www.facebook.com/'
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

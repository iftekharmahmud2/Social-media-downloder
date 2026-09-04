const express = require('express');
const cors = require('cors');
const youtubedl = require('yt-dlp-exec');
const path = require('path');
const https = require('https');
const http = require('http');

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

// Helper: Fetch direct media URL without authentication
async function scrapeDirectMedia(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    }, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return resolve(scrapeDirectMedia(res.headers.location));
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // Look for unauthenticated video streaming CDN URLs in HTML
        const hdMatch = data.match(/playable_url_quality_hd["']:\s*["']([^"']+)["']/);
        const sdMatch = data.match(/playable_url["']:\s*["']([^"']+)["']/);
        const fbMatch = data.match(/"browser_native_hd_url":"([^"]+)"/) || data.match(/"browser_native_sd_url":"([^"]+)"/);

        let streamUrl = null;
        if (hdMatch) streamUrl = hdMatch[1];
        else if (sdMatch) streamUrl = sdMatch[1];
        else if (fbMatch) streamUrl = fbMatch[1];

        if (streamUrl) {
          // Decode escaped JSON slashes
          resolve(streamUrl.replace(/\\/g, ''));
        } else {
          resolve(null);
        }
      });
    });

    req.on('error', reject);
  });
}

// Info endpoint
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Attempt 1: Direct open parser (no login check)
    const directUrl = await scrapeDirectMedia(url);

    if (directUrl) {
      return res.json({
        title: 'Social Video (Ready to Download)',
        thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400',
        directStream: directUrl
      });
    }

    // Attempt 2: yt-dlp fallback with public extractor
    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      noCheckCertificates: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      ]
    });

    res.json({
      title: output.title || 'Social Video',
      thumbnail: output.thumbnail || '',
      directStream: null
    });
  } catch (error) {
    console.error('Extraction error:', error.message || error);
    res.status(500).json({
      error: 'Unable to process link. Make sure the video is public and from an open post/reel.'
    });
  }
});

// Stream download endpoint
app.get('/api/download', async (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).send('URL query parameter missing');
  }

  res.header('Content-Disposition', 'attachment; filename="video.mp4"');
  res.header('Content-Type', 'video/mp4');

  try {
    const directStream = await scrapeDirectMedia(videoUrl);

    if (directStream) {
      const client = directStream.startsWith('https') ? https : http;
      return client.get(directStream, (streamRes) => {
        streamRes.pipe(res);
      }).on('error', () => {
        if (!res.headersSent) res.status(500).send('Direct pipe failed');
      });
    }

    const subprocess = youtubedl.exec(videoUrl, {
      output: '-',
      format: 'best[ext=mp4]/best',
      noCheckCertificates: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      ]
    });

    subprocess.stdout.pipe(res);

    subprocess.on('error', () => {
      if (!res.headersSent) res.status(500).send('Stream error');
    });
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Server processing error');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

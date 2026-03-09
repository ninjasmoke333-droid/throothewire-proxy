import express from "express";
import cors from "cors";


app.get("/debug", (req, res) => {
  res.json({
    hasElevenLabsKey: !!process.env.VITE_ELEVENLABS_API_KEY,
    hasVoiceId: !!process.env.VITE_ELEVENLABS_VOICE_ID,
    keyPrefix: process.env.VITE_ELEVENLABS_API_KEY?.slice(0, 8),
  });
});

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "online", name: "THROOTHEWIRE proxy" });
});

// Brave Search proxy
app.get("/api/search", async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  if (!process.env.VITE_BRAVE_API_KEY) {
    return res.status(500).json({ error: "Brave API key not configured" });
  }

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3`,
      {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": process.env.VITE_BRAVE_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Brave Search error:", response.status, error);
      return res.status(response.status).json({ error: "Brave Search failed", details: error });
    }

    const data = await response.json();
    const results = data.web?.results?.slice(0, 3).map(r => ({
      title: r.title,
      description: r.description,
      url: r.url,
    })) || [];

    res.json({ results });

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Internal proxy error", details: err.message });
  }
});

// ElevenLabs TTS proxy
app.post("/api/tts", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  if (!process.env.VITE_ELEVENLABS_API_KEY || !process.env.VITE_ELEVENLABS_VOICE_ID) {
    return res.status(500).json({ error: "ElevenLabs credentials not configured" });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.VITE_ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.VITE_ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.85,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("ElevenLabs error:", response.status, error);
      return res.status(response.status).json({ error: "ElevenLabs TTS failed", details: error });
    }

    const audioBuffer = await response.arrayBuffer();
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(audioBuffer));

  } catch (err) {
    console.error("TTS proxy error:", err);
    res.status(500).json({ error: "Internal proxy error", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🤖 THROOTHEWIRE proxy online at http://localhost:${PORT}`);
});
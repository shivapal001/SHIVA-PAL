import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import Database from "better-sqlite3";
import axios from "axios";
import cookieParser from "cookie-parser";

const app = express();

async function startServer() {
  const PORT = 3000;
  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

  // Database Setup
  const db = new Database("jarvis_memory.db");
  // ... (existing db setup)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT,
      response TEXT,
      type TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "online", system: "JARVIS Core" });
  });

  // Spotify Auth Routes
  app.get("/api/auth/spotify/url", (req, res) => {
    const scope = "user-read-playback-state user-modify-playback-state user-read-currently-playing streaming app-remote-control";
    const redirectUri = `${APP_URL}/api/auth/spotify/callback`;
    const params = new URLSearchParams({
      client_id: process.env.SPOTIFY_CLIENT_ID || "",
      response_type: "code",
      redirect_uri: redirectUri,
      scope: scope,
      show_dialog: "true",
    });
    res.json({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
  });

  app.get("/api/auth/spotify/callback", async (req, res) => {
    const { code } = req.query;
    const redirectUri = `${APP_URL}/api/auth/spotify/callback`;

    try {
      const response = await axios.post("https://accounts.spotify.com/api/token", 
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
          client_id: process.env.SPOTIFY_CLIENT_ID || "",
          client_secret: process.env.SPOTIFY_CLIENT_SECRET || "",
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // Set secure cookies for the iframe context
      res.cookie("spotify_access_token", access_token, {
        maxAge: expires_in * 1000,
        httpOnly: true,
        secure: true,
        sameSite: "none",
      });
      res.cookie("spotify_refresh_token", refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'SPOTIFY_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Spotify connected successfully. Closing window...</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Spotify Auth Error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/spotify/status", (req, res) => {
    const token = req.cookies.spotify_access_token;
    res.json({ connected: !!token });
  });

  app.post("/api/spotify/play", async (req, res) => {
    const token = req.cookies.spotify_access_token;
    if (!token) return res.status(401).json({ error: "Not connected to Spotify" });

    const { query } = req.body;
    try {
      // 1. Search for the track/artist
      const searchRes = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,artist&limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const track = searchRes.data.tracks?.items[0];
      if (!track) return res.status(404).json({ error: "No results found" });

      // 2. Try to play it
      // Note: This requires an active device
      await axios.put("https://api.spotify.com/v1/me/player/play", 
        { uris: [track.uri] },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      res.json({ success: true, track: track.name, artist: track.artists[0].name });
    } catch (error: any) {
      console.error("Spotify Play Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to play on Spotify. Make sure you have an active Spotify device open." });
    }
  });

  app.get("/api/memory", (req, res) => {
    const memories = db.prepare("SELECT * FROM memories ORDER BY timestamp DESC").all();
    res.json(memories);
  });

  app.post("/api/memory", (req, res) => {
    const { key, value } = req.body;
    try {
      const stmt = db.prepare("INSERT OR REPLACE INTO memories (key, value) VALUES (?, ?)");
      stmt.run(key, value);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 50").all();
    res.json(logs);
  });

  app.post("/api/logs", (req, res) => {
    const { command, response, type } = req.body;
    const stmt = db.prepare("INSERT INTO logs (command, response, type) VALUES (?, ?, ?)");
    stmt.run(command, response, type);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Only listen if not running as a Vercel function
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`JARVIS Core running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import Database from "better-sqlite3";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Database Setup
  const db = new Database("jarvis_memory.db");
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

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "online", system: "JARVIS Core" });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JARVIS Core running on http://localhost:${PORT}`);
  });
}

startServer();


const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "9393";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-before-launch";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "content.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: "buckeye.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

function starterData() {
  return {
    games: [
      {
        id: "game-2024-1",
        season: "2024",
        opponent: "Notre Dame",
        date: "2025-01-20",
        result: "National Championship",
        score: "34–23",
        description: "Ohio State wins the national championship.",
        videoUrl: ""
      },
      {
        id: "game-2024-2",
        season: "2024",
        opponent: "Texas",
        date: "2025-01-10",
        result: "Win",
        score: "28–14",
        description: "College Football Playoff semifinal.",
        videoUrl: ""
      }
    ],
    highlights: [
      {
        id: "highlight-1",
        title: "Championship Highlights",
        season: "2024",
        description: "Relive the championship run.",
        videoUrl: ""
      },
      {
        id: "highlight-2",
        title: "Big Plays",
        season: "2024",
        description: "Memorable plays from the season.",
        videoUrl: ""
      }
    ]
  };
}

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(starterData(), null, 2));
  }
}

function readData() {
  ensureData();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return starterData();
  }
}

function writeData(data) {
  ensureData();
  const tempFile = DATA_FILE + ".tmp";
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Please sign in as an administrator." });
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function validVideoUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const allowed = [
      "youtube.com",
      "www.youtube.com",
      "youtu.be",
      "www.youtube-nocookie.com",
      "vimeo.com",
      "www.vimeo.com",
      "player.vimeo.com"
    ];
    if (url.protocol !== "https:" || !allowed.includes(url.hostname)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

app.get("/api/content", (req, res) => {
  const data = readData();
  res.set("Cache-Control", "no-store");
  res.json(data);
});

app.get("/api/session", (req, res) => {
  res.json({ isAdmin: Boolean(req.session && req.session.isAdmin) });
});

app.post("/api/login", (req, res) => {
  const password = cleanText(req.body.password, 200);
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Could not start session." });
    req.session.isAdmin = true;
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ error: "Could not save session." });
      res.json({ success: true });
    });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("buckeye.sid");
    res.json({ success: true });
  });
});

app.put("/api/content", requireAdmin, (req, res) => {
  const incoming = req.body;
  if (!incoming || !Array.isArray(incoming.games) || !Array.isArray(incoming.highlights)) {
    return res.status(400).json({ error: "Games and highlights must be lists." });
  }

  if (incoming.games.length > 300 || incoming.highlights.length > 500) {
    return res.status(400).json({ error: "Too many entries." });
  }

  const games = [];
  for (const item of incoming.games) {
    if (!item || typeof item !== "object") continue;
    const videoUrl = validVideoUrl(cleanText(item.videoUrl, 1000));
    if (videoUrl === null) {
      return res.status(400).json({ error: "Videos must use an HTTPS YouTube or Vimeo link." });
    }
    games.push({
      id: cleanText(item.id, 100) || require("crypto").randomUUID(),
      season: cleanText(item.season, 20),
      opponent: cleanText(item.opponent, 100),
      date: cleanText(item.date, 20),
      result: cleanText(item.result, 100),
      score: cleanText(item.score, 40),
      description: cleanText(item.description, 1000),
      videoUrl
    });
  }

  const highlights = [];
  for (const item of incoming.highlights) {
    if (!item || typeof item !== "object") continue;
    const videoUrl = validVideoUrl(cleanText(item.videoUrl, 1000));
    if (videoUrl === null) {
      return res.status(400).json({ error: "Videos must use an HTTPS YouTube or Vimeo link." });
    }
    highlights.push({
      id: cleanText(item.id, 100) || require("crypto").randomUUID(),
      title: cleanText(item.title, 150),
      season: cleanText(item.season, 20),
      description: cleanText(item.description, 1000),
      videoUrl
    });
  }

  writeData({ games, highlights });
  res.json({ success: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Buckeye Vault running on port ${PORT}`);
});

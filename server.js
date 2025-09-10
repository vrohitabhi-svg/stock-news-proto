import express from "express";
import http from "http";
import { WebSocket } from "ws";
import fetch from "node-fetch";
import { Server as IOServer } from "socket.io";
import dotenv from "dotenv";
import Sentiment from "sentiment";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();
const PORT = process.env.PORT || 3000;
const FINNHUB_KEY = process.env.FINNHUB_KEY;
const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const FCM_SERVICE_ACCOUNT = process.env.FCM_SERVICE_ACCOUNT_PATH;

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: "*" } });

app.get("/", (req, res) => res.send("Stock News Realtime Server"));

if (FCM_SERVICE_ACCOUNT && fs.existsSync(FCM_SERVICE_ACCOUNT)) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(FCM_SERVICE_ACCOUNT, "utf8")))
  });
  console.log("Firebase Admin initialized for FCM");
} else {
  console.log("FCM service account not provided or file missing. Push disabled.");
}

const sentiment = new Sentiment();

const TICKER_MAP = {
  "reliance": "RELIANCE.NS",
  "tcs": "TCS.NS",
  "hdfc": "HDFC.NS",
  "infy": "INFY.NS",
  "infosys": "INFY.NS",
  "bharat petroleum": "BPCL.NS",
  "icici": "ICICIBANK.NS",
  "sbi": "SBIN.NS"
};

function extractTickers(text) {
  text = (text || "").toLowerCase();
  const found = new Set();
  for (const name in TICKER_MAP) {
    if (text.includes(name)) found.add(TICKER_MAP[name]);
  }
  return Array.from(found);
}

function scoreAndLabel(text) {
  const s = sentiment.analyze(text || "");
  const normalized = Math.tanh(s.score / 5);
  const label = normalized > 0.35 ? "positive" : normalized < -0.35 ? "negative" : "neutral";
  return { score: normalized, label, rawScore: s.score };
}

if (!FINNHUB_KEY) {
  console.warn("FINNHUB_KEY missing. Finnhub WS disabled.");
} else {
  const fhUrl = `wss://ws.finnhub.io?token=${FINNHUB_KEY}`;
  const fhWs = new WebSocket(fhUrl);

  fhWs.on("open", () => {
    console.log("Connected to Finnhub WS");
    try {
      fhWs.send(JSON.stringify({ type: "subscribe", topic: "news" }));
    } catch (e) { console.error(e); }
  });

  fhWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      const title = msg?.data ? (Array.isArray(msg.data) ? msg.data[0].headline || JSON.stringify(msg.data[0]) : JSON.stringify(msg.data)) : JSON.stringify(msg);
      const content = title;
      const tickers = extractTickers(title);
      const sent = scoreAndLabel(title);
      const event = {
        source: "finnhub",
        title, content,
        tickers,
        sentiment: sent,
        received_at: new Date().toISOString()
      };
      io.emit("news_event", event);
      checkAlertsAndPush(event);
    } catch (e) {
      console.error("WS parse err", e);
    }
  });

  fhWs.on("error", (err) => console.error("Finnhub WS err", err));
}

async function pollNews() {
  if (!NEWSAPI_KEY) {
    console.warn("NEWSAPI_KEY missing. NewsAPI polling disabled.");
    return;
  }
  const q = encodeURIComponent("stock OR market OR shares OR company OR sebi OR nse OR bse");
  const url = `https://newsapi.org/v2/everything?q=${q}&pageSize=20&sortBy=publishedAt&language=en&apiKey=${NEWSAPI_KEY}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j.articles) {
      j.articles.forEach(a => {
        const title = a.title || a.description || "";
        const tickers = extractTickers(`${title} ${a.description || ""}`);
        const sent = scoreAndLabel(title + " " + (a.description || ""));
        const evt = {
          source: "newsapi",
          title: a.title,
          url: a.url,
          publishedAt: a.publishedAt,
          description: a.description,
          tickers,
          sentiment: sent,
          received_at: new Date().toISOString()
        };
        io.emit("news_event", evt);
        checkAlertsAndPush(evt);
      });
    }
  } catch (err) {
    console.error("NewsAPI poll err", err);
  }
}

setInterval(pollNews, 60 * 1000);
pollNews();

function checkAlertsAndPush(event) {
  const { tickers, sentiment, title } = event;
  if (!tickers || tickers.length === 0) return;
  let action = null;
  if (sentiment.label === "positive" && sentiment.score > 0.4) action = "BUY";
  if (sentiment.label === "negative" && sentiment.score < -0.4) action = "SELL";
  if (action) {
    const payload = { action, tickers, title, sentiment: sentiment.score, event };
    io.emit("trade_alert", payload);
    if (admin.apps.length > 0) {
      const message = {
        notification: { title: `${action} - ${tickers.join(", ")}`, body: title.slice(0,120) },
        topic: "stock_alerts",
        data: { payload: JSON.stringify(payload) }
      };
      admin.messaging().send(message).then(r => console.log("FCM sent:", r)).catch(e => console.error("FCM err:", e));
    }
  }
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("subscribeTopic", (t) => { socket.join(t); });
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

server.listen(PORT, () => console.log("Server on", PORT));

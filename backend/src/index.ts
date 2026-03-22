import { AuthController } from './controllers/AuthController';
import { AiService } from './services/AiService';
import prisma from './config/db'; 
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import http from 'http';
import { BinanceService } from './services/BinanceService';
import dotenv from 'dotenv';
import { TradeController } from './controllers/TradeController';
import { authenticate } from './middleware/auth';
import { WatchlistController } from './controllers/WatchlistController';

dotenv.config();
const app = express();

// ==========================================
//  WEB SOCKET & HTTP SERVER SETUP 
// ==========================================
const httpServer = http.createServer(app);
export const io = new Server(httpServer, {
    cors: { origin: "*" } // Allows your React Vite app to connect safely
});

app.use(cors());
app.use(express.json()); 

// ==========================================
//  AUTHENTICATION GATEWAY
// ==========================================
app.post('/api/auth/send-otp', AuthController.sendOtp);
app.post('/api/auth/verify-otp', AuthController.verifyOtp);

// ==========================================
//  TRADE EXECUTION ENGINE (Protected)
// ==========================================
app.post('/api/trades', authenticate, TradeController.executeTrade);
app.get('/api/portfolio', authenticate, TradeController.getPortfolio);
app.post('/api/trades/:tradeId/close', authenticate, TradeController.closeTrade);

// ==========================================
//  WATCHLIST ENGINE (Protected)
// ==========================================
app.post('/api/watchlist', authenticate, WatchlistController.add);
app.get('/api/watchlist', authenticate, WatchlistController.get);
app.delete('/api/watchlist/:id', authenticate, WatchlistController.remove); 

// ==========================================
//  BINANCE LIVE STREAM & SOCKET BROADCAST
// ==========================================
export const binance = new BinanceService();
binance.connect();

binance.on('connected', () => {
    console.log("🟢 [Main] Connection confirmed! Sending subscription...");
    binance.subscribe(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']);
});

// Listen to ticker events and broadcast to the React frontend
binance.on('ticker', (data) => {
    io.emit('crypto-update', data);
});

// Handle frontend connections
io.on('connection', (socket) => {
    console.log(`⚡ Frontend client connected: ${socket.id}`);
    
    // Send them the current prices immediately upon connecting
    const currentPrices = binance.getAllPrices();
    socket.emit('initial-state', currentPrices);

    socket.on('disconnect', () => {
        console.log(` Frontend client disconnected: ${socket.id}`);
    });
});

// ==========================================
//  HISTORICAL CANDLESTICK DATA (Protected)
// ==========================================
app.get('/api/chart/:symbol', authenticate, async (req: any, res: any): Promise<any> => {
    const symbol = req.params.symbol.toUpperCase();
    const limit = 500; // Get the last 500 minutes

    try {
        // We use Node's native fetch to hit the Binance REST API for historical history
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`);
        const data: any = await response.json();

        if (data.code && data.msg) {
             return res.status(400).json({ error: "Failed to get historical data from Binance" });
        }

        // Binance returns raw arrays [time, open, high, low, close, volume, ...]
        // We format it perfectly for the Lightweight Charts library
        const cleanCandles = data.map((d: any) => ({
            time: d[0] / 1000, // Convert milliseconds to seconds
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
        }));

        return res.json({ success: true, data: cleanCandles });

    } catch (error) {
        console.error("Historical chart error:", error);
        return res.status(500).json({ error: 'Failed to fetch candlestick history' });
    }
});


// REST Route for initial dashboard load
app.get('/api/prices', (req, res) => {
    res.json(binance.getAllPrices());
});


// ==========================================
//  THE MULTI-AGENT AI ENDPOINT
// ==========================================
const aiService = new AiService();

app.post('/api/analyze/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    
    console.log(`Checking memory for: ${symbol}`);

    // grab the exact live price from our memory cache
    const currentPrice = binance.getPrice(symbol);

    if (!currentPrice) {
        return res.status(404).json({ error: `No live data for ${symbol} yet. Please wait a second.` });
    }

    try {
        console.log(`\n Initiating AI analysis for ${symbol}...`);
        
        // Multi-Agent Debate
        const analysis = await aiService.evaluateTrade(currentPrice);

        // Save the verdict permanently to the Prisma database
        const savedLog = await prisma.aiSignalLog.create({
            data: {
                symbol: symbol,
                recommendedAction: analysis.verdict.action,
                confidence: Number(analysis.verdict.confidence),
                techAgentLog: analysis.techArgument,
                riskAgentLog: analysis.riskArgument,
                judgeDecision: JSON.stringify(analysis.verdict) 
            }
        });

        // Send the debate and the verdict back to the user
        res.json({ 
            success: true, 
            data: analysis,
            logId: savedLog.id 
        });

    } catch (error) {
        console.error("AI Analysis Failed:", error);
        res.status(500).json({ error: "Failed to generate AI analysis" });
    }
});

// ==========================================
// START THE SERVER
// ==========================================
const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(` Backend & WebSocket Server running on http://localhost:${PORT}`);
});
import WebSocket from 'ws';
import { EventEmitter } from 'events';


export interface TickerData {
    symbol: string;
    price: number;
    volume: number;
    change24h: number;
    timestamp: number;
}

export class BinanceService extends EventEmitter {
    private ws: WebSocket | null = null;
    private prices: Map<string, TickerData> = new Map();
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor() {
        super();
    }

    // ==========================================
    //  CONNECT TO BINANCE
    // ==========================================
    public connect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

        this.ws = new WebSocket('wss://stream.binance.com:9443/ws');

        this.ws.on('open', () => {
            console.log(' [Binance] WebSocket Connected.');
            this.emit('connected');
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const parsed = JSON.parse(data.toString());
                
                // Binance 24hr ticker stream format
                if (parsed.e === '24hrTicker') {
                    const symbol = parsed.s;
                    const price = parseFloat(parsed.c); // Current price
                    const volume = parseFloat(parsed.v); // 24h Volume
                    const change24h = parseFloat(parsed.P); // 24h Price Change Percentage

                    const tickerData: TickerData = { 
                        symbol, 
                        price, 
                        volume, 
                        change24h, 
                        timestamp: Date.now() 
                    };

                    //  Save the FULL data object to memory for the AI
                    this.prices.set(symbol, tickerData);

                    //  Broadcast it to index.ts and the React frontend
                    this.emit('ticker', tickerData);
                }
            } catch (error) {
                console.error('Error parsing Binance message:', error);
            }
        });

        this.ws.on('error', (error) => {
            console.error(' [Binance] WebSocket Error:', error);
        });

        this.ws.on('close', () => {
            console.log(' [Binance] WebSocket Disconnected. Auto-reconnecting in 5 seconds...');
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });
    }

    // ==========================================
    //  SUBSCRIBE TO COINS
    // ==========================================
    public subscribe(symbols: string[]) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('Cannot subscribe: WebSocket is not open.');
            return;
        }

        const streams = symbols.map(s => `${s.toLowerCase()}@ticker`);
        const payload = {
            method: 'SUBSCRIBE',
            params: streams,
            id: 1
        };

        this.ws.send(JSON.stringify(payload));
        console.log(`[Binance] Subscribed to: ${symbols.join(', ')}`);
    }

    // ==========================================
    //  MEMORY RETRIEVAL METHODS
    // ==========================================
    public getPrice(symbol: string): TickerData | undefined {
        return this.prices.get(symbol.toUpperCase());
    }

    public getAllPrices(): TickerData[] {
        return Array.from(this.prices.values());
    }
}
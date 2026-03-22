import { EventEmitter } from 'events';


// data structure for incomming stream 

export interface TickerData {
    symbol: string;
    price: number;
    volume: number;
    change24h: number;
    timestamp: number;
}

export abstract class Exchange extends EventEmitter {
    protected name: string; // can be accsesed by this class and child classes
    protected currentPrices: Map<string, TickerData> = new Map(); // to store the latest ticker data for each symbol
    constructor(name: string) {
        super();
        this.name = name;
    }

    // methods to grab the latest price data for AI agents
    public getPrice(symbol: string): TickerData | undefined {
        return this.currentPrices.get(symbol.toUpperCase());
    }

    public getAllPrices(): TickerData[] {
        return Array.from(this.currentPrices.values());
    }

    // abstract methods that any child must implement
    abstract connect(): void;
    abstract disconnect(): void;
    abstract subscribe(symbols: string[]): void;
}
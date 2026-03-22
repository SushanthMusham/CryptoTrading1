import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { createChart, type ISeriesApi, type CandlestickData } from 'lightweight-charts';
import { TrendingUp, TrendingDown, Activity, Brain, Wallet, LogOut, Zap, ShieldAlert, Gavel, X } from 'lucide-react';

interface TickerData {
  symbol: string;
  price: number;
  volume: number;
  change24h: number;
  timestamp: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  
  // --- STATE ---
  const [prices, setPrices] = useState<Record<string, TickerData>>({});
  const [selectedCoin, setSelectedCoin] = useState('BTCUSDT');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [tradeAmount, setTradeAmount] = useState('500');

  // --- REFS FOR THE CHART ---
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null); 
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null); 
  const latestCandleRef = useRef<CandlestickData | null>(null); 

  const selectedCoinRef = useRef(selectedCoin);
  useEffect(() => { selectedCoinRef.current = selectedCoin; }, [selectedCoin]);


  // ==========================================
  // 📈 PHASE 1: INITIALIZE THE CHART WINDOW
  // ==========================================
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      layout: { background: { color: '#0f172a' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { mode: 0 },
      timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: false },
    });

    candleSeriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const handleResize = () => {
      chartRef.current.applyOptions({ width: chartContainerRef.current?.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chartRef.current.remove(); 
    };
  }, []);


  // ==========================================
  // 📈 PHASE 2: FETCH HISTORY & CONNECT SOCKET
  // ==========================================
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }

    fetchPortfolio(); 

    if (candleSeriesRef.current) {
        candleSeriesRef.current.setData([]); 
        latestCandleRef.current = null; 
    }

    const fetchHistory = async () => {
        try {
            const res = await axios.get(`http://localhost:3000/api/chart/${selectedCoin}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const historicalData = res.data.data;
            if (candleSeriesRef.current && historicalData.length > 0) {
                candleSeriesRef.current.setData(historicalData);
                latestCandleRef.current = historicalData[historicalData.length - 1]; 
            }
        } catch (err) { console.error("Failed to fetch chart history", err); }
    };
    fetchHistory();

    const socket = io('http://localhost:3000');
    socket.on('initial-state', (data: TickerData[]) => {
      const priceMap: Record<string, TickerData> = {};
      data.forEach(item => priceMap[item.symbol] = item);
      setPrices(priceMap);
    });

    socket.on('crypto-update', (data: TickerData) => {
      setPrices(prev => ({ ...prev, [data.symbol]: data }));
      
      // LIVE CANDLE UPDATE MAGIC
      if (data.symbol === selectedCoinRef.current && candleSeriesRef.current && latestCandleRef.current) {
            const price = data.price;
            const currentCandle = latestCandleRef.current;
            
            const candleTimeSeconds = currentCandle.time as number;
            const nowSeconds = Math.floor(Date.now() / 1000);
            
            if (nowSeconds < candleTimeSeconds + 60) {
                // Update existing minute's candle
                latestCandleRef.current = {
                    ...currentCandle,
                    high: Math.max(currentCandle.high, price),
                    low: Math.min(currentCandle.low, price),
                    close: price 
                };
            } else {
                // Start a new minute candle
                latestCandleRef.current = {
                    time: (candleTimeSeconds + 60) as any, // 👈 FIX 1: Bypasses the strict Time type
                    open: price,
                    high: price,
                    low: price,
                    close: price
                };
            }
            candleSeriesRef.current.update(latestCandleRef.current!); 
      }
    });

    return () => { socket.disconnect(); };
  }, [navigate, selectedCoin]); 


  // --- API CALLS ---
  const fetchPortfolio = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:3000/api/portfolio', { headers: { Authorization: `Bearer ${token}` } });
      setPortfolio(res.data.portfolio.trades);
    } catch (err) { console.error("Failed to fetch portfolio", err); }
  };

  const executeTrade = async (type: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:3000/api/trades', {
        symbol: selectedCoin, tradeType: type, amount: Number(tradeAmount)
      }, { headers: { Authorization: `Bearer ${token}` } });
      fetchPortfolio(); 
    } catch (err) { console.error("Trade failed", err); }
  };

  const closeTrade = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`http://localhost:3000/api/trades/${id}/close`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchPortfolio(); 
    } catch (err) { console.error("Close failed", err); }
  };

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiVerdict(null);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`http://localhost:3000/api/analyze/${selectedCoin}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAiVerdict(res.data.data);
    } catch (err) { console.error("AI Analysis Failed", err); }
    setIsAnalyzing(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const formatPrice = (price: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
        <nav className="border-b border-slate-800 bg-slate-900/80 p-4 flex justify-between items-center backdrop-blur-sm">
            <div className="flex items-center space-x-3">
                <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
                    <Activity className="text-blue-500 w-5 h-5" />
                </div>
                <span className="font-bold text-xl tracking-widest">TRADING<span className="text-blue-500">AI</span></span>
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-white flex items-center text-sm font-medium transition-colors">
                <LogOut className="w-4 h-4 mr-2" /> Exit War Room
            </button>
        </nav>

        <div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-73px)]">
            
            {/* COLUMN 1: Live Market */}
            <div className="lg:col-span-1 bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                    <h2 className="font-bold text-slate-200 tracking-wide text-sm uppercase">Live Market</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {Object.values(prices).map(coin => {
                        const isPositive = coin.change24h >= 0;
                        return (
                            <div 
                                key={coin.symbol} 
                                onClick={() => { setSelectedCoin(coin.symbol); setAiVerdict(null); }}
                                className={`p-3 rounded-lg cursor-pointer transition-all flex justify-between items-center mb-2 ${selectedCoin === coin.symbol ? 'bg-blue-500/10 border border-blue-500/30 shadow-lg shadow-blue-500/5' : 'hover:bg-slate-800/50 border border-transparent'}`}
                            >
                                <div>
                                    <div className="font-bold text-slate-100">{coin.symbol.replace('USDT', '')}</div>
                                    <div className="text-xs text-slate-500 font-medium">USDT</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-mono text-slate-200">{formatPrice(coin.price)}</div>
                                    <div className={`text-xs flex items-center justify-end font-medium mt-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                        {Math.abs(coin.change24h).toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* COLUMN 2: Chart & AI */}
            <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden h-[340px] relative">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 z-10 relative">
                        <h2 className="font-bold text-white text-lg">{selectedCoin.replace('USDT', '')} <span className="text-slate-500 text-sm font-normal">/ USDT (1m candles)</span></h2>
                        <div className="font-mono text-2xl font-bold text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                            {prices[selectedCoin] ? formatPrice(prices[selectedCoin].price) : 'Loading...'}
                        </div>
                    </div>
                    {/* TradingView Chart Container */}
                    <div ref={chartContainerRef} className="absolute inset-0 top-[73px]" />
                </div>

                <div className="bg-slate-900 rounded-xl border border-slate-800 flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                        <h2 className="font-bold text-slate-200 tracking-wide text-sm uppercase flex items-center">
                            <Brain className="w-4 h-4 mr-2 text-purple-400"/> AI Multi-Agent Debate
                        </h2>
                        {!isAnalyzing && !aiVerdict && (
                            <button onClick={runAiAnalysis} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded text-sm font-bold transition-all flex items-center shadow-[0_0_15px_rgba(147,51,234,0.4)]">
                                <Zap className="w-4 h-4 mr-1"/> Initiate Analysis
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 p-4 overflow-y-auto">
                        {isAnalyzing ? (
                            <div className="h-full flex flex-col items-center justify-center text-purple-400">
                                <Brain className="w-16 h-16 mb-4 animate-pulse" />
                                <p className="animate-pulse font-mono text-sm">Agents evaluating live orderbook...</p>
                            </div>
                        ) : !aiVerdict ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
                                Click 'Initiate Analysis' to run Gemini 2.5 Flash.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                        <h3 className="text-blue-400 font-bold text-xs uppercase mb-2 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> Tech Agent</h3>
                                        <p className="text-sm text-slate-300 italic">"{aiVerdict.techArgument}"</p>
                                    </div>
                                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                        <h3 className="text-rose-400 font-bold text-xs uppercase mb-2 flex items-center"><ShieldAlert className="w-3 h-3 mr-1"/> Risk Agent</h3>
                                        <p className="text-sm text-slate-300 italic">"{aiVerdict.riskArgument}"</p>
                                    </div>
                                </div>
                                <div className={`p-4 rounded-lg border-2 flex items-center justify-between ${
                                    aiVerdict.verdict.action === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/50' : 
                                    aiVerdict.verdict.action === 'SELL' ? 'bg-rose-500/10 border-rose-500/50' : 
                                    'bg-slate-500/10 border-slate-500/50'
                                }`}>
                                    <div>
                                        <h3 className="font-bold text-white flex items-center"><Gavel className="w-4 h-4 mr-2"/> Judge Verdict: <span className={`ml-2 ${aiVerdict.verdict.action === 'BUY' ? 'text-emerald-400' : aiVerdict.verdict.action === 'SELL' ? 'text-rose-400' : 'text-slate-400'}`}>{aiVerdict.verdict.action}</span></h3>
                                        <p className="text-sm text-slate-300 mt-1">{aiVerdict.verdict.reasoning}</p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-slate-500 uppercase font-bold">Confidence</div>
                                        <div className="text-xl font-mono text-white">{aiVerdict.verdict.confidence}%</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* COLUMN 3: Command Center */}
            <div className="lg:col-span-1 flex flex-col gap-4">
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                    <h2 className="font-bold text-slate-200 text-sm uppercase mb-4 tracking-wide">Execute Trade</h2>
                    <div className="mb-4">
                        <label className="text-xs text-slate-400 block mb-2 font-bold uppercase">Trade Amount (USD)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500 font-bold">$</span>
                            <input type="number" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-8 pr-3 text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => executeTrade('BUY')} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors shadow-lg shadow-emerald-900/50">BUY</button>
                        <button onClick={() => executeTrade('SELL')} className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-lg transition-colors shadow-lg shadow-rose-900/50">SELL</button>
                    </div>
                </div>

                <div className="bg-slate-900 rounded-xl border border-slate-800 flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                        <h2 className="font-bold text-slate-200 text-sm uppercase tracking-wide">Open Positions</h2>
                        <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs px-2 py-1 rounded font-bold">{portfolio.length} Open</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {portfolio.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
                                <Wallet className="w-10 h-10 mb-2 opacity-20" /> No active trades
                            </div>
                        ) : (
                            portfolio.map(trade => {
                                const currentPrice = prices[trade.symbol]?.price || trade.entryPrice;
                                const pnl = trade.tradeType === 'BUY' 
                                    ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.amount
                                    : ((trade.entryPrice - currentPrice) / trade.entryPrice) * trade.amount;
                                const pnlPercent = (pnl / trade.amount) * 100;
                                const isProfit = pnl >= 0;
                                return (
                                    <div key={trade.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 mb-2 relative group hover:border-slate-600 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="font-bold text-sm flex items-center">
                                                <span className={trade.tradeType === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{trade.tradeType}</span>
                                                <span className="mx-2 text-slate-600">|</span>
                                                <span className="text-white">{trade.symbol.replace('USDT', '')}</span>
                                            </div>
                                            <button onClick={() => closeTrade(trade.id)} className="text-xs bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white px-2 py-1 rounded transition-colors opacity-0 group-hover:opacity-100 absolute right-2 top-2 flex items-center">
                                                <X className="w-3 h-3 mr-1" /> Close
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div><span className="text-slate-500 block">Entry Price</span><span className="text-slate-300 font-mono">${trade.entryPrice.toFixed(2)}</span></div>
                                            <div className="text-right"><span className="text-slate-500 block">Live PnL</span><span className={`font-mono font-bold text-sm ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>{isProfit ? '+' : ''}{pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)</span></div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
import { Request, Response } from 'express';
import prisma from '../config/db';
import { binance } from '../index';
import nodemailer from 'nodemailer';

export class TradeController {
    
    // ==========================================
    //      EXECUTE A NEW DUMMY TRADE
    // ==========================================
    public static async executeTrade(req: Request, res: Response): Promise<any> {
        // The user ID was securely attached by our middleware
        const userId = (req as any).user.userId;
        const { symbol, tradeType, amount, takeProfit, stopLoss } = req.body;

        if (!symbol || !tradeType || !amount) {
            return res.status(400).json({ error: 'Missing symbol, tradeType, or amount' });
        }

        // Instantly grab the exact live price from our WebSocket memory map
        const liveData = binance.getPrice(symbol.toUpperCase());
        
        if (!liveData) {
            return res.status(400).json({ error: `No live data available for ${symbol} right now. Waiting for stream...` });
        }

        const entryPrice = liveData.price;

        // Auto-calculate default TP/SL if the user didn't provide them (2% profit, 1% loss limit)
        const calculatedTp = takeProfit || (tradeType === 'BUY' ? entryPrice * 1.02 : entryPrice * 0.98);
        const calculatedSl = stopLoss || (tradeType === 'BUY' ? entryPrice * 0.99 : entryPrice * 1.01);

        try {
            // Lock the trade into the Prisma database
            const trade = await prisma.trade.create({
                data: {
                    userId,
                    symbol: symbol.toUpperCase(),
                    tradeType,
                    entryPrice,
                    amount,
                    takeProfit: calculatedTp,
                    stopLoss: calculatedSl,
                    status: 'OPEN'
                }
            });

            //  SEND THE MANDATORY EMAIL NOTIFICATION 
            const user = await prisma.user.findUnique({ where: { id: userId } });
            
            if (user && user.email) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS
                    }
                });

                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: `🚨 Trading AI Alert: ${tradeType} order executed for ${symbol.toUpperCase()}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0f172a; color: white; border-radius: 10px;">
                            <h2 style="color: #3b82f6;">Trading AI Execution Alert</h2>
                            <p>Your dummy order has been successfully executed on the market.</p>
                            <ul style="list-style: none; padding: 0;">
                                <li><strong>Action:</strong> <span style="color: ${tradeType === 'BUY' ? '#10b981' : '#ef4444'}; font-weight: bold;">${tradeType}</span></li>
                                <li><strong>Asset:</strong> ${symbol.toUpperCase()}</li>
                                <li><strong>Entry Price:</strong> $${entryPrice.toFixed(2)}</li>
                                <li><strong>Amount:</strong> $${amount}</li>
                            </ul>
                            <p style="color: #64748b; font-size: 12px;">This is an automated alert from your Trading AI War Room.</p>
                        </div>
                    `
                };

                // Send email asynchronously so it doesn't slow down the UI
                transporter.sendMail(mailOptions).catch(err => console.error("Failed to send trade email:", err));
            }

            console.log(`Trade Executed: ${tradeType} ${symbol} @ $${entryPrice} by User ${userId}`);

            return res.json({
                success: true,
                message: `Successfully executed ${tradeType} on ${symbol} at $${entryPrice}`,
                trade
            });

        } catch (error) {
            console.error("Trade Execution Error:", error);
            return res.status(500).json({ error: 'Failed to execute dummy trade' });
        }
    }

    // ==========================================
    //   GET PORTFOLIO & CALCULATE LIVE PNL
    // ==========================================
    public static async getPortfolio(req: Request, res: Response): Promise<any> {
        const userId = (req as any).user.userId;

        try {
            // Fetch all OPEN trades for this user from the database
            const openTrades = await prisma.trade.findMany({
                where: {
                    userId: userId,
                    status: 'OPEN'
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            let totalPnL = 0;

            // Loop through the trades and calculate live PnL against the WebSocket memory
            const enrichedTrades = openTrades.map((trade: any) => {
                const liveData = binance.getPrice(trade.symbol);
                const currentPrice = liveData ? liveData.price : trade.entryPrice; // Fallback to entry if stream lags
                let unrealizedPnL = 0;

                
                if (trade.tradeType === 'BUY') {
                    unrealizedPnL = ((currentPrice - trade.entryPrice) / trade.entryPrice) * trade.amount;
                } else if (trade.tradeType === 'SELL') {
                    unrealizedPnL = ((trade.entryPrice - currentPrice) / trade.entryPrice) * trade.amount;
                }

                totalPnL += unrealizedPnL;

                // Return the trade with the fresh math attached
                return {
                    ...trade,
                    currentPrice,
                    unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
                    profitPercentage: parseFloat(((unrealizedPnL / trade.amount) * 100).toFixed(2))
                };
            });

            return res.json({
                success: true,
                portfolio: {
                    totalActiveTrades: enrichedTrades.length,
                    totalInvested: openTrades.reduce((sum:any,t:any) => sum + t.amount, 0),
                    totalLivePnL: parseFloat(totalPnL.toFixed(2)),
                    trades: enrichedTrades
                }
            });

        } catch (error) {
            console.error("Portfolio Error:", error);
            return res.status(500).json({ error: 'Failed to fetch portfolio' });
        }
    }
    // ==========================================
    //  CLOSE AN OPEN TRADE
    // ==========================================
    public static async closeTrade(req: Request, res: Response): Promise<any> {
        const userId = (req as any).user.userId;
        const tradeId = req.params.tradeId as string;

        try {
            // Find the trade and ensure it belongs to the user
            const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
            if (!trade || trade.userId !== userId) {
                return res.status(404).json({ error: 'Trade not found' });
            }
            if (trade.status === 'CLOSED') {
                return res.status(400).json({ error: 'Trade is already closed' });
            }

            // Grab the live price to calculate final PnL
            const liveData = binance.getPrice(trade.symbol);
            const closePrice = liveData ? liveData.price : trade.entryPrice;
            let finalPnL = 0;
            
            if (trade.tradeType === 'BUY') {
                finalPnL = ((closePrice - trade.entryPrice) / trade.entryPrice) * trade.amount;
            } else {
                finalPnL = ((trade.entryPrice - closePrice) / trade.entryPrice) * trade.amount;
            }

            // Update the database
            const closedTrade = await prisma.trade.update({
                where: { id: tradeId },
                data: {
                    status: 'CLOSED',
                    pnl: parseFloat(finalPnL.toFixed(2)),
                    closedAt: new Date()
                }
            });

            return res.json({ success: true, message: `Trade closed at $${closePrice}`, trade: closedTrade });
        } catch (error) {
            console.error("Close Trade Error:", error);
            return res.status(500).json({ error: 'Failed to close trade' });
        }
    }
}
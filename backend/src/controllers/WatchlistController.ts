import { Request, Response } from 'express';
import prisma from '../config/db';

export class WatchlistController {
    
    // ==========================================
    //  ADD TO WATCHLIST
    // ==========================================
    public static async add(req: Request, res: Response): Promise<any> {
        const userId = (req as any).user.userId;
        const { symbol } = req.body;

        if (!symbol) return res.status(400).json({ error: 'Symbol is required' });

        try {
            // Check if it already exists so we don't add duplicates
            const existing = await prisma.watchlist.findFirst({
                where: { userId, symbol: symbol.toUpperCase() }
            });

            if (existing) {
                return res.status(400).json({ error: `${symbol} is already in your watchlist` });
            }

            const item = await prisma.watchlist.create({
                data: {
                    userId,
                    symbol: symbol.toUpperCase()
                }
            });

            return res.json({ success: true, message: `Added ${symbol} to watchlist`, item });
        } catch (error) {
            console.error("Watchlist Add Error:", error);
            return res.status(500).json({ error: 'Failed to add to watchlist' });
        }
    }

    // ==========================================
    //  GET WATCHLIST
    // ==========================================
    public static async get(req: Request, res: Response): Promise<any> {
        const userId = (req as any).user.userId;

        try {
            const items = await prisma.watchlist.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' }
            });

            return res.json({ success: true, watchlist: items });
        } catch (error) {
            console.error("Watchlist Get Error:", error);
            return res.status(500).json({ error: 'Failed to fetch watchlist' });
        }
    }

    // ==========================================
    //  REMOVE FROM WATCHLIST
    // ==========================================
    public static async remove(req: Request, res: Response): Promise<any> {
        const userId = (req as any).user.userId;
        const id = req.params.id as string; // Strict type assertion!

        try {
            // Verify ownership before deleting
            const item = await prisma.watchlist.findUnique({ where: { id } });
            if (!item || item.userId !== userId) {
                return res.status(404).json({ error: 'Watchlist item not found' });
            }

            await prisma.watchlist.delete({ where: { id } });
            return res.json({ success: true, message: 'Removed from watchlist' });
        } catch (error) {
            console.error("Watchlist Delete Error:", error);
            return res.status(500).json({ error: 'Failed to remove from watchlist' });
        }
    }
}
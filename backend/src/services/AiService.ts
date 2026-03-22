import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { TickerData } from '../core/Exchange';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// using geminin-flash
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); 

abstract class Agent {
    protected name: string;
    protected rolePrompt: string;

    constructor(name: string, rolePrompt: string) {
        this.name = name;
        this.rolePrompt = rolePrompt;
    }

    async analyze(data: string): Promise<string> {
        const prompt = `${this.rolePrompt}\n\nMarket Data: ${data}\n\nProvide your analysis:`;
        const result = await model.generateContent(prompt);
        return result.response.text();
    }
}

// --- SPECIFIC AGENTS ---
class TechAgent extends Agent {
    constructor() {
        super(
            "Technical Analyst", 
            "You are an aggressive crypto technical analyst. Look at the price and 24h change. Argue for WHY we should enter a trade right now to maximize profit. Be brief (2-3 sentences max)."
        );
    }
}

class RiskAgent extends Agent {
    constructor() {
        super(
            "Risk Manager", 
            "You are a highly conservative hedge fund risk manager. Look at the price and 24h change. Point out the potential downside and argue for strict capital preservation. Be brief (2-3 sentences max)."
        );
    }
}

// --- THE JUDGE ---
class JudgeAgent {
    // The Judge outputs JSON
    async renderVerdict(ticker: TickerData, techAnalysis: string, riskAnalysis: string) {
        const prompt = `
        You are the Head Algorithmic Trading Judge.
        Asset: ${ticker.symbol} | Current Price: $${ticker.price} | 24h Change: ${ticker.change24h}%

        Argument 1 (Aggressive Tech): ${techAnalysis}
        Argument 2 (Conservative Risk): ${riskAnalysis}

        Based on the current price and the arguments, render a final trading decision. 
        You MUST respond in ONLY raw JSON format matching this exact structure, nothing else:
        {
            "action": "BUY" | "SELL" | "HOLD",
            "entryPrice": ${ticker.price},
            "takeProfit": <calculate a realistic TP>,
            "stopLoss": <calculate a strict SL>,
            "confidence": <number 0 to 100>,
            "reasoning": "<1 sentence summary of why>"
        }
        `;

        const result = await model.generateContent(prompt);
        let rawText = result.response.text();
        
        // Clean the JSON string (Gemini sometimes adds markdown code blocks)
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        return JSON.parse(rawText);
    }
}

// --- MAIN AI SERVICE ---
export class AiService {
    private techAgent = new TechAgent();
    private riskAgent = new RiskAgent();
    private judgeAgent = new JudgeAgent();

    public async evaluateTrade(ticker: TickerData) {
        console.log(`\n--- Starting AI Debate for ${ticker.symbol} ---`);
        const marketDataString = `Symbol: ${ticker.symbol}, Price: $${ticker.price}, 24h Change: ${ticker.change24h}%`;

       
        const [techArgument, riskArgument] = await Promise.all([
            this.techAgent.analyze(marketDataString),
            this.riskAgent.analyze(marketDataString)
        ]);

        console.log(`Tech Agent: ${techArgument}`);
        console.log(`Risk Agent: ${riskArgument}`);

        // Judge makes the final call
        const verdict = await this.judgeAgent.renderVerdict(ticker, techArgument, riskArgument);
        console.log(`Judge Verdict:`, verdict);

        return {
            techArgument,
            riskArgument,
            verdict
        };
    }
}
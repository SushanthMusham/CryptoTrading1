import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';


// Stores: Map<Email, { otp: string, expiresAt: number }>
const otpCache = new Map<string, { otp: string; expiresAt: number }>();

// NODEMAILER SETUP
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// const transporter = nodemailer.createTransport({
//     host: 'smtp.gmail.com',
//     port: 587,
//     secure: false, // false for 587, true for 465
//     requireTLS: true,
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS
//     }
// });

export class AuthController {
    
    // SEND OTP ROUTE
    public static async sendOtp(req: Request, res: Response): Promise<any> {
        
        console.log(`\n🛎️ OTP Request received for:`, req.body.email);
        console.log(`🔐 Email User loaded:`, process.env.EMAIL_USER ? "YES" : "NO");
        
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });

        // Generate a random 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save to memory for 5 minutes (300,000 ms)
        otpCache.set(email, { otp, expiresAt: Date.now() + 300000 });

        try {
            await transporter.sendMail({
                from: `"Trading Platform AI" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: "Your Trading Platform Login Code",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
                        <h2>Authentication Required</h2>
                        <p>Your 6-digit access code is:</p>
                        <h1 style="color: #4A90E2; font-size: 40px; letter-spacing: 5px;">${otp}</h1>
                        <p>This code expires in 5 minutes.</p>
                    </div>
                `
            });
            
            console.log(`OTP sent successfully to ${email}`);
            return res.json({ success: true, message: "OTP sent to email" });
        } catch (error) {
            console.error("Email Error:", error);
            return res.status(500).json({ error: "Failed to send OTP email" });
        }
    }

    // VERIFY OTP & LOGIN ROUTE
    public static async verifyOtp(req: Request, res: Response): Promise<any> {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

        const cached = otpCache.get(email);

        // Check if OTP exists and matches
        if (!cached || cached.otp !== otp) {
            return res.status(401).json({ error: "Invalid OTP" });
        }

        // Check if OTP is expired
        if (Date.now() > cached.expiresAt) {
            otpCache.delete(email);
            return res.status(401).json({ error: "OTP expired" });
        }

        try {
            // OTP is valid ,Deleting it so it can't be reused
            otpCache.delete(email);

            // Find the user in Prisma, or CREATE them if they are new
            let user = await prisma.user.findUnique({ where: { email } });
            
            if (!user) {
                user = await prisma.user.create({
                    data: { 
                        email,
                        riskProfile: "Moderate" // Default risk profile
                    }
                });
                console.log(` New user registered: ${email}`);
            }

            // Generate the secure JWT token
            const token = jwt.sign(
                { userId: user.id, email: user.email }, 
                process.env.JWT_SECRET || 'secret', 
                { expiresIn: '7d' } // Keep them logged in for 7 days
            );

            return res.json({ 
                success: true, 
                token, 
                user 
            });

        } catch (error) {
            console.error("Verification Error:", error);
            return res.status(500).json({ error: "Internal server error during login" });
        }
    }
}
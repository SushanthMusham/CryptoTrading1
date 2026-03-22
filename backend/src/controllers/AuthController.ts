import { Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import prisma from "../config/db";

// In-memory OTP store
const otpCache = new Map<string, { otp: string; expiresAt: number }>();

export class AuthController {
  // ================= SEND OTP =================
  public static async sendOtp(req: Request, res: Response): Promise<Response> {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    console.log("🛎️ OTP Request received for:", email);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP (valid for 5 mins)
    otpCache.set(email, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: "onboarding@resend.dev",
          to: email,
          subject: "Your Trading Platform Login Code",
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
              <h2>Authentication Required</h2>
              <p>Your 6-digit access code is:</p>
              <h1 style="color: #4A90E2; font-size: 40px; letter-spacing: 5px;">
                ${otp}
              </h1>
              <p>This code expires in 5 minutes.</p>
            </div>
          `,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ OTP sent successfully to ${email}`);

      return res.json({
        success: true,
        message: "OTP sent to email",
      });
    } catch (error) {
      console.error("❌ Email Error:", error);

      return res.status(500).json({
        error: "Failed to send OTP email",
      });
    }
  }

  // ================= VERIFY OTP =================
  public static async verifyOtp(req: Request, res: Response): Promise<Response> {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res
        .status(400)
        .json({ error: "Email and OTP are required" });
    }

    const cached = otpCache.get(email);

    // Validate OTP existence
    if (!cached || cached.otp !== otp) {
      return res.status(401).json({ error: "Invalid OTP" });
    }

    // Check expiry
    if (Date.now() > cached.expiresAt) {
      otpCache.delete(email);
      return res.status(401).json({ error: "OTP expired" });
    }

    try {
      // Prevent reuse
      otpCache.delete(email);

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            riskProfile: "Moderate",
          },
        });

        console.log(`🆕 New user registered: ${email}`);
      }

      // Generate JWT
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
        },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token,
        user,
      });
    } catch (error) {
      console.error("❌ Verification Error:", error);

      return res.status(500).json({
        error: "Internal server error during login",
      });
    }
  }
}
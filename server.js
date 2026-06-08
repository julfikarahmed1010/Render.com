const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jwt-simple');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// কনফিগুরেশন (এনভায়রনমেন্ট ভ্যারিয়েবল না থাকলে ডিফল্টটি কাজ করবে)
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mytgapp';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_this_in_production';
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN'; // @BotFather থেকে পাওয়া টোকেন

// ১. ডাটাবেজ কানেকশন সেটআপ
mongoose.connect(MONGO_URI)
    .then(() => console.log('Database connected successfully via MongoDB'))
    .catch(err => console.error('Database connection error:', err));

// ২. ডাটাবেজ মডেল/স্কিমা (User Schema)
const userSchema = new mongoose.Schema({
    tgId: { type: String, required: true, unique: true },
    username: String,
    coins: { type: Number, default: 1000 },
    tickets: { type: Number, default: 50 },
    gold: { type: Number, default: 50000 },
    adsWatched: { type: Number, default: 0 },
    lastDailyClaim: { type: Date, default: null }
});

const User = mongoose.model('User', userSchema);

// ৩. উইথড্র বা পেমেন্ট হিস্ট্রি স্কিমা (Withdrawal Schema)
const withdrawSchema = new mongoose.Schema({
    tgId: String,
    walletAddress: String,
    amountGold: Number,
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

const Withdraw = mongoose.model('Withdraw', withdrawSchema);

// ৪. এপিআই রাউটস (API Routes)

// ইউজারের ডাটা লোড বা নতুন ইউজার তৈরি করার এপিআই
app.post('/api/user/sync', async (req, res) => {
    const { tgId, username } = req.body;
    try {
        let user = await User.findOne({ tgId });
        if (!user) {
            user = new User({ tgId, username });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ব্যালেন্স আপডেট করার এapi (গেম খেলা, স্পিন বা অ্যাড দেখার পর)
app.post('/api/user/update-balance', async (req, res) => {
    const { tgId, coins, tickets, gold, adsWatched } = req.body;
    try {
        const user = await User.findOne({ tgId });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (coins !== undefined) user.coins += coins;
        if (tickets !== undefined) user.tickets += tickets;
        if (gold !== undefined) user.gold += gold;
        if (adsWatched !== undefined) user.adsWatched += adsWatched;

        await user.save();
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// উইথড্র বা টাকা তোলার রিকোয়েস্ট এপিআই
app.post('/api/withdraw/request', async (req, res) => {
    const { tgId, walletAddress, goldAmt } = req.body;
    const ticketCost = goldAmt / 1000;

    try {
        const user = await User.findOne({ tgId });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.gold < goldAmt || user.tickets < ticketCost) {
            return res.status(400).json({ success: false, message: 'Insufficient Balance Matrix' });
        }

        // ব্যালেন্স কেটে নেওয়া
        user.gold -= goldAmt;
        user.tickets -= ticketCost;
        await user.save();

        // রিকোয়েস্ট ডাটাবেজে সেভ করা
        const newWithdraw = new Withdraw({ tgId, walletAddress, amountGold: goldAmt });
        await newWithdraw.save();

        res.json({ success: true, message: 'Withdrawal locked into queue', user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// এডমিনদের জন্য সমস্ত উইথড্র রিকোয়েস্ট দেখার এপিআই
app.get('/api/admin/withdrawals', async (req, res) => {
    try {
        const list = await Withdraw.find().sort({ createdAt: -1 });
        res.json(list);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// সার্ভার চালু করা
app.listen(PORT, () => {
    console.log(`Server is successfully running on port ${PORT}`);
});

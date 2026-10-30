const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const callRoutes = require('./src/routes/callRoutes');
const friendRoutes = require('./src/routes/friendRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const userRoutes = require('./src/routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
app.disable('x-powered-by');
const allowedOrigins = new Set([
  process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || 'https://discord-lite-mocha.vercel.app',
  'http://tauri.localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
}));
app.use(express.json({ limit: '1mb' }));
if (process.env.VERCEL) app.set('trust proxy', 1);

// Security headers (بدون إضافة أي اعتماديات خارجية)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Root route (for Vercel & checking status)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Discord Lite API is running 🚀' });
});

// 2. Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Dis-lite backend is running perfectly 🚀' });
});

// 3. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

// 4. Global 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// 5. Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// 6. Start Server (Only if run directly, not when imported by Vercel serverless)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 Dis-lite Server is running on port ${PORT}`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}

module.exports = app;

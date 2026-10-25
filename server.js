const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const friendRoutes = require('./src/routes/friendRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const userRoutes = require('./src/routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Middlewares
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  // Handle preflight OPTIONS request instantly
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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

// 6. Start Server (Only if not running as a Vercel Serverless Function)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 Dis-lite Server is running on port ${PORT}`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}

module.exports = app;

const jwt = require('jsonwebtoken');

const MIN_SECRET_BYTES = 32;

// نقرأ السر وقت الطلب بدل وقت تحميل الموديول، حتى لا يسقط السيرفر بالكامل
// (خصوصاً على Vercel) إذا كان المتغير غير مضبوط في البيئة.
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    return null;
  }
  return secret;
};

const authMiddleware = (req, res, next) => {
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    console.error('JWT_SECRET is missing or shorter than 32 bytes. Set it in the backend environment.');
    return res.status(500).json({ error: 'Server authentication is not configured.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = { authMiddleware, getJwtSecret };

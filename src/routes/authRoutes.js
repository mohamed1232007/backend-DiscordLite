const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { authRateLimit } = require('../middlewares/authRateLimit');

// المسارات الأساسية
router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);
router.get('/me', authMiddleware, getMe);

module.exports = router;

const express = require('express');
const router = express.Router();
const { updateStatus } = require('../controllers/userController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.post('/status', updateStatus);

module.exports = router;


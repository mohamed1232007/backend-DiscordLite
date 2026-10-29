const express = require('express');
const router = express.Router();
const {
  getUnreadDirectMessages,
  getDirectMessages,
  sendDirectMessage,
} = require('../controllers/messageController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.get('/inbox/unread', getUnreadDirectMessages);
router.get('/direct/:friendId', getDirectMessages);
router.post('/direct', sendDirectMessage);

module.exports = router;

const express = require('express');
const router = express.Router();
const { 
  getFriends, 
  searchUser, 
  sendFriendRequest, 
  getPendingRequests, 
  respondToRequest 
} = require('../controllers/friendController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// جميع مسارات الأصدقاء محمية بالتوكن
router.use(authMiddleware);

router.get('/', getFriends);
router.get('/search', searchUser);
router.get('/pending', getPendingRequests);
router.post('/request', sendFriendRequest);
router.post('/respond', respondToRequest);

module.exports = router;


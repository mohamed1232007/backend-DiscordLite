const express = require('express');
const {
  answerCall,
  createRoom,
  getInvitations,
  getRoom,
  inviteParticipants,
  leaveCall,
  updateNoiseSuppression,
} = require('../controllers/callController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.get('/invitations', getInvitations);
router.post('/', createRoom);
router.get('/:roomId', getRoom);
router.post('/:roomId/answer', answerCall);
router.post('/:roomId/invitations', inviteParticipants);
router.patch('/:roomId/noise', updateNoiseSuppression);
router.post('/:roomId/leave', leaveCall);

module.exports = router;

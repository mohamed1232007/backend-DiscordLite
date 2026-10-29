const supabase = require('../config/supabase');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

const hasAcceptedFriendship = async (userId, friendId) => {
  const { data, error } = await supabase
    .from('friends')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!data;
};

const endRoomIfNeeded = async (roomId) => {
  const { data: participants, error } = await supabase
    .from('call_participants')
    .select('status')
    .eq('room_id', roomId);
  if (error) throw error;

  const activeCount = participants.filter(({ status }) => status === 'active').length;
  if (participants.length <= 2 || activeCount === 0) {
    const { error: roomError } = await supabase
      .from('call_rooms')
      .update({ status: 'ended' })
      .eq('id', roomId);
    if (roomError) throw roomError;
  }
};

const leaveStaleCalls = async (userId, exceptRoomId = null) => {
  let query = supabase
    .from('call_participants')
    .update({ status: 'left' })
    .eq('user_id', userId)
    .eq('status', 'active');
  if (exceptRoomId) query = query.neq('room_id', exceptRoomId);

  const { data, error } = await query.select('room_id');
  if (error) throw error;

  const roomIds = new Set((data || []).map(({ room_id }) => room_id));
  for (const roomId of roomIds) {
    await endRoomIfNeeded(roomId);
  }
};

const getInvitations = async (req, res) => {
  try {
    const { data: invitations, error } = await supabase
      .from('call_participants')
      .select('room_id, invited_by, created_at')
      .eq('user_id', req.user.id)
      .eq('status', 'invited')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    if (!invitations?.length) return res.status(200).json({ invitation: null });

    const roomIds = [...new Set(invitations.map(({ room_id }) => room_id))];
    const { data: rooms, error: roomsError } = await supabase
      .from('call_rooms')
      .select('id, created_by, status')
      .in('id', roomIds);
    if (roomsError) throw roomsError;

    const activeRoomIds = new Set((rooms || [])
      .filter((room) => room.status === 'active')
      .map((room) => room.id));
    const expiredRoomIds = roomIds.filter((roomId) => !activeRoomIds.has(roomId));

    if (expiredRoomIds.length) {
      const { error: clearError } = await supabase
        .from('call_participants')
        .update({ status: 'left' })
        .eq('user_id', req.user.id)
        .eq('status', 'invited')
        .in('room_id', expiredRoomIds);
      if (clearError) throw clearError;
    }

    const invitation = invitations.find(({ room_id }) => activeRoomIds.has(room_id));
    if (!invitation) return res.status(200).json({ invitation: null });

    const room = rooms.find(({ id }) => id === invitation.room_id);
    const callerId = invitation.invited_by || room.created_by;
    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .eq('id', callerId)
      .maybeSingle();
    if (callerError) throw callerError;

    return res.status(200).json({
      invitation: {
        roomId: room.id,
        callerId: caller?.id || room.created_by,
        callerName: caller?.display_name || caller?.username || 'Friend',
        caller,
      },
    });
  } catch (error) {
    console.error('Get call invitations error:', error);
    return res.status(500).json({ error: 'Failed to check call invitations.' });
  }
};

const getRoom = async (req, res) => {
  const { roomId } = req.params;
  if (!isUuid(roomId)) return res.status(400).json({ error: 'A valid room ID is required.' });

  try {
    const { data: room, error: roomError } = await supabase
      .from('call_rooms')
      .select('id, created_by, status')
      .eq('id', roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) return res.status(404).json({ error: 'Call room not found.' });

    const { data: rows, error: rowsError } = await supabase
      .from('call_participants')
      .select('user_id, status, invited_by, noise_suppression_enabled, peer_id')
      .eq('room_id', roomId);
    if (rowsError) throw rowsError;
    if (!rows.some(({ user_id }) => user_id === req.user.id)) {
      return res.status(403).json({ error: 'You are not a participant in this call.' });
    }

    const userIds = rows.map(({ user_id }) => user_id);
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;

    const participants = rows.map((row) => ({
      ...row,
      user: profiles.find(({ id }) => id === row.user_id) || { id: row.user_id },
    }));

    return res.status(200).json({ room, participants });
  } catch (error) {
    console.error('Get call room error:', error);
    return res.status(500).json({ error: 'Failed to load call room.' });
  }
};

const createRoom = async (req, res) => {
  const { targetUserId, peerId, noiseSuppressionEnabled } = req.body || {};
  if (!isUuid(targetUserId) || targetUserId === req.user.id) {
    return res.status(400).json({ error: 'A valid friend ID is required.' });
  }
  if (typeof peerId !== 'string' || peerId.length < 1 || peerId.length > 128) {
    return res.status(400).json({ error: 'A valid peer ID is required.' });
  }
  if (typeof noiseSuppressionEnabled !== 'boolean') {
    return res.status(400).json({ error: 'Noise-suppression status is required.' });
  }

  try {
    if (!await hasAcceptedFriendship(req.user.id, targetUserId)) {
      return res.status(403).json({ error: 'Calls are limited to accepted friends.' });
    }

    await leaveStaleCalls(req.user.id);

    const { data: room, error: roomError } = await supabase
      .from('call_rooms')
      .insert({ created_by: req.user.id })
      .select('id')
      .single();
    if (roomError) throw roomError;

    const { error: participantsError } = await supabase
      .from('call_participants')
      .insert([
        {
          room_id: room.id,
          user_id: req.user.id,
          peer_id: peerId,
          invited_by: req.user.id,
          status: 'active',
          noise_suppression_enabled: noiseSuppressionEnabled,
          joined_at: new Date().toISOString(),
        },
        {
          room_id: room.id,
          user_id: targetUserId,
          invited_by: req.user.id,
          status: 'invited',
        },
      ]);

    if (participantsError) {
      const { error: cleanupError } = await supabase
        .from('call_rooms')
        .update({ status: 'ended' })
        .eq('id', room.id);
      if (cleanupError) console.error('Failed to close incomplete call room:', cleanupError);
      throw participantsError;
    }

    return res.status(201).json({ room });
  } catch (error) {
    console.error('Create call room error:', error);
    return res.status(500).json({ error: 'Failed to start the call.' });
  }
};

const answerCall = async (req, res) => {
  const { roomId } = req.params;
  const { peerId, noiseSuppressionEnabled } = req.body || {};
  if (!isUuid(roomId) || typeof peerId !== 'string' || peerId.length < 1 || peerId.length > 128) {
    return res.status(400).json({ error: 'Invalid call invitation.' });
  }
  if (typeof noiseSuppressionEnabled !== 'boolean') {
    return res.status(400).json({ error: 'Noise-suppression status is required.' });
  }

  try {
    const { data: room, error: roomError } = await supabase
      .from('call_rooms')
      .select('status')
      .eq('id', roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (room?.status !== 'active') {
      return res.status(409).json({ error: 'This call has already ended.' });
    }

    await leaveStaleCalls(req.user.id, roomId);

    const { data: membership, error } = await supabase
      .from('call_participants')
      .update({
        status: 'active',
        peer_id: peerId,
        noise_suppression_enabled: noiseSuppressionEnabled,
        joined_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .eq('status', 'invited')
      .select('user_id')
      .maybeSingle();
    if (error) throw error;
    if (!membership) return res.status(409).json({ error: 'This call invitation is no longer active.' });

    return res.status(200).json({ membership });
  } catch (error) {
    console.error('Answer call error:', error);
    return res.status(500).json({ error: 'Failed to join the call.' });
  }
};

const inviteParticipants = async (req, res) => {
  const { roomId } = req.params;
  const { userIds } = req.body || {};
  if (!isUuid(roomId) || !Array.isArray(userIds) || userIds.length < 1 || userIds.length > 20) {
    return res.status(400).json({ error: 'Invalid call invitations.' });
  }
  const inviteeIds = [...new Set(userIds)];
  if (inviteeIds.some((id) => !isUuid(id) || id === req.user.id)) {
    return res.status(400).json({ error: 'One or more friend IDs are invalid.' });
  }

  try {
    const { data: room, error: roomError } = await supabase
      .from('call_rooms')
      .select('status')
      .eq('id', roomId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (room?.status !== 'active') {
      return res.status(409).json({ error: 'This call has already ended.' });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('call_participants')
      .select('status')
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.status !== 'active') {
      return res.status(403).json({ error: 'Only active call participants can invite friends.' });
    }

    const friendshipResults = await Promise.all(
      inviteeIds.map((friendId) => hasAcceptedFriendship(req.user.id, friendId)),
    );
    if (friendshipResults.some((isFriend) => !isFriend)) {
      return res.status(403).json({ error: 'Calls are limited to accepted friends.' });
    }

    const { data: existingParticipants, error: existingError } = await supabase
      .from('call_participants')
      .select('user_id, status')
      .eq('room_id', roomId)
      .in('user_id', inviteeIds);
    if (existingError) throw existingError;

    const alreadyInvited = new Set((existingParticipants || [])
      .filter(({ status }) => ['active', 'invited'].includes(status))
      .map(({ user_id }) => user_id));
    const newInviteeIds = inviteeIds.filter((id) => !alreadyInvited.has(id));
    if (newInviteeIds.length === 0) return res.status(200).json({ invited: 0 });

    const { error } = await supabase
      .from('call_participants')
      .upsert(newInviteeIds.map((userId) => ({
        room_id: roomId,
        user_id: userId,
        invited_by: req.user.id,
        status: 'invited',
        noise_suppression_enabled: false,
        created_at: new Date().toISOString(),
      })), { onConflict: 'room_id,user_id' });
    if (error) throw error;

    return res.status(200).json({ invited: newInviteeIds.length });
  } catch (error) {
    console.error('Invite call participants error:', error);
    return res.status(500).json({ error: 'Failed to invite friends to the call.' });
  }
};

const updateNoiseSuppression = async (req, res) => {
  const { roomId } = req.params;
  const { enabled } = req.body || {};
  if (!isUuid(roomId) || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid noise-suppression setting.' });
  }

  try {
    const { data, error } = await supabase
      .from('call_participants')
      .update({ noise_suppression_enabled: enabled })
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .select('user_id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Active call membership not found.' });
    return res.status(200).json({ updated: true });
  } catch (error) {
    console.error('Update call noise-suppression error:', error);
    return res.status(500).json({ error: 'Failed to update call settings.' });
  }
};

const leaveCall = async (req, res) => {
  const { roomId } = req.params;
  const { status } = req.body || {};
  if (!isUuid(roomId) || !['left', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Invalid call status.' });
  }

  try {
    const { data: membership, error } = await supabase
      .from('call_participants')
      .update({ status })
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .in('status', ['active', 'invited'])
      .select('user_id')
      .maybeSingle();
    if (error) throw error;

    if (membership && status === 'left') await endRoomIfNeeded(roomId);

    return res.status(200).json({ updated: !!membership });
  } catch (error) {
    console.error('Leave call error:', error);
    return res.status(500).json({ error: 'Failed to leave the call.' });
  }
};

module.exports = {
  answerCall,
  createRoom,
  getInvitations,
  getRoom,
  inviteParticipants,
  leaveCall,
  updateNoiseSuppression,
};

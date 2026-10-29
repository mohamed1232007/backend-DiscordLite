const supabase = require('../config/supabase');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const checkAcceptedFriendship = async (userId, friendId) => {
  const { data, error } = await supabase
    .from('friends')
    .select('id')
    .eq('status', 'accepted')
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
    .limit(1)
    .maybeSingle();

  return { isFriend: !!data, error };
};

const getUnreadDirectMessages = async (req, res) => {
  const { after, through } = req.query;
  const afterDate = new Date(after);
  const throughDate = new Date(through);

  if (
    typeof after !== 'string'
    || typeof through !== 'string'
    || Number.isNaN(afterDate.getTime())
    || Number.isNaN(throughDate.getTime())
    || afterDate >= throughDate
  ) {
    return res.status(400).json({ error: 'A valid time range is required.' });
  }

  try {
    const unreadBySender = {};
    const pageSize = 500;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: messages, error } = await supabase
        .from('direct_messages')
        .select('sender_id')
        .eq('receiver_id', req.user.id)
        .gt('created_at', afterDate.toISOString())
        .lte('created_at', throughDate.toISOString())
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('Fetch unread DMs error:', error);
        return res.status(500).json({ error: 'Failed to fetch unread messages.' });
      }

      for (const { sender_id: senderId } of messages || []) {
        unreadBySender[senderId] = (unreadBySender[senderId] || 0) + 1;
      }

      hasMore = (messages || []).length === pageSize;
      offset += pageSize;
    }

    return res.status(200).json({ unreadBySender });
  } catch (error) {
    console.error('getUnreadDirectMessages error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 1. جلب سجل الرسائل المباشرة بين المستخدمين
const getDirectMessages = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { friendId } = req.params;

    if (typeof friendId !== 'string' || !UUID_PATTERN.test(friendId)) {
      return res.status(400).json({ error: 'A valid friend ID is required.' });
    }

    const { isFriend, error: friendshipError } = await checkAcceptedFriendship(currentUserId, friendId);
    if (friendshipError) {
      console.error('Check DM friendship error:', friendshipError);
      return res.status(500).json({ error: 'Failed to verify friendship.' });
    }
    if (!isFriend) {
      return res.status(403).json({ error: 'You can only view messages with accepted friends.' });
    }

    // جلب كل الرسائل المتبادلة بين الطرفين مرتبة زمنياً
    const { data: messages, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Fetch DMs error:', error);
      return res.status(500).json({ error: 'Failed to fetch messages.' });
    }

    return res.status(200).json({ messages: (messages || []).reverse() });
  } catch (err) {
    console.error('getDirectMessages error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 2. إرسال رسالة مباشرة جديدة
const sendDirectMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { receiverId, content, fileUrl } = req.body || {};

    if (
      typeof receiverId !== 'string'
      || !UUID_PATTERN.test(receiverId)
      || typeof content !== 'string'
      || !content.trim()
      || content.length > 4000
    ) {
      return res.status(400).json({ error: 'Receiver ID and message content are required.' });
    }

    const { isFriend, error: friendshipError } = await checkAcceptedFriendship(currentUserId, receiverId);
    if (friendshipError) {
      console.error('Check DM friendship error:', friendshipError);
      return res.status(500).json({ error: 'Failed to verify friendship.' });
    }
    if (!isFriend) {
      return res.status(403).json({ error: 'You can only message accepted friends.' });
    }

    const { data: newMessage, error } = await supabase
      .from('direct_messages')
      .insert([
        {
          sender_id: currentUserId,
          receiver_id: receiverId,
          content: content.trim(),
          file_url: fileUrl || null
        }
      ])
      .select('*')
      .single();

    if (error) {
      console.error('Insert DM error:', error);
      return res.status(500).json({ error: 'Failed to send message.' });
    }

    return res.status(201).json({ message: newMessage });
  } catch (err) {
    console.error('sendDirectMessage error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

module.exports = {
  getUnreadDirectMessages,
  getDirectMessages,
  sendDirectMessage
};

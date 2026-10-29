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

const MAX_UNREAD_PAGES = 20;

const getUnreadDirectMessages = async (req, res) => {
  const { after, through } = req.query;
  const throughDate = through === undefined ? new Date() : new Date(through);

  if (Number.isNaN(throughDate.getTime())) {
    return res.status(400).json({ error: 'A valid time range is required.' });
  }

  // أول طلب (أو إعادة مزامنة بعد انحراف ساعة الجهاز): نرجّع مؤشر السيرفر فقط
  // بدون عدّ أي رسالة، ثم تعتمد الواجهة على توقيت السيرفر في كل الطلبات التالية.
  if (after === undefined) {
    return res.status(200).json({ unreadBySender: {}, cursor: throughDate.toISOString() });
  }
  if (typeof after !== 'string') {
    return res.status(400).json({ error: 'A valid time range is required.' });
  }

  const afterDate = new Date(after);
  if (Number.isNaN(afterDate.getTime())) {
    return res.status(400).json({ error: 'A valid time range is required.' });
  }
  if (afterDate >= throughDate) {
    return res.status(200).json({ unreadBySender: {}, cursor: throughDate.toISOString() });
  }

  try {
    const unreadBySender = {};
    const pageSize = 500;
    let offset = 0;
    let hasMore = true;
    let pages = 0;

    while (hasMore && pages < MAX_UNREAD_PAGES) {
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
      pages += 1;
    }

    if (hasMore) {
      console.warn('[Messages] Unread scan stopped at the page limit; some counts may be incomplete.');
    }

    return res.status(200).json({ unreadBySender, cursor: throughDate.toISOString() });
  } catch (error) {
    console.error('getUnreadDirectMessages error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 1. جلب سجل الرسائل المباشرة بين المستخدمين
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

const getDirectMessages = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { friendId } = req.params;
    const { before } = req.query;

    if (typeof friendId !== 'string' || !UUID_PATTERN.test(friendId)) {
      return res.status(400).json({ error: 'A valid friend ID is required.' });
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const pageSize = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    let beforeDate = null;
    if (before !== undefined) {
      beforeDate = new Date(before);
      if (typeof before !== 'string' || Number.isNaN(beforeDate.getTime())) {
        return res.status(400).json({ error: 'A valid message cursor is required.' });
      }
    }

    const { isFriend, error: friendshipError } = await checkAcceptedFriendship(currentUserId, friendId);
    if (friendshipError) {
      console.error('Check DM friendship error:', friendshipError);
      return res.status(500).json({ error: 'Failed to verify friendship.' });
    }
    if (!isFriend) {
      return res.status(403).json({ error: 'You can only view messages with accepted friends.' });
    }

    // جلب صفحة من الرسائل المتبادلة بين الطرفين مرتبة زمنياً (الأحدث أولاً)
    let query = supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1);

    if (beforeDate) {
      query = query.lt('created_at', beforeDate.toISOString());
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Fetch DMs error:', error);
      return res.status(500).json({ error: 'Failed to fetch messages.' });
    }

    const rows = messages || [];
    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;

    return res.status(200).json({ messages: page.reverse(), hasMore });
  } catch (err) {
    console.error('getDirectMessages error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

const FILE_URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const MAX_FILE_URL_LENGTH = 2048;

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

    if (fileUrl !== undefined && fileUrl !== null) {
      if (
        typeof fileUrl !== 'string'
        || fileUrl.length > MAX_FILE_URL_LENGTH
        || !FILE_URL_PATTERN.test(fileUrl)
      ) {
        return res.status(400).json({ error: 'The attachment link must be a valid http(s) URL.' });
      }
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

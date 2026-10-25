const supabase = require('../config/supabase');

// 1. جلب سجل الرسائل المباشرة بين المستخدمين
const getDirectMessages = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { friendId } = req.params;

    if (!friendId) {
      return res.status(400).json({ error: 'Friend ID is required.' });
    }

    // جلب كل الرسائل المتبادلة بين الطرفين مرتبة زمنياً
    const { data: messages, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch DMs error:', error);
      return res.status(500).json({ error: 'Failed to fetch messages.' });
    }

    return res.status(200).json({ messages: messages || [] });
  } catch (err) {
    console.error('getDirectMessages error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 2. إرسال رسالة مباشرة جديدة
const sendDirectMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { receiverId, content, fileUrl } = req.body;

    if (!receiverId || !content || !content.trim()) {
      return res.status(400).json({ error: 'Receiver ID and message content are required.' });
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
  getDirectMessages,
  sendDirectMessage
};


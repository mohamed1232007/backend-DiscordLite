const supabase = require('../config/supabase');
const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 1. جلب قائمة الأصدقاء للمستخدم الحالي
const getFriends = async (req, res) => {
  try {
    const userId = req.user.id;

    // جلب الصداقات المقبولة فقط (accepted)
    const { data: friendships, error } = await supabase
      .from('friends')
      .select('id, user_id, friend_id, status')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (error) {
      console.error('Error fetching friends:', error);
      return res.status(500).json({ error: 'Failed to fetch friends.' });
    }

    if (!friendships || friendships.length === 0) {
      return res.status(200).json({ friends: [] });
    }

    // استخراج الـ IDs الخاصة بالأصدقاء
    const friendIds = friendships.map(f => f.user_id === userId ? f.friend_id : f.user_id);

    // جلب بيانات بروفايل الأصدقاء من جدول users
    const { data: friendsList, error: usersError } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, status, custom_status')
      .in('id', friendIds);

    if (usersError) {
      console.error('Error fetching friend profiles:', usersError);
      return res.status(500).json({ error: 'Failed to fetch friend profiles.' });
    }

    return res.status(200).json({ friends: friendsList || [] });
  } catch (err) {
    console.error('getFriends error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 2. البحث عن مستخدم بالـ username لإرسال طلب صداقة
const searchUser = async (req, res) => {
  try {
    const { username } = req.query;
    const currentUserId = req.user.id;

    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 32) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    const cleanQuery = username.toLowerCase().trim();
    if (!USERNAME_PATTERN.test(cleanQuery)) {
      return res.status(400).json({ error: 'Username may contain only letters, numbers, and underscores.' });
    }

    // البحث في المستخدمين مع استبعاد الحساب الحالي
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, status')
      .ilike('username', `%${cleanQuery}%`)
      .neq('id', currentUserId)
      .limit(10);

    if (error) {
      console.error('Search user error:', error);
      return res.status(500).json({ error: 'Failed to search users.' });
    }

    return res.status(200).json({ users: users || [] });
  } catch (err) {
    console.error('searchUser error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 3. إرسال طلب صداقة (Send Friend Request)
const sendFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body || {};

    if (typeof targetUserId !== 'string' || !UUID_PATTERN.test(targetUserId)) {
      return res.status(400).json({ error: 'A valid target user ID is required.' });
    }

    if (targetUserId === userId) {
      return res.status(400).json({ error: 'You cannot add yourself as a friend.' });
    }

    // التحقق هل توجد علاقة صداقة مسبقاً
    const { data: existing, error: checkError } = await supabase
      .from('friends')
      .select('*')
      .or(`and(user_id.eq.${userId},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${userId})`);

    if (checkError) {
      console.error('Friend check error:', checkError);
      return res.status(500).json({ error: 'Database check error.' });
    }

    if (existing && existing.length > 0) {
      const relation = existing[0];
      if (relation.status === 'accepted') {
        return res.status(400).json({ error: 'You are already friends!' });
      }
      return res.status(400).json({ error: 'A friend request is already pending.' });
    }

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', targetUserId)
      .maybeSingle();
    if (userError) {
      console.error('Target user check error:', userError);
      return res.status(500).json({ error: 'Failed to verify target user.' });
    }
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // إنشاء طلب صداقة (pending)
    const { data: newRequest, error: insertError } = await supabase
      .from('friends')
      .insert([
        {
          user_id: userId,
          friend_id: targetUserId,
          status: 'pending'
        }
      ])
      .select('*')
      .single();

    if (insertError) {
      console.error('Send request error:', insertError);
      return res.status(500).json({ error: 'Failed to send friend request.' });
    }

    return res.status(201).json({ message: 'Friend request sent successfully!', request: newRequest });
  } catch (err) {
    console.error('sendFriendRequest error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 4. جلب طلبات الصداقة المعلقة (Pending Requests)
const getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // الطلبات المرسلة إليك وتنتظر موافقتك
    const { data: requests, error } = await supabase
      .from('friends')
      .select('id, user_id, status, created_at')
      .eq('friend_id', userId)
      .eq('status', 'pending');

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch pending requests.' });
    }

    if (!requests || requests.length === 0) {
      return res.status(200).json({ requests: [] });
    }

    const senderIds = requests.map(r => r.user_id);
    const { data: senders } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', senderIds);

    const merged = requests.map(r => {
      const sender = senders?.find(s => s.id === r.user_id);
      return {
        requestId: r.id,
        user: sender,
        created_at: r.created_at
      };
    });

    return res.status(200).json({ requests: merged });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 5. قبول أو رفض طلب الصداقة (Accept / Decline)
const respondToRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId, action } = req.body; // action: 'accept' or 'decline'

    if (!requestId || !['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request parameters.' });
    }

    if (action === 'accept') {
      const { error } = await supabase
        .from('friends')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .eq('friend_id', userId);

      if (error) return res.status(500).json({ error: 'Failed to accept request.' });
      return res.status(200).json({ message: 'Friend request accepted!' });
    } else {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', requestId)
        .eq('friend_id', userId);

      if (error) return res.status(500).json({ error: 'Failed to decline request.' });
      return res.status(200).json({ message: 'Friend request declined.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

module.exports = {
  getFriends,
  searchUser,
  sendFriendRequest,
  getPendingRequests,
  respondToRequest
};

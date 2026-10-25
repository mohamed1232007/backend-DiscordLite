const supabase = require('../config/supabase');

// تحديث حالة المستخدم (online / offline / idle / dnd)
const updateStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, customStatus } = req.body;

    const validStatuses = ['online', 'idle', 'dnd', 'offline'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (customStatus !== undefined) updates.custom_status = customStatus;

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, username, display_name, status, custom_status')
      .single();

    if (error) {
      console.error('Update status error:', error);
      return res.status(500).json({ error: 'Failed to update status.' });
    }

    return res.status(200).json({ message: 'Status updated successfully', user: updatedUser });
  } catch (err) {
    console.error('updateStatus error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

module.exports = {
  updateStatus
};


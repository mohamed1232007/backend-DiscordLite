const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { JWT_SECRET } = require('../middlewares/authMiddleware');

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 1. تسجيل مستخدم جديد (Register)
const register = async (req, res) => {
  try {
    const { email, password, username, displayName } = req.body || {};

    if (
      typeof email !== 'string'
      || typeof password !== 'string'
      || typeof username !== 'string'
      || !email.trim()
      || !password
      || !username.trim()
    ) {
      return res.status(400).json({ error: 'Email, password, and username are required.' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();
    if (!USERNAME_PATTERN.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-32 characters using letters, numbers, and underscores.' });
    }
    if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Password must be between 6 and 72 bytes.' });
    }
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length > 64)) {
      return res.status(400).json({ error: 'Display name must be 64 characters or fewer.' });
    }

    const [{ data: existingEmail, error: emailError }, { data: existingUsername, error: usernameError }] = await Promise.all([
      supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle(),
      supabase
        .from('users')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle(),
    ]);

    if (emailError || usernameError) {
      console.error('Check user error:', emailError || usernameError);
      return res.status(500).json({ error: 'Database error checking user.' });
    }

    if (existingEmail) return res.status(400).json({ error: 'Email is already registered.' });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }

    // تشفير كلمة المرور
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // إضافة المستخدم في جدول users
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          email: cleanEmail,
          password_hash: passwordHash,
          username: cleanUsername,
          display_name: displayName?.trim() || cleanUsername,
          status: 'online'
        }
      ])
      .select('id, email, username, display_name, avatar_url, status, created_at')
      .single();

    if (insertError) {
      console.error('Insert user error:', insertError);
      return res.status(500).json({ error: 'Failed to create user account.' });
    }

    // إنشاء توكن JWT للجلسة
    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(201).json({
      message: 'Account created successfully!',
      user: newUser,
      token
    });
  } catch (err) {
    console.error('Register unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 2. تسجيل الدخول (Login)
const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail) || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // البحث عن المستخدم بالإيميل
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email, password_hash, username, display_name, avatar_url, custom_status, status, created_at')
      .eq('email', cleanEmail)
      .single();

    if (findError || !user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // مقارنة كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // تحديث حالة المستخدم إلى online
    await supabase
      .from('users')
      .update({ status: 'online' })
      .eq('id', user.id);

    // إنشاء التوكن
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // تجهيز بيانات المستخدم بدون كلمة السر
    const { password_hash, ...safeUser } = user;

    return res.status(200).json({
      message: 'Logged in successfully!',
      user: safeUser,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

// 3. جلب بيانات الحساب الحالي (Get Profile)
const getMe = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username, display_name, avatar_url, custom_status, status, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
};

module.exports = { register, login, getMe };

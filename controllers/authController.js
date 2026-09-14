const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { sendOtpEmail, generateOtp } = require('../utils/email');
const { initialsAvatarUrl, isGooglePhoto, hostedGooglePhoto } = require('../utils/avatar');

const OTP_TTL_MINUTES = 10;

async function issueOtp(user, lang) {
  const otp = generateOtp();
  user.otpCode = otp;
  user.otpExpires = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  await sendOtpEmail({ to: user.email, name: user.name, otp, expiresMinutes: OTP_TTL_MINUTES, lang });
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id, email, role, expiresIn) =>
  jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn });

const getDashboard = (role) => {
  const dashboards = {
    Admin: '/admin',
    Tourist: '/dashboard',
  };
  return dashboards[role] || '/dashboard';
};

const sendTokenResponse = (user, statusCode, res) => {
  const token       = generateToken(user._id, user.email, user.role, '7d');
  const cookieOpts  = { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 };

  res.cookie('jwt', token, cookieOpts);

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.image,
        loginTime: new Date().toISOString(),
        dashboard: getDashboard(user.role),
      },
    },
  });
};

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, nationality, dob } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return next(new AppError('An account with this email already exists.', 400));
    }

    const newUser = await User.create({
      name,
      email,
      password,
      phone: phone || '',
      nationality: nationality || '',
      dob: dob || null,
      image: initialsAvatarUrl(name),
      role: 'Tourist',
      emailVerified: false,
    });

    await issueOtp(newUser, req.lang);

    res.status(201).json({
      status: 'success',
      needsVerification: true,
      data: { email: newUser.email },
    });
  } catch (err) {
    next(err);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return next(new AppError('Please provide the email and the code.', 400));
    }

    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+otpCode +otpExpires');
    if (!user) return next(new AppError('No account found for that email.', 404));

    if (user.emailVerified) {
      return sendTokenResponse(user, 200, res);
    }
    if (!user.otpCode || !user.otpExpires || user.otpExpires < new Date()) {
      return next(new AppError('This code has expired. Please request a new one.', 400));
    }
    if (user.otpCode !== String(otp).trim()) {
      return next(new AppError('That code is incorrect.', 400));
    }

    user.emailVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Please provide an email.', 400));

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) return next(new AppError('No account found for that email.', 404));
    if (user.emailVerified) {
      return next(new AppError('This account is already verified.', 400));
    }

    await issueOtp(user, req.lang);
    res.status(200).json({ status: 'success', message: 'A new code has been sent.' });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return next(new AppError('Invalid email or password.', 401));
    }

    const isMatch = await user.correctPassword(password, user.password);
    if (!isMatch) {
      return next(new AppError('Invalid email or password.', 401));
    }

    if (user.status === 'suspended') {
      return next(new AppError('Your account has been suspended. Please contact support.', 403));
    }
    if (user.status === 'deactivated') {
      return next(new AppError('This account has been closed. Contact support to reopen it.', 403));
    }
    if (!user.emailVerified) {
      await issueOtp(user, req.lang);
      return res.status(403).json({
        status: 'fail',
        needsVerification: true,
        message: 'Please verify your email first - we just sent you a new code.',
        data: { email: user.email },
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

const googleAuth = async (req, res, next) => {
  try {
    const { credential, agreedToTerms } = req.body;
    if (!credential) {
      return next(new AppError('Missing Google credential.', 400));
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e) {
      return next(new AppError('Could not verify Google sign-in. Please try again.', 401));
    }

    const { sub, email, name, picture } = payload;
    if (!email) {
      return next(new AppError('Your Google account has no email to sign in with.', 400));
    }

    let user = await User.findOne({ $or: [{ googleId: sub }, { email: email.toLowerCase() }] });

    if (user) {
      if (user.status === 'suspended') {
        return next(new AppError('Your account has been suspended. Please contact support.', 403));
      }
      if (user.status === 'deactivated') {
        return next(new AppError('This account has been closed. Contact support to reopen it.', 403));
      }
      let changed = false;
      if (!user.googleId) {
        user.googleId = sub;
        changed = true;
      }
      // Accounts still pointing at a Google-hosted photo (or none) get a Cloudinary copy.
      // Photos the user uploaded themselves are left alone.
      const photoSource = isGooglePhoto(user.image) ? user.image : (!user.image && picture) ? picture : null;
      if (photoSource) {
        const hosted = await hostedGooglePhoto(photoSource, sub);
        if (hosted !== user.image) {
          user.image = hosted;
          changed = true;
        }
      }
      if (changed) await user.save({ validateBeforeSave: false });
      return sendTokenResponse(user, 200, res);
    }

    if (agreedToTerms !== true) {
      return res.status(400).json({
        status: 'fail',
        needsTermsAgreement: true,
        email,
        name,
        picture: picture || '',
      });
    }

    const { dob, phone, nationality } = req.body;
    if (!dob || !nationality || !phone || String(phone).replace(/\D/g, '').length < 7) {
      return next(new AppError('Please provide your date of birth, phone number and nationality to finish creating your account.', 400));
    }
    const age = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (Number.isNaN(age) || age < 18) {
      return next(new AppError('You must be at least 18 years old to create an account.', 400));
    }

    user = await User.create({
      name,
      email,
      googleId: sub,
      authProvider: 'google',
      image: picture ? await hostedGooglePhoto(picture, sub) : initialsAvatarUrl(name),
      role: 'Tourist',
      dob,
      phone,
      nationality,
    });

    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

const logout = (req, res) => {
  res.cookie('jwt', 'loggedout', { httpOnly: true, maxAge: 10 * 1000 });
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({ status: 'success', data: { user } });
  } catch (err) {
    next(err);
  }
};

const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.correctPassword(currentPassword, user.password);
    if (!isMatch) {
      return next(new AppError('Current password is incorrect.', 401));
    }

    user.password = newPassword;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, googleAuth, logout, getMe, updatePassword, verifyOtp, resendOtp };

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [function () { return this.authProvider !== 'google'; }, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    googleId:     { type: String, unique: true, sparse: true },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },

    emailVerified: { type: Boolean, default: true },
    otpCode:       { type: String, select: false },
    otpExpires:    { type: Date, select: false },
    phone:       { type: String, default: '' },
    nationality: { type: String, default: '' },
    dob:         { type: Date },
    image:       { type: String, default: '' },
    role:        { type: String, enum: ['Tourist', 'Admin'], default: 'Tourist' },
    status:      { type: String, enum: ['active', 'suspended', 'deactivated'], default: 'active' },
    deactivatedAt: { type: Date },
    joinDate:    { type: Date, default: Date.now },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 8);
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000;
  }
  next();
});

userSchema.methods.correctPassword = async function (candidatePassword, hashedPassword) {
  return await bcrypt.compare(candidatePassword, hashedPassword);
};

userSchema.methods.changedPasswordAfter = function (jwtIat) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtIat < changedTimestamp;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);

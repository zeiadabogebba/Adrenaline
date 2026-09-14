const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
    customer: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['open', 'resolved'],
      default: 'open',
    },
    adminReply: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      minlength: [10, 'Message must be at least 10 characters'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contact', contactSchema);

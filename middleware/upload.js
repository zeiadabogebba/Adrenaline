const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary, cloudinaryFolder } = require('../config/cloudinary');
const AppError = require('../utils/AppError');

const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:           cloudinaryFolder('avatars'),
    allowed_formats:  ['jpg', 'jpeg', 'png', 'webp'],
    transformation:   [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
  },
});

const packageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          cloudinaryFolder('packages'),
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, quality: 'auto' }],
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, and WebP images are allowed.', 400), false);
  }
};

const limits = { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024 };

const reviewStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          cloudinaryFolder('reviews'),
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1000, quality: 'auto' }],
  },
});

const travellerIdStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          cloudinaryFolder('traveller-ids'),
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1400, quality: 'auto' }],
  },
});

const paymentScreenshotStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          cloudinaryFolder('payment-screenshots'),
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1400, quality: 'auto' }],
  },
});

const uploadAvatar         = multer({ storage: avatarStorage,      fileFilter, limits }).single('avatar');
const uploadPackageImage   = multer({ storage: packageStorage,     fileFilter, limits }).single('image');
const uploadTripImage      = multer({ storage: packageStorage,     fileFilter, limits }).single('image');
const uploadReviewPhotos   = multer({ storage: reviewStorage,      fileFilter, limits }).array('photos', 5);
const uploadTravellerPhoto = multer({ storage: travellerIdStorage, fileFilter, limits: { fileSize: 6 * 1024 * 1024 } }).single('photo');
const uploadPaymentScreenshot = multer({ storage: paymentScreenshotStorage, fileFilter, limits: { fileSize: 6 * 1024 * 1024 } }).single('screenshot');

module.exports = { uploadAvatar, uploadPackageImage, uploadTripImage, uploadReviewPhotos, uploadTravellerPhoto, uploadPaymentScreenshot };

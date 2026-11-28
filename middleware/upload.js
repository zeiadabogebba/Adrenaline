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

const photoBookStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          cloudinaryFolder('photo-books'),
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }],
  },
});

const uploadAvatar         = multer({ storage: avatarStorage,      fileFilter, limits }).single('avatar');
const uploadPackageImage   = multer({ storage: packageStorage,     fileFilter, limits }).single('image');
const uploadTripImage      = multer({ storage: packageStorage,     fileFilter, limits }).single('image');
const uploadReviewPhotos   = multer({ storage: reviewStorage,      fileFilter, limits }).array('photos', 5);
const uploadTravellerPhoto = multer({ storage: travellerIdStorage, fileFilter, limits: { fileSize: 6 * 1024 * 1024 } }).single('photo');
const huntPhotoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          cloudinaryFolder('treasure-hunt'),
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1400, height: 1400, crop: 'limit', quality: 'auto' }],
  },
});

const uploadHuntPhoto = multer({ storage: huntPhotoStorage, fileFilter, limits: { fileSize: 8 * 1024 * 1024 } }).single('photo');
// Travellers' selfies at hunt stops. Phones may send HEIC; Cloudinary stores everything as JPEG.
const huntSelfieStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          cloudinaryFolder('treasure-hunt-selfies'),
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
    format:          'jpg',
    transformation:  [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }],
  },
});
const selfieFilter = (req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype)) cb(null, true);
  else cb(new AppError('Only photos (JPEG, PNG, WebP or HEIC) can be uploaded.', 400), false);
};
const uploadHuntSelfie = multer({ storage: huntSelfieStorage, fileFilter: selfieFilter, limits: { fileSize: 12 * 1024 * 1024 } }).single('photo');
const uploadPhotoBookPhoto = multer({ storage: photoBookStorage, fileFilter, limits: { fileSize: 8 * 1024 * 1024 } }).single('photo');
const uploadPaymentScreenshot = multer({ storage: paymentScreenshotStorage, fileFilter, limits: { fileSize: 6 * 1024 * 1024 } }).single('screenshot');

module.exports = { uploadAvatar, uploadPackageImage, uploadTripImage, uploadReviewPhotos, uploadTravellerPhoto, uploadPaymentScreenshot, uploadPhotoBookPhoto, uploadHuntPhoto, uploadHuntSelfie };

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Every upload lives under one root folder in the Cloudinary Media Library.
// Cloudinary creates folders from this name on upload, so it is the only place to change it.
const CLOUDINARY_ROOT_FOLDER = process.env.CLOUDINARY_FOLDER || 'adrenaline';

const cloudinaryFolder = (name) => `${CLOUDINARY_ROOT_FOLDER}/${name}`;

module.exports = { cloudinary, cloudinaryFolder, CLOUDINARY_ROOT_FOLDER };

const { cloudinary, cloudinaryFolder } = require('../config/cloudinary');

const initialsAvatarUrl = (name) => `/avatars/initials.svg?name=${encodeURIComponent(name || '')}`;

const isGooglePhoto = (url) => /^https:\/\/[^/]*googleusercontent\.com\//i.test(url || '');

// Google profile photos are served from googleusercontent.com, which some phones and
// networks block. Cloudinary fetches the photo server-side, so the copy we store loads
// for every visitor.
async function copyPhotoToCloudinary(url, key) {
  // Google links end in "=s96-c" (a 96px thumbnail); ask for the 400px version instead.
  const source = isGooglePhoto(url) ? url.replace(/=s\d+(-c)?$/, '=s400-c') : url;
  const result = await cloudinary.uploader.upload(source, {
    folder:         cloudinaryFolder('avatars'),
    public_id:      `google-${key}`,
    overwrite:      true,
    transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
  });
  return result.secure_url;
}

// Never let a Cloudinary hiccup break sign-in: fall back to the original URL.
async function hostedGooglePhoto(url, key) {
  try {
    return await copyPhotoToCloudinary(url, key);
  } catch (err) {
    console.error(`[avatar] could not copy Google photo for ${key}:`, err.message);
    return url;
  }
}

module.exports = { initialsAvatarUrl, isGooglePhoto, copyPhotoToCloudinary, hostedGooglePhoto };

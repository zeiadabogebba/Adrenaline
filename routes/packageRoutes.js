const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController');
const { protect, authorize } = require('../middleware/auth');
const { uploadPackageImage } = require('../middleware/upload');
const { validatePackage } = require('../middleware/validate');

router.get('/',   packageController.getAllPackages);
router.get('/:id', packageController.getPackage);

router.post('/',          protect, authorize('Admin'), validatePackage,    packageController.createPackage);
router.put('/:id',        protect, authorize('Admin'),                     packageController.updatePackage);
router.delete('/:id',     protect, authorize('Admin'),                     packageController.deletePackage);
router.post('/:id/image', protect, authorize('Admin'), uploadPackageImage, packageController.uploadPackageImage);

module.exports = router;

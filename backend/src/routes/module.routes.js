const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/module.controller');

router.get('/', moduleController.getAllModules);
router.get('/:id', moduleController.getModuleById);

module.exports = router;


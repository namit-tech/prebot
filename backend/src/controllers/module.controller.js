const Module = require('../models/Module');
const { asyncHandler } = require('../utils/helpers');

class ModuleController {
  getAllModules = asyncHandler(async (req, res) => {
    const modules = await Module.find({ isActive: true });

    res.json({
      success: true,
      data: modules
    });
  });

  getModuleById = asyncHandler(async (req, res) => {
    const module = await Module.findOne({ id: req.params.id, isActive: true });

    if (!module) {
      return res.status(404).json({
        success: false,
        error: 'Module not found'
      });
    }

    res.json({
      success: true,
      data: module
    });
  });
}

module.exports = new ModuleController();


const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Validation Failed:', errors.array());
    console.log('📩 Request Body:', req.body);
    return res.status(400).json({
      success: false,
      error: errors.array()[0]?.msg || 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

module.exports = { validate };


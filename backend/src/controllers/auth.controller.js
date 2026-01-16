const authService = require('../services/auth.service');
const { asyncHandler } = require('../utils/helpers');

class AuthController {
  login = asyncHandler(async (req, res) => {
    const { email, password, hardwareId } = req.body;

    const result = await authService.login(email, password);

    // Hardware ID Locking Logic
    if (hardwareId && result.user.role !== 'superadmin') {
        const user = await require('../models/User').findById(result.user.id);
        
        if (!user.hardwareId) {
            // First time login - Bind device
            user.hardwareId = hardwareId;
            await user.save();
            console.log(`🔒 Device bound for ${email}: ${hardwareId}`);
        } else if (user.hardwareId !== hardwareId) {
            // Mismatch - Block access
            return res.status(403).json({
                success: false,
                error: 'Access Denied: Account is locked to a different device.'
            });
        }
    }

    res.json({
      success: true,
      data: result
    });
  });

  validateToken = asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const result = await authService.validateToken(token);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        user: result.user,
        subscription: result.subscription
      }
    });
  });
}

module.exports = new AuthController();


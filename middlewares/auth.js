import jwt from 'jsonwebtoken';
import { usersCollection } from '../config/db.js';
import { ObjectId } from 'mongodb';

const JWT_SECRET = process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || 'pizzahub-secret-key-fallback';

/**
 * Generate a signed JWT token for an authenticated user
 * @param {Object} payload User payload containing id, email, role, etc.
 * @returns {string} Signed JWT token
 */
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Middleware: Verify JWT token from request header
 * Protects private API routes and blocks unauthorized / expired requests
 */
export async function verifyJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authorization token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Token is missing.',
      });
    }

    // Verify token validity and expiration
    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized. Invalid or expired token.',
        });
      }

      // Check if user is blocked in the database
      if (usersCollection && decoded.email) {
        const dbUser = await usersCollection.findOne({ email: decoded.email });
        if (dbUser && dbUser.isBlocked) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden. Your account has been suspended or blocked by an administrator.',
          });
        }
      }

      // Attach authenticated user information to request
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('[Auth Middleware] Verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication verification.',
    });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware factory
 * @param  {...string} roles Allowed roles ('admin', 'vendor', 'customer')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Authentication is required.',
      });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const normalizedRoles = roles.map((r) => r.toLowerCase());

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. This action requires one of the following roles: [${roles.join(', ')}]. Your role is '${userRole}'.`,
      });
    }

    next();
  };
}

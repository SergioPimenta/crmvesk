import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).json({ message: 'No token provided' });
  }

  // Expecting format: Bearer <token>
  const tokenParts = token.split(' ');
  if (tokenParts[0] !== 'Bearer' || !tokenParts[1]) {
    return res.status(401).json({ message: 'Unauthorized - invalid token format' });
  }

  jwt.verify(tokenParts[1], process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Unauthorized - invalid token' });
    }
    
    // Save user id for use in other routes
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  });
};

export const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Acesso restrito a administradores' });
  }
  return next();
};

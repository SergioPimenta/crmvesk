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

    // authUserId = identidade real de quem logou (para "sou eu mesmo?", subscriptions de push etc.)
    // userId = id do workspace/conta (dono original convidou membros) — usado para escopar todos os
    // dados do CRM (leads, pipeline, whatsapp, relatórios), que agora são compartilhados pela conta.
    // Tokens antigos (emitidos antes dos workspaces) não têm accountId: caem no próprio id.
    req.authUserId = decoded.id;
    req.userId = decoded.accountId ?? decoded.id;
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

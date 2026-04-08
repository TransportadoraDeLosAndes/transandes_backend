import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const verificarToken = (req: Request, res: Response, next: NextFunction) => {
  // 1. Buscamos el token en la cabecera de la petición
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // El formato es "Bearer <token>"

  // 2. Si no hay token, lo rechazamos
  if (!token) {
    res.status(401).json({ mensaje: "Acceso denegado. Se requiere un token." });
    return;
  }

  // 3. Verificamos que el token sea auténtico y no haya expirado
  try {
    const verificado = jwt.verify(token, process.env.JWT_SECRET as string);
    (req as any).admin = verificado; // Guardamos los datos del admin en la request
    next(); // Le damos paso a la siguiente función
  } catch (error) {
    res.status(403).json({ mensaje: "Token inválido o expirado." });
  }
};
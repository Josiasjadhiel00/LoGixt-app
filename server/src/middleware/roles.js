/**
 * Middleware para restringir endpoints a ciertos roles.
 * @param  {...string} roles Roles permitidos ('ADMINISTRADOR', 'ALMACENERO')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    if (req.user.rol === 'SUPERADMIN' || roles.includes(req.user.rol)) {
      return next();
    }

    return res.status(403).json({
      error: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}.`
    });
  };
}

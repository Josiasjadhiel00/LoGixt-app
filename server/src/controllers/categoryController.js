import db from '../db/connection.js';

export function getAllCategories(req, res) {
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';
  if (!isSuperAdmin && !req.user.empresa_id) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario no asignado a ninguna empresa.' });
  }

  const targetEmpresaId = isSuperAdmin && req.query.empresa_id
    ? Number(req.query.empresa_id)
    : (isSuperAdmin ? null : req.user.empresa_id);

  try {
    let sql = `
      SELECT 
        c.id, c.nombre, c.descripcion, c.prefijo, c.imagen, c.empresa_id,
        COUNT(p.id) AS total_productos,
        COALESCE(SUM(p.stock_actual), 0) AS total_unidades,
        COUNT(CASE WHEN p.stock_actual <= p.stock_minimo THEN 1 END) AS productos_alerta
      FROM categorias c
      LEFT JOIN productos p ON c.id = p.categoria_id AND p.empresa_id = c.empresa_id
    `;
    const params = [];

    if (targetEmpresaId) {
      sql += ' WHERE c.empresa_id = ?';
      params.push(targetEmpresaId);
    }

    sql += ' GROUP BY c.id ORDER BY c.nombre ASC';

    const categories = db.prepare(sql).all(...params);
    return res.json({ categories });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al obtener categorías.',
      ...(process.env.NODE_ENV !== 'production' ? { details: error.message } : {})
    });
  }
}

export function createCategory(req, res) {
  const { nombre, descripcion, prefijo, imagen } = req.body;
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuperAdmin && req.body.empresa_id
    ? Number(req.body.empresa_id)
    : req.user.empresa_id;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
  }

  if (!empresaId) {
    return res.status(400).json({ error: 'Debe pertenecer a una empresa para crear categorías.' });
  }

  const cleanPrefix = prefijo && prefijo.trim() ? prefijo.trim().toUpperCase() : nombre.trim().slice(0, 3).toUpperCase();

  try {
    const existing = db.prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?) AND empresa_id = ?').get(nombre.trim(), empresaId);
    if (existing) {
      return res.status(400).json({ error: `La categoría "${nombre.trim()}" ya existe en su empresa.` });
    }

    const result = db.prepare('INSERT INTO categorias (nombre, descripcion, prefijo, imagen, empresa_id) VALUES (?, ?, ?, ?, ?)').run(
      nombre.trim(),
      descripcion ? descripcion.trim() : null,
      cleanPrefix,
      imagen ? imagen.trim() : null,
      empresaId
    );

    const created = db.prepare('SELECT * FROM categorias WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ message: 'Categoría creada con éxito.', category: created });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al crear la categoría.',
      ...(process.env.NODE_ENV !== 'production' ? { details: error.message } : {})
    });
  }
}

export function updateCategory(req, res) {
  const { id } = req.params;
  const { nombre, descripcion, prefijo, imagen } = req.body;
  const empresaId = req.user.rol === 'SUPERADMIN' ? null : req.user.empresa_id;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
  }

  const cleanPrefix = prefijo && prefijo.trim() ? prefijo.trim().toUpperCase() : null;

  try {
    let checkQuery = 'SELECT id, empresa_id FROM categorias WHERE id = ?';
    const checkParams = [id];
    if (empresaId) {
      checkQuery += ' AND empresa_id = ?';
      checkParams.push(empresaId);
    }

    const existing = db.prepare(checkQuery).get(...checkParams);
    if (!existing) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    const duplicate = db.prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?) AND id != ? AND empresa_id = ?').get(
      nombre.trim(),
      id,
      existing.empresa_id
    );

    if (duplicate) {
      return res.status(400).json({ error: `Ya existe otra categoría con el nombre "${nombre.trim()}".` });
    }

    db.prepare(`
      UPDATE categorias SET
        nombre = ?,
        descripcion = ?,
        prefijo = COALESCE(?, prefijo),
        imagen = COALESCE(?, imagen)
      WHERE id = ?
    `).run(
      nombre.trim(),
      descripcion ? descripcion.trim() : null,
      cleanPrefix,
      imagen ? imagen.trim() : null,
      id
    );

    const updated = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
    return res.json({ message: 'Categoría actualizada con éxito.', category: updated });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al actualizar categoría.',
      ...(process.env.NODE_ENV !== 'production' ? { details: error.message } : {})
    });
  }
}

export function deleteCategory(req, res) {
  const { id } = req.params;
  const isSuperAdmin = req.user.rol === 'SUPERADMIN';
  const empresaId = req.user.empresa_id;

  try {
    const category = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada.' });
    }

    if (!isSuperAdmin && category.empresa_id && category.empresa_id !== empresaId) {
      return res.status(403).json({ error: 'No tienes autorización para eliminar esta categoría.' });
    }

    // Reasignar productos que tuvieran esta categoría a NULL
    db.prepare('UPDATE productos SET categoria_id = NULL WHERE categoria_id = ?').run(id);

    // Eliminar categoría
    db.prepare('DELETE FROM categorias WHERE id = ?').run(id);

    return res.json({
      ok: true,
      message: `Categoría "${category.nombre}" eliminada exitosamente.`
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al eliminar la categoría.',
      ...(process.env.NODE_ENV !== 'production' ? { details: error.message } : {})
    });
  }
}

import db, { transaction } from '../db/connection.js';

export function getAllProducts(req, res) {
  const { search, categoria_id, estado, sort_by } = req.query;
  const isSuper = req.user.rol === 'SUPERADMIN';
  let empresaId = null;

  if (isSuper) {
    if (req.query.empresa_id) {
      empresaId = Number(req.query.empresa_id);
    }
  } else {
    empresaId = req.user.empresa_id;
    if (!empresaId) {
      return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
    }
  }

  let query = `
    SELECT 
      p.id, p.codigo, p.codigo_barras, p.codigo_qr, p.nombre,
      p.categoria_id, c.nombre AS categoria_nombre,
      p.descripcion, p.unidad_medida, p.stock_actual, p.stock_minimo,
      p.ubicacion_almacen, p.ubicacion_pasillo, p.ubicacion_estante, p.ubicacion_nivel,
      p.proveedor, p.imagen, p.empresa_id, p.fecha_creacion, p.fecha_actualizacion,
      CASE 
        WHEN p.stock_actual = 0 THEN 'AGOTADO'
        WHEN p.stock_actual <= p.stock_minimo THEN 'STOCK BAJO'
        ELSE 'DISPONIBLE'
      END AS estado
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE 1=1
  `;
  const params = [];

  // Aislamiento Multi-Tenant
  if (empresaId) {
    query += ' AND p.empresa_id = ?';
    params.push(empresaId);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (
      p.codigo LIKE ? OR 
      p.codigo_barras LIKE ? OR 
      p.codigo_qr LIKE ? OR 
      p.nombre LIKE ? OR 
      p.descripcion LIKE ? OR 
      p.ubicacion_pasillo LIKE ? OR 
      p.ubicacion_estante LIKE ? OR
      c.nombre LIKE ?
    )`;
    params.push(term, term, term, term, term, term, term, term);
  }

  if (categoria_id) {
    query += ' AND p.categoria_id = ?';
    params.push(Number(categoria_id));
  }

  if (estado) {
    const est = estado.toLowerCase();
    if (est === 'agotado') {
      query += ' AND p.stock_actual = 0';
    } else if (est === 'bajo' || est === 'stock bajo') {
      query += ' AND p.stock_actual > 0 AND p.stock_actual <= p.stock_minimo';
    } else if (est === 'disponible') {
      query += ' AND p.stock_actual > p.stock_minimo';
    }
  }

  // Ordenamiento
  if (sort_by === 'stock_asc') {
    query += ' ORDER BY p.stock_actual ASC';
  } else if (sort_by === 'stock_desc') {
    query += ' ORDER BY p.stock_actual DESC';
  } else if (sort_by === 'nombre') {
    query += ' ORDER BY p.nombre ASC';
  } else {
    query += ' ORDER BY p.fecha_actualizacion DESC';
  }

  const products = db.prepare(query).all(...params);
  return res.json({ products, total: products.length });
}

export function getProductById(req, res) {
  const { id } = req.params;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? (req.query.empresa_id ? Number(req.query.empresa_id) : null) : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  let query = `
    SELECT 
      p.*,
      c.nombre AS categoria_nombre,
      CASE 
        WHEN p.stock_actual = 0 THEN 'AGOTADO'
        WHEN p.stock_actual <= p.stock_minimo THEN 'STOCK BAJO'
        ELSE 'DISPONIBLE'
      END AS estado
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.id = ?
  `;
  const params = [id];

  if (empresaId) {
    query += ' AND p.empresa_id = ?';
    params.push(empresaId);
  }

  const product = db.prepare(query).get(...params);

  if (!product) {
    return res.status(404).json({ error: 'Producto no encontrado en el catálogo de su empresa.' });
  }

  // Obtener últimos movimientos de este producto
  let movQuery = `
    SELECT m.*, u.nombre AS usuario_nombre
    FROM movimientos m
    JOIN usuarios u ON m.usuario_id = u.id
    WHERE m.producto_id = ?
  `;
  const movParams = [id];

  if (empresaId) {
    movQuery += ' AND m.empresa_id = ?';
    movParams.push(empresaId);
  }

  movQuery += ' ORDER BY m.fecha DESC, m.hora DESC LIMIT 10';

  const movements = db.prepare(movQuery).all(...movParams);

  return res.json({ product, movements });
}

export function lookupProductByCode(req, res) {
  const rawCode = req.params.code || req.query.code;

  if (!rawCode || !rawCode.trim()) {
    return res.status(400).json({ error: 'Debe ingresar o escanear un código.' });
  }

  const code = rawCode.trim();
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? (req.query.empresa_id ? Number(req.query.empresa_id) : null) : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  let query = `
    SELECT 
      p.*,
      c.nombre AS categoria_nombre,
      CASE 
        WHEN p.stock_actual = 0 THEN 'AGOTADO'
        WHEN p.stock_actual <= p.stock_minimo THEN 'STOCK BAJO'
        ELSE 'DISPONIBLE'
      END AS estado
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE (LOWER(p.codigo) = LOWER(?) OR p.codigo_barras = ? OR p.codigo_qr = ?)
  `;
  const params = [code, code, code];

  if (empresaId) {
    query += ' AND p.empresa_id = ?';
    params.push(empresaId);
  }

  query += ' LIMIT 1';

  const product = db.prepare(query).get(...params);

  if (!product) {
    return res.status(404).json({
      error: `No se encontró ningún producto con el código escaneado: "${code}" en su almacén.`
    });
  }

  return res.json({ product });
}

export function createProduct(req, res) {
  const {
    codigo,
    codigo_barras,
    codigo_qr,
    nombre,
    categoria_id,
    descripcion,
    unidad_medida,
    stock_inicial,
    stock_minimo,
    ubicacion_almacen,
    ubicacion_pasillo,
    ubicacion_estante,
    ubicacion_nivel,
    proveedor,
    imagen
  } = req.body;

  if (!codigo || !nombre) {
    return res.status(400).json({ error: 'El código interno y el nombre del producto son obligatorios.' });
  }

  const empresaId = req.user.rol === 'SUPERADMIN' && req.body.empresa_id
    ? Number(req.body.empresa_id)
    : req.user.empresa_id;

  if (!empresaId) {
    return res.status(400).json({ error: 'Debe pertenecer a una empresa para registrar productos.' });
  }

  const cleanCodigo = codigo.trim().toUpperCase();
  const cleanQR = (codigo_qr && codigo_qr.trim())
    ? codigo_qr.trim()
    : `WMS-${cleanCodigo}-${Date.now().toString(36).toUpperCase()}`;

  // Verificar unicidad de código interno dentro de la empresa
  const existingCode = db.prepare('SELECT id FROM productos WHERE LOWER(codigo) = LOWER(?) AND empresa_id = ?').get(cleanCodigo, empresaId);
  if (existingCode) {
    return res.status(400).json({ error: `Ya existe un producto con el código "${cleanCodigo}" en su empresa.` });
  }

  // Verificar unicidad de código QR dentro de la empresa
  const existingQR = db.prepare('SELECT id FROM productos WHERE codigo_qr = ? AND empresa_id = ?').get(cleanQR, empresaId);
  if (existingQR) {
    return res.status(400).json({ error: `El código QR "${cleanQR}" ya se encuentra asignado a otro producto en su empresa.` });
  }

  const initialStock = Math.max(0, parseInt(stock_inicial, 10) || 0);
  const minStock = Math.max(0, parseInt(stock_minimo, 10) || 5);

  try {
    const result = transaction((db) => {
      const insert = db.prepare(`
        INSERT INTO productos (
          codigo, codigo_barras, codigo_qr, nombre, categoria_id, descripcion,
          unidad_medida, stock_actual, stock_minimo, ubicacion_almacen,
          ubicacion_pasillo, ubicacion_estante, ubicacion_nivel, proveedor, imagen, empresa_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const prodRes = insert.run(
        cleanCodigo,
        codigo_barras ? codigo_barras.trim() : null,
        cleanQR,
        nombre.trim(),
        categoria_id ? Number(categoria_id) : null,
        descripcion ? descripcion.trim() : null,
        unidad_medida ? unidad_medida.trim() : 'Unidades',
        initialStock,
        minStock,
        ubicacion_almacen ? ubicacion_almacen.trim() : 'Almacén Principal',
        ubicacion_pasillo ? ubicacion_pasillo.trim() : null,
        ubicacion_estante ? ubicacion_estante.trim() : null,
        ubicacion_nivel ? ubicacion_nivel.trim() : null,
        proveedor ? proveedor.trim() : null,
        imagen ? imagen.trim() : null,
        empresaId
      );

      const productId = Number(prodRes.lastInsertRowid);

      // Si se definió un stock inicial mayor a 0, registrar automáticamente el movimiento de INGRESO
      if (initialStock > 0) {
        const now = new Date();
        const fecha = now.toISOString().split('T')[0];
        const hora = now.toTimeString().split(' ')[0];

        db.prepare(`
          INSERT INTO movimientos (
            producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
            usuario_id, observacion, fecha, hora, empresa_id
          ) VALUES (?, 'INGRESO', ?, 0, ?, ?, 'Registro de stock inicial al crear producto', ?, ?, ?)
        `).run(productId, initialStock, initialStock, req.user.id, fecha, hora, empresaId);
      }

      return productId;
    });

    const created = db.prepare('SELECT * FROM productos WHERE id = ?').get(result);
    return res.status(201).json({ message: 'Producto registrado exitosamente.', product: created });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al registrar el producto.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

export function updateProduct(req, res) {
  const { id } = req.params;
  const {
    codigo_barras,
    codigo_qr,
    nombre,
    categoria_id,
    descripcion,
    unidad_medida,
    stock_minimo,
    ubicacion_almacen,
    ubicacion_pasillo,
    ubicacion_estante,
    ubicacion_nivel,
    proveedor,
    imagen
  } = req.body;

  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  let checkQuery = 'SELECT id, empresa_id FROM productos WHERE id = ?';
  const checkParams = [id];
  if (empresaId) {
    checkQuery += ' AND empresa_id = ?';
    checkParams.push(empresaId);
  }

  const current = db.prepare(checkQuery).get(...checkParams);
  if (!current) {
    return res.status(404).json({ error: 'Producto no encontrado en su catálogo.' });
  }

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del producto no puede estar vacío.' });
  }

  // Verificar QR único si se actualiza dentro de la misma empresa
  if (codigo_qr && codigo_qr.trim()) {
    const existingQR = db.prepare('SELECT id FROM productos WHERE codigo_qr = ? AND id != ? AND empresa_id = ?').get(codigo_qr.trim(), id, current.empresa_id);
    if (existingQR) {
      return res.status(400).json({ error: 'El código QR ya está en uso por otro producto de su empresa.' });
    }
  }

  try {
    db.prepare(`
      UPDATE productos SET
        codigo_barras = ?,
        codigo_qr = COALESCE(?, codigo_qr),
        nombre = ?,
        categoria_id = ?,
        descripcion = ?,
        unidad_medida = ?,
        stock_minimo = ?,
        ubicacion_almacen = ?,
        ubicacion_pasillo = ?,
        ubicacion_estante = ?,
        ubicacion_nivel = ?,
        proveedor = ?,
        imagen = ?,
        fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      codigo_barras ? codigo_barras.trim() : null,
      codigo_qr ? codigo_qr.trim() : null,
      nombre.trim(),
      categoria_id ? Number(categoria_id) : null,
      descripcion ? descripcion.trim() : null,
      unidad_medida ? unidad_medida.trim() : 'Unidades',
      Math.max(0, parseInt(stock_minimo, 10) || 0),
      ubicacion_almacen ? ubicacion_almacen.trim() : 'Almacén Principal',
      ubicacion_pasillo ? ubicacion_pasillo.trim() : null,
      ubicacion_estante ? ubicacion_estante.trim() : null,
      ubicacion_nivel ? ubicacion_nivel.trim() : null,
      proveedor ? proveedor.trim() : null,
      imagen ? imagen.trim() : null,
      id
    );

    const updated = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
    return res.json({ message: 'Producto actualizado con éxito.', product: updated });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al actualizar el producto.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

export function deleteProduct(req, res) {
  const { id } = req.params;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  let query = 'SELECT id, nombre, codigo, empresa_id FROM productos WHERE id = ?';
  const params = [id];
  if (empresaId) {
    query += ' AND empresa_id = ?';
    params.push(empresaId);
  }

  const product = db.prepare(query).get(...params);
  if (!product) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  // Validar si tiene movimientos en el historial
  const movementCount = db.prepare('SELECT COUNT(*) as count FROM movimientos WHERE producto_id = ?').get(id).count;
  if (movementCount > 0) {
    return res.status(400).json({
      error: `No es posible eliminar el producto "${product.nombre}" (${product.codigo}) porque cuenta con ${movementCount} movimientos registrados en el historial de trazabilidad.`
    });
  }

  try {
    db.prepare('DELETE FROM productos WHERE id = ?').run(id);
    return res.json({ message: `Producto "${product.nombre}" eliminado correctamente.` });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al eliminar el producto.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

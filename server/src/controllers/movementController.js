import db, { transaction } from '../db/connection.js';

export function getAllMovements(req, res) {
  const { producto_id, tipo, usuario_id, fecha_desde, fecha_hasta, search, limit } = req.query;
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
      m.id, m.producto_id, m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo,
      m.usuario_id, m.destino, m.motivo_ajuste, m.guia_despacho, m.responsable_recepcion,
      m.observacion, m.fecha, m.hora, m.empresa_id, m.fecha_creacion,
      p.nombre AS producto_nombre, p.codigo AS producto_codigo, p.unidad_medida,
      p.ubicacion_almacen, p.ubicacion_pasillo, p.ubicacion_estante, p.ubicacion_nivel,
      p.imagen AS producto_imagen,
      u.nombre AS usuario_nombre, u.usuario AS usuario_username
    FROM movimientos m
    JOIN productos p ON m.producto_id = p.id
    JOIN usuarios u ON m.usuario_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (empresaId) {
    query += ' AND m.empresa_id = ?';
    params.push(empresaId);
  }

  if (producto_id) {
    query += ' AND m.producto_id = ?';
    params.push(Number(producto_id));
  }

  if (tipo) {
    query += ' AND UPPER(m.tipo) = UPPER(?)';
    params.push(tipo.trim());
  }

  if (usuario_id) {
    query += ' AND m.usuario_id = ?';
    params.push(Number(usuario_id));
  }

  if (fecha_desde) {
    query += ' AND m.fecha >= ?';
    params.push(fecha_desde.trim());
  }

  if (fecha_hasta) {
    query += ' AND m.fecha <= ?';
    params.push(fecha_hasta.trim());
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ' AND (p.nombre LIKE ? OR p.codigo LIKE ? OR m.destino LIKE ? OR m.observacion LIKE ? OR u.nombre LIKE ? OR m.guia_despacho LIKE ? OR m.responsable_recepcion LIKE ?)';
    params.push(term, term, term, term, term, term, term);
  }

  const limitCount = limit ? parseInt(limit, 10) : 200;
  query += ` ORDER BY m.fecha DESC, m.hora DESC, m.id DESC LIMIT ${limitCount}`;

  const movements = db.prepare(query).all(...params);
  return res.json({ movements, total: movements.length });
}

export function getMovementById(req, res) {
  const { id } = req.params;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? (req.query.empresa_id ? Number(req.query.empresa_id) : null) : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  let query = `
    SELECT 
      m.*,
      p.nombre AS producto_nombre, p.codigo AS producto_codigo, p.unidad_medida,
      p.ubicacion_almacen, p.ubicacion_pasillo, p.ubicacion_estante, p.ubicacion_nivel,
      p.imagen AS producto_imagen,
      u.nombre AS usuario_nombre, u.usuario AS usuario_username
    FROM movimientos m
    JOIN productos p ON m.producto_id = p.id
    JOIN usuarios u ON m.usuario_id = u.id
    WHERE m.id = ?
  `;
  const params = [id];

  if (empresaId) {
    query += ' AND m.empresa_id = ?';
    params.push(empresaId);
  }

  const movement = db.prepare(query).get(...params);

  if (!movement) {
    return res.status(404).json({ error: 'Movimiento no encontrado.' });
  }

  return res.json({ movement });
}

/**
 * 📥 REGISTRAR INGRESO DE PRODUCTOS
 */
export function registerInbound(req, res) {
  const { producto_id, cantidad, observacion, proveedor, guia_despacho } = req.body;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  if (!producto_id) {
    return res.status(400).json({ error: 'Debe especificar el producto para el ingreso.' });
  }

  const cant = parseInt(cantidad, 10);
  if (isNaN(cant) || cant <= 0) {
    return res.status(400).json({ error: 'La cantidad a ingresar debe ser un número entero positivo mayor a cero.' });
  }

  try {
    const result = transaction((db) => {
      // 1. Obtener producto y validar pertenencia a la empresa
      let prodQuery = 'SELECT id, nombre, codigo, stock_actual, unidad_medida, empresa_id FROM productos WHERE id = ?';
      const prodParams = [producto_id];
      if (empresaId) {
        prodQuery += ' AND empresa_id = ?';
        prodParams.push(empresaId);
      }

      const product = db.prepare(prodQuery).get(...prodParams);
      if (!product) {
        throw new Error('El producto especificado no existe en su almacén.');
      }

      const targetEmpresaId = product.empresa_id || req.user.empresa_id;
      const stockAnterior = product.stock_actual;
      const stockNuevo = stockAnterior + cant;

      // 2. Actualizar stock del producto
      db.prepare(`
        UPDATE productos 
        SET stock_actual = ?, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(stockNuevo, product.id);

      // Si se proporcionó un proveedor, actualizarlo opcionalmente
      if (proveedor && proveedor.trim()) {
        db.prepare('UPDATE productos SET proveedor = ? WHERE id = ?').run(proveedor.trim(), product.id);
      }

      // 3. Registrar movimiento inmutable
      const now = new Date();
      const fecha = now.toISOString().split('T')[0];
      const hora = now.toTimeString().split(' ')[0];

      const movRes = db.prepare(`
        INSERT INTO movimientos (
          producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
          usuario_id, observacion, guia_despacho, fecha, hora, empresa_id
        ) VALUES (?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        product.id,
        cant,
        stockAnterior,
        stockNuevo,
        req.user.id,
        observacion ? observacion.trim() : null,
        guia_despacho ? guia_despacho.trim() : null,
        fecha,
        hora,
        targetEmpresaId
      );

      return {
        movementId: Number(movRes.lastInsertRowid),
        producto: product.nombre,
        codigo: product.codigo,
        stock_anterior: stockAnterior,
        cantidad_ingresada: cant,
        stock_nuevo: stockNuevo,
        unidad_medida: product.unidad_medida
      };
    });

    return res.status(201).json({
      message: `Ingreso confirmado: Se sumaron ${cant} unidades al producto "${result.producto}". Nuevo stock: ${result.stock_nuevo}.`,
      data: result
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Error al procesar el ingreso de producto.' });
  }
}

/**
 * 📤 REGISTRAR DESPACHO DE PRODUCTOS
 */
export function registerOutbound(req, res) {
  const { producto_id, cantidad, destino, observacion, responsable_recepcion, guia_despacho } = req.body;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  if (!producto_id) {
    return res.status(400).json({ error: 'Debe especificar el producto para el despacho.' });
  }

  const cant = parseInt(cantidad, 10);
  if (isNaN(cant) || cant <= 0) {
    return res.status(400).json({ error: 'La cantidad a despachar debe ser un número entero positivo mayor a cero.' });
  }

  try {
    const result = transaction((db) => {
      // 1. Obtener producto y validar pertenencia a la empresa
      let prodQuery = 'SELECT id, nombre, codigo, stock_actual, unidad_medida, empresa_id FROM productos WHERE id = ?';
      const prodParams = [producto_id];
      if (empresaId) {
        prodQuery += ' AND empresa_id = ?';
        prodParams.push(empresaId);
      }

      const product = db.prepare(prodQuery).get(...prodParams);
      if (!product) {
        throw new Error('El producto especificado no existe en su almacén.');
      }

      if (product.stock_actual < cant) {
        throw new Error(
          `Stock insuficiente para el producto "${product.nombre}" (${product.codigo}). Existencias disponibles: ${product.stock_actual}, Cantidad solicitada: ${cant}.`
        );
      }

      const targetEmpresaId = product.empresa_id || req.user.empresa_id;
      const stockAnterior = product.stock_actual;
      const stockNuevo = stockAnterior - cant;

      // 2. Actualizar stock del producto
      db.prepare(`
        UPDATE productos 
        SET stock_actual = ?, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(stockNuevo, product.id);

      // 3. Registrar movimiento inmutable
      const now = new Date();
      const fecha = now.toISOString().split('T')[0];
      const hora = now.toTimeString().split(' ')[0];

      const movRes = db.prepare(`
        INSERT INTO movimientos (
          producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
          usuario_id, destino, observacion, guia_despacho, responsable_recepcion, fecha, hora, empresa_id
        ) VALUES (?, 'DESPACHO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        product.id,
        cant,
        stockAnterior,
        stockNuevo,
        req.user.id,
        destino ? destino.trim() : null,
        observacion ? observacion.trim() : null,
        guia_despacho ? guia_despacho.trim() : null,
        responsable_recepcion ? responsable_recepcion.trim() : null,
        fecha,
        hora,
        targetEmpresaId
      );

      return {
        movementId: Number(movRes.lastInsertRowid),
        producto: product.nombre,
        codigo: product.codigo,
        stock_anterior: stockAnterior,
        cantidad_despachada: cant,
        stock_nuevo: stockNuevo,
        destino: destino || 'No especificado',
        responsable: responsable_recepcion || 'No especificado',
        unidad_medida: product.unidad_medida
      };
    });

    return res.status(201).json({
      message: `Despacho confirmado: Se restaron ${cant} unidades del producto "${result.producto}". Nuevo stock: ${result.stock_nuevo}.`,
      data: result
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Error al procesar el despacho de producto.' });
  }
}

/**
 * ⚖️ REGISTRAR AJUSTE DE INVENTARIO
 */
export function registerAdjustment(req, res) {
  const { producto_id, stock_nuevo, motivo_ajuste, observacion } = req.body;
  const isSuper = req.user.rol === 'SUPERADMIN';
  const empresaId = isSuper ? null : req.user.empresa_id;

  if (!isSuper && !empresaId) {
    return res.status(403).json({ error: 'Acceso denegado: Usuario sin empresa asociada.' });
  }

  if (!producto_id) {
    return res.status(400).json({ error: 'Debe especificar el producto para el ajuste.' });
  }

  const newStock = parseInt(stock_nuevo, 10);
  if (isNaN(newStock) || newStock < 0) {
    return res.status(400).json({ error: 'El nuevo stock debe ser un número entero mayor o igual a cero.' });
  }

  if (!motivo_ajuste || !motivo_ajuste.trim()) {
    return res.status(400).json({
      error: 'El motivo del ajuste es estrictamente obligatorio (ej. Producto dañado, Diferencia en conteo, Pérdida, Corrección).'
    });
  }

  try {
    const result = transaction((db) => {
      let prodQuery = 'SELECT id, nombre, codigo, stock_actual, unidad_medida, empresa_id FROM productos WHERE id = ?';
      const prodParams = [producto_id];
      if (empresaId) {
        prodQuery += ' AND empresa_id = ?';
        prodParams.push(empresaId);
      }

      const product = db.prepare(prodQuery).get(...prodParams);
      if (!product) {
        throw new Error('El producto especificado no existe en su almacén.');
      }

      const targetEmpresaId = product.empresa_id || req.user.empresa_id;
      const stockAnterior = product.stock_actual;
      const diferencia = newStock - stockAnterior;

      if (diferencia === 0) {
        throw new Error('El nuevo stock ingresado es idéntico al stock actual. No se requiere ajuste.');
      }

      // Actualizar producto
      db.prepare(`
        UPDATE productos 
        SET stock_actual = ?, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStock, product.id);

      // Registrar movimiento de ajuste
      const now = new Date();
      const fecha = now.toISOString().split('T')[0];
      const hora = now.toTimeString().split(' ')[0];

      const movRes = db.prepare(`
        INSERT INTO movimientos (
          producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
          usuario_id, motivo_ajuste, observacion, fecha, hora, empresa_id
        ) VALUES (?, 'AJUSTE', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        product.id,
        Math.abs(diferencia),
        stockAnterior,
        newStock,
        req.user.id,
        motivo_ajuste.trim(),
        observacion ? observacion.trim() : null,
        fecha,
        hora,
        targetEmpresaId
      );

      return {
        movementId: Number(movRes.lastInsertRowid),
        producto: product.nombre,
        codigo: product.codigo,
        stock_anterior: stockAnterior,
        stock_nuevo: newStock,
        diferencia,
        motivo: motivo_ajuste.trim()
      };
    });

    return res.status(201).json({
      message: `Ajuste de inventario aplicado exitosamente para "${result.producto}". Diferencia: ${result.diferencia > 0 ? '+' : ''}${result.diferencia}. Nuevo stock: ${result.stock_nuevo}.`,
      data: result
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Error al procesar el ajuste de inventario.' });
  }
}

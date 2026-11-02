import db from '../db/connection.js';

export function getDashboardSummary(req, res) {
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

  try {
    // 1. Métricas KPI filtradas por empresa
    const empWhere = empresaId ? 'WHERE empresa_id = ?' : 'WHERE 1=1';
    const empParam = empresaId ? [empresaId] : [];

    const totalProductos = db.prepare(`SELECT COUNT(*) as count FROM productos ${empWhere}`).get(...empParam).count;
    const totalExistencias = db.prepare(`SELECT COALESCE(SUM(stock_actual), 0) as total FROM productos ${empWhere}`).get(...empParam).total;
    
    const stockBajoWhere = empresaId 
      ? 'WHERE stock_actual > 0 AND stock_actual <= stock_minimo AND empresa_id = ?'
      : 'WHERE stock_actual > 0 AND stock_actual <= stock_minimo';
    const stockBajoCount = db.prepare(`SELECT COUNT(*) as count FROM productos ${stockBajoWhere}`).get(...empParam).count;

    const agotadosWhere = empresaId 
      ? 'WHERE stock_actual = 0 AND empresa_id = ?'
      : 'WHERE stock_actual = 0';
    const agotadosCount = db.prepare(`SELECT COUNT(*) as count FROM productos ${agotadosWhere}`).get(...empParam).count;

    // Disponibilidad porcentual estimada
    const totalPosibles = totalProductos > 0 ? ((totalProductos - agotadosCount) / totalProductos) * 100 : 100;
    const disponibilidadPorcentaje = Number(totalPosibles.toFixed(1));

    // 2. Últimos movimientos generales
    let movWhere = 'WHERE 1=1';
    if (empresaId) movWhere += ' AND m.empresa_id = ?';

    const ultimosMovimientos = db.prepare(`
      SELECT 
        m.id, m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo,
        m.fecha, m.hora, m.destino, m.motivo_ajuste, m.guia_despacho, m.responsable_recepcion,
        p.nombre AS producto_nombre, p.codigo AS producto_codigo, p.unidad_medida,
        p.imagen AS producto_imagen,
        u.nombre AS usuario_nombre
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      JOIN usuarios u ON m.usuario_id = u.id
      ${movWhere}
      ORDER BY m.fecha DESC, m.hora DESC, m.id DESC
      LIMIT 10
    `).all(...empParam);

    // 3. Últimos ingresos específicos
    let ingWhere = "WHERE m.tipo = 'INGRESO'";
    if (empresaId) ingWhere += ' AND m.empresa_id = ?';

    const ultimosIngresos = db.prepare(`
      SELECT 
        m.id, m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo,
        m.fecha, m.hora, m.guia_despacho, m.observacion,
        p.nombre AS producto_nombre, p.codigo AS producto_codigo, p.unidad_medida,
        u.nombre AS usuario_nombre
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      JOIN usuarios u ON m.usuario_id = u.id
      ${ingWhere}
      ORDER BY m.fecha DESC, m.hora DESC, m.id DESC
      LIMIT 6
    `).all(...empParam);

    // 4. Últimos despachos específicos
    let despWhere = "WHERE m.tipo = 'DESPACHO'";
    if (empresaId) despWhere += ' AND m.empresa_id = ?';

    const ultimosDespachos = db.prepare(`
      SELECT 
        m.id, m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo,
        m.fecha, m.hora, m.destino, m.responsable_recepcion, m.guia_despacho,
        p.nombre AS producto_nombre, p.codigo AS producto_codigo, p.unidad_medida,
        u.nombre AS usuario_nombre
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      JOIN usuarios u ON m.usuario_id = u.id
      ${despWhere}
      ORDER BY m.fecha DESC, m.hora DESC, m.id DESC
      LIMIT 6
    `).all(...empParam);

    // 5. Productos prioritarios de reposición (Stock bajo y Agotados)
    let repWhere = 'WHERE p.stock_actual <= p.stock_minimo';
    if (empresaId) repWhere += ' AND p.empresa_id = ?';

    const alertasReposicion = db.prepare(`
      SELECT 
        p.id, p.codigo, p.codigo_barras, p.codigo_qr, p.nombre,
        p.stock_actual, p.stock_minimo, p.unidad_medida,
        p.ubicacion_almacen, p.ubicacion_pasillo, p.ubicacion_estante, p.ubicacion_nivel,
        p.imagen,
        (p.stock_minimo - p.stock_actual) AS faltante,
        CASE 
          WHEN p.stock_actual = 0 THEN 'AGOTADO'
          ELSE 'STOCK BAJO'
        END AS estado
      FROM productos p
      ${repWhere}
      ORDER BY p.stock_actual ASC, (p.stock_minimo - p.stock_actual) DESC
      LIMIT 10
    `).all(...empParam);

    return res.json({
      kpis: {
        total_productos: totalProductos,
        total_existencias: totalExistencias,
        stock_bajo: stockBajoCount,
        agotados: agotadosCount,
        disponibilidad_porcentaje: disponibilidadPorcentaje
      },
      ultimos_movimientos: ultimosMovimientos,
      ultimos_ingresos: ultimosIngresos,
      ultimos_despachos: ultimosDespachos,
      alertas_reposicion: alertasReposicion
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al obtener el resumen del dashboard.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

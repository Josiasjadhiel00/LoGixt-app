import bcrypt from 'bcryptjs';
import db, { transaction } from './connection.js';
import { runSaaSMigrations } from './migrate_saas.js';

export function seedDatabase() {
  console.log('Iniciando carga de datos iniciales en la base de datos...');

  // Ejecutar migraciones y tablas SaaS primero
  try {
    runSaaSMigrations();
  } catch (err) {
    console.error('Error durante runSaaSMigrations:', err);
  }

  const shouldSeedDemo = process.env.SEED_DEMO_DATA === 'true' || (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA !== 'false');
  if (!shouldSeedDemo) {
    return;
  }

  transaction((db) => {
    // 1. Verificar si ya existen usuarios
    const userCount = db.prepare('SELECT COUNT(*) as count FROM usuarios').get().count;
    if (userCount > 0) {
      console.log('La base de datos ya contiene información. Actualizando metadatos si es necesario.');
      // Actualizar imágenes y prefijos en categorías si están vacíos
      try {
        db.prepare("UPDATE categorias SET prefijo = 'CAB', imagen = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80' WHERE nombre LIKE '%Cable%' AND (prefijo IS NULL OR prefijo = '')").run();
        db.prepare("UPDATE categorias SET prefijo = 'EPP', imagen = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80' WHERE nombre LIKE '%Seguridad%' AND (prefijo IS NULL OR prefijo = '')").run();
        db.prepare("UPDATE categorias SET prefijo = 'HER', imagen = 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80' WHERE nombre LIKE '%Herramientas%' AND (prefijo IS NULL OR prefijo = '')").run();
        db.prepare("UPDATE categorias SET prefijo = 'RED', imagen = 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80' WHERE nombre LIKE '%Red%' AND (prefijo IS NULL OR prefijo = '')").run();
        db.prepare("UPDATE categorias SET prefijo = 'EMB', imagen = 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80' WHERE nombre LIKE '%Embalaje%' AND (prefijo IS NULL OR prefijo = '')").run();
        db.prepare("UPDATE categorias SET prefijo = 'FER', imagen = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80' WHERE nombre LIKE '%Ferreter%' AND (prefijo IS NULL OR prefijo = '')").run();
      } catch {}
      return;
    }

    console.log('Creando usuarios iniciales...');
    const salt = bcrypt.genSaltSync(10);
    const passAdmin = bcrypt.hashSync('admin123', salt);
    const passAlmacen = bcrypt.hashSync('almacen123', salt);

    const insertUser = db.prepare(`
      INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado)
      VALUES (?, ?, ?, ?, ?)
    `);

    const adminResult = insertUser.run('Carlos Mendoza', 'admin', passAdmin, 'ADMINISTRADOR', 'ACTIVO');
    const almacenResult = insertUser.run('Carlos Mendoza', 'almacen', passAlmacen, 'ALMACENERO', 'ACTIVO');

    const adminId = Number(adminResult.lastInsertRowid);
    const almacenId = Number(almacenResult.lastInsertRowid);

    // 2. Crear Categorías con prefijo e imagen
    console.log('Creando categorías con prefijos e imágenes de catálogo...');
    const insertCat = db.prepare('INSERT INTO categorias (nombre, descripcion, prefijo, imagen) VALUES (?, ?, ?, ?)');
    
    const catCables = Number(insertCat.run(
      'Cables y Conectividad',
      'Cables de audio, video, red y fibra óptica para infraestructuras.',
      'CAB',
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'
    ).lastInsertRowid);

    const catPerifericos = Number(insertCat.run(
      'Periféricos e Input',
      'Dispositivos de entrada, teclados, ratones y accesorios de puesto de trabajo.',
      'PRF',
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=600&q=80'
    ).lastInsertRowid);

    const catPantallas = Number(insertCat.run(
      'Pantallas y Displays',
      'Monitores industriales, paneles IPS y pantallas para oficinas y centros de control.',
      'PNT',
      'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80'
    ).lastInsertRowid);

    const catAlmacenamiento = Number(insertCat.run(
      'Almacenamiento',
      'Unidades de estado sólido, memorias flash de alta velocidad y discos duros.',
      'ALM',
      'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80'
    ).lastInsertRowid);

    const catAdaptadores = Number(insertCat.run(
      'Adaptadores e Interfaces',
      'Adaptadores multipuerto, hubs USB-C y convertidores de señal.',
      'ADP',
      'https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=600&q=80'
    ).lastInsertRowid);

    const catRedes = Number(insertCat.run(
      'Redes y Telecomunicaciones',
      'Switches, routers de rack, patch panels y módulos transceptores.',
      'RED',
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80'
    ).lastInsertRowid);

    // 3. Crear Productos
    console.log('Creando catálogo de productos iniciales...');
    const insertProd = db.prepare(`
      INSERT INTO productos (
        codigo, codigo_barras, codigo_qr, nombre, categoria_id, descripcion,
        unidad_medida, stock_actual, stock_minimo, ubicacion_almacen,
        ubicacion_pasillo, ubicacion_estante, ubicacion_nivel, proveedor, imagen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const productsData = [
      {
        codigo: 'CB-HDMI-01',
        codigo_barras: '7701234567890',
        codigo_qr: 'WMS-CB-HDMI-01',
        nombre: 'Cable HDMI 2.1 Ultra HD 4K/8K 2m',
        categoria_id: catCables,
        descripcion: 'Cable HDMI 2.1 de ultra alta velocidad con soporte HDR y conectores dorados',
        unidad_medida: 'Unidades',
        stock_actual: 48,
        stock_minimo: 15,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo A',
        ubicacion_estante: 'Estante 02',
        ubicacion_nivel: 'Nivel 1',
        proveedor: 'Proveedor Tech Global S.A.',
        imagen: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'MS-USB-03',
        codigo_barras: '7701234567891',
        codigo_qr: 'WMS-MS-USB-03',
        nombre: 'Mouse USB Óptico Ergonómico 1600 DPI',
        categoria_id: catPerifericos,
        descripcion: 'Mouse ergonómico para uso continuo en estaciones operativas',
        unidad_medida: 'Unidades',
        stock_actual: 0, // Agotado
        stock_minimo: 25,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo B',
        ubicacion_estante: 'Estante 01',
        ubicacion_nivel: 'Nivel 2',
        proveedor: 'Periféricos Industriales S.A.',
        imagen: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'SSD-1TB-08',
        codigo_barras: '7701234567892',
        codigo_qr: 'WMS-SSD-1TB-08',
        nombre: 'Disco SSD NVMe M.2 1TB PCIe Gen4',
        categoria_id: catAlmacenamiento,
        descripcion: 'Unidad de estado sólido de alta velocidad de lectura hasta 7000MB/s',
        unidad_medida: 'Unidades',
        stock_actual: 24,
        stock_minimo: 8,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo C',
        ubicacion_estante: 'Estante 03',
        ubicacion_nivel: 'Nivel 1',
        proveedor: 'Almacenamiento Global',
        imagen: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'HDD-EXT-09',
        codigo_barras: '7701234567893',
        codigo_qr: 'WMS-HDD-EXT-09',
        nombre: 'Disco Duro Externo Rugged 2TB USB 3.0',
        categoria_id: catAlmacenamiento,
        descripcion: 'Disco resistente a caídas y golpes para respaldos de campo',
        unidad_medida: 'Unidades',
        stock_actual: 0, // Agotado
        stock_minimo: 8,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo C',
        ubicacion_estante: 'Estante 04',
        ubicacion_nivel: 'Nivel 2',
        proveedor: 'Almacenamiento Global',
        imagen: 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'PSU-750-12',
        codigo_barras: '7701234567894',
        codigo_qr: 'WMS-PSU-750-12',
        nombre: 'Fuente de Poder Modular 750W 80+ Gold',
        categoria_id: catAdaptadores,
        descripcion: 'Fuente certificada para estaciones de trabajo de alto rendimiento',
        unidad_medida: 'Unidades',
        stock_actual: 0, // Agotado
        stock_minimo: 12,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo D',
        ubicacion_estante: 'Estante 02',
        ubicacion_nivel: 'Nivel 3',
        proveedor: 'Energía Tech Pro',
        imagen: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'KB-WRL-02',
        codigo_barras: '7701234567895',
        codigo_qr: 'WMS-KB-WRL-02',
        nombre: 'Teclado Inalámbrico Pro Ultra-Slim',
        categoria_id: catPerifericos,
        descripcion: 'Teclado compacto recargable con conexión Bluetooth y 2.4Ghz',
        unidad_medida: 'Unidades',
        stock_actual: 14, // Stock bajo
        stock_minimo: 15,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo B',
        ubicacion_estante: 'Estante 02',
        ubicacion_nivel: 'Nivel 1',
        proveedor: 'Periféricos Industriales S.A.',
        imagen: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'MON-24-04',
        codigo_barras: '7701234567896',
        codigo_qr: 'WMS-MON-24-04',
        nombre: 'Monitor 24" IPS Full HD 75Hz Industrial',
        categoria_id: catPantallas,
        descripcion: 'Monitor para centro de monitoreo continuo 24/7 sin parpadeo',
        unidad_medida: 'Unidades',
        stock_actual: 8, // Stock bajo
        stock_minimo: 10,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo A',
        ubicacion_estante: 'Estante 01',
        ubicacion_nivel: 'Nivel 1',
        proveedor: 'Displays y Pantallas S.A.',
        imagen: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'MEM-USB-07',
        codigo_barras: '7701234567897',
        codigo_qr: 'WMS-MEM-USB-07',
        nombre: 'Memoria USB 64GB USB 3.2 Gen 1 Metal',
        categoria_id: catAlmacenamiento,
        descripcion: 'Pendrive cuerpo metálico para instalación de sistemas y utilitarios',
        unidad_medida: 'Unidades',
        stock_actual: 9, // Stock bajo
        stock_minimo: 10,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo C',
        ubicacion_estante: 'Estante 01',
        ubicacion_nivel: 'Nivel 3',
        proveedor: 'Almacenamiento Global',
        imagen: 'https://images.unsplash.com/photo-1618477247222-acbdb0e159b3?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'ADP-USBC-06',
        codigo_barras: '7701234567898',
        codigo_qr: 'WMS-ADP-USBC-06',
        nombre: 'Adaptador USB-C a HDMI 4K + USB 3.0',
        categoria_id: catAdaptadores,
        descripcion: 'Adaptador multipuerto aluminio gris espacial',
        unidad_medida: 'Unidades',
        stock_actual: 65,
        stock_minimo: 10,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo D',
        ubicacion_estante: 'Estante 01',
        ubicacion_nivel: 'Nivel 1',
        proveedor: 'Proveedor Tech Global S.A.',
        imagen: 'https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'NET-SW-10',
        codigo_barras: '7701234567899',
        codigo_qr: 'WMS-NET-SW-10',
        nombre: 'Switch Gigabit Ethernet 16 Puertos Rack',
        categoria_id: catRedes,
        descripcion: 'Switch no administrable para sala de servidores y telecom',
        unidad_medida: 'Unidades',
        stock_actual: 24,
        stock_minimo: 4,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo E',
        ubicacion_estante: 'Estante 01',
        ubicacion_nivel: 'Nivel 2',
        proveedor: 'Redes y Telecom S.A.',
        imagen: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'CB-NET-05',
        codigo_barras: '7701234567800',
        codigo_qr: 'WMS-CB-NET-05',
        nombre: 'Cable de Red Cat 6 UTP Bobina 305m',
        categoria_id: catCables,
        descripcion: 'Bobina de red categoría 6 cobre 100% para cableado estructurado',
        unidad_medida: 'Bobinas',
        stock_actual: 40,
        stock_minimo: 5,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo A',
        ubicacion_estante: 'Estante 03',
        ubicacion_nivel: 'Nivel 1',
        proveedor: 'Proveedor Tech Global S.A.',
        imagen: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&q=80'
      },
      {
        codigo: 'NET-SW-08',
        codigo_barras: '7701234567801',
        codigo_qr: 'WMS-NET-SW-08',
        nombre: 'Switch Gigabit Ethernet 8 Puertos Desktop',
        categoria_id: catRedes,
        descripcion: 'Switch compacto carcasa metálica para puestos de trabajo',
        unidad_medida: 'Unidades',
        stock_actual: 6,
        stock_minimo: 4,
        ubicacion_almacen: 'Almacén Central',
        ubicacion_pasillo: 'Pasillo E',
        ubicacion_estante: 'Estante 02',
        ubicacion_nivel: 'Nivel 1',
        proveedor: 'Redes y Telecom S.A.',
        imagen: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=400&q=80'
      }
    ];

    const insertedProductIds = [];
    for (const item of productsData) {
      const res = insertProd.run(
        item.codigo, item.codigo_barras, item.codigo_qr, item.nombre,
        item.categoria_id, item.descripcion, item.unidad_medida, item.stock_actual,
        item.stock_minimo, item.ubicacion_almacen, item.ubicacion_pasillo,
        item.ubicacion_estante, item.ubicacion_nivel, item.proveedor, item.imagen
      );
      insertedProductIds.push({ id: Number(res.lastInsertRowid), ...item });
    }

    // 4. Registrar Movimientos Históricos Iniciales (Ingresos, Despachos, Ajustes)
    console.log('Generando historial de movimientos iniciales con auditoría y guías...');
    const insertMov = db.prepare(`
      INSERT INTO movimientos (
        producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
        usuario_id, observacion, destino, motivo_ajuste, guia_despacho, responsable_recepcion, fecha, hora
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Ingresos iniciales
    insertMov.run(
      insertedProductIds[0].id, 'INGRESO', 20, 28, 48,
      almacenId, 'Recepción de lote estándar con empaque íntegro.', null, null,
      'GR-2026-104', null, '2026-09-07', '07:45:00'
    );
    insertMov.run(
      insertedProductIds[2].id, 'INGRESO', 25, 0, 25,
      almacenId, 'Ingreso por compra corporativa orden OC-902', null, null,
      'FAC-2026-881', null, '2026-09-06', '15:40:00'
    );

    // Despachos iniciales
    insertMov.run(
      insertedProductIds[8].id, 'DESPACHO', 15, 80, 65,
      almacenId, 'Despacho de material para orden de trabajo.', 'Área de Ensamble y TI - Puesto 4', null,
      'VALE-SAL-2026-481', 'Javier Ortiz', '2026-09-07', '07:10:00'
    );
    insertMov.run(
      insertedProductIds[1].id, 'DESPACHO', 10, 10, 0,
      adminId, 'Entrega de periféricos para oficina norte', 'Despacho Sucursal Norte - Bodega B', null,
      'VALE-SAL-2026-479', 'Carlos Mendoza', '2026-09-07', '06:15:00'
    );
    insertMov.run(
      insertedProductIds[5].id, 'DESPACHO', 6, 20, 14,
      almacenId, 'Dotación de teclados', 'Departamento de Ventas y Soporte', null,
      'VALE-SAL-2026-475', 'Javier Ortiz', '2026-09-06', '18:20:00'
    );
    insertMov.run(
      insertedProductIds[9].id, 'DESPACHO', 2, 26, 24,
      adminId, 'Instalación de rack piso 2', 'Proyecto Centro de Datos - Rack 03', null,
      'VALE-SAL-2026-470', 'Carlos Mendoza', '2026-09-05', '17:40:00'
    );
    insertMov.run(
      insertedProductIds[6].id, 'DESPACHO', 4, 12, 8,
      almacenId, 'Monitores para videovigilancia', 'Centro de Monitoreo CCTV', null,
      'VALE-SAL-2026-466', 'Javier Ortiz', '2026-09-05', '14:10:00'
    );

    // Ajuste
    insertMov.run(
      insertedProductIds[10].id, 'AJUSTE', 2, 38, 40,
      adminId, 'Ajuste confirmado en inventario rotativo mensual', null, 'Diferencia en conteo físico',
      null, null, '2026-09-06', '11:30:00'
    );

    console.log('¡Base de datos sembrada con los datos y fotos del catálogo!');
  });
}

// Ejecutar directamente si se llama via script
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase();
}

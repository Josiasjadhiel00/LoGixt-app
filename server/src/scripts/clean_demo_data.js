import db, { transaction } from '../db/connection.js';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

export function cleanDemoData() {
  console.log('🧹 INICIANDO LIMPIEZA DE DATOS DE PRUEBA EN LOGIXT...');
  console.log('====================================================');

  transaction((db) => {
    // 1. Eliminar datos operativos de prueba
    console.log('🗑️  Eliminando movimientos de inventario...');
    db.prepare('DELETE FROM movimientos').run();

    console.log('🗑️  Eliminando productos de prueba...');
    db.prepare('DELETE FROM productos').run();

    console.log('🗑️  Eliminando categorías de prueba...');
    db.prepare('DELETE FROM categorias').run();

    console.log('🗑️  Eliminando dispositivos de prueba...');
    db.prepare('DELETE FROM dispositivos').run();

    console.log('🗑️  Eliminando pagos de prueba...');
    db.prepare('DELETE FROM pagos').run();

    console.log('🗑️  Eliminando registros de auditoría y webhooks de prueba...');
    db.prepare('DELETE FROM actividad_logs').run();
    db.prepare('DELETE FROM webhook_logs').run();

    console.log('🗑️  Eliminando suscripciones de prueba...');
    db.prepare('DELETE FROM suscripciones').run();

    console.log('🗑️  Eliminando usuarios de prueba (conservando SuperAdmin)...');
    db.prepare("DELETE FROM usuarios WHERE rol != 'SUPERADMIN'").run();
    db.prepare('UPDATE usuarios SET empresa_id = NULL').run();

    console.log('🗑️  Eliminando empresas de prueba...');
    db.prepare('DELETE FROM empresas').run();

    // 2. Asegurar que el SuperAdmin existe y tiene empresa_id en NULL
    const superAdmin = db.prepare("SELECT id FROM usuarios WHERE LOWER(usuario) = 'superadmin'").get();
    const initialPass = process.env.SUPERADMIN_INITIAL_PASSWORD || 'admin123';
    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync(initialPass, salt);

    if (superAdmin) {
      db.prepare(`
        UPDATE usuarios SET
          empresa_id = NULL,
          contrasena_hash = ?,
          estado = 'ACTIVO',
          tema = 'logixt',
          color_acento = 'purple'
        WHERE id = ?
      `).run(passHash, superAdmin.id);
      console.log('👑 Usuario SuperAdmin actualizado (empresa_id: NULL, estado: ACTIVO).');
    } else {
      db.prepare(`
        INSERT INTO usuarios (nombre, usuario, contrasena_hash, rol, estado, empresa_id, tema, color_acento)
        VALUES ('SuperAdmin Plataforma', 'superadmin', ?, 'SUPERADMIN', 'ACTIVO', NULL, 'logixt', 'purple')
      `).run(passHash);
      console.log('👑 Usuario SuperAdmin creado exitosamente.');
    }

    // 3. Verificar que los planes y la configuración base están intactos
    const planCount = db.prepare('SELECT COUNT(*) as count FROM planes').get().count;
    console.log(`📦 Planes disponibles en el sistema: ${planCount}`);

    const graciaConfig = db.prepare("SELECT valor FROM configuracion_saas WHERE clave = 'dias_periodo_gracia'").get();
    console.log(`⚙️  Período de gracia configurado: ${graciaConfig ? graciaConfig.valor : '5'} días`);
  });

  // Checkpoint WAL para persistir los cambios inmediatamente en el archivo
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {}

  console.log('====================================================');
  console.log('✅ BASE DE DATOS LIMPIA: Todos los datos de prueba fueron eliminados.');
  console.log('   Empresas: 0 | Productos: 0 | Movimientos: 0 | Dispositivos: 0');
  console.log('   SuperAdmin: "superadmin" listo para iniciar sesión.');
  console.log('====================================================');
}

// Ejecutar si se invoca directamente
if (process.argv[1] && process.argv[1].endsWith('clean_demo_data.js')) {
  cleanDemoData();
}

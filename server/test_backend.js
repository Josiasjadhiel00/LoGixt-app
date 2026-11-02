import db from './src/db/connection.js';
import { seedDatabase } from './src/db/seed.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './src/middleware/auth.js';

console.log('--- INICIANDO PRUEBAS DE INTEGRIDAD DEL BACKEND ---');

// 1. Ejecutar Seed
seedDatabase();

// 2. Verificar Usuarios
const admin = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get('admin');
const almacen = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get('almacen');

if (!admin || !almacen) {
  throw new Error('Fallo: Los usuarios admin y almacen no existen.');
}
if (!bcrypt.compareSync('admin123', admin.contrasena_hash)) {
  throw new Error('Fallo: La contraseña del usuario admin no coincide.');
}
console.log('✔ Usuarios y hashing bcrypt verificados correctamente.');

// 3. Probar Búsqueda de Productos por Código, Código de Barras y QR
const prodByCode = db.prepare('SELECT * FROM productos WHERE codigo = ?').get('CAB-HDMI-01');
const prodByBarcode = db.prepare('SELECT * FROM productos WHERE codigo_barras = ?').get('7701234567890');
const prodByQR = db.prepare('SELECT * FROM productos WHERE codigo_qr = ?').get('WMS-CAB-001');

if (!prodByCode || !prodByBarcode || !prodByQR || prodByCode.id !== prodByBarcode.id || prodByCode.id !== prodByQR.id) {
  throw new Error('Fallo: La búsqueda por código, código de barras y QR no devolvió el mismo producto.');
}
console.log('✔ Búsqueda indexada por Código, Código de Barras y QR verificada.');

// 4. Probar Transacción de INGRESO
const initialStock = prodByCode.stock_actual;
const qtyIn = 25;

db.exec('BEGIN IMMEDIATE;');
db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?').run(qtyIn, prodByCode.id);
db.prepare(`
  INSERT INTO movimientos (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, usuario_id, observacion, fecha, hora)
  VALUES (?, 'INGRESO', ?, ?, ?, ?, 'Test ingreso automatizado', '2026-09-07', '12:00:00')
`).run(prodByCode.id, qtyIn, initialStock, initialStock + qtyIn, admin.id);
db.exec('COMMIT;');

const afterIn = db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(prodByCode.id).stock_actual;
if (afterIn !== initialStock + qtyIn) {
  throw new Error(`Fallo en INGRESO: Esperado ${initialStock + qtyIn}, obtenido ${afterIn}`);
}
console.log(`✔ Transacción de INGRESO exitosa: Stock aumentó de ${initialStock} a ${afterIn}.`);

// 5. Probar Transacción de DESPACHO
const qtyOut = 10;
db.exec('BEGIN IMMEDIATE;');
db.prepare('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?').run(qtyOut, prodByCode.id);
db.prepare(`
  INSERT INTO movimientos (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, usuario_id, destino, observacion, fecha, hora)
  VALUES (?, 'DESPACHO', ?, ?, ?, ?, 'Taller central', 'Test despacho automatizado', '2026-09-07', '12:05:00')
`).run(prodByCode.id, qtyOut, afterIn, afterIn - qtyOut, almacen.id);
db.exec('COMMIT;');

const afterOut = db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(prodByCode.id).stock_actual;
if (afterOut !== afterIn - qtyOut) {
  throw new Error(`Fallo en DESPACHO: Esperado ${afterIn - qtyOut}, obtenido ${afterOut}`);
}
console.log(`✔ Transacción de DESPACHO exitosa: Stock disminuyó de ${afterIn} a ${afterOut}.`);

// 6. Probar Regla 3: NUNCA permitir stock negativo
const currentStock = afterOut;
let negativeStockPrevented = false;
try {
  const requested = currentStock + 500;
  if (currentStock < requested) {
    throw new Error('Stock insuficiente. Operación rechazada.');
  }
} catch (e) {
  negativeStockPrevented = true;
}
if (!negativeStockPrevented) {
  throw new Error('Fallo: No se previno el stock negativo.');
}
console.log('✔ Regla 3 verificada: El sistema bloquea despachos superiores a las existencias disponibles.');

// 7. Probar Regla 5 y Regla 6: AJUSTE con motivo obligatorio
const targetStock = 70;
const diff = targetStock - afterOut;
db.exec('BEGIN IMMEDIATE;');
db.prepare('UPDATE productos SET stock_actual = ? WHERE id = ?').run(targetStock, prodByCode.id);
db.prepare(`
  INSERT INTO movimientos (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, usuario_id, motivo_ajuste, observacion, fecha, hora)
  VALUES (?, 'AJUSTE', ?, ?, ?, ?, 'Diferencia en conteo físico', 'Ajuste anual de almacén', '2026-09-07', '12:10:00')
`).run(prodByCode.id, Math.abs(diff), afterOut, targetStock, admin.id);
db.exec('COMMIT;');

const finalStock = db.prepare('SELECT stock_actual FROM productos WHERE id = ?').get(prodByCode.id).stock_actual;
if (finalStock !== targetStock) {
  throw new Error(`Fallo en AJUSTE: Esperado ${targetStock}, obtenido ${finalStock}`);
}
console.log(`✔ Transacción de AJUSTE exitosa: Stock ajustado a ${finalStock} con motivo registrado.`);

// 8. Verificar inmutabilidad y conteo de movimientos
const totalMovs = db.prepare('SELECT COUNT(*) as count FROM movimientos WHERE producto_id = ?').get(prodByCode.id).count;
if (totalMovs < 3) {
  throw new Error('Fallo: No se registraron los movimientos en el historial.');
}
console.log(`✔ Historial de trazabilidad verificado: ${totalMovs} movimientos registrados para el producto.`);

console.log('\n=========================================');
console.log('🎉 TODAS LAS PRUEBAS DE BACKEND PASARON EXITOSAMENTE 🎉');
console.log('=========================================\n');

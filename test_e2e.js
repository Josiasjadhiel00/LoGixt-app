// Script de prueba de integración de extremo a extremo (E2E)
const API_URL = 'http://localhost:5000/api';

async function runE2ETests() {
  console.log('🚀 Iniciando pruebas de integración completas del Sistema de Almacén...');

  // 1. Iniciar sesión como Administrador
  console.log('\n[1] Probando autenticación Admin...');
  const loginAdminRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', contrasena: 'admin123' })
  });
  const adminData = await loginAdminRes.json();
  if (!loginAdminRes.ok || !adminData.token) {
    throw new Error('Fallo en login de admin: ' + JSON.stringify(adminData));
  }
  const adminToken = adminData.token;
  console.log('✔ Sesión iniciada como:', adminData.user.nombre, `(${adminData.user.rol})`);

  // 2. Iniciar sesión como Almacenero
  console.log('\n[2] Probando autenticación Almacenero...');
  const loginAlmacenRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'almacen', contrasena: 'almacen123' })
  });
  const almacenData = await loginAlmacenRes.json();
  if (!loginAlmacenRes.ok || !almacenData.token) {
    throw new Error('Fallo en login de almacen: ' + JSON.stringify(almacenData));
  }
  const almacenToken = almacenData.token;
  console.log('✔ Sesión iniciada como:', almacenData.user.nombre, `(${almacenData.user.rol})`);

  // 3. Consultar Dashboard y KPIs
  console.log('\n[3] Probando consulta de KPIs del Dashboard...');
  const dashRes = await fetch(`${API_URL}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const dashData = await dashRes.json();
  console.log('✔ KPIs obtenidos:', dashData.kpis);

  // 4. Búsqueda y Escáner (Lookup por código de barras y QR)
  console.log('\n[4] Probando escaneo y búsqueda rápida de producto...');
  const lookupBarcodeRes = await fetch(`${API_URL}/products/lookup/7701234567890`, {
    headers: { Authorization: `Bearer ${almacenToken}` }
  });
  const lookupData = await lookupBarcodeRes.json();
  if (!lookupBarcodeRes.ok || !lookupData.product) {
    throw new Error('Fallo en lookup de código de barras: ' + JSON.stringify(lookupData));
  }
  const targetProduct = lookupData.product;
  console.log('✔ Producto escaneado correctamente:', targetProduct.nombre, `(Stock: ${targetProduct.stock_actual})`);

  // 5. Flujo de Ingreso de Mercancía
  console.log('\n[5] Probando flujo de Ingreso de Mercancía (+30 unidades)...');
  const initialStock = targetProduct.stock_actual;
  const inboundRes = await fetch(`${API_URL}/movements/inbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${almacenToken}`
    },
    body: JSON.stringify({
      producto_id: targetProduct.id,
      cantidad: 30,
      observacion: 'Recepción de pedido E2E Test',
      proveedor: 'TechCable Soluciones S.A.'
    })
  });
  const inboundData = await inboundRes.json();
  if (!inboundRes.ok) {
    throw new Error('Fallo en ingreso: ' + JSON.stringify(inboundData));
  }
  console.log('✔ Ingreso procesado:', inboundData.message);

  // 6. Flujo de Despacho de Mercancía
  console.log('\n[6] Probando flujo de Despacho de Mercancía (-15 unidades)...');
  const outboundRes = await fetch(`${API_URL}/movements/outbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${almacenToken}`
    },
    body: JSON.stringify({
      producto_id: targetProduct.id,
      cantidad: 15,
      destino: 'Área de TI y Servidores',
      observacion: 'Solicitud de cableado sala rack'
    })
  });
  const outboundData = await outboundRes.json();
  if (!outboundRes.ok) {
    throw new Error('Fallo en despacho: ' + JSON.stringify(outboundData));
  }
  console.log('✔ Despacho procesado:', outboundData.message);

  // 7. Prueba de Regla 3: NUNCA permitir stock negativo
  console.log('\n[7] Probando bloqueo de despacho superior a existencias (Protección stock negativo)...');
  const invalidOutboundRes = await fetch(`${API_URL}/movements/outbound`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${almacenToken}`
    },
    body: JSON.stringify({
      producto_id: targetProduct.id,
      cantidad: 99999, // Excede ampliamente el stock
      destino: 'Prueba de error'
    })
  });
  if (invalidOutboundRes.status === 400) {
    const errData = await invalidOutboundRes.json();
    console.log('✔ Regla 3 aplicada correctamente. Mensaje de seguridad:', errData.error);
  } else {
    throw new Error('Fallo de seguridad: El sistema no bloqueó el despacho excesivo.');
  }

  // 8. Flujo de Ajuste de Inventario (Admin)
  console.log('\n[8] Probando Ajuste de Inventario con motivo justificado...');
  const adjustRes = await fetch(`${API_URL}/movements/adjust`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      producto_id: targetProduct.id,
      stock_nuevo: 100,
      motivo_ajuste: 'Diferencia encontrada durante conteo físico',
      observacion: 'Ajuste confirmado en auditoría periódica'
    })
  });
  const adjustData = await adjustRes.json();
  if (!adjustRes.ok) {
    throw new Error('Fallo en ajuste: ' + JSON.stringify(adjustData));
  }
  console.log('✔ Ajuste procesado:', adjustData.message);

  // 9. Control de Permisos por Rol: Almacenero intenta realizar ajuste
  console.log('\n[9] Probando control de roles: Almacenero intenta hacer ajuste (debe rechazarse)...');
  const forbiddenAdjustRes = await fetch(`${API_URL}/movements/adjust`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${almacenToken}`
    },
    body: JSON.stringify({
      producto_id: targetProduct.id,
      stock_nuevo: 50,
      motivo_ajuste: 'Intento no autorizado'
    })
  });
  if (forbiddenAdjustRes.status === 403) {
    console.log('✔ Permiso denegado correctamente (HTTP 403). Solo Administradores pueden ajustar.');
  } else {
    throw new Error('Fallo en control de roles: Almacenero pudo ejecutar acción de administrador.');
  }

  // 10. Consulta del Historial Completo
  console.log('\n[10] Probando consulta de Historial de Trazabilidad...');
  const histRes = await fetch(`${API_URL}/movements?producto_id=${targetProduct.id}`, {
    headers: { Authorization: `Bearer ${almacenToken}` }
  });
  const histData = await histRes.json();
  console.log(`✔ Historial verificado: ${histData.movements.length} movimientos registrados para el producto.`);

  console.log('\n======================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE INTEGRACIÓN E2E PASARON CON ÉXITO 🎉');
  console.log('======================================================\n');
}

runE2ETests().catch((err) => {
  console.error('\n❌ Error durante pruebas E2E:', err);
  process.exit(1);
});

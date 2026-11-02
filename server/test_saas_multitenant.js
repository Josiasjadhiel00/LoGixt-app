import app from './src/app.js';
import db from './src/db/connection.js';

const BASE_URL = 'http://127.0.0.1:5000';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 PRUEBAS AUTOMATIZADAS DE SISTEMA SAAS Y MULTI-TENANT');
  console.log('====================================================');

  // Asegurar estado activo inicial para idempotencia de pruebas
  db.prepare("UPDATE empresas SET estado = 'ACTIVA'").run();
  db.prepare("UPDATE suscripciones SET estado = 'ACTIVE'").run();
  db.prepare("DELETE FROM pagos WHERE payment_id LIKE 'test_webhook_tx%'").run();

  // Esperar a que el servidor esté activo
  await new Promise(resolve => setTimeout(resolve, 600));

  // 1. Health Check
  console.log('\n[1/6] Verificando salud del sistema...');
  const health = await req('/api/health');
  assert(health.status === 200, `Health check devolvió status ${health.status}`);
  assert(health.data.status === 'online', 'Health check status no es online');
  console.log('  ✔ Health check exitoso: Sistema en línea.');

  // 2. Login de Superadmin y Acceso a Métricas de Plataforma
  console.log('\n[2/6] Verificando autenticación y panel de SuperAdmin...');
  const saLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { usuario: 'superadmin', contrasena: 'admin123' }
  });
  assert(saLogin.status === 200, `Login de SuperAdmin falló con status ${saLogin.status}`);
  assert(saLogin.data.user.rol === 'SUPERADMIN', 'El rol del usuario logueado no es SUPERADMIN');
  const saToken = saLogin.data.token;
  console.log('  ✔ SuperAdmin autenticado exitosamente.');

  const metrics = await req('/api/admin/metrics', {
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(metrics.status === 200, 'Error al obtener métricas de plataforma');
  assert(metrics.data.metrics.total_empresas >= 2, 'Total empresas en métricas debe ser >= 2');
  console.log(`  ✔ Métricas de plataforma obtenidas: ${metrics.data.metrics.total_empresas} empresas, MRR: $${metrics.data.metrics.mrr}`);

  const companiesList = await req('/api/admin/empresas', {
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(companiesList.status === 200, 'Error al listar empresas como SuperAdmin');
  assert(companiesList.data.empresas.length >= 2, 'Deben existir al menos 2 empresas');
  console.log(`  ✔ Lista de empresas obtenida (${companiesList.data.empresas.length} empresas registradas).`);

  // 3. Login e inspección de Empresa 1 (TechLogix, ID 1)
  console.log('\n[3/6] Verificando Empresa 1 (TechLogix)...');
  const emp1Login = await req('/api/auth/login', {
    method: 'POST',
    body: { usuario: 'admin', contrasena: 'admin123' }
  });
  assert(emp1Login.status === 200, `Login de Empresa 1 falló con status ${emp1Login.status}`);
  assert(emp1Login.data.user.empresa_id === 1, 'Empresa ID de admin debe ser 1');
  const emp1Token = emp1Login.data.token;

  const emp1Products = await req('/api/products', {
    headers: { Authorization: `Bearer ${emp1Token}` }
  });
  assert(emp1Products.status === 200, 'Error al obtener productos de Empresa 1');
  const emp1List = emp1Products.data.products || [];
  const emp1ProductIds = emp1List.map(p => p.id);
  assert(emp1List.every(p => p.empresa_id === 1), 'Todos los productos deben pertenecer a empresa_id = 1');
  console.log(`  ✔ Empresa 1 tiene ${emp1List.length} productos, todos con empresa_id = 1.`);

  const emp1Sub = await req('/api/subscriptions/my-subscription', {
    headers: { Authorization: `Bearer ${emp1Token}` }
  });
  if (emp1Sub.status !== 200) {
    console.error('DEBUG emp1Sub error:', emp1Sub);
  }
  assert(emp1Sub.status === 200, 'Error al consultar suscripción de Empresa 1');
  assert(emp1Sub.data.subscription.empresa_id === 1, 'Suscripción no corresponde a Empresa 1');
  console.log(`  ✔ Suscripción Empresa 1: Plan ${emp1Sub.data.subscription.plan_nombre}, Estado: ${emp1Sub.data.subscription.suscripcion_estado}`);

  // 4. Login e inspección de Empresa 2 (Distribuidora Andina, ID 2) y Aislamiento estricto
  console.log('\n[4/6] Verificando aislamiento multi-tenant con Empresa 2 (Distribuidora Andina)...');
  const emp2Login = await req('/api/auth/login', {
    method: 'POST',
    body: { usuario: 'admin_andina', contrasena: 'andina123' }
  });
  assert(emp2Login.status === 200, `Login de Empresa 2 falló con status ${emp2Login.status}`);
  assert(emp2Login.data.user.empresa_id === 2, 'Empresa ID de admin_andina debe ser 2');
  const emp2Token = emp2Login.data.token;

  const emp2Products = await req('/api/products', {
    headers: { Authorization: `Bearer ${emp2Token}` }
  });
  assert(emp2Products.status === 200, 'Error al obtener productos de Empresa 2');
  const emp2List = emp2Products.data.products || [];
  assert(emp2List.every(p => p.empresa_id === 2), 'Todos los productos deben pertenecer a empresa_id = 2');

  // Validar que ningún producto de Empresa 1 está en los productos de Empresa 2
  const overlap = emp2List.filter(p => emp1ProductIds.includes(p.id));
  assert(overlap.length === 0, '¡VIOLACIÓN DE AISLAMIENTO! Empresa 2 recibió productos de Empresa 1');
  console.log(`  ✔ Aislamiento de listado verificado: 0 productos compartidos.`);

  // Intentar acceder a un producto de Empresa 1 con el token de Empresa 2
  if (emp1ProductIds.length > 0) {
    const crossAccess = await req(`/api/products/${emp1ProductIds[0]}`, {
      headers: { Authorization: `Bearer ${emp2Token}` }
    });
    assert(crossAccess.status === 404, `Aislamiento falló: Empresa 2 pudo acceder al producto ${emp1ProductIds[0]} de Empresa 1 (status ${crossAccess.status})`);
    console.log(`  ✔ Aislamiento de detalle verificado: Empresa 2 recibió 404 al intentar ver producto de Empresa 1.`);
  }

  // 5. Verificación de Suspensión y Bloqueo de Rutas Operativas
  console.log('\n[5/6] Verificando suspensión de suscripción y bloqueo de acceso operativo...');
  // Suspender Empresa 2 como SuperAdmin
  const suspendRes = await req('/api/admin/empresas/2/toggle-status', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(suspendRes.status === 200, 'Error al suspender Empresa 2 desde SuperAdmin');
  console.log('  ✔ Empresa 2 suspendida por el SuperAdmin.');

  // Intentar consultar productos con el token de Empresa 2 (debe retornar 403 TENANT_SUSPENDED)
  const blockedProducts = await req('/api/products', {
    headers: { Authorization: `Bearer ${emp2Token}` }
  });
  assert(blockedProducts.status === 403, `Se esperaba 403 para empresa suspendida, se obtuvo ${blockedProducts.status}`);
  assert(blockedProducts.data.code === 'TENANT_SUSPENDED', `Código de error esperado TENANT_SUSPENDED, se obtuvo ${blockedProducts.data.code}`);
  console.log('  ✔ Bloqueo operativo verificado: Retorna 403 TENANT_SUSPENDED.');

  // Comprobar que la ruta de consulta de suscripción SIGUE disponible para pagar/ver estado
  const subCheckWhileSuspended = await req('/api/subscriptions/my-subscription', {
    headers: { Authorization: `Bearer ${emp2Token}` }
  });
  assert(subCheckWhileSuspended.status === 200, 'La ruta de suscripción debe seguir accesible cuando está suspendida');
  assert(subCheckWhileSuspended.data.subscription.empresa_estado === 'SUSPENDIDA', 'El estado de la empresa debe ser SUSPENDIDA');
  console.log('  ✔ Acceso a "Mi Suscripción" permitido durante suspensión para que el cliente pueda regularizar su cuenta.');

  // Comprobar que los datos de Empresa 2 NO han sido eliminados de la base de datos
  const dbEmp2Count = db.prepare('SELECT COUNT(*) as count FROM productos WHERE empresa_id = 2').get().count;
  assert(dbEmp2Count === emp2List.length, 'Los datos de la empresa NO deben ser eliminados al suspenderse');
  console.log(`  ✔ Integridad de datos preservada: Todos los ${dbEmp2Count} productos de Empresa 2 permanecen intactos.`);

  // 6. Verificación de Webhook y Restauración Inmediata
  console.log('\n[6/6] Verificando webhook de pago y reactivación inmediata del servicio...');
  const webhookRes = await req('/api/webhooks/payments', {
    method: 'POST',
    body: {
      type: 'payment.succeeded',
      data: {
        empresa_id: 2,
        amount: 79.00,
        payment_id: 'test_webhook_tx_998877'
      }
    }
  });
  assert(webhookRes.status === 200, `Webhook falló con status ${webhookRes.status}`);
  assert(webhookRes.data.status === 'success', 'El webhook no reportó status success');
  console.log('  ✔ Webhook payment.succeeded procesado exitosamente.');

  // Verificar que el acceso a los productos de Empresa 2 se restableció de inmediato
  const restoredProducts = await req('/api/products', {
    headers: { Authorization: `Bearer ${emp2Token}` }
  });
  assert(restoredProducts.status === 200, `Acceso no restaurado tras pago: status ${restoredProducts.status}`);
  const restoredList = restoredProducts.data.products || [];
  console.log(`  ✔ Restauración inmediata confirmada: Empresa 2 vuelve a tener acceso a sus ${restoredList.length} productos.`);

  // Verificar estado activo en "Mi Suscripción"
  const restoredSub = await req('/api/subscriptions/my-subscription', {
    headers: { Authorization: `Bearer ${emp2Token}` }
  });
  assert(restoredSub.data.subscription.suscripcion_estado === 'ACTIVE', 'El estado de la suscripción debe ser ACTIVE');
  assert(restoredSub.data.subscription.empresa_estado === 'ACTIVA', 'El estado de la empresa debe ser ACTIVA');
  console.log(`  ✔ Estado de suscripción verificado: ACTIVA con fecha próximo pago: ${restoredSub.data.subscription.fecha_proximo_pago}.`);

  // Verificar registro en webhook_logs
  const log = db.prepare("SELECT * FROM webhook_logs WHERE evento = 'payment.succeeded' ORDER BY id DESC LIMIT 1").get();
  assert(log !== undefined, 'No se registró el evento en webhook_logs');
  assert(log.procesado === 1, 'El estado en webhook_logs debe ser procesado = 1');
  console.log(`  ✔ Auditoría en webhook_logs verificada (ID de registro: ${log.id}).`);

  console.log('\n====================================================');
  console.log('🎉 ¡TODAS LAS PRUEBAS SAAS MULTI-TENANT PASARON CON ÉXITO!');
  console.log('====================================================');

  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ ERROR DURANTE LA EJECUCIÓN DE LAS PRUEBAS:');
  console.error(err);
  process.exit(1);
});

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
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 VALIDACIÓN FASE 2: DISPOSITIVOS + PERFIL + TEMAS + SUPERADMIN');
  console.log('================================================================');

  // Asegurar estado activo inicial para las empresas y limpiar datos de pruebas previas
  db.prepare("UPDATE empresas SET estado = 'ACTIVA'").run();
  db.prepare("UPDATE suscripciones SET estado = 'ACTIVE'").run();
  db.prepare("DELETE FROM dispositivos WHERE uuid LIKE 'dev-%' OR nombre LIKE '%Test%' OR nombre LIKE '%Prueba%'").run();
  db.prepare("UPDATE usuarios SET apellido = 'Almacén', email = 'admin@techlogix.com', telefono = '+56 9 1234 5678', foto = NULL, tema = 'logixt', color_acento = 'purple' WHERE id = 2").run();

  await new Promise(resolve => setTimeout(resolve, 800));

  // -----------------------------------------------------------------
  // 1. AUTENTICACIÓN SUPERADMIN Y MÉTRICAS COMPLETAS CON 4 CHARTS
  // -----------------------------------------------------------------
  console.log('\n[1/7] Verificando SuperAdmin y Analítica con 4 Gráficos...');
  const saLogin = await req('/api/auth/login', {
    method: 'POST',
    body: { usuario: 'superadmin', contrasena: 'admin123' }
  });
  assert(saLogin.status === 200, `Login SuperAdmin status: ${saLogin.status}`);
  const saToken = saLogin.data.token;

  const metricsRes = await req('/api/admin/metrics', {
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(metricsRes.status === 200, 'Error al obtener métricas');
  const { metrics, charts } = metricsRes.data;

  assert(typeof metrics.total_dispositivos === 'number', 'total_dispositivos debe ser número');
  assert(typeof metrics.dispositivos_activos === 'number', 'dispositivos_activos debe ser número');
  assert(Array.isArray(charts.monthly_revenue), 'charts.monthly_revenue debe ser un arreglo');
  assert(Array.isArray(charts.subscription_distribution), 'charts.subscription_distribution debe ser un arreglo');
  assert(Array.isArray(charts.device_breakdown), 'charts.device_breakdown debe ser un arreglo');
  assert(Array.isArray(charts.company_growth), 'charts.company_growth debe ser un arreglo');
  console.log(`  ✔ Métricas verificadas: ${metrics.total_empresas} empresas, ${metrics.total_dispositivos} dispositivos en red.`);
  console.log(`  ✔ 4 Datasets analíticos para gráficos validados (Ingresos, Suscripciones, Tipos de Dispositivo, Crecimiento).`);

  // -----------------------------------------------------------------
  // 2. CREACIÓN DE DISPOSITIVO CON CÓDIGO TEMPORAL LGX-XXXX-XXXX
  // -----------------------------------------------------------------
  console.log('\n[2/7] Verificando generación de códigos y creación de dispositivo...');
  const newDevRes = await req('/api/admin/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}` },
    body: {
      empresa_id: 1,
      nombre: 'Tablet Bodega Central Test',
      tipo: 'TABLET',
      modelo: 'Samsung Tab Active4 Pro',
      ubicacion: 'Pasillo A-01'
    }
  });
  assert(newDevRes.status === 201, `Error al crear dispositivo: ${JSON.stringify(newDevRes.data)}`);
  const createdDevice = newDevRes.data.dispositivo;
  assert(createdDevice.empresa_id === 1, 'Dispositivo no asignado a empresa 1');
  assert(createdDevice.estado === 'PENDIENTE', 'Nuevo dispositivo debe estar en estado PENDIENTE');
  
  const activationCode = createdDevice.codigo_activacion;
  assert(/^LGX-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(activationCode), `Código no cumple formato LGX-XXXX-XXXX: ${activationCode}`);
  console.log(`  ✔ Dispositivo creado (ID: ${createdDevice.id}) con código seguro temporal: "${activationCode}".`);

  // Regenerar código
  const regenRes = await req(`/api/admin/devices/${createdDevice.id}/regenerate-code`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(regenRes.status === 200, 'Error al regenerar código de dispositivo');
  const regeneratedCode = regenRes.data.dispositivo.codigo_activacion;
  assert(/^LGX-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(regeneratedCode), 'Código regenerado no cumple formato');
  assert(regeneratedCode !== activationCode, 'El código regenerado debe ser distinto al anterior');
  console.log(`  ✔ Código regenerado exitosamente: "${regeneratedCode}".`);

  // -----------------------------------------------------------------
  // 3. ACTIVACIÓN POR PARTE DEL CLIENTE (TENANT) Y CÓDIGO DE UN SOLO USO
  // -----------------------------------------------------------------
  console.log('\n[3/7] Verificando activación de dispositivo por el cliente (Tenant)...');
  const emp1Login = await req('/api/auth/login', {
    method: 'POST',
    body: { usuario: 'admin', contrasena: 'admin123' }
  });
  assert(emp1Login.status === 200, 'Error login admin empresa 1');
  const emp1Token = emp1Login.data.token;

  // Activar dispositivo usando el código
  const activateRes = await req('/api/devices/activate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: {
      codigo: regeneratedCode,
      nombre: 'Tablet Bodega Central (Activada)',
      sistema_operativo: 'Android 14',
      version_logixt: 'v2.1.0'
    }
  });
  assert(activateRes.status === 200, `Error al activar dispositivo: ${JSON.stringify(activateRes.data)}`);
  assert(activateRes.data.dispositivo.estado === 'ACTIVO', 'Dispositivo activado debe tener estado ACTIVO');
  console.log('  ✔ Dispositivo activado correctamente por la empresa.');

  // Verificar que el código temporal fue invalidado (un solo uso)
  const reuseRes = await req('/api/devices/activate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: {
      codigo: regeneratedCode,
      nombre: 'Intento de Reuso'
    }
  });
  assert(reuseRes.status === 404, `El código debió ser de un solo uso pero retornó status ${reuseRes.status}`);
  console.log('  ✔ Verificado: Código de activación de un solo uso invalidado tras activación.');

  // -----------------------------------------------------------------
  // 4. CONTROL ESTRICTO DE LÍMITES DE DISPOSITIVOS POR PLAN
  // -----------------------------------------------------------------
  console.log('\n[4/7] Verificando control de límites de dispositivos según el Plan...');
  // Consultar estado de dispositivos de Empresa 1
  const myDevices = await req('/api/devices', {
    headers: { Authorization: `Bearer ${emp1Token}` }
  });
  assert(myDevices.status === 200, 'Error al consultar dispositivos de empresa');
  const maxDispositivos = myDevices.data.max_dispositivos;
  const activosIniciales = myDevices.data.activos_count;
  console.log(`  Información de plan: Límite máximo = ${maxDispositivos}, Activos = ${activosIniciales}.`);

  // 1. Crear un dispositivo pendiente con código antes de alcanzar el límite
  const pendingPreRes = await req('/api/admin/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}` },
    body: {
      empresa_id: 1,
      nombre: 'Dispositivo Excedente Pendiente',
      tipo: 'PC'
    }
  });
  assert(pendingPreRes.status === 201, 'Error al crear dispositivo previo');
  const codeExceedLimit = pendingPreRes.data.dispositivo.codigo_activacion;

  // 2. Activar dispositivos hasta llenar el límite del plan (maxDispositivos)
  const slotsToFill = maxDispositivos - activosIniciales;
  for (let i = 0; i < slotsToFill; i++) {
    const dev = await req('/api/admin/devices', {
      method: 'POST',
      headers: { Authorization: `Bearer ${saToken}` },
      body: {
        empresa_id: 1,
        nombre: `Dispositivo Llenado ${i + 1}`,
        tipo: 'PC'
      }
    });
    assert(dev.status === 201, 'Error al crear dispositivo de llenado');
    const actRes = await req('/api/devices/activate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${emp1Token}` },
      body: { codigo: dev.data.dispositivo.codigo_activacion }
    });
    assert(actRes.status === 200, 'Error al activar dispositivo');
  }

  // 3. Verificar bloqueo al intentar CREAR un nuevo dispositivo con el límite alcanzado
  const createExceedRes = await req('/api/admin/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}` },
    body: {
      empresa_id: 1,
      nombre: 'Dispositivo Bloqueado por Creación',
      tipo: 'PC'
    }
  });
  assert(createExceedRes.status === 400, `Creación debió retornar 400, dio: ${createExceedRes.status}`);
  assert(
    createExceedRes.data.error.includes('Has alcanzado el límite de dispositivos de tu plan'),
    `Mensaje de error debe ser "Has alcanzado el límite de dispositivos de tu plan", recibido: "${createExceedRes.data.error}"`
  );
  console.log(`  ✔ Bloqueo estricto al CREAR dispositivo por límite de plan confirmado.`);

  // 4. Verificar bloqueo al intentar ACTIVAR un código pendiente con el límite alcanzado
  const exceedRes = await req('/api/devices/activate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: { codigo: codeExceedLimit }
  });
  assert(exceedRes.status === 400, `Activación debió rechazar con 400 por límite excedido, dio ${exceedRes.status}`);
  assert(
    exceedRes.data.error.includes('Has alcanzado el límite de dispositivos de tu plan'),
    `Mensaje de error debe ser "Has alcanzado el límite de dispositivos de tu plan", recibido: "${exceedRes.data.error}"`
  );
  console.log(`  ✔ Bloqueo estricto al ACTIVAR dispositivo por límite de plan confirmado: "${exceedRes.data.error}".`);

  // -----------------------------------------------------------------
  // 5. AISLAMIENTO MULTI-TENANT DE DISPOSITIVOS (EMPRESA 2)
  // -----------------------------------------------------------------
  console.log('\n[5/7] Verificando aislamiento multi-tenant de dispositivos...');
  const emp2Login = await req('/api/auth/login', {
    method: 'POST',
    body: { usuario: 'admin_andina', contrasena: 'andina123' }
  });
  assert(emp2Login.status === 200, 'Error login admin empresa 2');
  const emp2Token = emp2Login.data.token;

  const emp2Devices = await req('/api/devices', {
    headers: { Authorization: `Bearer ${emp2Token}` }
  });
  assert(emp2Devices.status === 200, 'Error al listar dispositivos de empresa 2');
  const emp2List = emp2Devices.data.dispositivos;
  assert(emp2List.every(d => d.empresa_id === 2), 'Todos los dispositivos listados deben pertenecer a empresa_id = 2');
  
  // Empresa 2 intenta activar con código que pertenece a Empresa 1
  const crossActivateRes = await req('/api/devices/activate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { codigo: codeExceedLimit }
  });
  assert(crossActivateRes.status === 403, `Empresa 2 no puede activar dispositivo de Empresa 1, status recibido: ${crossActivateRes.status}`);
  console.log('  ✔ Aislamiento verificado: Empresa 2 no tiene acceso ni puede activar dispositivos de Empresa 1.');

  // -----------------------------------------------------------------
  // 6. PERFIL DE USUARIO, CAMBIO DE TEMA Y COLORES DE ACENTO
  // -----------------------------------------------------------------
  console.log('\n[6/7] Verificando edición de perfil y personalización de temas...');
  const updateProfRes = await req('/api/auth/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: {
      nombre: 'Carlos Admin',
      apellido: 'Logistics',
      email: 'carlos.admin@techlogix.com',
      telefono: '+56 9 8888 7777',
      foto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    }
  });
  assert(updateProfRes.status === 200, 'Error al actualizar perfil');
  assert(updateProfRes.data.user.apellido === 'Logistics', 'Apellido no actualizado');
  assert(updateProfRes.data.user.telefono === '+56 9 8888 7777', 'Teléfono no actualizado');
  console.log('  ✔ Datos personales del usuario actualizados exitosamente.');

  // Cambio de preferencias de apariencia (tema y acento)
  const prefRes = await req('/api/auth/preferences', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: {
      tema: 'dark',
      color_acento: 'emerald'
    }
  });
  assert(prefRes.status === 200, 'Error al actualizar preferencias de apariencia');
  assert(prefRes.data.user.tema === 'dark', 'Tema no actualizado en backend');
  assert(prefRes.data.user.color_acento === 'emerald', 'Color de acento no actualizado en backend');
  console.log('  ✔ Tema ("dark") y color de acento ("emerald") persistidos en base de datos.');

  // -----------------------------------------------------------------
  // 7. REGISTRO DE AUDITORÍA Y TRAZABILIDAD (actividad_logs)
  // -----------------------------------------------------------------
  console.log('\n[7/7] Verificando auditoría de actividad en base de datos y endpoints SuperAdmin...');
  const logsRes = await req('/api/admin/activity', {
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(logsRes.status === 200, 'Error al obtener historial global de actividad');
  assert(logsRes.data.logs.length > 0, 'Deben existir registros de actividad');

  // Buscar logs generados en las pruebas
  const activationLog = logsRes.data.logs.find(l => l.accion === 'DISPOSITIVO_ACTIVADO');
  assert(activationLog !== undefined, 'No se registró log de DISPOSITIVO_ACTIVADO');
  console.log(`  ✔ Registro de auditoría encontrado: [${activationLog.fecha}] ${activationLog.accion} - ${activationLog.detalles}`);

  const prefLog = logsRes.data.logs.find(l => l.accion === 'PREFERENCIAS_ACTUALIZADAS');
  assert(prefLog !== undefined, 'No se registró log de PREFERENCIAS_ACTUALIZADAS');
  console.log(`  ✔ Registro de auditoría de apariencia encontrado: [${prefLog.fecha}] ${prefLog.accion}`);

  // Verificar módulo de pagos global y suscripciones global
  const paymentsRes = await req('/api/admin/payments', {
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(paymentsRes.status === 200, 'Error al obtener pagos globales');

  const subsRes = await req('/api/admin/subscriptions', {
    headers: { Authorization: `Bearer ${saToken}` }
  });
  assert(subsRes.status === 200, 'Error al obtener suscripciones globales');

  console.log('\n================================================================');
  console.log('🎉 ¡TODAS LAS PRUEBAS DE LA FASE 2 PASARON EXITOSAMENTE AL 100%!');
  console.log('================================================================');

  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ ERROR EN PRUEBAS FASE 2:');
  console.error(err);
  process.exit(1);
});

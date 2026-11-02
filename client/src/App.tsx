import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Header } from './components/layout/Header';
import { HubMain, MainArea, SubAreaOption } from './pages/HubMain';
import { AlmacenView, AlmacenTab } from './pages/AlmacenView';
import { IngresoView } from './pages/IngresoView';
import { DespachoView } from './pages/DespachoView';
import { ScannerPage } from './pages/ScannerPage';
import { UsersPage } from './pages/UsersPage';
import { AdminPlatformPage } from './pages/AdminPlatformPage';

import { CameraScannerModal } from './components/scanner/CameraScannerModal';
import { ProductModal } from './components/products/ProductModal';
import { AdjustModal } from './components/movements/AdjustModal';
import { LabelPrintModal } from './components/products/LabelPrintModal';
import { MySubscriptionModal } from './components/saas/MySubscriptionModal';
import { SuspendedTenantScreen } from './components/saas/SuspendedTenantScreen';
import { ProfileModal } from './components/profile/ProfileModal';
import { CompanyDevicesModal } from './components/devices/CompanyDevicesModal';
import { StorageBackupModal } from './components/storage/StorageBackupModal';
import { StorageSetupWizardModal } from './components/storage/StorageSetupWizardModal';

import { Product, Category, DashboardSummary } from './types';
import { api, syncPendingMovementMutations } from './services/api';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { sound } from './services/sound';

type ViewMode = 'hub' | 'almacen' | 'ingreso' | 'despacho' | 'scanner' | 'usuarios' | 'admin';

export const App: React.FC = () => {
  const { user, isLoading, isAdmin } = useAuth();

  const [currentView, setCurrentView] = useState<ViewMode>('hub');
  const [almacenTab, setAlmacenTab] = useState<AlmacenTab>('dashboard');
  const [ingresoTab, setIngresoTab] = useState<'ingreso-flujo' | 'ingreso-categorias'>('ingreso-flujo');

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Modales Operativos
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);

  const [isLabelOpen, setIsLabelOpen] = useState(false);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);

  // Modal SaaS "Mi Suscripción"
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);

  // Modales Fase 2: Perfil de Usuario y Dispositivos de Empresa
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'profile' | 'appearance' | 'subscription'>('profile');
  const [isDevicesModalOpen, setIsDevicesModalOpen] = useState(false);

  // Modales Fase 3: Almacenamiento Local y Respaldo en la Nube
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isStorageWizardOpen, setIsStorageWizardOpen] = useState(false);

  const [scannedCodeForScannerPage, setScannedCodeForScannerPage] = useState<string>('');
  const [actionProduct, setActionProduct] = useState<Product | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Asistente de configuración inicial en primer inicio de sesión
  useEffect(() => {
    if (user && user.rol !== 'SUPERADMIN' && !user.almacenamiento_configurado) {
      setIsStorageWizardOpen(true);
    }
  }, [user]);

  // Si el usuario es SUPERADMIN, mostrar por defecto el panel de plataforma
  useEffect(() => {
    if (user?.rol === 'SUPERADMIN') {
      setCurrentView('admin');
    } else {
      setCurrentView('hub');
    }
  }, [user]);

  const loadGlobalData = async () => {
    try {
      const [sumRes, catRes] = await Promise.all([
        api.dashboard.getSummary(),
        api.categories.getAll(),
      ]);
      setSummary(sumRes);
      setCategories(catRes.categories);
    } catch (err) {
      console.error('Error cargando datos del sistema:', err);
    }
  };

  useEffect(() => {
    if (user && user.rol !== 'SUPERADMIN') {
      loadGlobalData();
    }
  }, [user, refreshKey]);

  useEffect(() => {
    if (!user || user.rol === 'SUPERADMIN') return;

    let syncing = false;
    const syncIfEnabled = async () => {
      if (!navigator.onLine || syncing) return;
      syncing = true;
      try {
        const { config } = await api.storage.getConfig();
        if (config.auto_sincronizar) {
          const result = await syncPendingMovementMutations();
          if (result?.appliedCount) await api.storage.syncPull();
        }
      } catch (error) {
        console.warn('No se pudieron sincronizar las operaciones pendientes:', error);
      } finally {
        syncing = false;
      }
    };

    void syncIfEnabled();
    window.addEventListener('online', syncIfEnabled);
    const intervalId = window.setInterval(syncIfEnabled, 30000);
    return () => {
      window.removeEventListener('online', syncIfEnabled);
      window.clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    let timeoutId: number | undefined;
    const showNotice = (event: Event) => {
      const notice = (event as CustomEvent<string>).detail;
      setSyncNotice(notice);
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setSyncNotice(null), 6000);
    };
    window.addEventListener('logixt:sync-notice', showNotice);
    return () => {
      window.removeEventListener('logixt:sync-notice', showNotice);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  // Hook global de pistola lectora de código de barras USB/Bluetooth
  useBarcodeScanner({
    enabled: !!user,
    onScan: (code) => {
      sound.playSuccess();
      setScannedCodeForScannerPage(code);
      setCurrentView('scanner');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#060b17] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-400">Iniciando LOGIX WMS SaaS...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const triggerRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleCameraScanSuccess = (decodedText: string) => {
    sound.playSuccess();
    setScannedCodeForScannerPage(decodedText);
    setCurrentView('scanner');
  };

  const handleNavigateArea = (area: MainArea, subOption?: SubAreaOption) => {
    setActionProduct(null);
    if (area === 'almacen') {
      if (subOption === 'almacen-movimientos') setAlmacenTab('movimientos');
      else if (subOption === 'almacen-productos') setAlmacenTab('productos');
      else if (subOption === 'almacen-alertas') setAlmacenTab('alertas');
      else setAlmacenTab('dashboard');
      setCurrentView('almacen');
    } else if (area === 'ingreso') {
      if (subOption === 'ingreso-categorias') setIngresoTab('ingreso-categorias');
      else setIngresoTab('ingreso-flujo');
      setCurrentView('ingreso');
    } else if (area === 'despacho') {
      setCurrentView('despacho');
    }
  };

  // 🛡️ CONTROL DE ACCESO SAAS (SECCIÓN 5 & 14):
  // Si la empresa o suscripción está suspendida, bloquear funciones operativas
  const isTenantSuspended =
    user.rol !== 'SUPERADMIN' &&
    (user.empresa_estado === 'SUSPENDIDA' || user.suscripcion_estado === 'SUSPENDED');

  if (isTenantSuspended) {
    return (
      <>
        <SuspendedTenantScreen
          onOpenSubscriptionModal={() => setIsSubscriptionModalOpen(true)}
          companyName={user.empresa_nombre || undefined}
          planName={user.plan_nombre || undefined}
        />
        <MySubscriptionModal
          isOpen={isSubscriptionModalOpen}
          onClose={() => setIsSubscriptionModalOpen(false)}
          onSuccessRenewal={() => {
            triggerRefresh();
            window.location.reload();
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen app-layout-root flex flex-col font-sans transition-colors duration-200">
      {/* 1. Header Global con Identidad LOGIX WMS */}
      <Header
        onOpenScanner={() => setIsCameraOpen(true)}
        onGoHome={() => {
          setActionProduct(null);
          if (user.rol === 'SUPERADMIN') {
            setCurrentView('admin');
          } else {
            setCurrentView('hub');
          }
        }}
        onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
        onGoToAdminPlatform={() => setCurrentView('admin')}
        onOpenProfile={(tab) => {
          setProfileTab(tab || 'profile');
          setIsProfileModalOpen(true);
        }}
        onOpenDevices={() => setIsDevicesModalOpen(true)}
        onOpenStorage={() => setIsStorageModalOpen(true)}
        isSuperAdminView={currentView === 'admin'}
      />

      {syncNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-20 z-[70] max-w-sm rounded-xl border border-amber-500/40 bg-slate-950/95 px-4 py-3 text-xs font-semibold text-amber-100 shadow-xl"
        >
          {syncNotice}
        </div>
      )}

      {/* 2. Área Central de Contenido */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* PANEL DEL PROPIETARIO DEL SOFTWARE (SUPERADMIN) (SECCIÓN 8) */}
        {currentView === 'admin' && user.rol === 'SUPERADMIN' && (
          <AdminPlatformPage onGoToWarehouseDemo={() => setCurrentView('hub')} />
        )}

        {/* VISTA PRINCIPAL: CENTRO DE OPERACIONES DE 3 ÁREAS */}
        {currentView === 'hub' && (
          <HubMain
            summary={summary}
            onNavigateArea={handleNavigateArea}
          />
        )}

        {/* ÁREA 1: ALMACÉN (DASHBOARD, MOVIMIENTOS, PRODUCTOS, ALERTAS) */}
        {currentView === 'almacen' && (
          <AlmacenView
            initialTab={almacenTab}
            onGoBack={() => setCurrentView('hub')}
            onOpenInbound={(prod) => {
              setActionProduct(prod || null);
              setIngresoTab('ingreso-flujo');
              setCurrentView('ingreso');
            }}
            onOpenOutbound={(prod) => {
              setActionProduct(prod || null);
              setCurrentView('despacho');
            }}
            onOpenAdjust={(prod) => {
              setAdjustProduct(prod || null);
              setIsAdjustOpen(true);
            }}
            onOpenNewProduct={() => {
              setProductToEdit(null);
              setIsProductModalOpen(true);
            }}
            onOpenEditProduct={(prod) => {
              setProductToEdit(prod);
              setIsProductModalOpen(true);
            }}
            onOpenLabel={(prod) => {
              setLabelProduct(prod);
              setIsLabelOpen(true);
            }}
            refreshKey={refreshKey}
          />
        )}

        {/* ÁREA 2: INGRESO (RECEPCIÓN RÁPIDA & CATEGORÍAS) */}
        {currentView === 'ingreso' && (
          <IngresoView
            initialTab={ingresoTab}
            initialProduct={actionProduct}
            onGoBack={() => setCurrentView('hub')}
            onOpenScannerCamera={() => setIsCameraOpen(true)}
            onSuccessMutation={triggerRefresh}
            onExploreCategory={() => {
              setAlmacenTab('productos');
              setCurrentView('almacen');
            }}
          />
        )}

        {/* ÁREA 3: DESPACHO (SALIDA CON COMPARADOR DE STOCK) */}
        {currentView === 'despacho' && (
          <DespachoView
            initialProduct={actionProduct}
            onGoBack={() => setCurrentView('hub')}
            onOpenScannerCamera={() => setIsCameraOpen(true)}
            onSuccessMutation={triggerRefresh}
          />
        )}

        {/* ESCÁNER CONTINUO RÁPIDO */}
        {currentView === 'scanner' && (
          <div className="max-w-4xl mx-auto w-full py-6 px-4">
            <button
              onClick={() => setCurrentView('hub')}
              className="mb-4 flex items-center space-x-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
            >
              ← Volver al Centro de Operaciones
            </button>
            <ScannerPage
              scannedCodeFromCamera={scannedCodeForScannerPage}
              onClearScannedCameraCode={() => setScannedCodeForScannerPage('')}
              onLaunchCamera={() => setIsCameraOpen(true)}
              onOpenInbound={(prod) => {
                setActionProduct(prod || null);
                setIngresoTab('ingreso-flujo');
                setCurrentView('ingreso');
              }}
              onOpenOutbound={(prod) => {
                setActionProduct(prod || null);
                setCurrentView('despacho');
              }}
              onOpenAdjust={(prod) => {
                setAdjustProduct(prod);
                setIsAdjustOpen(true);
              }}
              onOpenLabel={(prod) => {
                setLabelProduct(prod);
                setIsLabelOpen(true);
              }}
              onOpenHistory={() => {
                setAlmacenTab('movimientos');
                setCurrentView('almacen');
              }}
            />
          </div>
        )}

        {/* USUARIOS Y PERMISOS (ADMIN DE EMPRESA) */}
        {currentView === 'usuarios' && isAdmin && (
          <div className="max-w-5xl mx-auto w-full py-6 px-4">
            <button
              onClick={() => setCurrentView('hub')}
              className="mb-4 flex items-center space-x-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 hover:text-white transition"
            >
              ← Volver al Centro de Operaciones
            </button>
            <UsersPage />
          </div>
        )}
      </main>

      {/* MODALES GLOBALES */}

      {/* Modal Cámara Escáner */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScanSuccess={handleCameraScanSuccess}
      />

      {/* Modal Producto (Crear / Editar) */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        productToEdit={productToEdit}
        categories={categories}
        onSuccess={() => {
          triggerRefresh();
        }}
      />

      {/* Modal Ajuste de Inventario */}
      <AdjustModal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        initialProduct={adjustProduct}
        onOpenScanner={() => setIsCameraOpen(true)}
        onSuccess={() => {
          triggerRefresh();
        }}
      />

      {/* Modal Impresión de Etiqueta con Barcode y QR */}
      <LabelPrintModal
        isOpen={isLabelOpen}
        onClose={() => setIsLabelOpen(false)}
        product={labelProduct}
      />

      {/* Modal SaaS Mi Suscripción */}
      <MySubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
        onSuccessRenewal={() => {
          triggerRefresh();
        }}
      />

      {/* Modal Perfil de Usuario y Personalización */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        initialTab={profileTab}
        onOpenSubscriptionDetails={() => {
          setIsProfileModalOpen(false);
          setIsSubscriptionModalOpen(true);
        }}
        onOpenStorage={() => setIsStorageModalOpen(true)}
      />

      {/* Modal Terminales y Dispositivos de la Empresa */}
      <CompanyDevicesModal
        isOpen={isDevicesModalOpen}
        onClose={() => setIsDevicesModalOpen(false)}
      />

      {/* Modal Centro de Almacenamiento y Copias de Seguridad */}
      <StorageBackupModal
        isOpen={isStorageModalOpen}
        onClose={() => setIsStorageModalOpen(false)}
        onOpenSetupWizard={() => {
          setIsStorageModalOpen(false);
          setIsStorageWizardOpen(true);
        }}
      />

      {/* Modal Asistente de Configuración Inicial de Almacenamiento */}
      <StorageSetupWizardModal
        isOpen={isStorageWizardOpen}
        onClose={() => setIsStorageWizardOpen(false)}
        onComplete={() => {
          triggerRefresh();
        }}
        isInitialSetup={!user?.almacenamiento_configurado}
      />
    </div>
  );
};

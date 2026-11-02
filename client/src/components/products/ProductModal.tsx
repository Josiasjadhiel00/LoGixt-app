import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertCircle, Save, Package } from 'lucide-react';
import { Product, Category } from '../../types';
import { api } from '../../services/api';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (product: Product) => void;
  productToEdit?: Product | null;
  categories: Category[];
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  productToEdit,
  categories,
}) => {
  const isEditing = !!productToEdit;

  const [formData, setFormData] = useState({
    nombre: '',
    codigo: '',
    codigo_barras: '',
    codigo_qr: '',
    categoria_id: '',
    descripcion: '',
    unidad_medida: 'Unidades',
    stock_inicial: '0',
    stock_minimo: '5',
    ubicacion_almacen: 'Almacén Principal',
    ubicacion_pasillo: 'Pasillo 01',
    ubicacion_estante: 'Estante A',
    ubicacion_nivel: 'Nivel 01',
    proveedor: '',
    imagen: '',
  });

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (productToEdit) {
      setFormData({
        nombre: productToEdit.nombre || '',
        codigo: productToEdit.codigo || '',
        codigo_barras: productToEdit.codigo_barras || '',
        codigo_qr: productToEdit.codigo_qr || '',
        categoria_id: productToEdit.categoria_id ? String(productToEdit.categoria_id) : '',
        descripcion: productToEdit.descripcion || '',
        unidad_medida: productToEdit.unidad_medida || 'Unidades',
        stock_inicial: String(productToEdit.stock_actual || 0),
        stock_minimo: String(productToEdit.stock_minimo || 5),
        ubicacion_almacen: productToEdit.ubicacion_almacen || 'Almacén Principal',
        ubicacion_pasillo: productToEdit.ubicacion_pasillo || '',
        ubicacion_estante: productToEdit.ubicacion_estante || '',
        ubicacion_nivel: productToEdit.ubicacion_nivel || '',
        proveedor: productToEdit.proveedor || '',
        imagen: productToEdit.imagen || '',
      });
    } else {
      setFormData({
        nombre: '',
        codigo: '',
        codigo_barras: '',
        codigo_qr: '',
        categoria_id: categories.length > 0 ? String(categories[0].id) : '',
        descripcion: '',
        unidad_medida: 'Unidades',
        stock_inicial: '0',
        stock_minimo: '5',
        ubicacion_almacen: 'Almacén Principal',
        ubicacion_pasillo: 'Pasillo 01',
        ubicacion_estante: 'Estante A',
        ubicacion_nivel: 'Nivel 01',
        proveedor: '',
        imagen: '',
      });
    }
    setError(null);
  }, [productToEdit, isOpen, categories]);

  if (!isOpen) return null;

  const handleGenerateQR = () => {
    const codeBase = formData.codigo.trim() || 'PROD';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(Math.random() * 1000);
    setFormData((prev) => ({
      ...prev,
      codigo_qr: `WMS-${codeBase}-${timestamp}-${random}`,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.nombre.trim() || !formData.codigo.trim()) {
      setError('El nombre y el código interno del producto son obligatorios.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && productToEdit) {
        const res = await api.products.update(productToEdit.id, {
          nombre: formData.nombre,
          codigo_barras: formData.codigo_barras || null,
          codigo_qr: formData.codigo_qr || productToEdit.codigo_qr,
          categoria_id: formData.categoria_id ? Number(formData.categoria_id) : null,
          descripcion: formData.descripcion || null,
          unidad_medida: formData.unidad_medida,
          stock_minimo: parseInt(formData.stock_minimo, 10) || 0,
          ubicacion_almacen: formData.ubicacion_almacen || null,
          ubicacion_pasillo: formData.ubicacion_pasillo || null,
          ubicacion_estante: formData.ubicacion_estante || null,
          ubicacion_nivel: formData.ubicacion_nivel || null,
          proveedor: formData.proveedor || null,
          imagen: formData.imagen || null,
        });
        onSuccess(res.product);
      } else {
        const res = await api.products.create({
          nombre: formData.nombre,
          codigo: formData.codigo,
          codigo_barras: formData.codigo_barras || null,
          codigo_qr: formData.codigo_qr || undefined,
          categoria_id: formData.categoria_id ? Number(formData.categoria_id) : null,
          descripcion: formData.descripcion || null,
          unidad_medida: formData.unidad_medida,
          stock_inicial: parseInt(formData.stock_inicial, 10) || 0,
          stock_minimo: parseInt(formData.stock_minimo, 10) || 5,
          ubicacion_almacen: formData.ubicacion_almacen || 'Almacén Principal',
          ubicacion_pasillo: formData.ubicacion_pasillo || null,
          ubicacion_estante: formData.ubicacion_estante || null,
          ubicacion_nivel: formData.ubicacion_nivel || null,
          proveedor: formData.proveedor || null,
          imagen: formData.imagen || null,
        });
        onSuccess(res.product);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al procesar el producto.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-[#0b1226] text-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-800 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 bg-[#070e22] border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Package className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-lg text-white">
              {isEditing ? 'Editar Producto' : 'Registrar Nuevo Producto'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4.5 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="p-3.5 bg-rose-950/60 border border-rose-500/40 rounded-xl flex items-center space-x-2.5 text-rose-300 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Información básica */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Nombre del Producto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Cable HDMI 2.0 3m"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Código Interno *
                </label>
                <input
                  type="text"
                  required
                  disabled={isEditing}
                  placeholder="Ej. CAB-HDMI-01"
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none font-mono disabled:bg-slate-950 disabled:text-slate-500 uppercase"
                />
              </div>
            </div>

            {/* Códigos de Barras y QR */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Código de Barras (EAN / UPC / Code128)
                </label>
                <input
                  type="text"
                  placeholder="Ej. 7701234567890"
                  value={formData.codigo_barras}
                  onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    Código QR
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateQR}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Autogenerar QR</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Ej. WMS-CAB-001"
                  value={formData.codigo_qr}
                  onChange={(e) => setFormData({ ...formData, codigo_qr: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Categoría y Unidad de Medida */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Categoría
                </label>
                <select
                  value={formData.categoria_id}
                  onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Seleccione una categoría</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Unidad de Medida
                </label>
                <select
                  value={formData.unidad_medida}
                  onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="Unidades">Unidades</option>
                  <option value="Cajas">Cajas</option>
                  <option value="Pares">Pares</option>
                  <option value="Bobinas">Bobinas</option>
                  <option value="Rollos">Rollos</option>
                  <option value="Kits">Kits</option>
                  <option value="Metros">Metros</option>
                  <option value="Kilogramos">Kilogramos</option>
                  <option value="Litros">Litros</option>
                </select>
              </div>
            </div>

            {/* Cantidades y Stock */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4.5 bg-slate-900/60 rounded-2xl border border-slate-800">
              {!isEditing && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Stock Inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock_inicial}
                    onChange={(e) => setFormData({ ...formData, stock_inicial: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white font-bold focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Se registrará automáticamente como movimiento inicial.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Stock Mínimo (Alerta) *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formData.stock_minimo}
                  onChange={(e) => setFormData({ ...formData, stock_minimo: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-amber-400 font-bold focus:border-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Nivel en el que se activará la alerta de reposición.
                </span>
              </div>
            </div>

            {/* Ubicación Física en Almacén */}
            <div className="p-4.5 bg-emerald-950/20 rounded-2xl border border-emerald-500/30">
              <label className="block text-xs font-black uppercase tracking-wider text-emerald-400 mb-2.5">
                📍 Ubicación Física en Almacén
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Almacén</label>
                  <input
                    type="text"
                    placeholder="Alm. Principal"
                    value={formData.ubicacion_almacen}
                    onChange={(e) => setFormData({ ...formData, ubicacion_almacen: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Pasillo</label>
                  <input
                    type="text"
                    placeholder="Pasillo 02"
                    value={formData.ubicacion_pasillo}
                    onChange={(e) => setFormData({ ...formData, ubicacion_pasillo: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Estante</label>
                  <input
                    type="text"
                    placeholder="Estante A"
                    value={formData.ubicacion_estante}
                    onChange={(e) => setFormData({ ...formData, ubicacion_estante: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Nivel</label>
                  <input
                    type="text"
                    placeholder="Nivel 01"
                    value={formData.ubicacion_nivel}
                    onChange={(e) => setFormData({ ...formData, ubicacion_nivel: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-emerald-500 focus:outline-none font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Descripción y Proveedor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Proveedor Habitual
                </label>
                <input
                  type="text"
                  placeholder="Ej. TechCable Soluciones"
                  value={formData.proveedor}
                  onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  URL de Imagen (Opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://ejemplo.com/foto.jpg"
                  value={formData.imagen}
                  onChange={(e) => setFormData({ ...formData, imagen: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Descripción
              </label>
              <textarea
                rows={2}
                placeholder="Especificaciones o notas logísticas del producto..."
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-[#070e22] border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : isEditing ? 'Actualizar Producto' : 'Registrar Producto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
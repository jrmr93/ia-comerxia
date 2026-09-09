import React, { useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Database,
  DollarSign,
  Globe,
  Image as ImageIcon,
  Images,
  Loader2,
  Package,
  Percent,
  Plus,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { CostOption, ParsedProductResult } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface TelegramSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_MESSAGES = [
  {
    title: '🤝 Oferta Afiliados - Smartwatch Serie 9 Pro (Precios Afiliado)',
    sender: 'Grupo Proveedores Dropshipping',
    username: '@proveedor_dropship_vip',
    photos: [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&auto=format&fit=crop&q=80',
    ],
    caption:
      '🚀 ¡Llegaron al almacén! Smartwatch Serie 9 Pro Pantalla AMOLED 49mm sumergible con llamadas bluetooth. Precios para la comunidad:\n• Precio Afiliado x 1 unidad: $24.50 c/u\n• Precio Afiliado x 3 unidades: $21.00 c/u\n• Precio Afiliado por caja (20 u.): $18.00 c/u\n• Precio Mayorista Bulto: $15.50 c/u\n• PVP Sugerido al público: $49.00\nStock físico: 45 unidades listas para despacho inmediato.',
  },
  {
    title: '👟 Zapatillas Nike Running (Varios Precios de Costo)',
    sender: 'Distribuidora Calzado Premium',
    username: '@calzado_mayorista_vip',
    photos: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&auto=format&fit=crop&q=80',
    ],
    caption:
      '🔥 OFERTA LOTE: Zapatillas Nike Air Zoom Running. Colores Rojo/Negro y Blanco. Tallas 38 a 44. Precios de costo disponibles: Por unidad/muestra: $38.00 c/u. A partir de 6 pares: $32.00 c/u. Por cajón mayorista (24 pares): $26.50 c/u. Stock disponible: 30 pares.',
  },
  {
    title: '🏷️ Producto con "Más IVA" (+ % IVA Configurado)',
    sender: 'TecnoMayorista Industrial',
    username: '@mayorista_industrial',
    photos: [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
    ],
    caption:
      'Smartwatch Serie 9 Ultra OLED 49mm. Costo unitario: $20.00 + IVA. Stock disponible: 35 unidades.',
  },
  {
    title: '✅ Producto con "Incluye IVA" (Costo Final)',
    sender: 'Audio Pro Importaciones',
    username: '@audio_directo',
    photos: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
    ],
    caption:
      'Auriculares inalámbricos Diadema Pro ANC. Costo: $35.00 incluye IVA. 20 unidades listas para entrega.',
  },
  {
    title: '👕 Lote Camisetas Polo Piqué',
    sender: 'Textiles Confecciones Express',
    username: '@textiles_mayoristas',
    photos: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
    ],
    caption:
      '👕 Camisetas Polo tipo piqué 100% algodón peinado de alta densidad. Colores surtidos. Tallas S, M, L, XL. Costo al detalle: $11.50. Costo por paquete de 50 piezas: $8.00 la unidad.',
  },
];

const MARGIN_PRESETS = [20, 30, 40, 50, 75, 100];

export const TelegramSimulatorModal: React.FC<TelegramSimulatorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { authFetch } = useAuth();
  const [caption, setCaption] = useState(PRESET_MESSAGES[0].caption);
  const [senderName, setSenderName] = useState(PRESET_MESSAGES[0].sender);
  const [senderUsername, setSenderUsername] = useState(PRESET_MESSAGES[0].username);
  const [marginPercent, setMarginPercent] = useState<number>(30);
  const [photosList, setPhotosList] = useState<string[]>(PRESET_MESSAGES[0].photos);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [newPhotoUrlInput, setNewPhotoUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    extracted: ParsedProductResult;
    inventoryItem: any;
    isDuplicate?: boolean;
    sku?: string;
    message?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: (typeof PRESET_MESSAGES)[0]) => {
    setCaption(preset.caption);
    setSenderName(preset.sender);
    setSenderUsername(preset.username);
    setPhotosList(preset.photos);
    setVideoUrl((preset as any).videoUrl || '');
    setResult(null);
    setError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          setPhotosList((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAddPhotoUrl = () => {
    if (newPhotoUrlInput.trim()) {
      setPhotosList((prev) => [...prev, newPhotoUrlInput.trim()]);
      setNewPhotoUrlInput('');
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotosList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption && photosList.length === 0) {
      setError('Debes ingresar un mensaje o al menos una foto del producto');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await authFetch('/api/telegram/simulate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          photos: photosList,
          photoBase64: photosList[0] || null,
          photoMimeType: photosList[0]?.startsWith('data:image/png')
            ? 'image/png'
            : 'image/jpeg',
          videoUrl: videoUrl.trim() || undefined,
          senderName,
          senderUsername,
          profitMarginPercent: marginPercent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar el mensaje');
      }

      setResult(data);
      onSuccess();
    } catch (err: any) {
      console.error('Error simulating:', err);
      setError(err.message || 'Error al procesar con Gemini AI');
    } finally {
      setLoading(false);
    }
  };

  // Quick switch cost price option from the result card
  const handleSwitchCostOption = async (opt: CostOption) => {
    if (!result?.inventoryItem?.id) return;
    try {
      const res = await authFetch(`/api/inventory/${result.inventoryItem.id}/select-cost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          costPrice: opt.price,
          profitMarginPercent: marginPercent,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setResult((prev) => (prev ? { ...prev, inventoryItem: updated } : null));
        onSuccess();
      }
    } catch (err) {
      console.error('Error switching cost option:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[92vh] flex flex-col text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 shadow-2xs">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <span>Simulador de Mensajes Telegram</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                  Multi-Costo + Margen + IA
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Prueba cómo Gemini detecta múltiples precios de costo, elige el mayor por defecto y aplica el margen de ganancia
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="overflow-y-auto flex-1 py-4 space-y-5">
          {/* Preset Buttons */}
          <div>
            <label className="text-xs font-bold text-slate-700 mb-2 block">
              Cargar Ejemplos Predefinidos:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESET_MESSAGES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-sky-50/50 border border-slate-200 hover:border-sky-300 text-left transition cursor-pointer group"
                >
                  <span className="text-xs font-bold text-slate-900 group-hover:text-sky-700 block truncate">
                    {preset.title}
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                    👤 {preset.sender} ({preset.photos.length} fotos)
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Sender and Remitente Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Nombre del Proveedor (Remitente):
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-sky-500 transition"
                  placeholder="Distribuidora Calzado Premium"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Username de Telegram:
                </label>
                <input
                  type="text"
                  value={senderUsername}
                  onChange={(e) => setSenderUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono focus:outline-none focus:bg-white focus:border-sky-500 transition"
                  placeholder="@proveedor_vip"
                />
              </div>
            </div>

            {/* Profit Margin Percentage Configuration */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <Percent className="w-3.5 h-3.5 text-sky-600" />
                  <span>Margen de Ganancia para este Producto (%):</span>
                </label>
                <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                  {marginPercent}%
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(Number(e.target.value))}
                  className="w-24 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <div className="flex-1 flex space-x-1 overflow-x-auto py-0.5">
                  {MARGIN_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMarginPercent(p)}
                      className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
                        marginPercent === p
                          ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      +{p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Message Caption */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Texto del Mensaje / Descripción del Producto:
              </label>
              <textarea
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escribe o pega el mensaje del proveedor con el nombre, costo y detalles del producto..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-sky-500 transition resize-none"
              />
            </div>

            {/* Multi-Photo Manager */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <Images className="w-3.5 h-3.5 text-purple-600" />
                  <span>Fotografías del Producto ({photosList.length} adjuntas)</span>
                </label>

                {/* File Upload Button */}
                <label className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold transition cursor-pointer flex items-center space-x-1 shadow-2xs">
                  <Upload className="w-3 h-3 text-purple-600" />
                  <span>Subir Fotos</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Photo preview cards */}
              {photosList.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photosList.map((photo, idx) => (
                    <div
                      key={idx}
                      className="aspect-square rounded-xl overflow-hidden bg-slate-50 border border-slate-200 relative group shadow-2xs"
                    >
                      <img
                        src={photo}
                        alt={`Foto ${idx + 1}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute bottom-1 left-1 text-[9px] bg-slate-900/80 px-1 rounded text-white font-mono font-bold">
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 p-1 rounded bg-slate-900/80 hover:bg-rose-600 text-white transition cursor-pointer opacity-0 group-hover:opacity-100"
                        title="Quitar foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
                  <span>Sin fotografías adjuntas. Sube imágenes del producto desde tu dispositivo.</span>
                </div>
              )}

              {/* Add by URL input */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="text"
                  value={newPhotoUrlInput}
                  onChange={(e) => setNewPhotoUrlInput(e.target.value)}
                  placeholder="Pegar URL de foto adicional..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:outline-none focus:bg-white focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleAddPhotoUrl}
                  disabled={!newPhotoUrlInput.trim()}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-bold transition flex items-center space-x-1 border border-slate-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </div>
            </div>

            {/* Optional Video of the Product */}
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <Video className="w-3.5 h-3.5 text-rose-500" />
                  <span>Video del Producto (Opcional - mensaje adicional)</span>
                </span>
                {videoUrl && (
                  <button
                    type="button"
                    onClick={() => setVideoUrl('')}
                    className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Quitar video
                  </button>
                )}
              </label>
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://... enlace de video enviado en mensaje sucesivo"
                className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs focus:outline-none focus:border-rose-500 font-mono"
              />
              <p className="text-[10px] text-slate-500">
                El bot agrupa automáticamente videos y fotos enviados en mensajes separados en una ventana de 3 segundos.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analizando precios de costo y fotos con Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Simular Mensaje y Registrar en PostgreSQL</span>
                </>
              )}
            </button>
          </form>

          {/* Success or Duplicate Extraction Preview */}
          {result && (
            <div
              className={`p-4 rounded-2xl border space-y-3 animate-fadeIn ${
                result.isDuplicate
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold text-xs">
                {result.isDuplicate ? (
                  <>
                    <span className="text-base">⚠️</span>
                    <span className="text-amber-900 font-bold">
                      Producto ya ingresado en inventario (No se duplicó el registro)
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-900 font-bold">
                      ¡Nuevo Producto Registrado con Éxito ({photosList.length} Foto(s))!
                    </span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div
                  className={`p-2.5 rounded-xl border ${
                    result.isDuplicate
                      ? 'bg-white border-amber-200'
                      : 'bg-white border-emerald-200'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 font-medium block">Nombre</span>
                  <span className="font-bold text-slate-900 truncate block">
                    {result.inventoryItem?.name || result.extracted.name}
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-xl border ${
                    result.isDuplicate
                      ? 'bg-white border-amber-200'
                      : 'bg-white border-emerald-200'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 font-medium block">Código SKU</span>
                  <span
                    className={`font-mono font-bold block ${
                      result.isDuplicate ? 'text-amber-800' : 'text-emerald-700'
                    }`}
                  >
                    {result.sku || result.inventoryItem?.sku || result.extracted.sku}
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-xl border ${
                    result.isDuplicate
                      ? 'bg-white border-amber-200'
                      : 'bg-white border-emerald-200'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 font-medium block">Costo / PVP</span>
                  <span className="font-mono font-bold text-slate-900 block">
                    ${Number(result.inventoryItem?.costPrice || result.extracted.costPrice).toFixed(2)} / $
                    {Number(result.inventoryItem?.salePrice || result.extracted.salePrice).toFixed(2)}
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded-xl border ${
                    result.isDuplicate
                      ? 'bg-white border-amber-200'
                      : 'bg-white border-emerald-200'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 font-medium block">Margen / Stock</span>
                  <span className="font-mono font-bold text-sky-700 block">
                    +{result.extracted.profitMarginPercent || marginPercent}% ({result.inventoryItem?.stock ?? result.extracted.stock} u.)
                  </span>
                </div>
              </div>

              {/* Tax / IVA calculation badge */}
              {result.extracted.attributes?.taxStatus === 'PLUS_TAX' && (
                <div className="px-3 py-2 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-900 text-xs flex items-center justify-between">
                  <span className="font-bold flex items-center space-x-1.5">
                    <span>🏷️</span>
                    <span>IVA Calculado (+{result.extracted.attributes?.taxPercent}%):</span>
                  </span>
                  <span className="font-mono font-bold">
                    Base: ${Number(result.extracted.attributes?.baseCostPrice || result.extracted.baseCostPrice).toFixed(2)} ➔ Con IVA: ${Number(result.extracted.costPrice).toFixed(2)}
                  </span>
                </div>
              )}
              {result.extracted.attributes?.taxStatus === 'INCLUDED' && (
                <div className="px-3 py-2 rounded-xl bg-emerald-100/70 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between">
                  <span className="font-bold flex items-center space-x-1.5">
                    <span>✅</span>
                    <span>IVA Incluido en el precio informado:</span>
                  </span>
                  <span className="font-mono font-bold">
                    Costo Final: ${Number(result.extracted.costPrice).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Multiple Cost Options Detected */}
              {result.extracted.costOptions && result.extracted.costOptions.length > 1 && (
                <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-emerald-900 flex items-center space-x-1">
                      <Tag className="w-3 h-3 text-emerald-600" />
                      <span>
                        {result.extracted.costOptions.length} Opciones de Costo Detectadas (
                        {result.extracted.costOptions.some((o) => /afiliad/i.test(o.label))
                          ? 'Precio afiliado por 1 unidad aplicado por defecto'
                          : 'Mayor costo aplicado por defecto'}
                        ):
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {result.extracted.costOptions.map((opt, idx) => {
                      const activeCost = Number(result.inventoryItem?.costPrice || result.extracted.costPrice);
                      const isSelected = Math.abs(activeCost - opt.price) < 0.01;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSwitchCostOption(opt)}
                          className={`p-2 rounded-xl text-left text-xs transition flex items-center justify-between border cursor-pointer ${
                            isSelected
                              ? 'bg-amber-100/80 border-amber-400 text-amber-900 ring-2 ring-amber-300 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-amber-300'
                          }`}
                        >
                          <div className="truncate mr-1">
                            <span className="block font-semibold truncate text-slate-900">{opt.label}</span>
                            <span className="text-[11px] font-mono font-bold text-amber-700">${opt.price.toFixed(2)}</span>
                          </div>
                          {isSelected ? (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 flex items-center space-x-0.5">
                              <Check className="w-3 h-3" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-500 hover:text-amber-700 underline">
                              Elegir
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {result ? '✓ Simulación completada' : 'Simula la detección automática de productos con IA'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

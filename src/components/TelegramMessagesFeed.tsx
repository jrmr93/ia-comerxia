import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Database,
  ExternalLink,
  Filter,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Package,
  Search,
  Sparkles,
  Square,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { TelegramMessage } from '../types.ts';

interface TelegramMessagesFeedProps {
  messages: TelegramMessage[];
  onSelectItem: (id: number) => void;
  onOpenSimulator: () => void;
  onDeleteMessage: (id: number) => Promise<boolean>;
  onBulkDeleteMessages: (ids: number[]) => Promise<boolean>;
  onClearAllMessages: () => Promise<boolean>;
  unseenMessageIds?: Set<number>;
  onMarkAllMessagesAsSeen?: () => void;
  onMarkMessageAsSeen?: (id: number) => void;
}

export const TelegramMessagesFeed: React.FC<TelegramMessagesFeedProps> = ({
  messages,
  onSelectItem,
  onOpenSimulator,
  onDeleteMessage,
  onBulkDeleteMessages,
  onClearAllMessages,
  unseenMessageIds,
  onMarkAllMessagesAsSeen,
  onMarkMessageAsSeen,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'with_photo' | 'text_only'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Confirmation Modals state
  const [confirmDeleteSingle, setConfirmDeleteSingle] = useState<TelegramMessage | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<boolean>(false);
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Filter messages
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Type filter
      if (typeFilter === 'with_photo' && !msg.photoUrl) return false;
      if (typeFilter === 'text_only' && msg.photoUrl) return false;

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchSender = msg.senderName?.toLowerCase().includes(q);
      const matchUsername = msg.senderUsername?.toLowerCase().includes(q);
      const matchCaption = msg.caption?.toLowerCase().includes(q);
      const matchItemName = msg.inventoryItemName?.toLowerCase().includes(q);
      const matchSku = msg.inventoryItemSku?.toLowerCase().includes(q);
      return matchSender || matchUsername || matchCaption || matchItemName || matchSku;
    });
  }, [messages, searchQuery, typeFilter]);

  // Selection handlers
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredMessages.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredMessages.map((m) => m.id));
    }
  };

  // Perform single delete
  const handleExecuteSingleDelete = async () => {
    if (!confirmDeleteSingle) return;
    setIsDeleting(true);
    try {
      const ok = await onDeleteMessage(confirmDeleteSingle.id);
      if (ok) {
        setSelectedIds((prev) => prev.filter((id) => id !== confirmDeleteSingle.id));
        setConfirmDeleteSingle(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Perform bulk delete
  const handleExecuteBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      const ok = await onBulkDeleteMessages(selectedIds);
      if (ok) {
        setSelectedIds([]);
        setConfirmBulkDelete(false);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Perform clear all
  const handleExecuteClearAll = async () => {
    setIsDeleting(true);
    try {
      const ok = await onClearAllMessages();
      if (ok) {
        setSelectedIds([]);
        setConfirmClearAll(false);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (messages.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center my-6 shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">
          No hay mensajes de proveedores registrados
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
          Cuando tu proveedor envíe fotos y descripciones por Telegram, el sistema los procesará con Gemini y los registrará aquí automáticamente.
        </p>
        <button
          onClick={onOpenSimulator}
          className="inline-flex items-center px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-xs transition cursor-pointer"
        >
          <Sparkles className="w-4 h-4 mr-2 text-sky-200" />
          <span>Simular Primer Mensaje de Proveedor</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 my-6">
      {/* Header with Title and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            Registro de Mensajes Recibidos de Telegram
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-sky-700 border border-slate-200">
              {messages.length} {messages.length === 1 ? 'mensaje' : 'mensajes'}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Historial de transmisiones del proveedor procesadas por Gemini AI y almacenadas en PostgreSQL
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Clear All Messages Button */}
          <button
            onClick={() => setConfirmClearAll(true)}
            className="inline-flex items-center px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium transition cursor-pointer"
            title="Borrar todo el historial de mensajes de Telegram"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
            <span>Vaciar Historial</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por texto, proveedor, username, producto o SKU..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end flex-wrap gap-y-2">
          {/* Mark all messages as seen button if any unread */}
          {unseenMessageIds && unseenMessageIds.size > 0 && onMarkAllMessagesAsSeen && (
            <button
              type="button"
              onClick={onMarkAllMessagesAsSeen}
              className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs animate-pulse"
              title="Marcar todos los mensajes como vistos"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
              <span>Marcar como vistos ({unseenMessageIds.size})</span>
            </button>
          )}

          {/* Type filter buttons */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-sky-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setTypeFilter('with_photo')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center space-x-1 ${
                typeFilter === 'with_photo'
                  ? 'bg-sky-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>Con Foto</span>
            </button>
            <button
              onClick={() => setTypeFilter('text_only')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center space-x-1 ${
                typeFilter === 'text_only'
                  ? 'bg-sky-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Solo Texto</span>
            </button>
          </div>

          {/* Select All Checkbox */}
          <button
            onClick={handleSelectAll}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer ${
              selectedIds.length > 0
                ? 'bg-sky-50 border-sky-300 text-sky-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            {selectedIds.length > 0 && selectedIds.length === filteredMessages.length ? (
              <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span>
              {selectedIds.length > 0
                ? `${selectedIds.length} seleccionados`
                : 'Seleccionar'}
            </span>
          </button>
        </div>
      </div>

      {/* Floating/Sticky Bulk Delete Action Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs animate-fadeIn shadow-sm">
          <div className="flex items-center space-x-2 text-rose-950 font-medium">
            <CheckCircle2 className="w-4 h-4 text-rose-600" />
            <span>
              Has seleccionado <strong>{selectedIds.length}</strong> de {messages.length} mensajes recibidos.
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
            >
              Deseleccionar
            </button>
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Messages List Grid */}
      {filteredMessages.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-xs">
          No se encontraron mensajes que coincidan con los filtros aplicados.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredMessages.map((msg) => {
            const isSelected = selectedIds.includes(msg.id);
            const isUnseen = Boolean(unseenMessageIds && unseenMessageIds.has(msg.id));
            let parsedData: any = null;
            if (msg.extractedData) {
              try {
                parsedData = JSON.parse(msg.extractedData);
              } catch (e) {}
            }

            return (
              <div
                key={msg.id}
                onClick={() => {
                  if (isUnseen && onMarkMessageAsSeen) {
                    onMarkMessageAsSeen(msg.id);
                  }
                }}
                className={`bg-white border rounded-2xl p-4 sm:p-5 transition shadow-xs relative group ${
                  isSelected
                    ? 'border-sky-500 ring-2 ring-sky-500/30'
                    : isUnseen
                    ? 'border-amber-400 bg-amber-50/20 ring-1 ring-amber-400/50'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Selection Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleSelect(msg.id);
                    }}
                    className="absolute top-4 right-4 sm:static text-slate-400 hover:text-sky-600 transition cursor-pointer z-10 flex-shrink-0 mt-0.5"
                    title={isSelected ? 'Deseleccionar' : 'Seleccionar'}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-sky-600" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                    )}
                  </button>

                  {/* Left Photo + Content */}
                  <div className="flex items-start space-x-4 flex-1 min-w-0 pr-8 sm:pr-0">
                    {msg.photoUrl ? (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 relative">
                        <img
                          src={msg.photoUrl}
                          alt="Producto Telegram"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        {isUnseen && (
                          <span className="absolute top-1 left-1 bg-amber-400 text-slate-950 font-black text-[8px] px-1.5 py-0.5 rounded shadow-xs animate-pulse">
                            NUEVO
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 flex-shrink-0 relative">
                        <MessageSquare className="w-6 h-6 mb-1" />
                        <span className="text-[10px]">Solo texto</span>
                        {isUnseen && (
                          <span className="absolute top-1 left-1 bg-amber-400 text-slate-950 font-black text-[8px] px-1.5 py-0.5 rounded shadow-xs animate-pulse">
                            NUEVO
                          </span>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-sky-600" />
                          {msg.senderName || 'Proveedor Telegram'}
                        </span>
                        {msg.senderUsername && (
                          <span className="text-xs text-slate-500">{msg.senderUsername}</span>
                        )}
                        {isUnseen && (
                          <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-black bg-amber-400 text-slate-950 border border-amber-500 shadow-2xs animate-pulse">
                            ✨ Nuevo Mensaje
                          </span>
                        )}
                        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                          Procesado con IA
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200 line-clamp-3">
                        "{msg.caption || 'Mensaje sin texto adjunto'}"
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                        <span className="flex items-center">
                          <Calendar className="w-3.5 h-3.5 mr-1" />
                          {new Date(msg.createdAt).toLocaleString('es-ES')}
                        </span>
                        <span className="flex items-center font-mono">
                          <Database className="w-3 h-3 mr-1 text-emerald-600" />
                          ID Mensaje: #{msg.id}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right AI Extraction Action & Delete button */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2.5 sm:w-64 flex-shrink-0">
                    {msg.inventoryItemId ? (
                      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                            <span className="flex items-center">
                              <Sparkles className="w-3 h-3 mr-1 text-sky-600" />
                              Producto Creado
                            </span>
                            <span className="font-mono text-sky-700 font-bold">
                              {msg.inventoryItemSku || parsedData?.sku}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {msg.inventoryItemName || parsedData?.name || 'Producto en Inventario'}
                          </h4>
                          <div className="flex items-center justify-between text-xs mt-1.5">
                            <span className="text-slate-500 text-[11px]">Precio Venta:</span>
                            <span className="font-bold text-emerald-700">
                              ${msg.inventoryItemPrice || Number(parsedData?.salePrice || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (isUnseen && onMarkMessageAsSeen) {
                              onMarkMessageAsSeen(msg.id);
                            }
                            onSelectItem(msg.inventoryItemId!);
                          }}
                          className="mt-2.5 w-full py-1.5 px-3 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-medium border border-sky-200 transition flex items-center justify-center space-x-1 cursor-pointer"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>Ver en Inventario</span>
                        </button>
                      </div>
                    ) : (
                      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-500 text-center">
                        <span className="text-slate-500 block">Registro de log de mensaje</span>
                      </div>
                    )}

                    {/* Single Delete Button */}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSingle(msg)}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition cursor-pointer flex items-center space-x-1 text-xs self-end"
                      title="Eliminar este mensaje almacenado"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span className="text-[11px]">Borrar Mensaje</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODALS */}

      {/* 1. Confirm Single Delete Modal */}
      {confirmDeleteSingle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">¿Eliminar Mensaje del Proveedor?</h3>
                <p className="text-xs text-slate-500">Log ID #{confirmDeleteSingle.id}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">
                Proveedor: {confirmDeleteSingle.senderName || 'Telegram'}
              </p>
              <p className="text-slate-500 italic line-clamp-2">
                "{confirmDeleteSingle.caption || 'Sin texto'}"
              </p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Esta acción eliminará el registro del mensaje de la base de datos.
              {confirmDeleteSingle.inventoryItemId && (
                <span className="text-amber-700 block mt-1 font-medium">
                  Nota: El producto generado en el inventario no se borrará, solo se eliminará este registro de transmisión.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteSingle(null)}
                className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteSingleDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirmar y Borrar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Confirm Bulk Delete Modal */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Eliminar {selectedIds.length} Mensajes Seleccionados?
                </h3>
                <p className="text-xs text-slate-500">Acción masiva de limpieza</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Se eliminarán de forma permanente los <strong>{selectedIds.length}</strong> registros de mensajes seleccionados de la base de datos PostgreSQL.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmBulkDelete(false)}
                className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteBulkDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Eliminar {selectedIds.length} Mensajes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Confirm Clear All Modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">¿Vaciar Todo el Historial de Mensajes?</h3>
                <p className="text-xs text-rose-600 font-semibold">Total: {messages.length} mensajes</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p>
                ⚠️ Esta operación borrará todos los registros de transmisiones recibidas de Telegram en la base de datos.
              </p>
              <p className="text-[11px] text-slate-600">
                Tus productos existentes en el inventario <strong>se mantendrán a salvo</strong> y no se verán afectados.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmClearAll(false)}
                className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteClearAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Sí, Vaciar Todo el Historial</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

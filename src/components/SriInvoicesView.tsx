import React, { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle2, AlertCircle, RefreshCw, Search, ExternalLink, ShieldCheck, Sparkles, Building, Printer, Mail } from 'lucide-react';
import { SriInvoiceRecord } from '../types';

export const SriInvoicesView: React.FC = () => {
  const [invoices, setInvoices] = useState<SriInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [emailModal, setEmailModal] = useState<{
    open: boolean;
    invoice: SriInvoiceRecord | null;
    emailInput: string;
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    invoice: null,
    emailInput: '',
    loading: false,
    error: null,
  });

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sri/facturas');
      const data = await res.json();
      if (res.ok && data.invoices) {
        setInvoices(data.invoices);
      } else {
        setError(data.error || 'No se pudo obtener el historial de facturas');
      }
    } catch (err: any) {
      console.error('Error fetching SRI invoices:', err);
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const openSendEmailModal = (inv: SriInvoiceRecord) => {
    const rawEmail = inv.customerEmail || '';
    const isDummy = rawEmail.toLowerCase() === 'ventas@comerxia.com';
    setEmailModal({
      open: true,
      invoice: inv,
      emailInput: isDummy ? '' : rawEmail,
      loading: false,
      error: null,
    });
  };

  const handleConfirmSendEmail = async () => {
    if (!emailModal.invoice) return;
    const targetEmail = emailModal.emailInput.trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setEmailModal((prev) => ({ ...prev, error: 'Ingresa una dirección de correo electrónico válida para el cliente.' }));
      return;
    }

    setEmailModal((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/sri/invoices/${emailModal.invoice.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage(data.message || `✓ Factura SRI #${emailModal.invoice.secuencial} enviada exitosamente a ${targetEmail}`);
        setEmailModal({ open: false, invoice: null, emailInput: '', loading: false, error: null });
        setTimeout(() => setToastMessage(null), 6000);
      } else {
        let errDesc = data.error || 'No se pudo enviar la factura por correo';
        if (errDesc.includes('Google (Gmail)') || errDesc.includes('Contraseña de Aplicación')) {
          errDesc += '. Ingresa tu cuenta emisor en Ajustes > Correo Gmail.';
        }
        setEmailModal((prev) => ({ ...prev, loading: false, error: errDesc }));
      }
    } catch (err: any) {
      console.error('Error sending invoice email:', err);
      setEmailModal((prev) => ({ ...prev, loading: false, error: err.message || 'Error de conexión al enviar correo de factura' }));
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const term = searchTerm.toLowerCase();
    return (
      inv.claveAcceso?.toLowerCase().includes(term) ||
      inv.customerName?.toLowerCase().includes(term) ||
      inv.customerCiRuc?.toLowerCase().includes(term) ||
      inv.secuencial?.includes(term) ||
      inv.orderNumber?.toLowerCase().includes(term)
    );
  });

  const parseSriMotivo = (rawMensajes?: string | null) => {
    if (!rawMensajes) return null;
    try {
      const parsed = JSON.parse(rawMensajes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((m: any) => `${m.identificador ? '[' + m.identificador + '] ' : ''}${m.mensaje || ''} ${m.informacionAdicional ? '(' + m.informacionAdicional + ')' : ''}`)
          .join(' | ');
      }
    } catch {}
    return rawMensajes;
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs sm:text-sm flex items-center justify-between shadow-xl animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-400 hover:text-white text-xs font-bold px-2 py-1">
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 text-white shadow-xl relative overflow-hidden border border-sky-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[11px] font-bold tracking-wide uppercase flex items-center gap-1 w-fit">
              <FileText className="w-3 h-3 text-sky-400" /> Registro Fiscal Oficial
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Historial de Facturas Electrónicas SRI
            </h2>
            <p className="text-xs sm:text-sm text-sky-200/80">
              Consulta y descarga los comprobantes electrónicos transmitidos y autorizados por el SRI.
            </p>
          </div>

          <button
            onClick={fetchInvoices}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold transition flex items-center gap-2 border border-slate-700 w-fit"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar Historial
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="flex items-center gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <Search className="w-4 h-4 text-slate-400 ml-2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por cliente, Cédula/RUC, Clave de Acceso o # de Orden..."
          className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
        />
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-700/50 text-rose-200 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-sky-500" />
          <p className="text-sm font-medium">Cargando comprobantes electrónicos del SRI...</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
          <FileText className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No se encontraron facturas emitidas</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchTerm
              ? 'No hay comprobantes que coincidan con la búsqueda.'
              : 'Puedes facturar electrónicamente las órdenes desde la vista de Pedidos o Gestión de Orden.'}
          </p>
        </div>
      ) : (
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl overflow-hidden">
          {/* Encabezado visible en pantallas medianas y grandes */}
          <div className="hidden md:grid md:grid-cols-12 bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 px-4 py-3 font-semibold">
            <div className="col-span-3">Comprobante / Clave</div>
            <div className="col-span-3">Cliente / Identificación</div>
            <div className="col-span-2 text-right">Monto Total</div>
            <div className="col-span-2 text-center">Estado SRI</div>
            <div className="col-span-2 text-right">Acciones</div>
          </div>

          <div className="divide-y divide-slate-800/60">
            {filteredInvoices.map((inv) => {
              const motivoText = parseSriMotivo(inv.mensajesSri);
              const isConsumidorFinal = inv.customerCiRuc === '9999999999999' || (inv.customerName || '').toUpperCase().includes('CONSUMIDOR FINAL');
              const rawEmail = inv.customerEmail || '';
              const hasValidEmail = Boolean(rawEmail && rawEmail.trim() !== '' && rawEmail.includes('@') && rawEmail.toLowerCase() !== 'ventas@comerxia.com');

              return (
                <div key={inv.id} className="p-4 md:px-4 md:py-3.5 hover:bg-slate-800/40 transition flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-2 items-start md:items-center text-xs">
                  {/* Comprobante / Clave */}
                  <div className="col-span-3 min-w-0 w-full space-y-0.5">
                    <div className="flex items-center justify-between md:justify-start gap-2">
                      <span className="font-bold text-white font-mono text-xs sm:text-sm">Factura #{inv.secuencial}</span>
                      {inv.orderNumber && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-medium shrink-0">Orden #{inv.orderNumber}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-sky-400 font-mono tracking-tight break-all leading-tight" title={inv.claveAcceso}>
                      {inv.claveAcceso}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleString('es-EC') : '—'}
                    </div>
                  </div>

                  {/* Cliente / Identificación */}
                  <div className="col-span-3 min-w-0 w-full space-y-0.5">
                    <div className="font-semibold text-slate-200 truncate" title={inv.customerName}>{inv.customerName}</div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                      <span>{inv.customerCiRuc}</span>
                      {isConsumidorFinal ? (
                        <span className="px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-700/50 text-[9px] font-medium">Consumidor Final</span>
                      ) : !hasValidEmail ? (
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px] font-medium">Sin correo</span>
                      ) : null}
                    </div>
                    {hasValidEmail && (
                      <div className="text-[10px] text-indigo-300/80 truncate" title={rawEmail}>
                        {rawEmail}
                      </div>
                    )}
                  </div>

                  {/* Monto Total */}
                  <div className="col-span-2 min-w-0 w-full md:text-right flex items-center justify-between md:justify-end gap-1">
                    <span className="md:hidden text-slate-400 text-[10px]">Total:</span>
                    <span className="font-bold text-emerald-400 font-mono text-sm sm:text-base">
                      ${Number(inv.totalAmount || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Estado SRI */}
                  <div className="col-span-2 min-w-0 w-full text-left md:text-center flex items-center justify-between md:justify-center gap-1">
                    <span className="md:hidden text-slate-400 text-[10px]">Estado SRI:</span>
                    {inv.estadoAutorizacion === 'AUTORIZADO' ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> AUTORIZADO
                      </span>
                    ) : inv.estadoAutorizacion === 'SIMULADO_OK' ? (
                      <span className="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-400/30 inline-flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" /> SIMULADO OK
                      </span>
                    ) : (
                      <div className="flex flex-col items-start md:items-center gap-1 max-w-full">
                        <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-400/30 inline-flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> {inv.estadoAutorizacion || 'DEVUELTO'}
                        </span>
                        {motivoText && (
                          <span className="text-[10px] text-rose-300/80 font-mono max-w-[180px] truncate" title={motivoText}>
                            {motivoText}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="col-span-2 min-w-0 w-full flex items-center justify-start md:justify-end gap-1.5 flex-wrap pt-2 md:pt-0 border-t border-slate-800/60 md:border-0">
                    <button
                      onClick={() => openSendEmailModal(inv)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 text-[11px] font-semibold transition inline-flex items-center gap-1 border border-indigo-700/50 shadow-xs"
                      title={isConsumidorFinal ? "Consumidor Final (Sin correo asignado)" : hasValidEmail ? "Enviar RIDE y XML al correo del cliente" : "Enviar por correo"}
                    >
                      <Mail className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="hidden sm:inline">Enviar</span> Email
                    </button>
                    <a
                      href={`/api/sri/facturas/${inv.id}/ride`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-[11px] font-semibold transition inline-flex items-center gap-1 border border-emerald-700/50 shadow-xs"
                      title="Ver e Imprimir RIDE oficial de la Factura SRI"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-400" /> RIDE
                    </a>
                    <a
                      href={`/api/sri/facturas/${inv.id}/xml`}
                      download={`Factura_${inv.claveAcceso}.xml`}
                      className="px-2 py-1.5 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-200 text-[11px] font-semibold transition inline-flex items-center gap-1 border border-sky-700/50 shadow-xs"
                      title="Descargar XML oficial del SRI"
                    >
                      <Download className="w-3 h-3" /> XML
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Interactivo Enviar Factura por Correo */}
      {emailModal.open && emailModal.invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-white animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Enviar Factura por Correo</h3>
                  <p className="text-xs text-slate-400">Factura #{emailModal.invoice.secuencial} • SRI</p>
                </div>
              </div>
              <button
                onClick={() => setEmailModal({ open: false, invoice: null, emailInput: '', loading: false, error: null })}
                className="text-slate-400 hover:text-white transition text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="text-xs text-slate-400">Cliente / Razón Social:</div>
                <div className="font-semibold text-sm text-slate-200">{emailModal.invoice.customerName}</div>
                <div className="text-[11px] font-mono text-sky-400">CÉDULA/RUC: {emailModal.invoice.customerCiRuc}</div>
                {(emailModal.invoice.customerCiRuc === '9999999999999' || (emailModal.invoice.customerName || '').toUpperCase().includes('CONSUMIDOR FINAL')) && (
                  <div className="text-[11px] text-amber-300/90 bg-amber-950/40 p-2 rounded-lg border border-amber-800/40 mt-1">
                    ℹ️ Esta factura fue emitida a <strong>Consumidor Final</strong>. No se envió correo automático. Puedes ingresar un correo si deseas enviarla manualmente.
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  Correo Electrónico del Destinatario:
                </label>
                <input
                  type="email"
                  value={emailModal.emailInput}
                  onChange={(e) => setEmailModal((prev) => ({ ...prev, emailInput: e.target.value, error: null }))}
                  placeholder="ejemplo@correo.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono placeholder-slate-600"
                  autoFocus
                />
                <p className="text-[11px] text-slate-500">
                  Se enviará el RIDE oficial en HTML y el archivo XML firmado y autorizado por el SRI como adjuntos.
                </p>
              </div>

              {emailModal.error && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700/60 text-rose-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-snug">{emailModal.error}</div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEmailModal({ open: false, invoice: null, emailInput: '', loading: false, error: null })}
                disabled={emailModal.loading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSendEmail}
                disabled={emailModal.loading}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {emailModal.loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enviando Factura...
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" /> Enviar Factura (RIDE y XML)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

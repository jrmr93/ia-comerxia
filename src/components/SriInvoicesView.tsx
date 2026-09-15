import React, { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle2, AlertCircle, RefreshCw, Search, ExternalLink, ShieldCheck, Sparkles, Building, Printer } from 'lucide-react';
import { SriInvoiceRecord } from '../types';

export const SriInvoicesView: React.FC = () => {
  const [invoices, setInvoices] = useState<SriInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Secuencial / Clave Acceso</th>
                <th className="px-4 py-3">Cliente / Identificación</th>
                <th className="px-4 py-3 text-right">Monto Total</th>
                <th className="px-4 py-3 text-center">Estado SRI</th>
                <th className="px-4 py-3 text-center">Fecha Emisión</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredInvoices.map((inv) => {
                const motivoText = parseSriMotivo(inv.mensajesSri);
                return (
                  <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white font-mono">Factura #{inv.secuencial}</div>
                      <div className="text-[10px] text-sky-400 font-mono tracking-tight truncate max-w-[220px]" title={inv.claveAcceso}>
                        {inv.claveAcceso}
                      </div>
                      {inv.orderNumber && (
                        <span className="text-[10px] text-slate-400 font-medium">Orden #{inv.orderNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-200">{inv.customerName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{inv.customerCiRuc}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400 font-mono text-sm">
                      ${Number(inv.totalAmount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.estadoAutorizacion === 'AUTORIZADO' ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> AUTORIZADO
                        </span>
                      ) : inv.estadoAutorizacion === 'SIMULADO_OK' ? (
                        <span className="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-400/30 inline-flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-sky-400" /> SIMULADO OK
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
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
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400 font-mono text-[11px]">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleString('es-EC') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                      <a
                        href={`/api/sri/facturas/${inv.id}/ride`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-[11px] font-semibold transition inline-flex items-center gap-1 border border-emerald-700/50 shadow-xs"
                        title="Ver e Imprimir RIDE oficial de la Factura SRI"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-400" /> RIDE
                      </a>
                      <a
                        href={`/api/sri/facturas/${inv.id}/xml`}
                        download={`Factura_${inv.claveAcceso}.xml`}
                        className="px-3 py-1.5 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-200 text-[11px] font-semibold transition inline-flex items-center gap-1 border border-sky-700/50 shadow-xs"
                        title="Descargar XML oficial del SRI"
                      >
                        <Download className="w-3 h-3" /> XML
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

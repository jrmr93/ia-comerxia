import React from 'react';
import {
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react';
import { DevTestingTab, CleanActionType } from './DevTestingTab.tsx';

interface TestDataCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAction?: CleanActionType;
  onCleanSuccess?: (action: CleanActionType, message: string) => void;
}

export const TestDataCleanerModal: React.FC<TestDataCleanerModalProps> = ({
  isOpen,
  onClose,
  onCleanSuccess,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center border border-indigo-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Limpiador de Datos de Prueba (Modo Desarrollador)
              </h3>
              <p className="text-xs text-slate-500">
                Reinicio de ciclo de pruebas • Consecutivos en blanco • Catálogo protegido
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <DevTestingTab
            onSuccess={() => {
              if (onCleanSuccess) {
                onCleanSuccess('all_transactions', 'Limpieza de pruebas completada');
              }
            }}
          />
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

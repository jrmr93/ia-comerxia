import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Play,
  Video,
  Upload,
  Link as LinkIcon,
  Check,
  CheckCircle2,
  X,
  Loader2,
  ExternalLink,
  Film,
  Trash2,
  HelpCircle,
  Tv,
  Youtube,
  Radio,
  FileVideo,
} from 'lucide-react';
import { InventoryItem } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { parseVideoUrl, ParsedVideoInfo } from '../utils/video-helper.ts';

export interface VideoSearchResult {
  title: string;
  videoUrl: string;
  embedUrl: string;
  platform: 'youtube' | 'youtube_shorts' | 'tiktok' | 'vimeo' | 'instagram' | 'direct' | 'unknown';
  thumbnailUrl?: string;
  authorOrChannel?: string;
  description?: string;
  isRecommended?: boolean;
}

interface ProductAiVideoPickerModalProps {
  item: InventoryItem;
  isOpen: boolean;
  onClose: () => void;
  onVideoApplied: (updatedItem: InventoryItem) => void;
}

export const ProductAiVideoPickerModal: React.FC<ProductAiVideoPickerModalProps> = ({
  item,
  isOpen,
  onClose,
  onVideoApplied,
}) => {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<'ai_search' | 'manual_link' | 'upload'>('ai_search');
  const [searchQuery, setSearchQuery] = useState<string>(item.name || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [manualUrlInput, setManualUrlInput] = useState<string>('');
  const [manualPreviewInfo, setManualPreviewInfo] = useState<ParsedVideoInfo | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto trigger search when opening
  useEffect(() => {
    if (isOpen && item) {
      setSearchQuery(item.name || '');
      setPreviewVideoUrl(item.videoUrl || null);
      setManualUrlInput(item.videoUrl || '');
      setErrorMsg(null);
      setSuccessToast(null);
      if (item.videoUrl) {
        setManualPreviewInfo(parseVideoUrl(item.videoUrl));
      }
      handleAiSearch(item.name || '');
    }
  }, [isOpen, item?.id]);

  // Update manual preview when manual link input changes
  useEffect(() => {
    if (manualUrlInput.trim()) {
      setManualPreviewInfo(parseVideoUrl(manualUrlInput.trim()));
    } else {
      setManualPreviewInfo(null);
    }
  }, [manualUrlInput]);

  const handleAiSearch = async (queryText: string) => {
    const q = queryText.trim();
    if (!q) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await authFetch(`/api/inventory/${item.id}/search-web-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al buscar videos');
      }

      if (Array.isArray(data.videos) && data.videos.length > 0) {
        setResults(data.videos);
        if (!previewVideoUrl && data.videos[0]?.videoUrl) {
          setPreviewVideoUrl(data.videos[0].videoUrl);
        }
      } else {
        setResults([]);
        setErrorMsg('No se encontraron videos automáticos. Puedes ingresar un enlace de YouTube o TikTok manualmente.');
      }
    } catch (err: any) {
      console.error('Error during AI video search:', err);
      setErrorMsg(err.message || 'Error al buscar videos con IA');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyVideo = async (targetVideoUrl: string) => {
    if (!targetVideoUrl) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const res = await authFetch(`/api/inventory/${item.id}/set-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: targetVideoUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar video');
      }

      setSuccessToast('🎬 ¡Video asignado correctamente al producto!');
      if (data.item) {
        onVideoApplied(data.item);
      }
      setTimeout(() => {
        if (onClose) onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo guardar el video');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveVideo = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/inventory/${item.id}/set-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: null }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPreviewVideoUrl(null);
      setManualUrlInput('');
      setManualPreviewInfo(null);
      setSuccessToast('Video eliminado del producto.');
      if (data.item) {
        onVideoApplied(data.item);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al eliminar el video');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Max 30MB limit for local storage
    if (file.size > 35 * 1024 * 1024) {
      setErrorMsg('El video no puede superar los 30MB. Para videos más largos recomendamos YouTube o TikTok.');
      return;
    }

    setUploading(true);
    setUploadProgress(20);
    setErrorMsg(null);

    try {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 70));
        }
      };

      reader.onload = async () => {
        try {
          setUploadProgress(80);
          const base64Data = reader.result as string;
          const res = await authFetch('/api/media/upload-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoData: base64Data, filename: file.name }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al guardar el video en el servidor');

          setUploadProgress(100);
          if (data.videoUrl) {
            setPreviewVideoUrl(data.videoUrl);
            setManualUrlInput(data.videoUrl);
            await handleApplyVideo(data.videoUrl);
          }
        } catch (postErr: any) {
          setErrorMsg(postErr.message || 'Error al procesar el archivo');
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = () => {
        setErrorMsg('Error al leer el archivo del dispositivo');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al subir el video');
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const currentPreviewParsed = previewVideoUrl ? parseVideoUrl(previewVideoUrl) : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl relative max-h-[94vh] flex flex-col text-slate-800 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Video del Producto (Híbrido + IA)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
                  IA & Web
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate max-w-md">
                Producto: <span className="font-semibold text-slate-700">{item.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Toast */}
        {successToast && (
          <div className="my-2 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="my-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-center justify-between animate-fadeIn">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 pt-4 pb-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('ai_search')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              activeTab === 'ai_search'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Buscar con IA / YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual_link')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              activeTab === 'manual_link'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Pegar Enlace Directo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Subir Video (MP4/WebM)</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* TAB 1: AI & Web Video Search */}
          {activeTab === 'ai_search' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAiSearch(searchQuery)}
                    placeholder="Escribe el producto para buscar videos (ej. Stanley Quencher review)..."
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
                  />
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleAiSearch(searchQuery)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
                  <span>{loading ? 'Buscando...' : 'Buscar'}</span>
                </button>
              </div>

              {/* Quick suggestion chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-500">Sugerencias:</span>
                {[
                  `${item.name} review español`,
                  `${item.name} unboxing`,
                  `${item.name} como funciona`,
                  `${item.name} shorts`,
                ].map((chip, cIdx) => (
                  <button
                    key={cIdx}
                    type="button"
                    onClick={() => {
                      setSearchQuery(chip);
                      handleAiSearch(chip);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-100 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 border border-slate-200 text-slate-700 transition cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Supported badges */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">Fuentes en tiempo real:</span>
                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-medium">YouTube En Vivo</span>
                <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-medium">Shorts</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 font-medium">TikTok</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-medium">Vimeo</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">Archivos MP4</span>
              </div>

              {/* Results Grid */}
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
                  <p className="text-xs font-semibold text-slate-600">
                    Buscando videos reales y reseñas en YouTube para este producto...
                  </p>
                </div>
              ) : results.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {results.map((video, idx) => {
                    const isSelected = item.videoUrl === video.videoUrl || previewVideoUrl === video.videoUrl;

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border transition flex flex-col justify-between space-y-2.5 bg-white ${
                          isSelected
                            ? 'border-sky-500 ring-2 ring-sky-300 shadow-md bg-sky-50/20'
                            : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                        }`}
                      >
                        {/* Video Thumbnail with Play Button */}
                        <div
                          onClick={() => setPreviewVideoUrl(video.videoUrl)}
                          className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 cursor-pointer group shadow-2xs"
                        >
                          {video.thumbnailUrl ? (
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
                              <Film className="w-8 h-8" />
                            </div>
                          )}

                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </div>
                          </div>

                          <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-black/80 text-white backdrop-blur-xs">
                            {video.platform === 'youtube_shorts' ? 'Shorts' : video.platform}
                          </div>

                          {video.isRecommended && (
                            <div className="absolute top-1.5 right-1.5 inline-flex items-center space-x-1 text-[10px] font-bold text-amber-900 bg-amber-300/95 px-2 py-0.5 rounded-md shadow-xs backdrop-blur-xs">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>Recomendado</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <h3
                            onClick={() => setPreviewVideoUrl(video.videoUrl)}
                            className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug cursor-pointer hover:text-sky-600 transition"
                          >
                            {video.title}
                          </h3>

                          {video.authorOrChannel && (
                            <p className="text-[11px] font-semibold text-slate-700 flex items-center space-x-1">
                              <Youtube className="w-3 h-3 text-red-600 inline flex-shrink-0" />
                              <span className="truncate">{video.authorOrChannel}</span>
                            </p>
                          )}

                          {video.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2">
                              {video.description}
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewVideoUrl(video.videoUrl)}
                            className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 hover:underline flex items-center space-x-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-sky-600" />
                            <span>Reproducir</span>
                          </button>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleApplyVideo(video.videoUrl)}
                            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            <span>Vincular Video</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <Film className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-600 font-medium">
                    No hay resultados para esta búsqueda. Intenta con otro término o pega un enlace directo.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Manual Video Link */}
          {activeTab === 'manual_link' && (
            <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Pega el enlace del video (YouTube, Shorts, TikTok, Instagram Reel, Vimeo o URL directa)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={manualUrlInput}
                    onChange={(e) => setManualUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... o https://www.tiktok.com/@..."
                    className="flex-1 px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-sky-500 transition"
                  />
                  <button
                    type="button"
                    disabled={!manualUrlInput.trim() || saving}
                    onClick={() => handleApplyVideo(manualUrlInput.trim())}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Guardar Video</span>
                  </button>
                </div>
              </div>

              {manualPreviewInfo && (
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-700">Plataforma detectada:</span>
                    <span className="px-2 py-0.5 rounded-md font-black uppercase text-[10px] bg-sky-100 text-sky-800">
                      {manualPreviewInfo.platform}
                    </span>
                  </div>
                  <p className="text-slate-500 font-mono text-[11px] truncate">
                    {manualPreviewInfo.originalUrl}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Direct Upload MP4/WebM */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4, video/webm, video/ogg, video/quicktime"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-8 border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/40 hover:bg-sky-50/80 rounded-2xl text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-white border border-sky-200 flex items-center justify-center text-sky-600 shadow-2xs group-hover:scale-110 transition duration-150">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Haz clic para seleccionar un video desde tu dispositivo
                </h3>
                <p className="text-xs text-slate-500">
                  Formatos compatibles: MP4, WebM, MOV (máximo 30MB)
                </p>
                <span className="px-3 py-1 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs">
                  Elegir archivo de video
                </span>
              </div>

              {uploading && (
                <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Subiendo y guardando en tu servidor...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-600 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Integrated Interactive Video Preview Box */}
          {previewVideoUrl && (
            <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Tv className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold">Vista Previa del Reproductor</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                    {currentPreviewParsed?.platform || 'video'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleApplyVideo(previewVideoUrl)}
                    className="px-3 py-1 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" />
                    <span>Usar este Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewVideoUrl(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="aspect-video w-full rounded-xl overflow-hidden bg-black flex items-center justify-center relative">
                {currentPreviewParsed?.isDirect ? (
                  <video
                    src={currentPreviewParsed.embedUrl}
                    controls
                    autoPlay={false}
                    className="w-full h-full object-contain"
                  />
                ) : currentPreviewParsed?.embedUrl ? (
                  <iframe
                    src={currentPreviewParsed.embedUrl}
                    title="Video Preview"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                ) : (
                  <div className="text-center p-4">
                    <p className="text-xs text-slate-400">No se pudo cargar el reproductor embed para esta URL.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Current Saved Video on Item */}
          {item.videoUrl && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-950">Video actualmente activo en este producto</p>
                  <p className="text-[11px] text-emerald-800 truncate font-mono">{item.videoUrl}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewVideoUrl(item.videoUrl || null)}
                  className="px-2.5 py-1 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-semibold text-emerald-900 transition cursor-pointer flex items-center space-x-1"
                >
                  <Play className="w-3 h-3 text-emerald-600" />
                  <span>Ver</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleRemoveVideo}
                  className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl transition cursor-pointer"
                  title="Desvincular video del producto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Los videos se muestran directamente en la tienda online y en el detalle del producto.
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

import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  ListVideo,
  Tv,
  Plus,
  Trash2,
  Edit3,
  Power,
  Copy,
  ExternalLink,
  QrCode,
  Check,
  RefreshCw,
  UploadCloud,
  ChevronUp,
  ChevronDown,
  Play,
  X,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  SlidersHorizontal,
  Pause,
  Volume2,
  VolumeX,
  Repeat,
  Image as ImageIcon,
  SkipForward,
  SkipBack,
  RotateCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { AdvertisingVideo, AdvertisingPlaylist, AdvertisingDisplay } from '../types.ts';

// Simple lightweight SVG QR Code generator component (using api.qrserver.com fallback for crisp vector QR)
const QrModal: React.FC<{ url: string; name: string; onClose: () => void }> = ({ url, name, onClose }) => {
  const [copied, setCopied] = useState(false);
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}&color=0f172a&bgcolor=ffffff`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mb-3">
          <QrCode className="w-6 h-6" />
        </div>

        <h3 className="text-xl font-bold text-slate-900 text-center mb-1">{name}</h3>
        <p className="text-xs text-slate-500 text-center mb-5">
          Escanea este código QR con la cámara de tu teléfono o televisor para abrir la pantalla publicitaria.
        </p>

        <div className="p-4 bg-white border-2 border-dashed border-sky-200 rounded-2xl shadow-xs mb-5 flex items-center justify-center">
          <img src={qrApiUrl} alt={`Código QR para ${name}`} className="w-56 h-56 object-contain rounded-lg" />
        </div>

        <div className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 mb-4">
          <span className="text-xs font-mono text-slate-600 truncate">{url}</span>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-medium hover:bg-sky-700 shrink-0 flex items-center gap-1.5 transition-colors shadow-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>

        <div className="flex gap-3 w-full">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 px-4 bg-indigo-600 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Pantalla
          </a>
          <button
            onClick={onClose}
            className="py-2.5 px-4 bg-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export const DigitalSignageView: React.FC = () => {
  const { authFetch } = useAuth();

  const [activeTab, setActiveTab] = useState<'videos' | 'playlists' | 'displays'>('videos');
  const [loading, setLoading] = useState(true);

  // Data states
  const [videos, setVideos] = useState<AdvertisingVideo[]>([]);
  const [playlists, setPlaylists] = useState<AdvertisingPlaylist[]>([]);
  const [displays, setDisplays] = useState<AdvertisingDisplay[]>([]);

  // Modals & form states
  const [uploading, setUploading] = useState(false);
  const [videoName, setVideoName] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadMediaType, setUploadMediaType] = useState<'video' | 'image'>('video');
  const [slideDuration, setSlideDuration] = useState<number>(10);
  const [editingDurationId, setEditingDurationId] = useState<number | null>(null);
  const [newDurationInput, setNewDurationInput] = useState<string>('10');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  // Playlist form state
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<AdvertisingPlaylist | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([]);

  // Display screen form state
  const [showDisplayModal, setShowDisplayModal] = useState(false);
  const [editingDisplay, setEditingDisplay] = useState<AdvertisingDisplay | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [assignedPlaylistId, setAssignedPlaylistId] = useState<number | null>(null);

  // QR Modal
  const [qrModalData, setQrModalData] = useState<{ url: string; name: string } | null>(null);

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIndexes, setSelectedItemIndexes] = useState<Record<number, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [vRes, pRes, dRes] = await Promise.all([
        authFetch('/api/digital-signage/videos'),
        authFetch('/api/digital-signage/playlists'),
        authFetch('/api/digital-signage/displays'),
      ]);

      const vData = await vRes.json();
      const pData = await pRes.json();
      const dData = await dRes.json();

      if (vData.success) setVideos(vData.videos || []);
      if (pData.success) setPlaylists(pData.playlists || []);
      if (dData.success) setDisplays(dData.displays || []);
    } catch (err) {
      console.error('Error loading digital signage data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ----------------------------------------------------
  // ----------------------------------------------------
  // VIDEO & IMAGE MULTIMEDIA HANDLERS
  // ----------------------------------------------------
  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isVideo) {
        alert('Por favor selecciona un archivo de video (MP4, WebM, MOV) o imagen (JPG, PNG, WEBP, GIF).');
        return;
      }

      setVideoFile(file);
      setUploadMediaType(isImage ? 'image' : 'video');

      if (!videoName) {
        setVideoName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUploadVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      alert('Selecciona un archivo para continuar.');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const isImage = uploadMediaType === 'image' || videoFile.type.startsWith('image/');

          let duration = 0;
          if (isImage) {
            duration = Math.max(1, Math.round(slideDuration || 10));
          } else {
            const tempVid = document.createElement('video');
            tempVid.src = base64Data;
            await new Promise((resolve) => {
              tempVid.onloadedmetadata = () => {
                duration = Math.round(tempVid.duration || 0);
                resolve(null);
              };
              tempVid.onerror = () => resolve(null);
            });
          }

          const fileSizeMB = Math.round((videoFile.size / (1024 * 1024)) * 100) / 100;

          const res = await authFetch('/api/digital-signage/videos/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: videoName || videoFile.name,
              videoData: base64Data,
              mimeType: videoFile.type,
              mediaType: isImage ? 'image' : 'video',
              duration,
              fileSize: fileSizeMB,
            }),
          });

          const data = await res.json();
          if (data.success) {
            setShowUploadModal(false);
            setVideoFile(null);
            setVideoName('');
            loadData();
          } else {
            alert(data.error || 'Error al subir el archivo.');
          }
        } catch (err: any) {
          alert('Error procesando el archivo: ' + err.message);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(videoFile);
    } catch (err: any) {
      alert('Error al leer el archivo: ' + err.message);
      setUploading(false);
    }
  };

  const handleSaveDuration = async (id: number) => {
    const dur = parseInt(newDurationInput, 10);
    if (isNaN(dur) || dur <= 0) {
      alert('Ingresa un tiempo de duración válido en segundos (mayor a 0).');
      return;
    }

    try {
      const res = await authFetch(`/api/digital-signage/videos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: dur }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos(videos.map(v => v.id === id ? { ...v, duration: dur } : v));
        setEditingDurationId(null);
      }
    } catch (err) {
      console.error('Error saving duration:', err);
    }
  };

  const handleToggleVideoActive = async (video: AdvertisingVideo) => {
    try {
      const res = await authFetch(`/api/digital-signage/videos/${video.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !video.active }),
      });
      const data = await res.json();
      if (data.success) {
        setVideos(videos.map(v => v.id === video.id ? { ...v, active: !video.active } : v));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteVideo = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este video? Se removerá también de las playlists.')) return;
    try {
      const res = await authFetch(`/api/digital-signage/videos/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setVideos(videos.filter(v => v.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ----------------------------------------------------
  // PLAYLIST HANDLERS
  // ----------------------------------------------------
  const handleOpenPlaylistModal = (playlist?: AdvertisingPlaylist) => {
    if (playlist) {
      setEditingPlaylist(playlist);
      setPlaylistName(playlist.name);
      setSelectedVideoIds(playlist.items ? playlist.items.map(it => it.videoId) : []);
    } else {
      setEditingPlaylist(null);
      setPlaylistName('');
      setSelectedVideoIds(videos.filter(v => v.active).map(v => v.id));
    }
    setShowPlaylistModal(true);
  };

  const handleToggleSelectVideoForPlaylist = (videoId: number) => {
    if (selectedVideoIds.includes(videoId)) {
      setSelectedVideoIds(selectedVideoIds.filter(id => id !== videoId));
    } else {
      setSelectedVideoIds([...selectedVideoIds, videoId]);
    }
  };

  const handleMoveVideoInPlaylist = (index: number, direction: 'up' | 'down') => {
    const nextIds = [...selectedVideoIds];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= nextIds.length) return;

    const temp = nextIds[index];
    nextIds[index] = nextIds[targetIdx];
    nextIds[targetIdx] = temp;
    setSelectedVideoIds(nextIds);
  };

  const handleSavePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) {
      alert('Ingresa un nombre para la playlist.');
      return;
    }

    try {
      const isEdit = Boolean(editingPlaylist);
      const url = isEdit ? `/api/digital-signage/playlists/${editingPlaylist!.id}` : '/api/digital-signage/playlists';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playlistName,
          videoIds: selectedVideoIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowPlaylistModal(false);
        loadData();
      } else {
        alert(data.error || 'Error al guardar la playlist.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeletePlaylist = async (id: number) => {
    if (!confirm('¿Deseas eliminar esta lista de reproducción?')) return;
    try {
      const res = await authFetch(`/api/digital-signage/playlists/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPlaylists(playlists.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ----------------------------------------------------
  // DISPLAY / PANTALLAS HANDLERS
  // ----------------------------------------------------
  const handleOpenDisplayModal = (disp?: AdvertisingDisplay) => {
    if (disp) {
      setEditingDisplay(disp);
      setDisplayName(disp.name);
      setAssignedPlaylistId(disp.playlistId || null);
    } else {
      setEditingDisplay(null);
      setDisplayName('');
      setAssignedPlaylistId(playlists.length > 0 ? playlists[0].id : null);
    }
    setShowDisplayModal(true);
  };

  const handleSaveDisplay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      alert('Ingresa el nombre de la pantalla (ej. Pantalla Local Principal).');
      return;
    }

    try {
      const isEdit = Boolean(editingDisplay);
      const url = isEdit ? `/api/digital-signage/displays/${editingDisplay!.id}` : '/api/digital-signage/displays';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName,
          playlistId: assignedPlaylistId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowDisplayModal(false);
        loadData();
      } else {
        alert(data.error || 'Error al guardar la pantalla.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteDisplay = async (id: number) => {
    if (!confirm('¿Deseas eliminar esta pantalla publicitaria?')) return;
    try {
      const res = await authFetch(`/api/digital-signage/displays/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setDisplays(displays.filter(d => d.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleControlDisplay = async (
    displayId: number,
    changes: Partial<{
      isPaused: boolean;
      volume: number;
      isMuted: boolean;
      loopMode: boolean;
      orientation: number;
      commandAction: string | null;
    }>
  ) => {
    try {
      // Optimistic update
      setDisplays((prev) =>
        prev.map((d) => (d.id === displayId ? { ...d, ...changes } : d))
      );

      const res = await authFetch(`/api/digital-signage/displays/${displayId}/control`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });

      const data = await res.json();
      if (data.success && data.display) {
        setDisplays((prev) =>
          prev.map((d) => (d.id === displayId ? { ...d, ...data.display } : d))
        );
      }
    } catch (err) {
      console.error('Error executing remote control command:', err);
    }
  };

  const getFullDisplayUrl = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/display/${token}`;
  };

  const formatLastSeen = (isoStr?: string | null) => {
    if (!isoStr) return 'Sin conexión registrada';
    const date = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 45) return 'En línea 🟢';
    if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `Hace ${Math.floor(diffSec / 3600)} hr`;
    return date.toLocaleDateString('es-EC', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-indigo-900/30 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold tracking-wide border border-sky-500/30 uppercase">
                Digital Signage
              </span>
              <span className="text-slate-400 text-xs">• Transmisión Continua 16:9</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Tv className="w-7 h-7 text-sky-400" />
              Publicidad Digital y Pantallas
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Administra los videos publicitarios de tu tienda, crea playlists en bucle infinito y transmite directamente a Smart TVs, TV Boxes o pantallas locales mediante URLs públicas y códigos QR.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadData}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors border border-slate-700 flex items-center gap-2 text-sm font-medium"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Sincronizar
            </button>
            <button
              onClick={() => handleOpenDisplayModal()}
              className="px-4 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Crear Pantalla
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-800/80 overflow-x-auto">
          <button
            onClick={() => setActiveTab('videos')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'videos'
                ? 'bg-white text-slate-900 shadow-md'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4 text-sky-500" />
            Multimedia (Videos e Imágenes) ({videos.length})
          </button>

          <button
            onClick={() => setActiveTab('playlists')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'playlists'
                ? 'bg-white text-slate-900 shadow-md'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ListVideo className="w-4 h-4 text-indigo-500" />
            Playlists ({playlists.length})
          </button>

          <button
            onClick={() => setActiveTab('displays')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'displays'
                ? 'bg-white text-slate-900 shadow-md'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4 text-emerald-500" />
            Pantallas Transmitiendo ({displays.length})
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* TAB 1: VIDEOS E IMÁGENES MULTIMEDIA */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'videos' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar videos o imágenes por nombre..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              />
            </div>

            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              Subir Video o Imagen (Diapositiva)
            </button>
          </div>

          {videos.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
              <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-4">
                <Film className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No hay contenido multimedia cargado</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Sube tus anuncios comerciales en video (MP4/WebM) o imágenes publicitarias para reproducirlas en diapositivas continuas con tiempo configurable.
              </p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="mt-5 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-sm inline-flex items-center gap-2 transition-colors shadow-md"
              >
                <UploadCloud className="w-4 h-4" />
                Subir Primer Video o Imagen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos
                .filter((v) => v.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((video) => {
                  const isImg = video.mediaType === 'image' || /\.(png|jpe?g|webp|gif|svg)$/i.test(video.fileUrl);

                  return (
                    <div
                      key={video.id}
                      className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col group ${
                        video.active
                          ? 'border-slate-200 hover:border-sky-300 hover:shadow-lg'
                          : 'border-slate-200 opacity-60 bg-slate-50'
                      }`}
                    >
                      {/* Media Preview / Thumbnail */}
                      <div className="relative aspect-video bg-slate-900 group/vid flex items-center justify-center overflow-hidden">
                        {isImg ? (
                          <img
                            src={video.fileUrl}
                            alt={video.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={video.fileUrl}
                            className="w-full h-full object-cover"
                            preload="metadata"
                          />
                        )}

                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/vid:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => setPreviewVideoUrl(video.fileUrl)}
                            className="w-12 h-12 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                            title="Vista previa"
                          >
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </button>
                        </div>

                        {/* Media Type & Duration Badge */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-mono flex items-center gap-1 backdrop-blur-xs">
                          {isImg ? (
                            <>
                              <ImageIcon className="w-3 h-3 text-indigo-400" />
                              <span className="text-indigo-300 font-bold">Diapositiva ({video.duration || 10}s)</span>
                            </>
                          ) : (
                            <>
                              <Film className="w-3 h-3 text-sky-400" />
                              <span className="text-sky-300 font-bold">Video ({video.duration ? `${video.duration}s` : 'MP4'})</span>
                            </>
                          )}
                        </div>

                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-mono flex items-center gap-1 backdrop-blur-xs">
                          <HardDrive className="w-3 h-3 text-emerald-400" />
                          {video.fileSize ? `${video.fileSize} MB` : (isImg ? 'Imagen' : 'Video')}
                        </div>
                      </div>

                      {/* Content info */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm line-clamp-1" title={video.name}>
                            {video.name}
                          </h4>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                            {video.fileUrl}
                          </p>

                          {/* Slide Duration Setter */}
                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-medium flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              Tiempo:
                            </span>

                            {editingDurationId === video.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max="300"
                                  value={newDurationInput}
                                  onChange={(e) => setNewDurationInput(e.target.value)}
                                  className="w-14 px-1.5 py-0.5 text-xs font-mono font-bold bg-slate-50 border border-sky-300 rounded focus:outline-none"
                                />
                                <span className="text-[10px] font-mono text-slate-400">seg</span>
                                <button
                                  type="button"
                                  onClick={() => handleSaveDuration(video.id)}
                                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingDurationId(null)}
                                  className="p-0.5 text-slate-400 hover:text-slate-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDurationId(video.id);
                                  setNewDurationInput(String(video.duration || 10));
                                }}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-mono text-xs font-bold flex items-center gap-1 transition-colors"
                                title="Editar tiempo de reproducción (segundos)"
                              >
                                {video.duration || 10} seg
                                <Edit3 className="w-3 h-3 text-slate-400" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleToggleVideoActive(video)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                              video.active
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {video.active ? 'Activo' : 'Inactivo'}
                          </button>

                          <button
                            onClick={() => handleDeleteVideo(video.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Eliminar contenido"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 2: PLAYLISTS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'playlists' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Listas de Reproducción (Playlists)</h3>
              <p className="text-xs text-slate-500">Organiza secuencias continuas de videos para tus pantallas publicitarias.</p>
            </div>

            <button
              onClick={() => handleOpenPlaylistModal()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva Playlist
            </button>
          </div>

          {playlists.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <ListVideo className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No hay playlists creadas</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Crea una playlist ordenando los videos que deseas reproducir en bucle automático.
              </p>
              <button
                onClick={() => handleOpenPlaylistModal()}
                className="mt-5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm inline-flex items-center gap-2 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" />
                Crear Lista de Reproducción
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-[10px] font-bold uppercase">
                          Playlist #{playlist.id}
                        </span>
                        <h4 className="text-lg font-black text-slate-900 mt-1">{playlist.name}</h4>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenPlaylistModal(playlist)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                          title="Editar playlist"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePlaylist(playlist.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Eliminar playlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 mb-4">
                      {playlist.items && playlist.items.length > 0
                        ? `${playlist.items.length} video(s) ordenados en loop continuo`
                        : 'Sin videos asignados'}
                    </p>

                    {/* Sequence preview */}
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {playlist.items && playlist.items.length > 0 ? (
                        playlist.items.map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold font-mono text-[10px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-semibold text-slate-800 truncate">
                                {item.video?.name || `Video #${item.videoId}`}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {item.video?.duration ? `${item.video.duration}s` : 'Video'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                          Agrega videos a esta playlist para comenzar la transmisión.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Total duración loop:{' '}
                      <strong className="text-slate-700">
                        {playlist.items
                          ? playlist.items.reduce((acc, it) => acc + (it.video?.duration || 0), 0)
                          : 0}s
                      </strong>
                    </span>
                    <button
                      onClick={() => handleOpenPlaylistModal(playlist)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      Organizar secuencia →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* TAB 3: DISPLAYS / PANTALLAS */}
      {/* ---------------------------------------------------- */}
      {activeTab === 'displays' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Pantallas Registradas</h3>
              <p className="text-xs text-slate-500">
                Dispositivos (Smart TV, TV Box, computadoras) conectados a tus listas de reproducción.
              </p>
            </div>

            <button
              onClick={() => handleOpenDisplayModal()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Crear Pantalla
            </button>
          </div>

          {displays.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Tv className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No hay pantallas registradas</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Crea una pantalla (ej. "Televisor Local Principal") para obtener su URL única de reproducción en pantalla completa.
              </p>
              <button
                onClick={() => handleOpenDisplayModal()}
                className="mt-5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm inline-flex items-center gap-2 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" />
                Registrar Primera Pantalla
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displays.map((display) => {
                const fullUrl = getFullDisplayUrl(display.token);
                return (
                  <div
                    key={display.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold font-mono">
                            {formatLastSeen(display.lastSeen)}
                          </span>
                          <h4 className="text-lg font-black text-slate-900 mt-1.5">{display.name}</h4>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenDisplayModal(display)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
                            title="Editar pantalla"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDisplay(display.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Eliminar pantalla"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-slate-500">Playlist Asignada:</span>
                          <span className="font-bold text-slate-800">
                            {display.playlistName || 'Sin playlist'}
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-slate-500 bg-slate-900 text-slate-200 p-2.5 rounded-xl flex items-center justify-between gap-2 overflow-hidden">
                          <span className="truncate">{fullUrl}</span>
                        </div>

                        {/* Control Remoto en Tiempo Real para Smart TV */}
                        <div className="bg-slate-900 text-white rounded-xl p-3 space-y-2.5 mt-3 border border-slate-800 shadow-inner">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-2">
                            <span className="flex items-center gap-1.5 text-sky-400">
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              Control Remoto Smart TV
                            </span>
                            <span className="font-mono text-[10px] text-emerald-400">En vivo ⚡</span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5">
                            {/* Play / Pause Toggle */}
                            <button
                              type="button"
                              onClick={() => handleControlDisplay(display.id, { isPaused: !display.isPaused })}
                              className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                                display.isPaused
                                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-xs'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                              title={display.isPaused ? 'Reanudar video' : 'Pausar video'}
                            >
                              {display.isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                              {display.isPaused ? 'Reanudar' : 'Pausar'}
                            </button>

                            {/* Mute / Unmute Toggle */}
                            <button
                              type="button"
                              onClick={() => handleControlDisplay(display.id, { isMuted: !display.isMuted })}
                              className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                                display.isMuted
                                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                  : 'bg-sky-600 text-white hover:bg-sky-700 shadow-xs'
                              }`}
                              title={display.isMuted ? 'Activar sonido' : 'Silenciar (Mute)'}
                            >
                              {display.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                              {display.isMuted ? 'Mute' : 'Audio ON'}
                            </button>

                            {/* Loop Mode Toggle */}
                            <button
                              type="button"
                              onClick={() => handleControlDisplay(display.id, { loopMode: display.loopMode === false ? true : false })}
                              className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                                display.loopMode !== false
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                              }`}
                              title={display.loopMode !== false ? 'Bucle continuo activado' : 'Bucle desactivado'}
                            >
                              <Repeat className="w-3.5 h-3.5" />
                              {display.loopMode !== false ? 'Bucle ON' : 'Bucle OFF'}
                            </button>
                          </div>

                          {/* Volume Slider & Next Video Button */}
                          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                            <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={display.volume ?? 100}
                              onChange={(e) => handleControlDisplay(display.id, { volume: Number(e.target.value) })}
                              className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                              title={`Ajustar volumen: ${display.volume ?? 100}%`}
                            />
                            <span className="text-[10px] font-mono text-slate-300 w-7 text-right shrink-0">
                              {display.volume ?? 100}%
                            </span>

                            <button
                              type="button"
                              onClick={() => handleControlDisplay(display.id, { commandAction: 'next' })}
                              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded shrink-0 transition-colors"
                              title="Saltar al siguiente elemento"
                            >
                              <SkipForward className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Screen Rotation / Orientation Selector */}
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 pt-2 border-t border-slate-800/80">
                            <span className="flex items-center gap-1.5 text-indigo-300">
                              <RotateCw className="w-3.5 h-3.5" />
                              Girar Pantalla:
                            </span>
                            <div className="flex items-center gap-1">
                              {[
                                { deg: 0, label: '0°' },
                                { deg: 90, label: '90° Vert' },
                                { deg: 180, label: '180°' },
                                { deg: 270, label: '270° Vert' },
                              ].map((rot) => (
                                <button
                                  key={rot.deg}
                                  type="button"
                                  onClick={() => handleControlDisplay(display.id, { orientation: rot.deg })}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                                    (display.orientation ?? 0) === rot.deg
                                      ? 'bg-indigo-600 text-white shadow-xs'
                                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                                  }`}
                                  title={`Girar pantalla a ${rot.label}`}
                                >
                                  {rot.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Playlist Item Direct Play Selector */}
                          {display.playlistId && (() => {
                            const currentPlaylist = playlists.find(p => p.id === display.playlistId);
                            const items = currentPlaylist?.items || [];
                            const selectedIdx = selectedItemIndexes[display.id] ?? 0;

                            if (items.length === 0) return null;

                            return (
                              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                                <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                                  <span className="text-sky-300 flex items-center gap-1">
                                    <ListVideo className="w-3.5 h-3.5" />
                                    Elementos de la Playlist:
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={selectedIdx}
                                    onChange={(e) => setSelectedItemIndexes(prev => ({ ...prev, [display.id]: Number(e.target.value) }))}
                                    className="flex-1 min-w-0 px-2 py-1 bg-slate-800 text-slate-100 text-[11px] font-medium rounded-lg border border-slate-700 focus:outline-none focus:border-sky-500 truncate"
                                  >
                                    {items.map((it, idx) => (
                                      <option key={it.id} value={idx}>
                                        #{idx + 1}: {it.video?.name || `Elemento ${idx + 1}`} ({it.video?.mediaType === 'image' ? 'Imagen' : 'Video'})
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => handleControlDisplay(display.id, { commandAction: `jump:${selectedIdx}` })}
                                    className="py-1 px-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-md shrink-0 transition-all active:scale-95"
                                    title="Reproducir este elemento inmediatamente"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    Reproducir
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(fullUrl);
                          alert('URL copiada al portapapeles: ' + fullUrl);
                        }}
                        className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar URL
                      </button>

                      <button
                        onClick={() => setQrModalData({ url: fullUrl, name: display.name })}
                        className="py-2 px-3 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                        title="Ver código QR"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Código QR
                      </button>

                      <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                        title="Abrir pantalla en nueva pestaña"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Abrir
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 1: UPLOAD VIDEO OR IMAGE SLIDE */}
      {/* ---------------------------------------------------- */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2">
              <UploadCloud className="w-6 h-6 text-sky-500" />
              Subir Contenido Multimedia
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Sube videos publicitarios o imágenes en diapositivas para transmitir en tus pantallas.
            </p>

            {/* Media Type Selector Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-4">
              <button
                type="button"
                onClick={() => setUploadMediaType('video')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  uploadMediaType === 'video'
                    ? 'bg-white text-sky-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Film className="w-4 h-4" />
                Video (MP4 / WebM)
              </button>

              <button
                type="button"
                onClick={() => setUploadMediaType('image')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  uploadMediaType === 'image'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                Imagen (Diapositiva)
              </button>
            </div>

            <form onSubmit={handleUploadVideo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Contenido</label>
                <input
                  type="text"
                  value={videoName}
                  onChange={(e) => setVideoName(e.target.value)}
                  placeholder={uploadMediaType === 'image' ? 'ej. Diapositiva Promoción de Temporada' : 'ej. Anuncio Oferta de Verano'}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              {uploadMediaType === 'image' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Tiempo de Visualización (Segundos por Diapositiva)</span>
                    <span className="text-indigo-600 font-mono text-[11px] font-extrabold">{slideDuration}s</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={slideDuration}
                      onChange={(e) => setSlideDuration(Math.max(1, parseInt(e.target.value, 10) || 10))}
                      className="w-28 px-3.5 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <div className="flex gap-1.5 overflow-x-auto">
                      {[5, 10, 15, 30, 60].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setSlideDuration(sec)}
                          className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border transition-colors ${
                            slideDuration === sec
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Archivo {uploadMediaType === 'image' ? 'de Imagen' : 'de Video'}
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/50 rounded-2xl p-6 text-center cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={uploadMediaType === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'video/mp4,video/webm,video/quicktime,video/mov'}
                    onChange={handleSelectFile}
                    className="hidden"
                  />
                  {uploadMediaType === 'image' ? (
                    <ImageIcon className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                  ) : (
                    <Film className="w-10 h-10 text-sky-500 mx-auto mb-2" />
                  )}

                  {videoFile ? (
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{videoFile.name}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">
                        Haz clic para buscar {uploadMediaType === 'image' ? 'imagen' : 'video'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {uploadMediaType === 'image'
                          ? 'Formatos soportados: JPG, PNG, WEBP, GIF'
                          : 'Formatos soportados: MP4, WebM, MOV (Máx. 500MB)'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading || !videoFile}
                  className="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md transition-colors"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    uploadMediaType === 'image' ? 'Subir Imagen' : 'Subir Video'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 2: EDIT / CREATE PLAYLIST */}
      {/* ---------------------------------------------------- */}
      {showPlaylistModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowPlaylistModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2 shrink-0">
              <ListVideo className="w-6 h-6 text-indigo-500" />
              {editingPlaylist ? 'Editar Playlist' : 'Nueva Lista de Reproducción'}
            </h3>
            <p className="text-xs text-slate-500 mb-4 shrink-0">
              Selecciona y reordena la secuencia de videos que se reproducirán de forma continua.
            </p>

            <form onSubmit={handleSavePlaylist} className="flex-1 flex flex-col overflow-hidden space-y-4">
              <div className="shrink-0">
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Playlist</label>
                <input
                  type="text"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  placeholder="ej. Publicidad Principal Tienda"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                <label className="block text-xs font-bold text-slate-700">
                  Seleccionar y Ordenar Videos ({selectedVideoIds.length} seleccionados):
                </label>

                {videos.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl text-center">
                    Primero sube videos publicitarios en la pestaña "Videos".
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Active selected sequence */}
                    {selectedVideoIds.map((vId, idx) => {
                      const videoObj = videos.find((v) => v.id === vId);
                      if (!videoObj) return null;

                      return (
                        <div
                          key={vId}
                          className="flex items-center justify-between p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold font-mono text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-900 truncate">{videoObj.name}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveVideoInPlaylist(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 text-slate-600 hover:text-indigo-600 disabled:opacity-30 rounded hover:bg-indigo-100"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveVideoInPlaylist(idx, 'down')}
                              disabled={idx === selectedVideoIds.length - 1}
                              className="p-1 text-slate-600 hover:text-indigo-600 disabled:opacity-30 rounded hover:bg-indigo-100"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleSelectVideoForPlaylist(vId)}
                              className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-100 ml-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Unselected available videos */}
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">
                        Videos Disponibles para Agregar:
                      </p>
                      {videos
                        .filter((v) => !selectedVideoIds.includes(v.id))
                        .map((video) => (
                          <div
                            key={video.id}
                            onClick={() => handleToggleSelectVideoForPlaylist(video.id)}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs hover:border-indigo-300 cursor-pointer transition-colors mb-1.5"
                          >
                            <span className="font-semibold text-slate-700 truncate">{video.name}</span>
                            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md">
                              + Agregar
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPlaylistModal(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md transition-colors"
                >
                  Guardar Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 3: CREATE / EDIT DISPLAY */}
      {/* ---------------------------------------------------- */}
      {showDisplayModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setShowDisplayModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2">
              <Tv className="w-6 h-6 text-emerald-500" />
              {editingDisplay ? 'Editar Pantalla' : 'Registrar Nueva Pantalla'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Genera una nueva URL única para transmitir tus anuncios en Smart TVs o monitores.
            </p>

            <form onSubmit={handleSaveDisplay} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Pantalla</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="ej. Televisor Exposición Local Principal"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Playlist Asignada</label>
                <select
                  value={assignedPlaylistId || ''}
                  onChange={(e) => setAssignedPlaylistId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="">-- Seleccionar Playlist --</option>
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name} ({pl.items?.length || 0} videos)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDisplayModal(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md transition-colors"
                >
                  Guardar Pantalla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 4: PREVIEW VIDEO */}
      {/* ---------------------------------------------------- */}
      {previewVideoUrl && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl relative border border-slate-800">
            <button
              onClick={() => setPreviewVideoUrl(null)}
              className="absolute top-4 right-4 z-10 p-2 text-white bg-slate-800/80 hover:bg-slate-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <video src={previewVideoUrl} controls autoPlay className="w-full aspect-video object-contain" />
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 5: QR CODE VIEW */}
      {/* ---------------------------------------------------- */}
      {qrModalData && (
        <QrModal
          url={qrModalData.url}
          name={qrModalData.name}
          onClose={() => setQrModalData(null)}
        />
      )}
    </div>
  );
};

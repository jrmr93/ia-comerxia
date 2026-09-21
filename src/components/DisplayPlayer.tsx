import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tv, AlertCircle, RefreshCw, WifiOff, Pause, VolumeX, Volume2, Volume1, Image as ImageIcon } from 'lucide-react';
import { PublicDisplayConfig } from '../types.ts';

interface DisplayPlayerProps {
  token: string;
}

export const DisplayPlayer: React.FC<DisplayPlayerProps> = ({ token }) => {
  const [config, setConfig] = useState<PublicDisplayConfig | null>(null);
  const [videos, setVideos] = useState<PublicDisplayConfig['videos']>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Audio gesture requirement tracking
  const [audioNeedsUserGesture, setAudioNeedsUserGesture] = useState(false);

  // Image slide countdown timer
  const [slideProgress, setSlideProgress] = useState(0); // 0 to 100%

  // Cached media URLs (Blob or CacheStorage URLs for offline playback)
  const [cachedUrls, setCachedUrls] = useState<Record<number, string>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const isSyncingRef = useRef(false);
  const prevSrcRef = useRef<string | null>(null);
  const lastProcessedActionRef = useRef<string | null>(null);

  // ----------------------------------------------------
  // OFFLINE CACHING WORKER
  // ----------------------------------------------------
  const cacheVideosLocally = useCallback(async (videoList: PublicDisplayConfig['videos']) => {
    if (typeof window === 'undefined' || !('caches' in window)) return;

    try {
      const cache = await caches.open('digital-signage-v1');
      const newCachedMap: Record<number, string> = {};

      for (const vid of videoList) {
        if (!vid.fileUrl) continue;
        try {
          const match = await cache.match(vid.fileUrl);
          if (!match) {
            const response = await fetch(vid.fileUrl, { mode: 'cors' });
            if (response.ok) {
              await cache.put(vid.fileUrl, response.clone());
              const blob = await response.blob();
              newCachedMap[vid.id] = URL.createObjectURL(blob);
            }
          } else {
            const blob = await match.blob();
            newCachedMap[vid.id] = URL.createObjectURL(blob);
          }
        } catch (cacheErr) {
          console.warn(`[Signage Cache] Could not cache item ${vid.id}:`, cacheErr);
        }
      }

      if (Object.keys(newCachedMap).length > 0) {
        setCachedUrls((prev) => ({ ...prev, ...newCachedMap }));
      }
    } catch (err) {
      console.warn('[Signage Cache] CacheStorage not supported:', err);
    }
  }, []);

  // ----------------------------------------------------
  // FETCH DISPLAY CONFIG & CONTROL STATE (POLL EVERY 3s FOR LIVE CONTROLS)
  // ----------------------------------------------------
  const fetchDisplayConfig = useCallback(async (isInitial = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      const res = await fetch(`/api/public/display/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Pantalla no encontrada o inactiva.');
      }

      const data: PublicDisplayConfig = await res.json();
      if (data) {
        setConfig(data);
        const newVideos = data.videos || [];
        setVideos(newVideos);
        setErrorMsg(null);
        setIsOffline(false);

        // Pre-cache videos and images for offline fallback
        cacheVideosLocally(newVideos);
      }
    } catch (err: any) {
      console.warn('[Signage Player] Fetch error:', err.message);
      if (!navigator.onLine) {
        setIsOffline(true);
      } else if (isInitial) {
        setErrorMsg(err.message || 'Error al conectar con la pantalla publicitaria.');
      }
    } finally {
      if (isInitial) setLoading(false);
      isSyncingRef.current = false;
    }
  }, [token, cacheVideosLocally]);

  // Network online/offline listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      fetchDisplayConfig(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchDisplayConfig]);

  // Fast polling every 3 seconds for instant remote control execution
  useEffect(() => {
    fetchDisplayConfig(true);

    const interval = setInterval(() => {
      fetchDisplayConfig(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchDisplayConfig]);

  const videosRef = useRef(videos);
  const configRef = useRef(config);

  useEffect(() => {
    videosRef.current = videos;
    configRef.current = config;
  }, [videos, config]);

  // Current item selection
  const currentItem = videos[currentIndex] || null;
  const currentSrc = currentItem
    ? cachedUrls[currentItem.id] || currentItem.fileUrl
    : null;

  const isImageItem = Boolean(
    currentItem &&
    (currentItem.mediaType === 'image' ||
      /^data:image\//i.test(currentItem.fileUrl) ||
      /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(currentItem.fileUrl))
  );

  // Next & Previous item handlers with smooth loop (STABLE REFS)
  const handleNextVideo = useCallback(() => {
    const list = videosRef.current;
    if (list.length === 0) return;
    const loopMode = configRef.current?.controls?.loopMode ?? configRef.current?.display?.loopMode ?? true;

    if (list.length === 1) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
      setSlideProgress(0);
      return;
    }

    setCurrentIndex((prevIndex) => {
      const nextIndex = prevIndex + 1;
      if (nextIndex >= list.length) {
        return loopMode ? 0 : prevIndex;
      }
      return nextIndex;
    });
    setSlideProgress(0);
  }, []);

  const handlePrevVideo = useCallback(() => {
    const list = videosRef.current;
    if (list.length === 0) return;
    if (list.length === 1) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
      setSlideProgress(0);
      return;
    }
    setCurrentIndex((prevIndex) => (prevIndex - 1 + list.length) % list.length);
    setSlideProgress(0);
  }, []);

  // Handle user tap/click/keydown to unlock audio permanently at 100% Volume
  const handleUserInteractionToUnlockAudio = useCallback(() => {
    setAudioNeedsUserGesture(false);

    if (videoRef.current) {
      const isMutedRemotely = configRef.current?.controls?.isMuted ?? configRef.current?.display?.isMuted ?? false;
      const vol = configRef.current?.controls?.volume ?? configRef.current?.display?.volume ?? 100;

      videoRef.current.muted = isMutedRemotely;
      videoRef.current.volume = Math.max(0, Math.min(100, vol)) / 100;

      const promise = videoRef.current.play();
      if (promise !== undefined) {
        promise.catch((err) => {
          console.warn('[Signage Player] Play after gesture failed:', err);
        });
      }
    }
  }, []);

  // Global listeners for any click, tap, or key press to unlock unmuted sound on Smart TVs
  useEffect(() => {
    const unlockAudio = () => {
      setAudioNeedsUserGesture(false);
      if (videoRef.current) {
        const isMutedRemotely = configRef.current?.controls?.isMuted ?? configRef.current?.display?.isMuted ?? false;
        const vol = configRef.current?.controls?.volume ?? configRef.current?.display?.volume ?? 100;
        videoRef.current.muted = isMutedRemotely;
        videoRef.current.volume = Math.max(0, Math.min(100, vol)) / 100;
        videoRef.current.play().catch(() => {});
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Apply Remote Controls dynamically to HTML5 Video Element (WITHOUT resetting currentTime!)
  useEffect(() => {
    if (isImageItem || !videoRef.current || !config) return;

    const vid = videoRef.current;
    const controls = config.controls || config.display;

    if (!controls) return;

    // 1. Remote Mute / Unmute & Volume (Default to 100% max volume)
    const desiredMuted = Boolean(controls.isMuted);
    const desiredVolume = typeof controls.volume === 'number'
      ? Math.max(0, Math.min(100, controls.volume)) / 100
      : 1.0;

    vid.volume = desiredVolume;

    if (desiredMuted !== vid.muted) {
      vid.muted = desiredMuted;
    }

    // 2. Remote Play / Pause
    if (controls.isPaused) {
      if (!vid.paused) vid.pause();
    } else {
      if (vid.paused && currentSrc) {
        const promise = vid.play();
        if (promise !== undefined) {
          promise.catch((err) => {
            if (err.name === 'NotAllowedError' && !desiredMuted) {
              console.warn('[Signage Player] Audio autoplay restricted by browser. Attempting muted fallback.');
              vid.muted = true;
              vid.play().catch(() => {});
              setAudioNeedsUserGesture(true);
            }
          });
        }
      }
    }
  }, [config, currentSrc, isImageItem]);

  // Handle explicit jump & command actions independently for both video and image items
  useEffect(() => {
    if (!config) return;
    const controls = config.controls || config.display;
    if (!controls?.commandAction) return;

    if (controls.commandAction !== lastProcessedActionRef.current) {
      lastProcessedActionRef.current = controls.commandAction;
      const act = controls.commandAction;
      if (act === 'next') {
        handleNextVideo();
      } else if (act === 'prev') {
        handlePrevVideo();
      } else if (act === 'restart') {
        if (videoRef.current) videoRef.current.currentTime = 0;
        setSlideProgress(0);
      } else if (act.startsWith('jump:')) {
        const targetIdx = parseInt(act.split(':')[1], 10);
        const availableVideos = config.videos || videosRef.current;
        if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx < availableVideos.length) {
          setCurrentIndex(targetIdx);
          setSlideProgress(0);
          if (videoRef.current) videoRef.current.currentTime = 0;
        }
      }
    }
  }, [config, handleNextVideo, handlePrevVideo]);

  // Trigger video play ONLY when currentSrc or currentIndex actually changes!
  useEffect(() => {
    if (isImageItem || !videoRef.current || !currentSrc) return;

    const vidEl = videoRef.current;

    // Only reset time if source has changed
    if (prevSrcRef.current !== currentSrc) {
      prevSrcRef.current = currentSrc;
      vidEl.currentTime = 0;
    }

    const isPausedRemotely = config?.controls?.isPaused ?? config?.display?.isPaused ?? false;
    const isMutedRemotely = config?.controls?.isMuted ?? config?.display?.isMuted ?? false;
    const vol = config?.controls?.volume ?? config?.display?.volume ?? 100;

    vidEl.volume = Math.max(0, Math.min(100, vol)) / 100;
    vidEl.muted = isMutedRemotely;

    if (isPausedRemotely) return;

    const playPromise = vidEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[Signage Player] Autoplay restricted by browser, applying muted fallback:', err);
        vidEl.muted = true;
        setAudioNeedsUserGesture(!isMutedRemotely);
        vidEl.play().catch((e) => console.error('[Signage Player] Muted play failed:', e));
      });
    }
  }, [currentSrc, currentIndex, isImageItem]); // NOT depending on config object to avoid 3s restart!

  // Handle Image Diapositiva / Slide Countdown Timer (Dependent strictly on primitive values!)
  const currentItemId = currentItem?.id;
  const currentDuration = currentItem?.duration && currentItem.duration > 0 ? currentItem.duration : 10;
  const isPausedRemotely = config?.controls?.isPaused ?? config?.display?.isPaused ?? false;

  useEffect(() => {
    if (!isImageItem || !currentItemId) return;
    if (isPausedRemotely) return;

    setSlideProgress(0);
    const stepMs = 100;
    const totalSteps = (currentDuration * 1000) / stepMs;

    let stepCount = 0;

    const timer = setInterval(() => {
      stepCount += 1;
      const progressPercent = Math.min(100, (stepCount / totalSteps) * 100);
      setSlideProgress(progressPercent);

      if (stepCount >= totalSteps) {
        clearInterval(timer);
        handleNextVideo();
      }
    }, stepMs);

    return () => clearInterval(timer);
  }, [isImageItem, currentItemId, currentDuration, currentIndex, isPausedRemotely, handleNextVideo]);

  // Handle video playback errors without freezing screen
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('[Signage Player] Error playing media at index', currentIndex, e);
    setTimeout(() => {
      handleNextVideo();
    }, 2000);
  };

  const isPaused = config?.controls?.isPaused ?? config?.display?.isPaused ?? false;
  const isMuted = config?.controls?.isMuted ?? config?.display?.isMuted ?? false;
  const volumeVal = config?.controls?.volume ?? config?.display?.volume ?? 100;
  const loopMode = config?.controls?.loopMode ?? config?.display?.loopMode ?? true;

  // ----------------------------------------------------
  // RENDER MODES
  // ----------------------------------------------------

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-950 text-white flex flex-col items-center justify-center p-6 z-50 select-none">
        <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mb-4 animate-pulse">
          <Tv className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">Comerxia Digital Signage</h2>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
          Conectando pantalla y sincronizando contenido...
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="fixed inset-0 bg-slate-950 text-white flex flex-col items-center justify-center p-6 z-50 select-none">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2 text-rose-300">Pantalla Desconectada</h2>
        <p className="text-slate-400 text-sm text-center max-w-md mb-6">{errorMsg}</p>
        <button
          onClick={() => fetchDisplayConfig(true)}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 transition-colors border border-slate-700"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar Conexión
        </button>
      </div>
    );
  }

  if (!currentItem || videos.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-950 text-white flex flex-col items-center justify-center p-6 z-50 select-none relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/40 via-slate-950 to-sky-950/40 animate-pulse pointer-events-none" />

        <div className="relative z-10 text-center max-w-lg">
          <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 text-sky-400 flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <Tv className="w-10 h-10" />
          </div>

          <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-mono font-bold tracking-wider uppercase mb-3 inline-block">
            {config?.display.name || 'Pantalla Publicitaria'}
          </span>

          <h1 className="text-2xl font-black text-white tracking-tight mb-2">
            Pantalla Lista para Transmitir
          </h1>

          <p className="text-slate-400 text-sm mb-6">
            Asigna videos o imágenes (diapositivas) a la playlist desde el panel administrativo de Comerxia para comenzar la transmisión automática.
          </p>

          {isOffline && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              Sin conexión a Internet (Modo Espera Local)
            </div>
          )}
        </div>
      </div>
    );
  }

  const orientation = config?.controls?.orientation ?? config?.display?.orientation ?? 0;

  const getRotationStyle = (): React.CSSProperties => {
    if (orientation === 90 || orientation === 270) {
      return {
        transform: `translate(-50%, -50%) rotate(${orientation}deg)`,
        width: '100vh',
        height: '100vw',
        position: 'fixed',
        top: '50%',
        left: '50%',
      };
    }
    if (orientation === 180) {
      return {
        transform: 'rotate(180deg)',
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      };
    }
    return {
      transform: 'rotate(0deg)',
      width: '100vw',
      height: '100vh',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    };
  };

  return (
    <div
      onClick={handleUserInteractionToUnlockAudio}
      style={getRotationStyle()}
      className="bg-black text-white z-50 overflow-hidden select-none cursor-pointer flex items-center justify-center relative"
    >
      {/* Media Element: Image Slide vs Video */}
      {isImageItem ? (
        <div className="w-full h-full flex items-center justify-center relative bg-black">
          <img
            src={currentSrc || currentItem.fileUrl}
            alt={currentItem.name}
            className="w-full h-full object-contain bg-black transition-all duration-700 ease-in-out"
          />

          {/* Slide Countdown Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-900/80 overflow-hidden z-40">
            <div
              className="h-full bg-sky-500 transition-all duration-100 ease-linear shadow-[0_0_12px_rgba(56,189,248,0.8)]"
              style={{ width: `${slideProgress}%` }}
            />
          </div>

          <div className="absolute top-6 right-6 z-50 bg-slate-900/80 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 backdrop-blur-md">
            <ImageIcon className="w-4 h-4 text-sky-400" />
            Diapositiva ({currentItem.duration || 10}s)
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={currentSrc || currentItem.fileUrl}
          autoPlay
          playsInline
          loop={videos.length === 1 && loopMode}
          muted={isMuted}
          onEnded={handleNextVideo}
          onError={handleVideoError}
          className="w-full h-full object-contain bg-black pointer-events-none"
        />
      )}

      {/* Audio Unmute User Gesture Banner (if browser blocked unmuted autoplay) */}
      {audioNeedsUserGesture && !isMuted && !isImageItem && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-sky-600/95 hover:bg-sky-500 text-white border border-sky-400/50 px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-bounce">
          <Volume1 className="w-6 h-6 animate-pulse" />
          <div className="text-left">
            <div className="font-extrabold text-sm tracking-wide">Haga clic o toca en la pantalla</div>
            <div className="text-xs text-sky-100 opacity-90">Para activar el audio completo al 100%</div>
          </div>
        </div>
      )}

      {/* Discrete Remote Control Badges */}
      {isPaused && (
        <div className="absolute bottom-6 left-6 z-50 bg-amber-950/90 text-amber-200 border border-amber-800/80 px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md animate-pulse">
          <Pause className="w-4 h-4 text-amber-400" />
          PAUSADO DESDE EL PANEL DE CONTROL
        </div>
      )}

      {/* Volume & Audio Indicator */}
      {!isImageItem && !isMuted && volumeVal < 100 && (
        <div className="absolute top-6 left-6 z-50 bg-slate-900/80 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 backdrop-blur-md">
          <Volume2 className="w-4 h-4 text-sky-400" />
          Volumen: {volumeVal}%
        </div>
      )}

      {!isImageItem && isMuted && (
        <div className="absolute top-6 left-6 z-50 bg-slate-900/60 text-slate-400 border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] font-mono flex items-center gap-1.5 backdrop-blur-md">
          <VolumeX className="w-3.5 h-3.5" />
          Sin Audio (Mute)
        </div>
      )}

      {/* Offline Badge */}
      {isOffline && (
        <div className="absolute top-6 right-6 z-50 bg-amber-950/80 text-amber-200 border border-amber-800 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 backdrop-blur-md">
          <WifiOff className="w-3.5 h-3.5" />
          Reproduciendo desde caché local
        </div>
      )}
    </div>
  );
};

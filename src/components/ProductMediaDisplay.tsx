import React, { useState, useEffect } from 'react';
import { Film, Play, Package, Image as ImageIcon, ImageOff } from 'lucide-react';
import { parseVideoUrl } from '../utils/video-helper.ts';
import { normalizeMediaUrl } from '../utils/media-helper.ts';

interface ProductMediaDisplayProps {
  imageUrl?: string | null;
  candidateImages?: string[];
  videoUrl?: string | null;
  name: string;
  className?: string;
  imageClassName?: string;
  videoClassName?: string;
  autoPlayVideo?: boolean;
  showPlayBadge?: boolean;
  placeholderText?: string;
  fallbackIcon?: 'package' | 'image';
  onClick?: (e: React.MouseEvent) => void;
}

export const ProductMediaDisplay: React.FC<ProductMediaDisplayProps> = ({
  imageUrl,
  candidateImages,
  videoUrl,
  name,
  className = 'w-full h-full relative overflow-hidden',
  imageClassName = 'w-full h-full object-cover',
  videoClassName = 'w-full h-full object-cover',
  autoPlayVideo = true,
  showPlayBadge = true,
  placeholderText = 'Producto sin foto',
  fallbackIcon = 'package',
  onClick,
}) => {
  // Helper to build normalized list of candidates
  const buildCandidateList = () => {
    const list: string[] = [];
    const add = (u: string | null | undefined) => {
      const n = normalizeMediaUrl(u);
      if (n && !list.includes(n)) list.push(n);
    };
    add(imageUrl);
    if (Array.isArray(candidateImages)) {
      candidateImages.forEach(add);
    }
    return list;
  };

  const [candidates, setCandidates] = useState<string[]>(buildCandidateList);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [hasTriedApiFallback, setHasTriedApiFallback] = useState(false);
  const [currentImgSrc, setCurrentImgSrc] = useState<string>(() => candidates[0] || '');
  const [imageError, setImageError] = useState(() => candidates.length === 0);

  // Video state & fallback
  const cleanVideoUrl = normalizeMediaUrl(videoUrl);
  const [videoSrc, setVideoSrc] = useState<string>(cleanVideoUrl);
  const [hasTriedVideoFallback, setHasTriedVideoFallback] = useState(false);
  const [videoError, setVideoError] = useState(!cleanVideoUrl);

  const [activeMode, setActiveMode] = useState<'photo' | 'video'>('photo');

  useEffect(() => {
    const list = buildCandidateList();
    setCandidates(list);
    setCandidateIdx(0);
    setHasTriedApiFallback(false);
    setCurrentImgSrc(list[0] || '');
    setImageError(list.length === 0);
    // Even if product has video and no photos, user requirement:
    // "los productos que no tengan fotos debe mostrar una imagen de portada que diga producto sin foto, en cualquier tipo de vista, aunque tengan un video y no tengan foto debe salir la imagen producto sin foto."
    setActiveMode('photo');
  }, [imageUrl, candidateImages ? candidateImages.join('|') : '']);

  useEffect(() => {
    const normVid = normalizeMediaUrl(videoUrl);
    setVideoSrc(normVid);
    setHasTriedVideoFallback(false);
    setVideoError(!normVid);
  }, [videoUrl]);

  const hasValidVideo = Boolean(videoSrc && !videoError);
  // Do NOT force video mode when photos are absent - always preserve activeMode so cover is displayed first
  const effectiveMode = activeMode;

  const goToNext = () => {
    if (effectiveMode === 'photo') {
      if (candidateIdx < candidates.length - 1) {
        const next = candidateIdx + 1;
        setCandidateIdx(next);
        setCurrentImgSrc(candidates[next]);
      } else if (hasValidVideo) {
        // Last photo swiped -> reveal video!
        setActiveMode('video');
      } else if (candidates.length > 1) {
        setCandidateIdx(0);
        setCurrentImgSrc(candidates[0]);
      }
    } else if (effectiveMode === 'video') {
      setActiveMode('photo');
      setCandidateIdx(0);
      setCurrentImgSrc(candidates[0] || '');
    }
  };

  const goToPrev = () => {
    if (effectiveMode === 'video') {
      setActiveMode('photo');
      const lastIdx = Math.max(0, candidates.length - 1);
      setCandidateIdx(lastIdx);
      setCurrentImgSrc(candidates[lastIdx] || '');
    } else if (effectiveMode === 'photo') {
      if (candidateIdx > 0) {
        const prev = candidateIdx - 1;
        setCandidateIdx(prev);
        setCurrentImgSrc(candidates[prev]);
      } else if (hasValidVideo) {
        setActiveMode('video');
      } else if (candidates.length > 1) {
        const lastIdx = candidates.length - 1;
        setCandidateIdx(lastIdx);
        setCurrentImgSrc(candidates[lastIdx]);
      }
    }
  };

  // Touch gesture handling
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const didSwipeRef = React.useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    didSwipeRef.current = false;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= (dt < 300 ? 25 : 40)) {
      didSwipeRef.current = true;
      if (dx < 0) goToNext();
      else goToPrev();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }
    if (onClick) onClick(e);
  };

  const handleImageError = () => {
    // 1. If it was /uploads/xxx and failed, try /api/media/xxx once
    if (currentImgSrc.startsWith('/uploads/') && !hasTriedApiFallback) {
      setHasTriedApiFallback(true);
      setCurrentImgSrc(currentImgSrc.replace('/uploads/', '/api/media/'));
      return;
    }

    // 2. If it's an external http/https URL and failed (likely CORS or hotlink block), proxy it through /api/proxy-image!
    if (
      (currentImgSrc.startsWith('http://') || currentImgSrc.startsWith('https://')) &&
      !currentImgSrc.includes('/api/proxy-image')
    ) {
      setCurrentImgSrc(`/api/proxy-image?url=${encodeURIComponent(currentImgSrc)}`);
      return;
    }

    // 3. Try next candidate in list
    const nextIdx = candidateIdx + 1;
    if (nextIdx < candidates.length) {
      setCandidateIdx(nextIdx);
      setHasTriedApiFallback(false);
      setCurrentImgSrc(candidates[nextIdx]);
      return;
    }

    // 4. All image candidates failed
    setImageError(true);
  };

  const handleVideoError = () => {
    if (videoSrc.startsWith('/uploads/') && !hasTriedVideoFallback) {
      setHasTriedVideoFallback(true);
      setVideoSrc(videoSrc.replace('/uploads/', '/api/media/'));
      return;
    }
    setVideoError(true);
  };

  // Render dots for swipe indicator
  const renderDots = () => {
    if (candidates.length <= 1 && !hasValidVideo) return null;
    return (
      <div className="absolute bottom-1.5 inset-x-0 flex items-center justify-center space-x-1 z-10 pointer-events-none">
        {candidates.map((_, i) => (
          <span
            key={i}
            className={`transition-all ${
              effectiveMode === 'photo' && candidateIdx === i
                ? 'w-3 h-1 bg-amber-400 rounded-full shadow-xs'
                : 'w-1 h-1 bg-white/70 rounded-full'
            }`}
          />
        ))}
        {hasValidVideo && (
          <span
            className={`transition-all flex items-center justify-center ${
              effectiveMode === 'video'
                ? 'w-3 h-1 bg-sky-400 rounded-full shadow-xs'
                : 'w-1 h-1 bg-sky-200/70 rounded-full'
            }`}
          />
        )}
      </div>
    );
  };

  // 1. If showing photo and valid image exists
  if (effectiveMode === 'photo' && currentImgSrc && !imageError) {
    return (
      <div
        className={`${className} touch-pan-y select-none`}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={currentImgSrc}
          alt={name}
          className={imageClassName}
          referrerPolicy="no-referrer"
          onError={handleImageError}
        />
        {cleanVideoUrl && showPlayBadge && (
          <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-lg text-[9px] font-black flex items-center space-x-1 shadow-md bg-slate-950/90 text-sky-300 border border-sky-400/40 backdrop-blur-xs">
            <Play className="w-2.5 h-2.5 text-sky-400 fill-current" />
            <span>Video</span>
          </div>
        )}
        {hasValidVideo && candidateIdx === candidates.length - 1 && (
          <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-black/75 text-sky-300 border border-sky-400/30 flex items-center space-x-0.5">
            <span>Video ▶</span>
          </div>
        )}
        {renderDots()}
      </div>
    );
  }

  // 1.b If in photo mode and no photo exists (or image failed):
  // User requirement: "los productos que no tengan fotos debe mostrar una imagen de portada que diga producto sin foto, en cualquier tipo de vista, aunque tengan un video y no tengan foto debe salir la imagen producto sin foto."
  if (effectiveMode === 'photo') {
    const textToShow = placeholderText || 'Producto sin foto';
    return (
      <div
        className={`${className} flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200/90 text-slate-500 relative select-none overflow-hidden group/nophoto border border-slate-200/70 p-2`}
        onClick={handleClick}
        onTouchStart={hasValidVideo ? handleTouchStart : undefined}
        onTouchEnd={hasValidVideo ? handleTouchEnd : undefined}
      >
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-white/95 border border-slate-200/90 flex items-center justify-center text-slate-400 shadow-2xs group-hover/nophoto:scale-105 transition-transform mb-1.5 shrink-0">
          <ImageOff className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 stroke-[1.75]" />
        </div>
        <div className="text-center px-1.5 min-w-0 max-w-full">
          <span className="text-[10px] sm:text-xs font-black text-slate-700 tracking-tight block uppercase leading-tight truncate">
            {textToShow}
          </span>
          <span className="text-[8px] sm:text-[9px] text-slate-400 font-medium block truncate mt-0.5">
            Sin foto disponible
          </span>
        </div>

        {/* If product has a video available, show an interactive badge so user can watch it */}
        {hasValidVideo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMode('video');
            }}
            className="mt-2 px-2.5 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-950 text-sky-300 border border-sky-400/40 text-[9px] sm:text-[10px] font-bold flex items-center space-x-1 shadow-xs transition cursor-pointer active:scale-95 z-10"
            title="Ver video disponible del producto"
          >
            <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-sky-400 fill-current" />
            <span>Ver Video</span>
          </button>
        )}
        {renderDots()}
      </div>
    );
  }

  // 2. If showing video and has valid video
  if (effectiveMode === 'video' && hasValidVideo) {
    const videoInfo = parseVideoUrl(videoSrc);

    if (videoInfo) {
      // Direct video file
      if (videoInfo.isDirect) {
        return (
          <div
            className={`${className} touch-pan-y select-none`}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Quick button to toggle back to cover if desired */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMode('photo');
              }}
              className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-lg bg-black/70 hover:bg-black text-white text-[9px] font-bold border border-white/20 flex items-center gap-1 cursor-pointer transition shadow-xs backdrop-blur-xs"
              title="Volver a la portada"
            >
              <ImageOff className="w-2.5 h-2.5" />
              <span>Portada</span>
            </button>

            <video
              ref={(el) => {
                if (el) {
                  el.muted = false;
                  el.volume = 1.0;
                  if (autoPlayVideo) {
                    const p = el.play();
                    if (p !== undefined) {
                      p.catch(() => {
                        const unmute = () => {
                          el.muted = false;
                          el.volume = 1.0;
                          el.play().catch(() => {});
                          window.removeEventListener('click', unmute);
                          window.removeEventListener('touchstart', unmute);
                        };
                        window.addEventListener('click', unmute, { once: true });
                        window.addEventListener('touchstart', unmute, { once: true });
                        el.muted = true;
                        el.play().catch(() => {});
                      });
                    }
                  }
                }
              }}
              onClick={(e) => {
                const v = e.currentTarget;
                v.muted = false;
                v.volume = 1.0;
              }}
              src={videoSrc.startsWith('/uploads/') || videoSrc.startsWith('/api/media/') ? videoSrc : videoInfo.embedUrl}
              muted={false}
              autoPlay={autoPlayVideo}
              controls
              controlsList="nodownload novolume"
              loop
              playsInline
              className={videoClassName}
              onError={handleVideoError}
            />
            {showPlayBadge && (
              <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-lg text-[9px] font-black flex items-center space-x-1 shadow-md bg-slate-950/90 text-emerald-300 border border-emerald-400/40 backdrop-blur-xs">
                <Play className="w-2.5 h-2.5 text-emerald-400 fill-current" />
                <span>Video</span>
              </div>
            )}
            {renderDots()}
          </div>
        );
      }

      // YouTube with thumbnail
      if (videoInfo.thumbnailUrl) {
        return (
          <div
            className={`${className} touch-pan-y select-none`}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMode('photo');
              }}
              className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-lg bg-black/70 hover:bg-black text-white text-[9px] font-bold border border-white/20 flex items-center gap-1 cursor-pointer transition shadow-xs backdrop-blur-xs"
              title="Volver a la portada"
            >
              <ImageOff className="w-2.5 h-2.5" />
              <span>Portada</span>
            </button>
            <img
              src={videoInfo.thumbnailUrl}
              alt={name}
              className={imageClassName}
              referrerPolicy="no-referrer"
              onError={handleVideoError}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/20 group-hover:bg-slate-950/40 transition-colors">
              <div className="w-10 h-10 rounded-full bg-slate-950/80 text-white border border-white/30 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                <Play className="w-4 h-4 text-sky-400 fill-sky-400 ml-0.5" />
              </div>
            </div>
            {showPlayBadge && (
              <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-lg text-[9px] font-black flex items-center space-x-1 shadow-md bg-slate-950/90 text-sky-300 border border-sky-400/40 backdrop-blur-xs">
                <Play className="w-2.5 h-2.5 text-sky-400 fill-current" />
                <span>{videoInfo.platform.toUpperCase()}</span>
              </div>
            )}
            {renderDots()}
          </div>
        );
      }

      // Platform video without static thumbnail
      return (
        <div
          className={`${className} bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-col items-center justify-center p-3 touch-pan-y select-none`}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMode('photo');
            }}
            className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-lg bg-black/70 hover:bg-black text-white text-[9px] font-bold border border-white/20 flex items-center gap-1 cursor-pointer transition shadow-xs backdrop-blur-xs"
            title="Volver a la portada"
          >
            <ImageOff className="w-2.5 h-2.5" />
            <span>Portada</span>
          </button>
          <div className="w-11 h-11 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shadow-md group-hover:scale-110 transition-transform mb-1.5">
            <Film className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-sky-400/20 text-sky-300 border border-sky-400/30">
            {videoInfo.platform.toUpperCase()} VIDEO
          </span>
          <span className="text-[9px] text-slate-400 mt-1 font-mono text-center truncate max-w-full px-2">
            Clic para reproducir
          </span>
          {renderDots()}
        </div>
      );
    }
  }

  // 3. Fallback: No image and no video (or both failed to load)
  return (
    <div
      className={`${className} flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200/90 text-slate-500 border border-slate-200/70 p-2 select-none`}
      onClick={onClick}
    >
      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-white/90 border border-slate-200/90 flex items-center justify-center text-slate-400 shadow-2xs mb-1.5 shrink-0">
        <ImageOff className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 stroke-[1.75]" />
      </div>
      <span className="text-[10px] sm:text-xs font-black text-slate-700 uppercase tracking-tight leading-tight truncate">
        {placeholderText || 'Producto sin foto'}
      </span>
      <span className="text-[8px] sm:text-[9px] text-slate-400 font-medium block truncate mt-0.5">
        Sin foto disponible
      </span>
    </div>
  );
};

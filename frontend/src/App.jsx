import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from './api';

import { 
  Search, Film, Tv, List, Settings, User, 
  Plus, AlertTriangle, X, Zap, Trash2, Filter, 
  ChevronLeft, ChevronRight, LogOut, Lock, Mail, 
  ChevronDown, Check, Flame, MonitorPlay
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithEmailAndPassword, 
  onAuthStateChanged, signOut, createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, updateDoc, 
  arrayUnion, arrayRemove, onSnapshot, getDoc 
} from 'firebase/firestore';

// --- CONFIG ---
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5001' 
  : 'https://cineblaze-backend.onrender.com'; 
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_LOGO_BASE_URL = 'https://image.tmdb.org/t/p/original';
const PLACEHOLDER_IMAGE = 'https://placehold.co/500x750/171717/7f1d1d?text=No+Poster';

// --- FIREBASE ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app, auth, db;
let firebaseInitialized = false;
try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseInitialized = true;
  }
} catch (error) { console.error("Firebase Init Error:", error); }

// --- GLOBAL STYLES ---
const GlobalStyles = () => (
  <style>{`
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0a0a0a; }
    ::-webkit-scrollbar-thumb { background: #262626; border-radius: 4px; border: 1px solid #0a0a0a; }
    ::-webkit-scrollbar-thumb:hover { background: #dc2626; }
    * { scrollbar-width: thin; scrollbar-color: #262626 #0a0a0a; }
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
);

const sanitizeItem = (item) => {
    if (!item) return null;
    return {
        ...item,
        id: item.id,
        // Backend guarantees strings, but safe fallback to []
        genres: Array.isArray(item.genres) ? item.genres : [],
        cast: Array.isArray(item.cast) ? item.cast : [],
        providers: Array.isArray(item.providers) ? item.providers : [],
        director: item.director || "Unknown",
        release_date: item.release_date || item.first_air_date || "",
        media_type: item.media_type || "movie",
        title: item.title || item.name || "Untitled",
        status: item.status || "want",
        poster_path: item.poster_path || null,
        vote_average: typeof item.vote_average === 'number' ? item.vote_average : 0,
        imdb_rating: item.imdb_rating || null,
        rotten_tomatoes: item.rotten_tomatoes || null,
        addedAt: item.addedAt || 0
    };
};

// --- COMPONENTS ---

const TrendingSkeleton = () => (
  <div className="space-y-3">
    <div className="flex items-center gap-2 px-1">
      <div className="w-1 h-5 bg-red-600 rounded-full"></div>
      <div className="h-5 w-40 bg-white/10 rounded animate-pulse"></div>
    </div>

    <div className="flex gap-4 overflow-hidden px-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="min-w-[140px] md:min-w-[160px] h-[240px] bg-white/5 rounded-xl animate-pulse"
        />
      ))}
    </div>
  </div>
);


const Poster = ({ path, alt, className = "" }) => (
  <img 
    src={path ? `${TMDB_IMAGE_BASE_URL}${path}` : PLACEHOLDER_IMAGE} 
    alt={alt || "Media Poster"}
    className={`object-cover ${className}`}
    onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER_IMAGE; }}
  />
);

const SimilarCard = ({ item, onClick }) => {
  const posterUrl = item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : PLACEHOLDER_IMAGE;
  const year = (item.release_date || item.first_air_date)?.split('-')[0] || 'N/A';

  return (
    <div 
        onClick={() => onClick(item)}
        className="min-w-[120px] w-[120px] bg-neutral-800 rounded-lg overflow-hidden shadow-md hover:scale-105 transition-transform cursor-pointer border border-neutral-700 flex-shrink-0 group"
    >
      <div className="relative h-40">
        <img src={posterUrl} alt={item.title} className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = PLACEHOLDER_IMAGE; }} />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
      </div>
      <div className="p-2 border-t border-neutral-700">
        <h4 className="text-xs font-bold text-gray-200 truncate" title={item.title}>{item.title || item.name}</h4>
        <p className="text-[10px] text-orange-500 font-medium">{year}</p>
      </div>
    </div>
  );
};

const HorizontalScrollContainer = ({ children, className = "" }) => {
    const scrollRef = useRef(null);
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(true);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setShowLeft(scrollLeft > 0);
            setShowRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [children]);

    const scroll = (direction) => {
        if (scrollRef.current) {
            const { clientWidth } = scrollRef.current;
            const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
            scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    return (
        <div className={`relative group/scroll ${className}`}>
            <button onClick={() => scroll('left')} className={`absolute left-0 top-0 bottom-0 z-20 w-8 md:w-12 bg-gradient-to-r from-black via-black/70 to-transparent flex items-center justify-center transition-opacity duration-300 ${showLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <ChevronLeft size={32} className="text-white drop-shadow-lg hover:text-red-500 transition-colors" />
            </button>
            <div ref={scrollRef} onScroll={checkScroll} className="flex overflow-x-auto gap-4 pb-4 scroll-smooth scrollbar-hide">
                {children}
            </div>
            <button onClick={() => scroll('right')} className={`absolute right-0 top-0 bottom-0 z-20 w-8 md:w-12 bg-gradient-to-l from-black via-black/70 to-transparent flex items-center justify-center transition-opacity duration-300 ${showRight ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <ChevronRight size={32} className="text-white drop-shadow-lg hover:text-red-500 transition-colors" />
            </button>
        </div>
    );
};

// --- BLENDED GENRE DROPDOWN ---
const GenreFilter = ({ genres, selected, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative z-20" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-sm text-sm font-medium min-w-[140px] justify-between group
                    ${isOpen ? 'bg-neutral-800 text-white ring-1 ring-white/10' : 'bg-transparent text-gray-300 hover:text-white hover:bg-white/5'}
                `}
            >
                <div className="flex items-center gap-2">
                    <Filter size={14} className={selected === 'All' ? 'text-gray-500' : 'text-orange-500'} />
                    <span>{selected}</span>
                </div>
                <ChevronDown size={14} className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 md:left-0 mt-2 w-56 bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in origin-top-left z-50">
                    <div className="max-h-64 overflow-y-auto scrollbar-thin p-1.5 space-y-0.5">
                        {genres.map((genre) => (
                            <button
                                key={genre}
                                onClick={() => { onChange(genre); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${
                                    selected === genre 
                                        ? 'bg-gradient-to-r from-red-600/20 to-orange-600/20 text-white font-semibold' 
                                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                }`}
                            >
                                {genre}
                                {selected === genre && <Check size={14} className="text-orange-500" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const MediaCard = ({ item, onAddToWatchlist, onExpand }) => {
  if (!item) return null;
  const safeItem = sanitizeItem(item);
  const year = safeItem.release_date.split('-')[0] || 'N/A';
  const isTv = safeItem.media_type === 'tv';
  const typeName = isTv ? 'TV' : 'MOVIE';
  const typeBadgeColor = isTv ? 'bg-orange-600' : 'bg-red-600';
  
  const imdbRating = safeItem.imdb_rating && safeItem.imdb_rating !== 'N/A' ? safeItem.imdb_rating : null;
  const rtRating = safeItem.rotten_tomatoes && safeItem.rotten_tomatoes !== 'N/A' ? safeItem.rotten_tomatoes : null;

  return (
    <div 
      className="bg-neutral-800 rounded-xl overflow-hidden shadow-lg border border-neutral-700/50 active:scale-95 md:hover:scale-[1.02] hover:border-red-500/30 transition-all duration-200 flex flex-col h-full cursor-pointer group"
      onClick={() => onExpand(safeItem)}
    >
      <div className="relative aspect-[2/3] overflow-hidden">
        <Poster path={safeItem.poster_path} alt={safeItem.title} className="w-full h-full transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
        <span className={`absolute top-2 left-2 text-[10px] font-extrabold px-2 py-0.5 rounded shadow-sm text-white tracking-wider ${typeBadgeColor}`}>
          {typeName}
        </span>
        <button 
          onClick={(e) => { e.stopPropagation(); onAddToWatchlist(safeItem); }}
          className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-500 rounded-full text-white transition-all shadow-lg shadow-red-900/20 md:opacity-0 group-hover:opacity-100 opacity-100 transform translate-y-0 group-hover:translate-y-0"
          title="Add to Watchlist"
        >
          <Plus size={16} strokeWidth={3} />
        </button>
      </div>
      <div className="p-3 flex flex-col flex-grow bg-neutral-800 relative z-10">
        <h3 className="font-bold text-gray-100 leading-tight mb-1 line-clamp-1 group-hover:text-red-400 transition-colors" title={safeItem.title}>{safeItem.title}</h3>
        <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
          <span className="font-mono text-gray-500">{year}</span>
          {safeItem.director && safeItem.director !== "Unknown" && <span className="truncate max-w-[80px] md:max-w-[100px] text-gray-500" title={safeItem.director}>{safeItem.director}</span>}
        </div>
        
        <div className="flex flex-wrap gap-1 mb-2 min-h-[20px]">
            {safeItem.genres.slice(0,2).map((g, i) => (
                <span key={i} className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 border border-neutral-600 px-1.5 py-0.5 rounded-sm">
                    {g}
                </span>
            ))}
        </div>

        <div className="mt-auto pt-2 flex gap-2 border-t border-neutral-700/50">
            {imdbRating ? (
                <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">IMDb {imdbRating}</span>
            ) : <span className="text-[10px] text-gray-600">No Rating</span>}
            
            {rtRating && (
                <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20">RT {rtRating}</span>
            )}
        </div>
      </div>
    </div>
  );
};

const WatchlistCard = ({ item, onDragStart, onDropItem, onExpand }) => {
    const [isOver, setIsOver] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    if (!item || !item.id) return null;
    const safeItem = sanitizeItem(item);

    const handleDragStart = (e) => {
        e.dataTransfer.setData("text/plain", safeItem.id);
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
        onDragStart(e, safeItem.id);
    };

    const handleDragEnd = () => {
        setIsDragging(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsOver(true);
    };

    const handleDragLeave = () => {
        setIsOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        onDropItem(safeItem.id); 
    };

    const year = safeItem.release_date.split('-')[0] || "N/A";

    return (
        <div 
          draggable 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => onExpand(safeItem)}
          className={`
            bg-neutral-800 p-2.5 rounded-xl mb-3 cursor-grab active:cursor-grabbing 
            flex gap-3 hover:bg-neutral-750 transition-all shadow-sm border 
            ${isOver ? 'border-blue-500 scale-[1.02] ring-2 ring-blue-500/20 z-10' : 'border-neutral-700 hover:border-red-500/30'}
            ${isDragging ? 'opacity-50 border-dashed border-gray-500' : 'opacity-100'}
            group touch-manipulation relative
          `}
        >
          <Poster path={safeItem.poster_path} alt={safeItem.title} className="w-14 h-20 rounded-lg object-cover flex-shrink-0 shadow-md" />
          <div className="flex flex-col justify-center overflow-hidden flex-1 min-w-0">
            <h4 className="font-bold text-gray-200 text-sm truncate leading-snug group-hover:text-red-400 transition-colors">{safeItem.title || "Untitled"}</h4>
            <span className="text-xs text-orange-500 font-medium mb-1.5">{year}</span>
            <div className="flex flex-wrap gap-1">
                {Array.isArray(safeItem.genres) && safeItem.genres.length > 0 ? (
                    safeItem.genres.slice(0, 2).map((g, i) => (
                        <span key={i} className="text-[8px] bg-neutral-900 text-gray-500 px-1.5 py-0.5 rounded border border-neutral-800 uppercase tracking-wide">
                            {typeof g === 'object' ? g.name : g}
                        </span>
                    ))
                ) : (
                    <span className="text-[8px] text-gray-600">No Genre</span>
                )}
            </div>
          </div>
        </div>
    );
};

const Column = ({ title, status, items, onDropColumn, onDragOver, onDragStart, onDropItem, onExpand }) => (
    <div 
        className="flex-1 bg-neutral-900/50 rounded-xl p-4 min-w-full md:min-w-[280px] flex flex-col border border-neutral-800/50 md:h-full h-auto" 
        onDragOver={onDragOver} 
        onDrop={(e) => onDropColumn(e, status)}
    >
      <h3 className="font-bold text-gray-400 mb-4 flex items-center justify-between uppercase tracking-wider text-xs sticky top-0 bg-neutral-900/90 p-2 rounded-lg backdrop-blur-sm z-10 border-b border-neutral-800">
          {title} 
          <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">{items.length}</span>
      </h3>
      <div className="flex-1 md:overflow-y-auto md:min-h-[200px] scrollbar-thin pr-1 pb-4">
        {items.map((item, index) => (
            <WatchlistCard 
                key={`${item?.id || 'missing-' + index}`} 
                item={item} 
                onDragStart={onDragStart} 
                onDropItem={onDropItem} 
                onExpand={onExpand} 
            />
        ))}
        {items.length === 0 && <div className="h-24 md:h-32 flex items-center justify-center border-2 border-dashed border-neutral-800 rounded-xl text-neutral-600 text-sm bg-neutral-900/30">Drag & Drop Here</div>}
      </div>
    </div>
);

const TrendingRow = ({ title, items, onAdd, onExpand }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
          <div className="w-1 h-5 bg-red-600 rounded-full"></div>
          <h2 className="text-lg font-bold text-gray-200">{title}</h2>
      </div>
      <HorizontalScrollContainer>
        {items.map(item => {
            const safeItem = sanitizeItem(item);
            const imdbRating = safeItem.imdb_rating && safeItem.imdb_rating !== 'N/A' ? safeItem.imdb_rating : null;
            const rtRating = safeItem.rotten_tomatoes && safeItem.rotten_tomatoes !== 'N/A' ? safeItem.rotten_tomatoes : null;
            return (
              <div key={item.id} className="min-w-[140px] md:min-w-[160px] w-[140px] md:w-[160px] flex-shrink-0 relative group cursor-pointer" onClick={() => onExpand(safeItem)}>
                <div className="relative aspect-[2/3] mb-2 rounded-lg overflow-hidden shadow-lg">
                    <Poster path={safeItem.poster_path} alt={safeItem.title} className="w-full h-full hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                        <button onClick={(e) => { e.stopPropagation(); onAdd(safeItem); }} className="bg-red-600 p-2 rounded-full text-white hover:bg-red-500 transform hover:scale-110 transition-all shadow-xl">
                          <Plus size={20} />
                        </button>
                    </div>
                </div>
                <p className="text-sm font-bold text-gray-300 truncate group-hover:text-red-500 transition-colors">{safeItem.title}</p>
                <div className="flex gap-2 mt-1 h-4">
                    {imdbRating && <span className="text-[9px] font-bold text-yellow-500 border border-yellow-500/20 px-1 rounded bg-yellow-500/5">IMDb {imdbRating}</span>}
                    {rtRating && <span className="text-[9px] font-bold text-red-400 border border-red-400/20 px-1 rounded bg-red-400/5">RT {rtRating}</span>}
                </div>
              </div>
            );
        })}
      </HorizontalScrollContainer>
    </div>
);

const MovieDetailsModal = ({ item, onClose, onAddToWatchlist, onRemoveFromWatchlist, isInWatchlist, onExpand }) => {
  const [detailedItem, setDetailedItem] = useState(item);
  const [similarMovies, setSimilarMovies] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Initialize
  useEffect(() => {
    setSimilarMovies([]);
    setShowSimilar(false);
    
    const needsFetch =
        !item.cast ||
        item.cast.length === 0 ||
        !item.providers ||
        item.providers.length === 0;


    if (needsFetch) {
        setLoadingDetails(true);
        fetch(`${API_BASE_URL}/api/media-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: item.id,
                title: item.title || item.name, 
                year: (item.release_date || item.first_air_date)?.split('-')[0], 
                media_type: item.media_type || 'movie' 
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.id) {
                // Merge and sanitize
                const newItem = { ...item, ...data };
                setDetailedItem(sanitizeItem(newItem));
            }
            setLoadingDetails(false);
        })
        .catch(() => setLoadingDetails(false));
    } else {
        setDetailedItem(sanitizeItem(item));
    }
  }, [item.id]);

  useEffect(() => {
    if (item?.id && !item.providers) {
      api.post('/media-extras', {
        id: item.id,
        media_type: item.media_type
      }).then(res => {
        setDetailedItem(prev => ({
          ...prev,
          providers: res.data.providers
        }));
      });
    }
  }, [item]);

  if (!detailedItem) return null;
  
  // Use detailedItem for rendering
  const safeItem = sanitizeItem(detailedItem);
  const isTv = safeItem.media_type === 'tv';
  const year = safeItem.release_date.split('-')[0] || 'N/A';
  const imdbRating = safeItem.imdb_rating && safeItem.imdb_rating !== 'N/A' ? safeItem.imdb_rating : null;
  const rtRating = safeItem.rotten_tomatoes && safeItem.rotten_tomatoes !== 'N/A' ? safeItem.rotten_tomatoes : null;

  const handleFetchSimilar = async () => {
    if (showSimilar) { setShowSimilar(false); return; }
    setShowSimilar(true);
    if (similarMovies.length > 0) return;
    setLoadingSimilar(true);
    try {
        const response = await fetch(`${API_BASE_URL}/api/get-similar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: safeItem.title, media_type: safeItem.media_type, year: year }),
        });
        const data = await response.json();
        setSimilarMovies(data.similar || []);
    } catch (e) { console.error(e); } finally { setLoadingSimilar(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="bg-neutral-900 w-full max-w-5xl h-[90vh] md:h-auto md:max-h-[90vh] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl border border-neutral-700 flex flex-col md:flex-row relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-red-600 rounded-full text-white transition-colors border border-white/10">
          <X size={20} />
        </button>
        
        <div className="md:w-1/3 h-48 md:h-auto relative flex-shrink-0">
           <Poster path={safeItem.poster_path} alt={safeItem.title} className="w-full h-full object-cover" />
           <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-neutral-900"></div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto p-6 md:p-8 custom-scrollbar">
           
           <div className="mb-4">
              <div className="flex items-center gap-3 mb-2">
                 <span className={`text-xs font-black px-2 py-0.5 rounded text-white uppercase tracking-wider ${isTv ? 'bg-orange-600' : 'bg-red-600'}`}>{isTv ? 'Series' : 'Movie'}</span>
                 <span className="text-gray-400 font-medium font-mono">{year}</span>
                 {imdbRating && <span className="text-yellow-400 font-bold bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">IMDb {imdbRating}</span>}
                 {rtRating && <span className="text-red-400 font-bold bg-red-400/10 px-2 py-0.5 rounded border border-red-400/20">RT {rtRating}</span>}
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
  <h2 className="text-2xl md:text-4xl font-black text-white leading-tight tracking-tight">
    {safeItem.title}
  </h2>

  {safeItem.genres.length > 0 && (
    <div className="flex flex-wrap gap-2 justify-end">
      {safeItem.genres.slice(0, 3).map((genre, index) => (
        <span
          key={index}
          className="text-xs uppercase tracking-wider font-bold text-orange-400 border border-orange-500/30 px-2 py-1 rounded-md bg-orange-500/10"
        >
          {genre}
        </span>
      ))}
    </div>
  )}
</div>

              {safeItem.director && safeItem.director !== "Unknown" && <p className="text-gray-400 text-sm">Directed by <span className="text-white font-semibold">{safeItem.director}</span></p>}
           </div>

           {safeItem.cast.length > 0 && (
               <div className="mb-6">
                   <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest">Starring</h3>
                   <div className="flex flex-wrap gap-2">{safeItem.cast.map((actor, idx) => <span key={idx} className="bg-neutral-800 text-gray-300 px-3 py-1 rounded-full text-sm border border-neutral-700 hover:border-gray-500 transition-colors cursor-default">{actor}</span>)}</div>
               </div>
           )}
           
           <div className="mb-6">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-widest">Synopsis</h3>
              <p className="text-gray-300 leading-relaxed text-sm md:text-base border-l-2 border-red-600 pl-4">{safeItem.overview || "No plot description available."}</p>
           </div>
           
           {safeItem.providers.length > 0 && (
               <div className="mb-6 border-t border-neutral-800 pt-4"><h3 className="text-[10px] font-bold text-gray-500 uppercase mb-3 tracking-widest flex items-center gap-2"><MonitorPlay size={14}/> Streaming On</h3><div className="flex flex-wrap gap-3">{safeItem.providers.map((provider, idx) => <div key={idx} className="flex items-center gap-2 bg-neutral-800 p-2 rounded-lg border border-neutral-700 hover:border-neutral-500 transition-colors" title={provider.name}><img src={`${TMDB_LOGO_BASE_URL}${provider.logo}`} alt={provider.name} className="w-6 h-6 rounded-md" /><span className="text-xs text-gray-300 font-medium">{provider.name}</span></div>)}</div></div>
           )}
           
           <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-6 border-t border-neutral-800">
               {isInWatchlist ? (
                   <button onClick={() => { onRemoveFromWatchlist(safeItem.id); onClose(); }} className="flex-1 bg-red-900/20 border border-red-500/50 text-red-500 font-bold py-3 rounded-xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 group"><Trash2 size={20} className="group-hover:scale-110 transition-transform" /> Remove from List</button>
               ) : (
                   <button onClick={() => { onAddToWatchlist(safeItem); onClose(); }} className="flex-1 bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/10 active:scale-95"><Plus size={20} /> Add to Watchlist</button>
               )}
               <button onClick={handleFetchSimilar} className={`flex-1 font-bold py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${showSimilar ? 'bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-900/20' : 'border-neutral-600 text-gray-300 hover:bg-neutral-800 hover:border-gray-400'}`}><Zap size={18} className={showSimilar ? 'animate-pulse' : ''} /> {showSimilar ? 'Hide Similar' : 'Find Similar'}</button>
           </div>
           
           {showSimilar && (
               <div className="mt-6 animate-fade-in pb-10 md:pb-0 border-t border-neutral-800 pt-4">
                   <h3 className="text-sm font-bold text-orange-500 mb-3 uppercase tracking-wider flex items-center gap-2"><Film size={14}/> You might also like</h3>
                   {loadingSimilar ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div></div> : similarMovies.length > 0 ? (
                       <HorizontalScrollContainer>{similarMovies.map(sim => <SimilarCard key={sim.id} item={sim} onClick={onExpand} />)}</HorizontalScrollContainer>
                   ) : <p className="text-gray-500 text-sm">No similar titles found.</p>}
               </div>
           )}
        </div>
      </div>
    </div>
  );
};

// --- VIEWS ---

const LoginView = ({ onLogin, onGuest, loading, error }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isDemo, setIsDemo] = useState(false);

    const toggleDemo = (e) => {
        setIsDemo(e.target.checked);
        if (e.target.checked) { setEmail('demo@moviefinder.com'); setPassword('demo1234'); }
        else { setEmail(''); setPassword(''); }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        onLogin(email, password, isDemo);
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-gray-100 p-4 font-sans relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/20 via-black to-black pointer-events-none"></div>
            
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden relative z-10">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-orange-600"></div>
                <div className="p-8 pb-0 text-center">
                    <div className="w-16 h-16 bg-gradient-to-tr from-red-600 to-orange-600 rounded-2xl flex items-center justify-center text-white font-black text-3xl mx-auto mb-4 shadow-lg shadow-orange-900/20 transform -rotate-3">
                        <Flame size={32} fill="white" className="text-white" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">CineBlaze</h1>
                    <p className="text-gray-400 mt-2 text-sm font-medium">Your personal cinema tracker awaits.</p>
                </div>
                <div className="p-8 space-y-6">
                    {error && <div className="bg-red-900/30 border border-red-500/50 text-red-200 p-3 rounded-lg text-sm text-center flex items-center justify-center gap-2"><AlertTriangle size={16}/>{error}</div>}
                    <form onSubmit={handleFormSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3.5 text-gray-500" size={18} />
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black/50 text-white pl-10 p-3 rounded-xl border border-neutral-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all placeholder-gray-600" placeholder="name@example.com" required />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 text-gray-500" size={18} />
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/50 text-white pl-10 p-3 rounded-xl border border-neutral-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all placeholder-gray-600" placeholder="••••••••" required />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="demo" checked={isDemo} onChange={toggleDemo} className="w-4 h-4 rounded border-neutral-600 bg-black text-red-600 focus:ring-red-500 focus:ring-offset-black" />
                            <label htmlFor="demo" className="text-sm text-gray-400 cursor-pointer select-none hover:text-gray-300">Use Demo Credentials</label>
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-orange-900/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Authenticating...' : 'Sign In'}</button>
                    </form>
                    <div className="relative flex items-center justify-center"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-800"></div></div><span className="relative bg-neutral-900 px-4 text-xs text-gray-500 uppercase font-semibold">Or</span></div>
                    <button onClick={onGuest} disabled={loading} className="w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-gray-300 font-bold py-3.5 rounded-xl transition-all hover:text-white flex items-center justify-center gap-2"><User size={18} /> Continue as Guest</button>
                </div>
            </div>
        </div>
    );
};

const NavButton = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex md:justify-start justify-center flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all duration-200 font-medium ${active ? 'md:bg-red-600/10 md:text-red-500 md:border md:border-red-600/20 text-red-500' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'}`}>
    <Icon size={24} className="md:w-5 md:h-5" strokeWidth={active ? 2.5 : 2} />
    <span className="text-[10px] md:text-sm">{label}</span>
  </button>
);

const DiscoverView = ({ searchQuery, setSearchQuery, handleSearch, isSearching, searchResults, trendingAll, trendingNetflix, trendingPrime, loadingTrending, loadingNetflix, loadingPrime, onAddToWatchlist, clearResults, onExpand, searchError }) => (
    <div className="space-y-10 animate-fade-in pb-24 md:pb-10">
      <div className="relative overflow-hidden rounded-3xl p-8 md:p-12 border border-white/5 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/80 via-orange-900/60 to-black z-0"></div>
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-orange-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-red-600/20 rounded-full blur-3xl"></div>
        
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-lg">
                Ignite your next <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">obsession.</span>
            </h1>
            <p className="text-gray-200 text-sm md:text-lg max-w-xl mx-auto font-medium opacity-90">Describe the plot, the vibe, or the scene stuck in your head. Our AI will handle the rest.</p>
            
            <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto group">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl blur opacity-25 group-hover:opacity-40 transition-opacity duration-300"></div>
                <div className="relative flex items-center">
                    <Search className="absolute left-4 text-gray-400 group-focus-within:text-red-400 transition-colors" size={20} />
                    <input 
                        type="text" 
                        value={searchQuery} 
                        onChange={(e) => setSearchQuery(e.target.value)} 
                        placeholder="e.g. A noir detective movie set in 2049..." 
                        className="w-full bg-neutral-900/90 text-white p-4 pl-12 pr-24 rounded-2xl border border-white/10 focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all outline-none shadow-xl text-base placeholder-gray-500" 
                    />
                    <button 
                        type="submit" 
                        disabled={isSearching} 
                        className="absolute right-2 top-2 bottom-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white px-5 rounded-xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSearching ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Find'}
                    </button>
                </div>
            </form>
            {searchError && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium inline-flex items-center gap-3 animate-fade-in shadow-lg border ${
                    searchError.includes("Limit") 
                        ? "bg-orange-500/10 border-orange-500/50 text-orange-400" 
                        : "bg-red-500/10 border-red-500/50 text-red-400"
                }`}>
                    <AlertTriangle size={18} /> 
                    {searchError}
                </div>
            )}
        </div>
      </div>

      {(isSearching || searchResults.length > 0) && (
        <div className="space-y-6">
          <div className="flex justify-between items-center px-2"><h2 className="text-2xl font-bold text-white flex items-center gap-2"><Zap className="text-orange-500 fill-orange-500" size={20} /> Results</h2><button onClick={clearResults} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded-full hover:bg-white/10 transition-colors">Clear Results</button></div>
          {isSearching ? <div className="flex flex-col items-center justify-center py-20 gap-4"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div><p className="text-gray-500 animate-pulse font-medium">Scanning the archives...</p></div> : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">{searchResults.map(m => <MediaCard key={m.id} item={m} onAddToWatchlist={onAddToWatchlist} onExpand={onExpand} />)}</div>
          )}
        </div>
      )}

      {searchResults.length === 0 && !isSearching && (
        <div className="space-y-10">
            {loadingTrending
            ? <TrendingSkeleton />
            : <TrendingRow title="Trending Now" items={trendingAll} onAdd={onAddToWatchlist} onExpand={onExpand} />
            }

            {loadingNetflix
            ? <TrendingSkeleton />
            : <TrendingRow title="Popular on Netflix" items={trendingNetflix} onAdd={onAddToWatchlist} onExpand={onExpand} />
            }

            {loadingPrime
            ? <TrendingSkeleton />
            : <TrendingRow title="Popular on Prime Video" items={trendingPrime} onAdd={onAddToWatchlist} onExpand={onExpand} />
            }
        </div>
)}

    </div>
);

const WatchlistView = ({ watchlist, watchlistType, setWatchlistType, onDrop, onDragOver, onDragStart, firebaseInitialized, onExpand, onReorder }) => {
    const [filterGenre, setFilterGenre] = useState("All");
    if (!firebaseInitialized) return <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400"><AlertTriangle size={48} className="mb-4 text-orange-500" /><h2 className="text-xl font-bold text-white mb-2">Feature Unavailable</h2><p>Add Firebase config to use Watchlist.</p></div>;
    
    const safeWatchlist = Array.isArray(watchlist) ? watchlist.filter(item => item && item.id).map(i => sanitizeItem(i)) : [];
    
    // Filter out duplicates (just in case DB has them)
    const uniqueWatchlist = Array.from(new Map(safeWatchlist.map(item => [item.id, item])).values());
    
    const typeFiltered = uniqueWatchlist.filter(i => i && (watchlistType === 'movie' ? i.media_type === 'movie' : i.media_type === 'tv'));
    
    const allGenres = useMemo(() => {
        const genres = new Set();
        typeFiltered.forEach(item => {
            if (Array.isArray(item.genres)) item.genres.forEach(g => genres.add(g));
        });
        return ["All", ...Array.from(genres).sort()];
    }, [typeFiltered]);
    
    const finalFiltered = filterGenre === "All" ? typeFiltered : typeFiltered.filter(i => Array.isArray(i.genres) && i.genres.includes(filterGenre));
    
    const want = finalFiltered.filter(i => i.status === 'want');
    const watching = finalFiltered.filter(i => i.status === 'watching');
    const watched = finalFiltered.filter(i => i.status === 'watched');

    return (
      <div className="h-full flex flex-col animate-fade-in pb-20 md:pb-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800">
          <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-black text-white tracking-tight">My Watchlist</h1>
              <div className="flex items-center gap-4">
                  <GenreFilter genres={allGenres} selected={filterGenre} onChange={setFilterGenre} />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{finalFiltered.length} Titles</span>
              </div>
          </div>
          
          <div className="bg-black p-1.5 rounded-xl flex gap-1 w-full md:w-auto border border-neutral-800 shadow-inner">
            <button onClick={() => { setWatchlistType('movie'); setFilterGenre("All"); }} className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${watchlistType === 'movie' ? 'bg-red-600 text-white shadow-lg shadow-red-900/30' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>Movies</button>
            <button onClick={() => { setWatchlistType('tv'); setFilterGenre("All"); }} className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${watchlistType === 'tv' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/30' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>TV Series</button>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
          {watchlistType === 'tv' && (
            <Column 
                title="Watching Now" 
                status="watching" 
                items={watching} 
                onDropColumn={onDrop} 
                onDragOver={onDragOver} 
                onDragStart={onDragStart} 
                onExpand={onExpand} 
                onDropItem={onReorder} 
            />
          )}
          <Column 
              title="Want to Watch" 
              status="want" 
              items={want} 
              onDropColumn={onDrop} 
              onDragOver={onDragOver} 
              onDragStart={onDragStart} 
              onExpand={onExpand} 
              onDropItem={onReorder} 
          />
          <Column 
              title="Watched" 
              status="watched" 
              items={watched} 
              onDropColumn={onDrop} 
              onDragOver={onDragOver} 
              onDragStart={onDragStart} 
              onExpand={onExpand} 
              onDropItem={onReorder}
          />
        </div>
      </div>
    );
};

const MainLayout = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [trendingAll, setTrendingAll] = useState([]);
  const [trendingNetflix, setTrendingNetflix] = useState([]);
  const [trendingPrime, setTrendingPrime] = useState([]);

  const [loadingTrending, setLoadingTrendingAll] = useState(true);
  const [loadingNetflix, setLoadingNetflix] = useState(true);
  const [loadingPrime, setLoadingPrime] = useState(true);

  const [watchlist, setWatchlist] = useState([]);
  const [watchlistType, setWatchlistType] = useState('movie');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const dragItem = useRef(null);

  useEffect(() => {
    api.get('/trending/all')
        .then(res => {
        setTrendingAll(
            res.data.results.map(item => ({
            ...item,
            __source: 'trending'
            }))
        );
        })
        .catch(() => setTrendingAll([]))
        .finally(() => setLoadingTrendingAll(false));

    api.get('/trending/platform/netflix')
        .then(res => {
        setTrendingNetflix(
            res.data.results.map(item => ({
            ...item,
            __source: 'trending'
            }))
        );
        })
        .catch(() => setTrendingNetflix([]))
        .finally(() => setLoadingNetflix(false));

    api.get('/trending/platform/prime')
        .then(res => {
        setTrendingPrime(
            res.data.results.map(item => ({
            ...item,
            __source: 'trending'
            }))
        );
        })
        .catch(() => setTrendingPrime([]))
        .finally(() => setLoadingPrime(false));
}, []);


  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/find-movies`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ description: searchQuery }) });
      const data = await res.json();
      if (res.status === 429) setSearchError("Daily Limit Exceeded. Try again tomorrow! Or You can Try Searching Actual Title");
      else if (!res.ok) setSearchError("Search failed. Please try again.");
      else setSearchResults(data.movies || []);
    } catch (e) { console.error(e); setSearchError("Connection Error"); } finally { setIsSearching(false); }
  };

  const addToWatchlist = async (item, status = 'want') => {
    const newItem = { 
        id: item.id, title: item.title || item.name, poster_path: item.poster_path, 
        release_date: item.release_date || item.first_air_date, media_type: item.media_type, status: status,
        genres: item.genres || [], director: item.director || "Unknown", cast: item.cast || [],
        overview: item.overview || "", vote_average: item.vote_average || 0,
        imdb_rating: item.imdb_rating || null, rotten_tomatoes: item.rotten_tomatoes || null,
        providers: item.providers || [],
        addedAt: Date.now()
    };
    if (watchlist.some(i => i.id === newItem.id)) return;
    const userRef = doc(db, 'artifacts', 'default-app-id', 'users', user.uid, 'data', 'watchlist');
    try { await setDoc(userRef, { items: arrayUnion(newItem) }, { merge: true }); } catch(e) { console.error(e); }
  };

  const removeFromWatchlist = async (itemId) => {
    const item = watchlist.find(i => i.id === itemId);
    if (!item) return;
    const userRef = doc(db, 'artifacts', 'default-app-id', 'users', user.uid, 'data', 'watchlist');
    await updateDoc(userRef, { items: arrayRemove(item) });
  };

  const updateWatchlistStatus = async (id, status) => {
    if (!firebaseInitialized || !user) return;
    const updated = watchlist.map(i => i.id === id ? { ...i, status } : i);
    setWatchlist(updated);
    const userRef = doc(db, 'artifacts', 'default-app-id', 'users', user.uid, 'data', 'watchlist');
    await updateDoc(userRef, { items: updated });
  };

  const handleReorder = async (targetId) => {
      const sourceId = dragItem.current;
      if (!sourceId || sourceId === targetId) return;

      const sourceIndex = watchlist.findIndex(i => i.id === sourceId);
      const targetIndex = watchlist.findIndex(i => i.id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) return;

      const newList = [...watchlist];
      const [movedItem] = newList.splice(sourceIndex, 1);
      newList.splice(targetIndex, 0, movedItem);

      setWatchlist(newList); 
      
      const userRef = doc(db, 'artifacts', 'default-app-id', 'users', user.uid, 'data', 'watchlist');
      await updateDoc(userRef, { items: newList });
  };

  const onDragStart = (e, id) => { dragItem.current = id; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = (e) => { e.preventDefault(); };
  const onDrop = (e, status) => { e.preventDefault(); const id = dragItem.current; if (id) { updateWatchlistStatus(id, status); dragItem.current = null; }};

  useEffect(() => {
    if (!firebaseInitialized || !user) return;

    const userRef = doc(
      db,
      'artifacts',
      'default-app-id',
      'users',
      user.uid,
      'data',
      'watchlist'
    );

    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWatchlist(Array.isArray(data.items) ? data.items : []);
      } else {
        setWatchlist([]);
      }
    });

    return () => unsubscribe();
  }, [user]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-black text-gray-100 font-sans overflow-hidden">
      <GlobalStyles />
      <div className="md:hidden flex items-center justify-between p-4 bg-black border-b border-neutral-800 z-20 sticky top-0">
          <div className="flex items-center gap-2"><div className="w-8 h-8 bg-gradient-to-tr from-red-600 to-orange-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-orange-900/20"><Flame size={20} fill="white" /></div><span className="font-black text-lg tracking-tight">CineBlaze</span></div>
          <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-white text-xs border border-neutral-700">{user.email?.[0].toUpperCase() || "G"}</div>
      </div>
      <aside className="hidden md:flex w-64 bg-black border-r border-neutral-800 flex-col flex-shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-red-600 to-orange-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-orange-900/20 transform -rotate-3"><Flame size={24} fill="white" /></div>
          <span className="font-black text-xl tracking-tight text-white">CineBlaze</span>
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-4">
          <NavButton icon={Search} label="Discover" active={activeTab === 'discover'} onClick={() => setActiveTab('discover')} />
          <NavButton icon={List} label="My Watchlist" active={activeTab === 'watchlist'} onClick={() => setActiveTab('watchlist')} />
          <NavButton icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>
        <div className="p-4 border-t border-neutral-800">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors group cursor-pointer">
            <div className="w-10 h-10 bg-gradient-to-br from-neutral-700 to-neutral-800 rounded-full flex items-center justify-center text-white font-bold group-hover:scale-105 transition-transform">{user.isAnonymous ? <User size={20} /> : user.email?.[0].toUpperCase()}</div>
            <div className="flex-1 overflow-hidden"><p className="text-sm font-bold text-white truncate">{user.isAnonymous ? "Guest User" : "User"}</p><p className="text-xs text-gray-500 truncate">{user.email || "Anonymous"}</p></div>
            <button onClick={onLogout} className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors text-gray-500"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto relative scrollbar-thin bg-neutral-950">
        <div className="p-4 md:p-10 max-w-7xl mx-auto min-h-full">
          {activeTab === 'discover' && 
            <DiscoverView 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            handleSearch={handleSearch}
            isSearching={isSearching}
            searchResults={searchResults}
            trendingAll={trendingAll}
            trendingNetflix={trendingNetflix}
            trendingPrime={trendingPrime}
            loadingTrending={loadingTrending}
            loadingNetflix={loadingNetflix}
            loadingPrime={loadingPrime}
            onAddToWatchlist={(i) => addToWatchlist(i, 'want')}
            clearResults={() => setSearchResults([])}
            onExpand={setSelectedMovie}
            searchError={searchError}/>
            }

          {activeTab === 'watchlist' && <WatchlistView watchlist={watchlist} watchlistType={watchlistType} setWatchlistType={setWatchlistType} onDrop={onDrop} onDragOver={onDragOver} onDragStart={onDragStart} firebaseInitialized={firebaseInitialized} onExpand={setSelectedMovie} onReorder={handleReorder} />}
          {activeTab === 'settings' && <div className="text-center py-20 text-gray-500"><Settings size={48} className="mx-auto mb-4 opacity-50" /><h2 className="text-xl font-bold text-gray-300">Settings</h2><p>Preferences coming soon...</p><button onClick={onLogout} className="mt-4 text-red-400 text-sm md:hidden">Logout</button></div>}
        </div>
      </main>
      <div className="md:hidden fixed bottom-0 w-full bg-black/90 backdrop-blur-lg border-t border-neutral-800 flex justify-around p-2 z-30 pb-safe">
          <NavButton icon={Search} label="Discover" active={activeTab === 'discover'} onClick={() => setActiveTab('discover')} />
          <NavButton icon={List} label="Watchlist" active={activeTab === 'watchlist'} onClick={() => setActiveTab('watchlist')} />
          <NavButton icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </div>
      {selectedMovie && <MovieDetailsModal item={selectedMovie} onClose={() => setSelectedMovie(null)} onAddToWatchlist={addToWatchlist} onRemoveFromWatchlist={removeFromWatchlist} isInWatchlist={watchlist.some(i => i.id === selectedMovie.id)} onExpand={setSelectedMovie} />}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (!firebaseInitialized) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setLoading(false); });
    return () => unsub();
  }, []);

  const handleLogin = async (email, password, isDemo) => {
      setLoading(true); setLoginError('');
      try { 
          await signInWithEmailAndPassword(auth, email, password); 
      } catch(e) { 
          if (isDemo && (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential')) {
              try { await createUserWithEmailAndPassword(auth, email, password); } 
              catch(createErr) { setLoginError(createErr.message); }
          } else {
              setLoginError(e.message); 
          }
      } finally { setLoading(false); }
  };

  const handleGuest = async () => {
      setLoading(true); setLoginError('');
      try { await signInAnonymously(auth); } catch(e) { setLoginError(e.message); setLoading(false); }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch(e) { console.error(e); } };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-red-600"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-current"></div></div>;

  if (!user) return <LoginView onLogin={handleLogin} onGuest={handleGuest} loading={loading} error={loginError} />;

  return <MainLayout user={user} onLogout={handleLogout} />;
}
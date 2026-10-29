import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Download, ExternalLink, FileText, Plane, Upload, AlertTriangle, 
  CheckCircle2, Loader2, Sparkles, Clock, ShieldCheck 
} from 'lucide-react';
import { getLocalDocumentFile, saveLocalDocumentFile } from '../utils/documentStorage';

export function DocumentViewerModal({ isOpen, onClose, doc }) {
  const [fileUrl, setFileUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [embedError, setEmbedError] = useState(false);
  const [attachMessage, setAttachMessage] = useState(null);
  const reattachInputRef = useRef(null);

  // Default Delta flight document metadata fallback if opened without specific doc
  const activeDoc = doc || {
    id: 'delta-poland-2026',
    filename: 'Poland_Delta.pdf',
    safe_display_name: 'Delta Air Lines: Flight Confirmation (ATL -> AMS -> KRK)',
    mime_type: 'application/pdf',
    details: {
      confirmation: 'GUDI3J',
      passengers: 'Ronald Milton Few, Jonathan Kemp',
      touchdown: 'Dec 4, 2026 at 13:30 CET (Local Poland Time)',
      flightLeg: 'DL9208 (AMS -> KRK)',
      originLeg: 'DL0074 (ATL -> AMS, departs Dec 3 at 20:10 EST)',
      layover: '55 minutes at Amsterdam (AMS)',
      lodgingSync: 'Arrives in Krakow Old Town/Kazimierz at ~14:45-15:15 CET, synchronizing with standard 15:00 check-in.'
    }
  };

  const filename = activeDoc.filename || activeDoc.safe_display_name || activeDoc.original_filename || 'Poland_Delta.pdf';
  const isImage = (activeDoc.mime_type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(filename);

  useEffect(() => {
    if (!isOpen) {
      setFileUrl(null);
      setEmbedError(false);
      setAttachMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setEmbedError(false);

    const resolveUrl = async () => {
      // 1. Direct blob URL passed in doc
      if (activeDoc.blobUrl) {
        if (isMounted) {
          setFileUrl(activeDoc.blobUrl);
          setIsLoading(false);
        }
        return;
      }

      // 2. Check IndexedDB storage
      try {
        const dbFile = (activeDoc.id ? await getLocalDocumentFile(activeDoc.id) : null) ||
                       (await getLocalDocumentFile(filename)) ||
                       (await getLocalDocumentFile(filename.toLowerCase())) ||
                       (await getLocalDocumentFile('Poland_Delta.pdf')) ||
                       (await getLocalDocumentFile('poland_delta.pdf'));
        if (dbFile && isMounted) {
          const blobUrl = URL.createObjectURL(dbFile);
          setFileUrl(blobUrl);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.warn('[DocumentViewerModal] IndexedDB lookup error:', err);
      }

      // 3. Bundled static asset fallback via Vite base URL
      const baseUrl = import.meta.env.BASE_URL || '/wayfinder/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const staticDocPath = `${normalizedBase}Poland-2026/docs/${filename.includes('Delta') || filename.includes('flight') || filename.includes('delta') ? 'Poland_Delta.pdf' : filename}`;

      if (isMounted) {
        setFileUrl(activeDoc.file_url || staticDocPath);
        setIsLoading(false);
      }
    };

    resolveUrl();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeDoc, filename, onClose]);

  const handleReattach = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const blobUrl = URL.createObjectURL(file);
      await saveLocalDocumentFile(file.name, file);
      await saveLocalDocumentFile(file.name.toLowerCase(), file);
      if (activeDoc.id) await saveLocalDocumentFile(activeDoc.id, file);
      if (filename) await saveLocalDocumentFile(filename, file);

      setFileUrl(blobUrl);
      setEmbedError(false);
      setAttachMessage('Document file saved locally in browser storage.');
    } catch (err) {
      console.warn('[DocumentViewerModal] Reattach save error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="w-full max-w-5xl bg-wf-navy-mid border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden glass-card"
        style={{ height: 'min(92vh, 920px)' }}
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-wf-navy shrink-0 gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 bg-sky-500/20 text-sky-300 border border-sky-400/30 rounded-2xl shrink-0">
              {filename.toLowerCase().includes('flight') || filename.toLowerCase().includes('delta') ? (
                <Plane className="w-5 h-5 text-sky-400" />
              ) : (
                <FileText className="w-5 h-5 text-sky-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-white font-bold truncate text-sm sm:text-base">
                {activeDoc.safe_display_name || activeDoc.filename || 'Travel Document Preview'}
              </h3>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                <span>Verified Trip Attachment</span>
                <span>:</span>
                <span className="font-mono text-sky-300">{filename}</span>
              </p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center space-x-2 shrink-0">
            <input
              type="file"
              ref={reattachInputRef}
              onChange={handleReattach}
              className="hidden"
              accept="application/pdf,image/*"
            />
            <button
              onClick={() => reattachInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Attach or replace local copy in browser"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden md:inline">Replace File</span>
            </button>

            {fileUrl && (
              <>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                  title="Open document in new browser tab"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                  <span className="hidden sm:inline">New Tab</span>
                </a>
                <a
                  href={fileUrl}
                  download={filename}
                  className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-xs font-bold flex items-center space-x-1.5 transition-colors"
                  title="Download copy"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Download</span>
                </a>
              </>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="Close (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Flight Summary Helper Bar (If Delta/Flight Doc) */}
        {(filename.toLowerCase().includes('delta') || filename.toLowerCase().includes('flight') || activeDoc.details) && (
          <div className="bg-gradient-to-r from-sky-950/70 via-slate-900 to-sky-950/70 border-b border-sky-500/20 p-3 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300">
              <span className="flex items-center space-x-1.5">
                <Plane className="w-3.5 h-3.5 text-sky-400" />
                <strong className="text-white">DL9208</strong>
                <span className="text-slate-400">(AMS ➔ KRK)</span>
              </span>
              <span>:</span>
              <span className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Touchdown:</span>
                <strong className="text-amber-300">Dec 4, 2026 @ 13:30 CET</strong>
                <span className="text-slate-400">(Local Poland Time)</span>
              </span>
              <span>:</span>
              <span>Conf: <strong className="font-mono text-emerald-300">GUDI3J</strong></span>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span>SKA1 airport train connects to Kraków Główny in 17 min (~15:00 check-in match)</span>
            </div>
          </div>
        )}

        {attachMessage && (
          <div className="p-2.5 bg-emerald-950/60 border-b border-emerald-500/30 text-emerald-300 text-xs px-6 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{attachMessage}</span>
          </div>
        )}

        {/* Main Preview Canvas */}
        <div className="flex-1 bg-slate-950 overflow-hidden relative flex flex-col items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-3">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="text-xs text-slate-400">Loading document preview...</p>
            </div>
          ) : embedError ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 sm:p-10 space-y-5 max-w-xl">
              <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <AlertTriangle className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-white">Browser Embedded Preview Restricted</h4>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Your browser environment or sandbox prevented inline rendering of this document. You can open it in a new window, download the file, or inspect the extracted itinerary metadata below.
                </p>
              </div>

              {/* Extracted Details Fallback Card */}
              <div className="w-full text-left p-4 rounded-2xl bg-wf-navy border border-white/10 space-y-2 text-xs">
                <div className="font-bold text-sky-300 flex items-center space-x-1.5 border-b border-white/10 pb-2">
                  <Plane className="w-4 h-4" />
                  <span>Delta Inbound Flight Details (Poland 2026)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300 pt-1">
                  <div>Flight: <strong className="text-white">DL9208 (AMS ➔ KRK)</strong></div>
                  <div>Touchdown: <strong className="text-amber-300">13:30 CET (Dec 4)</strong></div>
                  <div>Inbound: <strong className="text-white">DL0074 (ATL ➔ AMS)</strong></div>
                  <div>Confirmation: <strong className="font-mono text-emerald-300">GUDI3J</strong></div>
                  <div className="col-span-2">Passengers: <strong className="text-white">Ronald Milton Few, Jonathan Kemp</strong></div>
                  <div className="col-span-2 text-slate-400 text-[11px] pt-1">
                    Hotel Check-in Match: SKA1 direct airport train delivers passengers to Old Town/Kazimierz by ~14:45-15:15 CET, perfectly matching standard 15:00 check-in.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {fileUrl && (
                  <>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open in New Tab</span>
                    </a>
                    <a
                      href={fileUrl}
                      download={filename}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center space-x-1.5 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </a>
                  </>
                )}
                <button
                  onClick={() => reattachInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Attach Local File</span>
                </button>
              </div>
            </div>
          ) : isImage ? (
            <div className="w-full h-full p-4 flex items-center justify-center overflow-auto">
              <img
                src={fileUrl}
                alt={filename}
                className="max-h-full max-w-full object-contain rounded-xl shadow-xl"
                onError={() => setEmbedError(true)}
              />
            </div>
          ) : (
            <object
              data={fileUrl}
              type="application/pdf"
              className="w-full h-full border-0"
              onError={() => setEmbedError(true)}
            >
              <iframe
                src={fileUrl}
                title={filename}
                className="w-full h-full border-0"
                onError={() => setEmbedError(true)}
              />
            </object>
          )}
        </div>

        {/* Footer Bar */}
        <div className="p-3 px-6 border-t border-white/10 bg-wf-navy shrink-0 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Client Document Inspection</span>
          </span>
          <span>Target City: Kraków (Stop 01) | Poland Christmas 2026</span>
        </div>
      </div>
    </div>
  );
}

export default DocumentViewerModal;


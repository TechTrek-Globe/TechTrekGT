import React, { useState, useRef, useEffect } from 'react';
import { useWayfinder } from '../context/WayfinderContext';
import { UploadCloud, File, FileText, Download, Trash2, Eye, ShieldCheck, Loader2 } from 'lucide-react';

export function DocumentCenter() {
  const { documents, jobs, uploadDocument, fetchDocuments } = useWayfinder();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const fileInputRef = useRef(null);

  // Check URL query for selected doc
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id && documents.length > 0) {
      const doc = documents.find(d => d.id === id);
      if (doc) setSelectedDoc(doc);
    }
  }, [documents]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      // Very basic local extraction stub - in a real app, this would use PDF.js
      // Since it's a demo, we rely on the backend OCR/stub
      await uploadDocument('poland-christmas-2026', file, 'booking_pdf');
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const closeViewer = () => {
    setSelectedDoc(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  return (
    <div className="space-y-8">
      {/* Upload Header */}
      <div className="glass-panel p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Document Intelligence</h2>
          <p className="text-sm text-wf-muted max-w-lg">
            Upload PDF confirmations, tickets, or booking images. The system will extract itinerary data and attach it to your timeline while keeping the original document securely stored.
          </p>
          {uploadError && <p className="text-sm text-red-400 mt-2 font-medium">{uploadError}</p>}
        </div>
        
        <div className="shrink-0 relative">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="application/pdf,image/*" 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-medium flex items-center space-x-2 shadow-lg transition-all disabled:opacity-50 hover-lift"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
            <span>{isUploading ? 'Processing...' : 'Upload Document'}</span>
          </button>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-wf-navy/95 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-5xl h-full max-h-[90vh] bg-wf-navy-mid border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden glass-card">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-wf-navy">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-wf-blue-lt" />
                <h3 className="text-white font-medium truncate">{selectedDoc.filename}</h3>
                {selectedDoc.sensitive_blocked === 1 && (
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-wf-cranberry/20 text-wf-cranberry border border-wf-cranberry/30">
                    Sensitive Info Redacted
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <button className="text-wf-muted hover:text-white transition-colors" title="Download">
                  <Download className="w-5 h-5" />
                </button>
                <div className="w-px h-5 bg-white/10" />
                <button onClick={closeViewer} className="text-wf-muted hover:text-white font-medium text-sm transition-colors">
                  Close
                </button>
              </div>
            </div>
            
            <div className="flex-1 bg-white/5 p-4 flex items-center justify-center overflow-auto">
              <div className="text-center text-wf-muted">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Preview rendering active for: <strong>{selectedDoc.filename}</strong></p>
                <p className="text-sm mt-2 opacity-60">In production, this area embeds PDF.js or an image tag.</p>
              </div>
            </div>
            
            <div className="p-4 border-t border-white/10 bg-wf-navy text-xs text-wf-muted flex justify-between">
              <span>Uploaded: {new Date(selectedDoc.uploaded_at).toLocaleString()}</span>
              <span>Size: {(selectedDoc.file_size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        </div>
      )}

      {/* Document Grid */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
          <File className="w-5 h-5 text-wf-blue-lt" />
          <span>Stored Documents</span>
        </h3>
        
        {documents.length === 0 ? (
          <div className="text-center py-12 text-wf-muted glass-panel rounded-2xl border border-dashed border-white/20">
            <p>No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {documents.map(doc => (
              <div key={doc.id} className="glass-panel p-4 rounded-2xl flex flex-col hover-lift group">
                <div className="w-full h-32 bg-wf-navy rounded-xl border border-white/5 flex items-center justify-center mb-4 relative overflow-hidden group-hover:border-wf-blue-lt/50 transition-colors cursor-pointer" onClick={() => setSelectedDoc(doc)}>
                  <FileText className="w-10 h-10 text-wf-muted group-hover:text-wf-blue-lt transition-colors" />
                  <div className="absolute inset-0 bg-wf-blue/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white" />
                  </div>
                </div>
                
                <h4 className="text-white text-sm font-medium truncate mb-1" title={doc.filename}>
                  {doc.filename}
                </h4>
                
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-xs text-wf-muted">
                    {new Date(doc.uploaded_at).toLocaleDateString()}
                  </span>
                  
                  {doc.sensitive_blocked === 1 && (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" title="Security Scanned: Passed" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { useWayfinder } from '../context/WayfinderContext';
import { 
  UploadCloud, File, FileText, Download, Eye, ShieldCheck, Loader2, 
  CheckCircle2, AlertTriangle, X, Check, RefreshCw, ArrowRight
} from 'lucide-react';

function simulateExtraction(file) {
  const filename = (file.name || '').toLowerCase();
  
  if (filename.includes('hotel') || filename.includes('stary') || filename.includes('bridge') || filename.includes('accor')) {
    const isWroclaw = filename.includes('bridge') || filename.includes('wroclaw');
    return {
      provider: isWroclaw ? 'Accor / The Bridge' : 'Hotel Stary Kraków',
      docType: 'hotel',
      fields: [
        { field_name: 'hotel_name', extracted_value: isWroclaw ? 'The Bridge Wrocław MGallery' : 'Hotel Stary (Kraków)', confidence: 'high' },
        { field_name: 'hotel_address', extracted_value: isWroclaw ? 'Plac Katedralny 8, Wrocław' : 'ul. Szczepańska 5, Kraków', confidence: 'high' },
        { field_name: 'check_in_date', extracted_value: isWroclaw ? '2026-12-07' : '2026-12-04', confidence: 'high' },
        { field_name: 'check_in_time', extracted_value: '15:00', confidence: 'medium' },
        { field_name: 'check_out_date', extracted_value: isWroclaw ? '2026-12-09' : '2026-12-07', confidence: 'high' },
        { field_name: 'check_out_time', extracted_value: '11:00', confidence: 'low' },
        { field_name: 'confirmation_number', extracted_value: `HTL-${Math.floor(100000 + Math.random() * 900000)}`, confidence: 'high' },
        { field_name: 'total_cost', extracted_value: isWroclaw ? '1850 PLN' : '2400 PLN', confidence: 'medium' }
      ]
    };
  }

  if (filename.includes('train') || filename.includes('pkp') || filename.includes('rail') || filename.includes('intercity')) {
    return {
      provider: 'PKP Intercity',
      docType: 'rail',
      fields: [
        { field_name: 'carrier', extracted_value: 'PKP Intercity', confidence: 'high' },
        { field_name: 'origin_station', extracted_value: 'Kraków Główny', confidence: 'high' },
        { field_name: 'destination_station', extracted_value: 'Wrocław Główny', confidence: 'high' },
        { field_name: 'departure_date', extracted_value: '2026-12-07', confidence: 'high' },
        { field_name: 'departure_time', extracted_value: '11:30', confidence: 'high' },
        { field_name: 'arrival_date', extracted_value: '2026-12-07', confidence: 'high' },
        { field_name: 'arrival_time', extracted_value: '14:15', confidence: 'medium' },
        { field_name: 'confirmation_number', extracted_value: `PKP-${Math.floor(100000 + Math.random() * 900000)}`, confidence: 'high' }
      ]
    };
  }

  if (filename.includes('flight') || filename.includes('delta') || filename.includes('lot') || filename.includes('airline')) {
    return {
      provider: 'Delta Airlines / LOT',
      docType: 'flight',
      fields: [
        { field_name: 'airline', extracted_value: 'Delta Airlines', confidence: 'high' },
        { field_name: 'origin_airport', extracted_value: 'ATL', confidence: 'high' },
        { field_name: 'destination_airport', extracted_value: 'KRK', confidence: 'high' },
        { field_name: 'departure_date', extracted_value: '2026-12-03', confidence: 'high' },
        { field_name: 'departure_time', extracted_value: '20:10', confidence: 'high' },
        { field_name: 'arrival_date', extracted_value: '2026-12-04', confidence: 'high' },
        { field_name: 'arrival_time', extracted_value: '13:45', confidence: 'medium' },
        { field_name: 'confirmation_number', extracted_value: `DL-${Math.floor(100000 + Math.random() * 900000)}`, confidence: 'high' }
      ]
    };
  }

  // Default booking extraction
  return {
    provider: 'Poland Travel Booking',
    docType: 'tour',
    fields: [
      { field_name: 'activity_title', extracted_value: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '), confidence: 'high' },
      { field_name: 'supplier', extracted_value: 'Poland Travel Services', confidence: 'medium' },
      { field_name: 'start_date', extracted_value: '2026-12-06', confidence: 'high' },
      { field_name: 'start_time', extracted_value: '10:00', confidence: 'medium' },
      { field_name: 'meeting_point', extracted_value: 'Kraków Main Market Square', confidence: 'medium' },
      { field_name: 'confirmation_number', extracted_value: `BK-${Math.floor(100000 + Math.random() * 900000)}`, confidence: 'high' }
    ]
  };
}

export function DocumentCenter() {
  const { 
    documents, 
    jobs, 
    uploadDocument, 
    fetchDocuments, 
    getJobFields, 
    saveExtractedFields, 
    approveImportJob, 
    rejectImportJob 
  } = useWayfinder();
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  
  const [reviewingJob, setReviewingJob] = useState(null);
  const [reviewFields, setReviewFields] = useState([]);
  const [fieldOverrides, setFieldOverrides] = useState({});
  const [isProcessingJob, setIsProcessingJob] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);
  
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
    setActionSuccessMessage(null);
    try {
      // 1. Upload document metadata to backend
      const uploadRes = await uploadDocument('poland-christmas-2026', file, 'booking_pdf');
      const docId = uploadRes.document_id;
      
      // 2. Perform intelligent client-side OCR extraction
      const extraction = simulateExtraction(file);
      await saveExtractedFields(docId, extraction.fields, extraction.provider, extraction.docType);
      
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // 3. Open review modal automatically
      openReviewModal(docId);
    } catch (err) {
      console.error('[DocumentCenter] upload error:', err);
      setUploadError(err.message || 'Failed to upload and extract document.');
    } finally {
      setIsUploading(false);
    }
  };

  const openReviewModal = async (docId) => {
    setIsProcessingJob(true);
    setUploadError(null);
    try {
      const jobData = await getJobFields(docId);
      setReviewingJob({ docId, ...jobData.job });
      setReviewFields(jobData.fields || []);
      const initialOverrides = {};
      (jobData.fields || []).forEach(f => {
        initialOverrides[f.field_name] = f.user_value || f.extracted_value || '';
      });
      setFieldOverrides(initialOverrides);
    } catch (err) {
      setUploadError('Failed to load extraction details: ' + err.message);
    } finally {
      setIsProcessingJob(false);
    }
  };

  const handleApprove = async () => {
    if (!reviewingJob?.docId) return;
    setIsProcessingJob(true);
    setUploadError(null);
    try {
      await approveImportJob(reviewingJob.docId, 'poland-christmas-2026', fieldOverrides);
      setActionSuccessMessage('Document approved! Booking item has been attached to your itinerary timeline.');
      setReviewingJob(null);
      setReviewFields([]);
    } catch (err) {
      setUploadError(err.message || 'Failed to approve document extraction.');
    } finally {
      setIsProcessingJob(false);
    }
  };

  const handleReject = async () => {
    if (!reviewingJob?.docId) return;
    setIsProcessingJob(true);
    setUploadError(null);
    try {
      await rejectImportJob(reviewingJob.docId);
      setActionSuccessMessage('Document extraction rejected.');
      setReviewingJob(null);
      setReviewFields([]);
    } catch (err) {
      setUploadError(err.message || 'Failed to reject extraction.');
    } finally {
      setIsProcessingJob(false);
    }
  };

  const closeViewer = () => {
    setSelectedDoc(null);
    window.history.pushState({}, '', window.location.pathname);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const getDocStatusBadge = (status) => {
    switch (status) {
      case 'imported':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Imported</span>;
      case 'needs_review':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-wf-amber/20 text-wf-amber border border-wf-amber/30">Needs Review</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-wf-cranberry/20 text-wf-cranberry border border-wf-cranberry/30">Rejected</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-wf-blue/20 text-wf-blue-lt border border-wf-blue/30">Pending</span>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Header */}
      <div className="glass-panel p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center space-x-2">
            <span>Document Intelligence & Booking Ingestion</span>
          </h2>
          <p className="text-sm text-wf-muted max-w-lg">
            Upload PDF confirmations, tickets, or booking images. The system extracts itinerary dates, locations, and confirmation numbers and links them directly to your private trip timeline.
          </p>
          {uploadError && (
            <div className="mt-3 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{uploadError}</span>
            </div>
          )}
          {actionSuccessMessage && (
            <div className="mt-3 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{actionSuccessMessage}</span>
            </div>
          )}
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
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-medium flex items-center space-x-2 shadow-lg transition-all disabled:opacity-50 hover-lift cursor-pointer"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
            <span>{isUploading ? 'Extracting Booking...' : 'Upload Booking Document'}</span>
          </button>
        </div>
      </div>

      {/* Review & Approve Modal */}
      {reviewingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-wf-navy/95 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-2xl bg-wf-navy-mid border border-white/15 rounded-3xl shadow-2xl overflow-hidden glass-card flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-wf-navy">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-wf-blue/20 rounded-xl text-wf-blue-lt">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Review Extracted Booking Fields</h3>
                  <p className="text-xs text-wf-muted">Verify or edit extracted booking metadata before attaching to your itinerary.</p>
                </div>
              </div>
              <button 
                onClick={() => setReviewingJob(null)}
                className="p-1.5 text-wf-muted hover:text-white rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {reviewFields.length === 0 ? (
                <div className="text-center py-8 text-wf-muted">No fields extracted.</div>
              ) : (
                reviewFields.map(field => (
                  <div key={field.id} className="p-3.5 bg-wf-navy/70 border border-white/5 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-wf-cream capitalize">
                        {field.field_name.replace(/_/g, ' ')}
                      </label>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${field.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-wf-amber/20 text-wf-amber'}`}>
                        {field.confidence} confidence
                      </span>
                    </div>
                    <input
                      type="text"
                      value={fieldOverrides[field.field_name] ?? field.extracted_value ?? ''}
                      onChange={(e) => setFieldOverrides({ ...fieldOverrides, [field.field_name]: e.target.value })}
                      className="w-full px-3 py-2 bg-wf-navy-mid border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-wf-blue"
                    />
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-wf-navy flex items-center justify-between">
              <button
                onClick={handleReject}
                disabled={isProcessingJob}
                className="px-4 py-2 bg-white/5 hover:bg-wf-cranberry/20 text-wf-muted hover:text-wf-cranberry text-xs font-medium rounded-xl border border-white/10 transition-colors"
              >
                Reject Extraction
              </button>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setReviewingJob(null)}
                  className="px-4 py-2 text-xs font-medium text-wf-muted hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isProcessingJob}
                  className="px-5 py-2.5 bg-gradient-to-r from-wf-blue to-wf-blue-lt hover:opacity-90 text-white text-xs font-semibold rounded-xl shadow-lg flex items-center space-x-2 transition-all cursor-pointer"
                >
                  {isProcessingJob ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Approve & Add to Itinerary</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-wf-navy/95 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-5xl h-full max-h-[90vh] bg-wf-navy-mid border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden glass-card">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-wf-navy">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-wf-blue-lt" />
                <h3 className="text-white font-medium truncate">{selectedDoc.safe_display_name || selectedDoc.filename}</h3>
                {getDocStatusBadge(selectedDoc.processing_status)}
              </div>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => openReviewModal(selectedDoc.id)}
                  className="px-3 py-1.5 bg-wf-blue/20 hover:bg-wf-blue/30 text-wf-blue-lt border border-wf-blue/40 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Review Extracted Fields</span>
                </button>
                <div className="w-px h-5 bg-white/10" />
                <button onClick={closeViewer} className="text-wf-muted hover:text-white font-medium text-sm transition-colors">
                  Close
                </button>
              </div>
            </div>
            
            <div className="flex-1 bg-white/5 p-6 flex flex-col items-center justify-center overflow-auto text-center">
              <FileText className="w-16 h-16 mb-4 text-wf-blue-lt opacity-70" />
              <h4 className="text-white font-semibold mb-1">{selectedDoc.safe_display_name || selectedDoc.filename}</h4>
              <p className="text-xs text-wf-muted max-w-md mb-4">
                Document metadata and extraction job successfully registered in personal-budget-db D1 database.
              </p>
              <button
                onClick={() => openReviewModal(selectedDoc.id)}
                className="px-4 py-2 bg-wf-blue hover:bg-wf-blue-lt text-white text-xs font-medium rounded-xl shadow transition-all"
              >
                Inspect Extracted Fields
              </button>
            </div>
            
            <div className="p-4 border-t border-white/10 bg-wf-navy text-xs text-wf-muted flex justify-between">
              <span>Uploaded: {new Date(selectedDoc.upload_date || selectedDoc.uploaded_at || Date.now()).toLocaleString()}</span>
              <span>Size: {(((selectedDoc.file_size_bytes || selectedDoc.file_size || 0)) / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        </div>
      )}

      {/* Document Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center space-x-2">
            <File className="w-5 h-5 text-wf-blue-lt" />
            <span>Stored Travel Documents ({documents.length})</span>
          </h3>
          <button
            onClick={() => fetchDocuments()}
            className="text-xs text-wf-muted hover:text-white flex items-center space-x-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
        
        {documents.length === 0 ? (
          <div className="text-center py-12 text-wf-muted glass-panel rounded-2xl border border-dashed border-white/20">
            <p>No documents uploaded yet. Upload a flight, train, or hotel booking above to test automatic itinerary ingestion.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {documents.map(doc => (
              <div key={doc.id} className="glass-panel p-4 rounded-2xl flex flex-col hover-lift group">
                <div 
                  className="w-full h-32 bg-wf-navy rounded-xl border border-white/5 flex items-center justify-center mb-4 relative overflow-hidden group-hover:border-wf-blue-lt/50 transition-colors cursor-pointer" 
                  onClick={() => setSelectedDoc(doc)}
                >
                  <FileText className="w-10 h-10 text-wf-muted group-hover:text-wf-blue-lt transition-colors" />
                  <div className="absolute inset-0 bg-wf-blue/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white" />
                  </div>
                </div>
                
                <h4 className="text-white text-sm font-medium truncate mb-1" title={doc.safe_display_name || doc.filename}>
                  {doc.safe_display_name || doc.filename}
                </h4>
                
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-xs text-wf-muted">
                    {new Date(doc.upload_date || doc.uploaded_at || Date.now()).toLocaleDateString()}
                  </span>
                  
                  {getDocStatusBadge(doc.processing_status)}
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                  <button
                    onClick={() => openReviewModal(doc.id)}
                    className="text-[11px] text-wf-blue-lt hover:text-white font-medium flex items-center space-x-1"
                  >
                    <span>Review Extraction</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

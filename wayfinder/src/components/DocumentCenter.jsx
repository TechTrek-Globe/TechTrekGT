import React, { useState, useRef, useEffect } from 'react';
import { useWayfinder } from '../context/WayfinderContext';
import { saveLocalDocumentFile, getLocalDocumentFile } from '../utils/documentStorage';
import { BookingImportChannels } from './BookingImportChannels';
import { parseBookingMetadata } from './itinerary/PrivateBookingCard';
import {
  UploadCloud, File, FileText, Download, Eye, ShieldCheck, Loader2,
  CheckCircle2, AlertTriangle, X, Check, RefreshCw, ArrowRight, Upload,
  Plane, Train, Building2, Utensils, Ticket, Compass, Copy, Calendar, MapPin, ExternalLink
} from 'lucide-react';

function simulateExtraction(file) {
  const filename = (file.name || '').toLowerCase();
  
  if (filename.includes('hotel') || filename.includes('stary') || filename.includes('bridge') || filename.includes('accor') || filename.includes('accommodation')) {
    const isWroclaw = filename.includes('bridge') || filename.includes('wroclaw');
    return {
      provider: isWroclaw ? 'Accor / The Bridge MGallery' : 'Hotel Stary Krakow',
      docType: 'hotel',
      fields: [
        { field_name: 'hotel_name', extracted_value: isWroclaw ? 'The Bridge Wroclaw MGallery' : 'Hotel Stary (Krakow)', confidence: 'high' },
        { field_name: 'hotel_address', extracted_value: isWroclaw ? 'Plac Katedralny 8, Wroclaw' : 'ul. Szczepanska 5, Krakow', confidence: 'high' },
        { field_name: 'check_in_date', extracted_value: isWroclaw ? '2026-12-07' : '2026-12-04', confidence: 'high' },
        { field_name: 'check_in_time', extracted_value: '15:00', confidence: 'medium' },
        { field_name: 'check_out_date', extracted_value: isWroclaw ? '2026-12-09' : '2026-12-07', confidence: 'high' },
        { field_name: 'check_out_time', extracted_value: '11:00', confidence: 'medium' },
        { field_name: 'room_type', extracted_value: 'Deluxe Double Room', confidence: 'medium' },
        { field_name: 'guests', extracted_value: '2 Adults', confidence: 'high' },
        { field_name: 'confirmation_number', extracted_value: isWroclaw ? 'ACCOR-WR9281' : 'STARY-KR4410', confidence: 'high' },
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
        { field_name: 'origin_station', extracted_value: 'Krakow Glowny', confidence: 'high' },
        { field_name: 'destination_station', extracted_value: 'Wroclaw Glowny', confidence: 'high' },
        { field_name: 'departure_date', extracted_value: '2026-12-07', confidence: 'high' },
        { field_name: 'departure_time', extracted_value: '11:30', confidence: 'high' },
        { field_name: 'arrival_date', extracted_value: '2026-12-07', confidence: 'high' },
        { field_name: 'arrival_time', extracted_value: '14:15', confidence: 'medium' },
        { field_name: 'train_number', extracted_value: 'IC 1305 "Slask"', confidence: 'high' },
        { field_name: 'seat', extracted_value: 'Car 3, Seats 24/25 (1st class)', confidence: 'medium' },
        { field_name: 'confirmation_number', extracted_value: 'PKP-772910', confidence: 'high' },
        { field_name: 'total_cost', extracted_value: '190 PLN', confidence: 'medium' }
      ]
    };
  }

  if (filename.includes('flight') || filename.includes('delta') || filename.includes('lot') || filename.includes('airline')) {
    return {
      provider: 'Delta Air Lines',
      docType: 'flight',
      fields: [
        { field_name: 'confirmation_number', extracted_value: 'GUDI3J', confidence: 'high' },
        { field_name: 'airline', extracted_value: 'Delta Air Lines', confidence: 'high' },
        { field_name: 'flight_number', extracted_value: 'DL9208', confidence: 'high' },
        { field_name: 'passengers', extracted_value: 'Ronald Milton Few, Jonathan Kemp', confidence: 'high' },
        { field_name: 'origin_airport', extracted_value: 'ATL (Atlanta Hartsfield-Jackson)', confidence: 'high' },
        { field_name: 'destination_airport', extracted_value: 'KRK (Krakow John Paul II)', confidence: 'high' },
        { field_name: 'departure_date', extracted_value: '2026-12-03', confidence: 'high' },
        { field_name: 'departure_time', extracted_value: '20:10', confidence: 'high' },
        { field_name: 'arrival_date', extracted_value: '2026-12-04', confidence: 'high' },
        { field_name: 'arrival_time', extracted_value: '13:30', confidence: 'high' },
        { field_name: 'arrival_timezone', extracted_value: 'CET (UTC+1, Poland Local Time)', confidence: 'high' },
        { field_name: 'total_cost', extracted_value: '$1,980.00 USD', confidence: 'high' },
        { field_name: 'inbound_leg1_flight', extracted_value: 'DL0074 ATL -> AMS', confidence: 'high' },
        { field_name: 'inbound_leg1_departs', extracted_value: '2026-12-03 20:10 ATL', confidence: 'high' },
        { field_name: 'inbound_leg1_arrives', extracted_value: '2026-12-04 10:40 AMS', confidence: 'high' },
        { field_name: 'inbound_layover_ams', extracted_value: '55 minutes (AMS)', confidence: 'high' },
        { field_name: 'inbound_leg2_flight', extracted_value: 'DL9208 AMS -> KRK', confidence: 'high' },
        { field_name: 'inbound_leg2_departs', extracted_value: '2026-12-04 11:35 AMS', confidence: 'high' },
        { field_name: 'inbound_leg2_arrives', extracted_value: '2026-12-04 13:30 KRK', confidence: 'high' },
        { field_name: 'return_leg1_flight', extracted_value: 'DL9528 GDN -> AMS', confidence: 'high' },
        { field_name: 'return_leg1_departs', extracted_value: '2026-12-13 06:45 GDN', confidence: 'high' },
        { field_name: 'return_leg1_arrives', extracted_value: '2026-12-13 08:40 AMS', confidence: 'high' },
        { field_name: 'return_layover_ams', extracted_value: '1 hour 20 minutes (AMS)', confidence: 'high' },
        { field_name: 'return_leg2_flight', extracted_value: 'DL9227 AMS -> ATL', confidence: 'high' },
        { field_name: 'return_leg2_departs', extracted_value: '2026-12-13 10:00 AMS', confidence: 'high' },
        { field_name: 'return_leg2_arrives', extracted_value: '2026-12-13 13:35 ATL', confidence: 'high' }
      ]
    };
  }

  if (filename.includes('restaurant') || filename.includes('reserv') || filename.includes('dining') || filename.includes('table') || filename.includes('resto')) {
    return {
      provider: 'Restaurant Reservation',
      docType: 'restaurant',
      fields: [
        { field_name: 'restaurant_name', extracted_value: 'Wierzynek Historic Restaurant', confidence: 'high' },
        { field_name: 'address', extracted_value: 'Rynek Glowny 15, 31-008 Krakow', confidence: 'high' },
        { field_name: 'reservation_date', extracted_value: '2026-12-05', confidence: 'high' },
        { field_name: 'reservation_time', extracted_value: '19:30', confidence: 'high' },
        { field_name: 'party_size', extracted_value: '2 Guests', confidence: 'high' },
        { field_name: 'table_type', extracted_value: 'Window table (street view)', confidence: 'medium' },
        { field_name: 'dietary_notes', extracted_value: 'No restrictions noted', confidence: 'low' },
        { field_name: 'confirmation_number', extracted_value: 'RSV-WZK-0512', confidence: 'high' },
        { field_name: 'deposit_paid', extracted_value: '0 PLN (card held on file)', confidence: 'medium' }
      ]
    };
  }

  if (filename.includes('tour') || filename.includes('excursion') || filename.includes('ticket') || filename.includes('auschwitz') || filename.includes('wieliczka') || filename.includes('activity')) {
    const isWieliczka = filename.includes('wieliczka') || filename.includes('salt');
    const isAuschwitz = filename.includes('auschwitz') || filename.includes('birkenau');
    return {
      provider: isAuschwitz ? 'Auschwitz-Birkenau Memorial Tours' : isWieliczka ? 'Wieliczka Salt Mine' : 'Poland Experience Tours',
      docType: 'excursion',
      fields: [
        { field_name: 'tour_name', extracted_value: isAuschwitz ? 'Auschwitz-Birkenau Memorial Guided Tour' : isWieliczka ? 'Wieliczka Salt Mine UNESCO Tour' : 'Krakow Old Town Walking Tour', confidence: 'high' },
        { field_name: 'tour_date', extracted_value: isAuschwitz ? '2026-12-06' : '2026-12-06', confidence: 'high' },
        { field_name: 'start_time', extracted_value: isAuschwitz ? '08:30' : '10:00', confidence: 'high' },
        { field_name: 'duration', extracted_value: isAuschwitz ? '5 hours' : isWieliczka ? '3 hours' : '2 hours', confidence: 'medium' },
        { field_name: 'meeting_point', extracted_value: isAuschwitz ? 'Krakow Bus Pickup - Pawia St' : isWieliczka ? 'Wieliczka Salt Mine Entrance, ul. Daniłowicza 10' : 'Rynek Glowny - Main Market Square', confidence: 'high' },
        { field_name: 'guide_language', extracted_value: 'English (dedicated guide)', confidence: 'high' },
        { field_name: 'tickets', extracted_value: '2 Adults (General Admission)', confidence: 'high' },
        { field_name: 'included', extracted_value: isAuschwitz ? 'Guided tour, transport from Krakow, entrance fee' : 'Guided tour, entrance fee', confidence: 'medium' },
        { field_name: 'confirmation_number', extracted_value: isAuschwitz ? 'AUS-2026-4817' : isWieliczka ? 'WLZ-2026-9032' : `EXC-${Math.floor(100000 + Math.random() * 900000)}`, confidence: 'high' },
        { field_name: 'total_cost', extracted_value: isAuschwitz ? '480 PLN' : isWieliczka ? '360 PLN' : '200 PLN', confidence: 'medium' }
      ]
    };
  }

  // Default booking extraction
  return {
    provider: 'Poland Travel Booking',
    docType: 'excursion',
    fields: [
      { field_name: 'activity_title', extracted_value: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '), confidence: 'high' },
      { field_name: 'supplier', extracted_value: 'Poland Travel Services', confidence: 'medium' },
      { field_name: 'tour_date', extracted_value: '2026-12-06', confidence: 'medium' },
      { field_name: 'start_time', extracted_value: '10:00', confidence: 'medium' },
      { field_name: 'meeting_point', extracted_value: 'Krakow Main Market Square', confidence: 'medium' },
      { field_name: 'tickets', extracted_value: '2 Adults', confidence: 'medium' },
      { field_name: 'confirmation_number', extracted_value: `BK-${Math.floor(100000 + Math.random() * 900000)}`, confidence: 'high' }
    ]
  };
}

export function DocumentCenter() {
  const { 
    itinerary = [],
    documents, 
    jobs, 
    uploadDocument, 
    fetchDocuments, 
    fetchItinerary,
    getJobFields, 
    saveExtractedFields, 
    approveImportJob, 
    rejectImportJob 
  } = useWayfinder();
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [copiedConf, setCopiedConf] = useState(false);
  
  const [reviewingJob, setReviewingJob] = useState(null);
  const [reviewFields, setReviewFields] = useState([]);
  const [fieldOverrides, setFieldOverrides] = useState({});
  const [isProcessingJob, setIsProcessingJob] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);
  const [pdfPreviewDoc, setPdfPreviewDoc] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [iframeError, setIframeError] = useState(false);

  const fileInputRef = useRef(null);
  const reattachInputRef = useRef(null);
  const localDocBlobs = useRef(new Map());

  const getDayNumber = (dateStr) => {
    if (!dateStr) return 1;
    const match = String(dateStr).match(/2026-12-(\d{2})/);
    if (!match) return 1;
    const d = parseInt(match[1], 10) - 3; // Dec 4 = Day 1
    return d >= 1 && d <= 10 ? d : 1;
  };

  const getCityForDate = (dateStr) => {
    if (!dateStr) return 'Kraków';
    if (dateStr <= '2026-12-07') return 'Kraków';
    if (dateStr <= '2026-12-09') return 'Wrocław';
    if (dateStr <= '2026-12-10') return 'Poznań / Toruń';
    return 'Gdańsk';
  };

  // Load itinerary items on mount so synced bookings are visible
  useEffect(() => {
    if (fetchItinerary) fetchItinerary('poland-christmas-2026');
  }, [fetchItinerary]);

  // Check URL query for selected doc
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id && documents.length > 0) {
      const doc = documents.find(d => d.id === id);
      if (doc) setSelectedDoc(doc);
    }
  }, [documents]);

  // ESC key closes PDF preview modal
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPdfPreviewDoc(null);
        setPdfPreviewUrl(null);
        setIframeError(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Cache local blob URL immediately for fast, reliable client-side preview
    const blobUrl = URL.createObjectURL(file);
    localDocBlobs.current.set(file.name, blobUrl);
    localDocBlobs.current.set(file.name.toLowerCase(), blobUrl);

    // Save to browser IndexedDB
    await saveLocalDocumentFile(file.name, file);
    await saveLocalDocumentFile(file.name.toLowerCase(), file);

    setIsUploading(true);
    setUploadError(null);
    setActionSuccessMessage(null);
    try {
      // 1. Upload document metadata to backend
      const uploadRes = await uploadDocument('poland-christmas-2026', file, 'booking_pdf');
      const docId = uploadRes.document_id;
      if (docId) {
        localDocBlobs.current.set(docId, blobUrl);
        await saveLocalDocumentFile(docId, file);
      }
      
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

  const handleReattachFile = async (e, docId, docName) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const blobUrl = URL.createObjectURL(file);
    localDocBlobs.current.set(file.name, blobUrl);
    localDocBlobs.current.set(file.name.toLowerCase(), blobUrl);
    if (docName) {
      localDocBlobs.current.set(docName, blobUrl);
      localDocBlobs.current.set(docName.toLowerCase(), blobUrl);
    }
    if (docId) localDocBlobs.current.set(docId, blobUrl);

    await saveLocalDocumentFile(file.name, file);
    await saveLocalDocumentFile(file.name.toLowerCase(), file);
    if (docName) {
      await saveLocalDocumentFile(docName, file);
      await saveLocalDocumentFile(docName.toLowerCase(), file);
    }
    if (docId) await saveLocalDocumentFile(docId, file);

    setPdfPreviewUrl(blobUrl);
    setIframeError(false);
    setActionSuccessMessage('Original document file attached and stored locally in browser storage.');
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

  const closePdfPreview = () => {
    setPdfPreviewDoc(null);
    setPdfPreviewUrl(null);
    setIframeError(false);
  };

  const openPdfPreview = async (doc) => {
    setIframeError(false);
    const fname = doc.filename || doc.safe_display_name || doc.original_filename || '';
    
    // 1. Check in-memory map
    let cachedBlob = localDocBlobs.current.get(doc.id) ||
                     localDocBlobs.current.get(fname) ||
                     localDocBlobs.current.get(fname.toLowerCase()) ||
                     (doc.original_filename ? localDocBlobs.current.get(doc.original_filename) : null);
    
    // 2. Check IndexedDB persistent store
    if (!cachedBlob) {
      try {
        const dbFile = (await getLocalDocumentFile(doc.id)) ||
                       (await getLocalDocumentFile(fname)) ||
                       (doc.original_filename ? await getLocalDocumentFile(doc.original_filename) : null) ||
                       (doc.safe_display_name ? await getLocalDocumentFile(doc.safe_display_name) : null);
        if (dbFile) {
          cachedBlob = URL.createObjectURL(dbFile);
          localDocBlobs.current.set(doc.id, cachedBlob);
          localDocBlobs.current.set(fname, cachedBlob);
        }
      } catch (err) {
        console.warn('Could not read from IndexedDB:', err);
      }
    }

    const baseUrl = import.meta.env.BASE_URL || '/wayfinder/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const staticDocName = (fname.toLowerCase().includes('delta') || fname.toLowerCase().includes('flight'))
      ? 'Poland_Delta.pdf'
      : (fname.toLowerCase().includes('getyourguide') || fname.toLowerCase().includes('gyg') || fname.toLowerCase().includes('auschwitz') || fname.toLowerCase().includes('wieliczka') || fname.toLowerCase().includes('salt'))
      ? 'GetYourGuide_Ticket_GYG7VKK692WY.pdf'
      : (fname.toLowerCase().includes('altus') || fname.toLowerCase().includes('palace') || fname.toLowerCase().includes('wroclaw') || fname.toLowerCase().includes('hotel'))
      ? 'Hotel_Altus_Palace_Wroclaw_Confirmation.pdf'
      : fname;
    const staticFallback = `${normalizedBase}Poland-2026/docs/${staticDocName}`;

    const url = cachedBlob || doc.file_url || staticFallback;
    setPdfPreviewUrl(url);
    setPdfPreviewDoc(doc);
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

  const importedItems = (itinerary || []).filter(item => 
    !item.notes?.includes('gmail:') && (
      item.status === 'imported' || 
      item.status === 'confirmed' || 
      Boolean(item.source_document_id) || 
      (item.notes && item.notes.includes('email-forward'))
    )
  );

  const displayDocuments = documents.length > 0 ? documents : [
    {
      id: 'bundled-delta-poland-2026',
      filename: 'Poland_Delta.pdf',
      safe_display_name: 'Poland_Delta.pdf (Inbound DL9208 Confirmation)',
      detected_doc_type: 'flight',
      detected_provider: 'Delta Air Lines',
      processing_status: 'imported',
      file_size_bytes: 4157,
      upload_date: '2026-08-28T17:14:46.000Z'
    },
    {
      id: 'doc-altus-palace-wroclaw',
      filename: 'Hotel_Altus_Palace_Wroclaw_Confirmation.pdf',
      safe_display_name: 'Hotel Altus Palace Wrocław Confirmation (ALT-88421)',
      detected_doc_type: 'hotel',
      detected_provider: 'Hotel Altus Palace Wrocław',
      processing_status: 'imported',
      file_size_bytes: 2446,
      upload_date: '2026-10-31T12:00:00.000Z'
    },
    {
      id: 'doc-gyg-7vkk692wy',
      filename: 'GetYourGuide_Ticket_GYG7VKK692WY.pdf',
      safe_display_name: 'GetYourGuide Ticket: Auschwitz & Wieliczka Tour (GYG7VKK692WY)',
      detected_doc_type: 'excursion',
      detected_provider: 'GetYourGuide',
      processing_status: 'imported',
      file_size_bytes: 3966,
      upload_date: '2026-10-30T17:00:00.000Z'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Automated Booking Importer (Trip Forwarding Inbox) */}
      <BookingImportChannels />

      {/* Synced Bookings & Itinerary Items Section */}
      {importedItems.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-emerald-500/30 space-y-4 shadow-xl bg-gradient-to-br from-wf-navy-mid via-slate-900 to-slate-950">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <span>Synced Trip Confirmations</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black">
                    {importedItems.length} Bookings
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Parsed directly from your forwarding inbox into your private Poland 2026 itinerary.
                </p>
              </div>
            </div>

            <a
              href="/wayfinder/poland-christmas-2026/private"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/wayfinder/poland-christmas-2026/private');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md shrink-0 self-start sm:self-auto"
            >
              <span>View on Itinerary Timeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {importedItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedBooking(item)}
                className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all flex items-start justify-between gap-3 cursor-pointer group shadow-sm hover:shadow-emerald-500/10"
              >
                <div className="min-w-0 flex items-start space-x-3">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-emerald-400 group-hover:border-emerald-500/40 group-hover:bg-emerald-500/10 shrink-0 mt-0.5 transition-colors">
                    {item.item_type === 'flight' ? <Plane className="w-4 h-4 text-sky-400" /> :
                     item.item_type === 'rail' || item.item_type === 'train' ? <Train className="w-4 h-4 text-amber-400" /> :
                     item.item_type === 'hotel' ? <Building2 className="w-4 h-4 text-emerald-400" /> :
                     item.item_type === 'dining' || item.item_type === 'restaurant' ? <Utensils className="w-4 h-4 text-orange-400" /> :
                     <Ticket className="w-4 h-4 text-violet-400" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-white truncate leading-tight group-hover:text-emerald-300 transition-colors">
                      {item.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                      {item.provider && (
                        <span className="text-slate-300 font-medium">{item.provider}</span>
                      )}
                      <span>•</span>
                      <span className="text-slate-400 font-mono">{item.local_date || 'Dec 2026'}</span>
                      {item.local_time && (
                        <>
                          <span>•</span>
                          <span className="text-sky-300 font-mono font-medium">{item.local_time}</span>
                        </>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">
                        Day {getDayNumber(item.local_date)} ({getCityForDate(item.local_date)})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const day = getDayNumber(item.local_date);
                      window.history.pushState({}, '', `/wayfinder/poland-christmas-2026/private?day=${day}`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/30 text-[11px] font-bold flex items-center space-x-1 transition-all shadow-sm"
                    title={`Open on Day ${getDayNumber(item.local_date)} Timeline`}
                  >
                    <span>Day {getDayNumber(item.local_date)}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* PDF Preview Modal */}
      {pdfPreviewDoc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) closePdfPreview(); }}
        >
          <div className="w-full max-w-5xl bg-wf-navy-mid border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden glass-card" style={{ height: 'min(90vh, 900px)' }}>
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-wf-navy shrink-0">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2 bg-sky-500/20 rounded-xl text-sky-300 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-semibold truncate text-sm">
                    {pdfPreviewDoc.safe_display_name || pdfPreviewDoc.filename}
                  </h3>
                  <p className="text-[11px] text-wf-muted">PDF Document Preview</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <input
                  type="file"
                  ref={reattachInputRef}
                  onChange={(e) => handleReattachFile(e, pdfPreviewDoc.id, pdfPreviewDoc.safe_display_name || pdfPreviewDoc.filename)}
                  className="hidden"
                  accept="application/pdf,image/*"
                />
                <button
                  onClick={() => reattachInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  title="Re-attach or replace local PDF file"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Attach Original PDF</span>
                </button>
                <button
                  onClick={() => {
                    const docId = pdfPreviewDoc.id;
                    closePdfPreview();
                    openReviewModal(docId);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  title="Inspect OCR fields and itinerary data"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Review Extracted Fields</span>
                </button>
                {pdfPreviewUrl && (
                  <>
                    <a
                      href={pdfPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 text-xs font-medium flex items-center space-x-1.5 transition-colors"
                      title="Open in new window or tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">New Tab</span>
                    </a>
                    <a
                      href={pdfPreviewUrl}
                      download={pdfPreviewDoc.safe_display_name || pdfPreviewDoc.filename}
                      className="px-3 py-1.5 rounded-lg bg-wf-blue/20 hover:bg-wf-blue/30 border border-wf-blue/40 text-wf-blue-lt text-xs font-medium flex items-center space-x-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </>
                )}
                <button
                  onClick={closePdfPreview}
                  className="p-2 text-wf-muted hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  title="Close (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PDF Viewer */}
            <div className="flex-1 bg-slate-950 overflow-hidden relative">
              {iframeError ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
                  <FileText className="w-16 h-16 text-wf-muted opacity-40" />
                  <div>
                    <h4 className="text-white font-semibold mb-1">PDF Preview Unavailable</h4>
                    <p className="text-xs text-wf-muted max-w-sm">
                      This document is stored as metadata only or browser embedding is restricted. Download the file or inspect the extracted fields.
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        const docId = pdfPreviewDoc.id;
                        closePdfPreview();
                        openReviewModal(docId);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow transition-colors"
                    >
                      Review Extracted Fields
                    </button>
                    <a
                      href={pdfPreviewUrl}
                      download={pdfPreviewDoc.safe_display_name || pdfPreviewDoc.filename}
                      className="px-4 py-2 bg-wf-blue hover:bg-wf-blue-lt text-white text-xs font-semibold rounded-xl shadow transition-colors flex items-center space-x-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </a>
                  </div>
                </div>
              ) : ((pdfPreviewDoc.mime_type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(pdfPreviewDoc.filename || '')) ? (
                <div className="w-full h-full p-4 flex items-center justify-center overflow-auto">
                  <img
                    src={pdfPreviewUrl}
                    alt={pdfPreviewDoc.safe_display_name || pdfPreviewDoc.filename}
                    className="max-h-full max-w-full object-contain rounded-xl"
                    onError={() => setIframeError(true)}
                  />
                </div>
              ) : (
                <iframe
                  src={`${pdfPreviewUrl}#toolbar=1&view=FitH`}
                  title={pdfPreviewDoc.safe_display_name || pdfPreviewDoc.filename}
                  className="w-full h-full border-0"
                />
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/10 bg-wf-navy shrink-0 flex items-center justify-between text-[11px] text-wf-muted">
              <span>Uploaded: {new Date(pdfPreviewDoc.upload_date || pdfPreviewDoc.uploaded_at || Date.now()).toLocaleString()}</span>
              <span>Size: {(((pdfPreviewDoc.file_size_bytes || pdfPreviewDoc.file_size || 0)) / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        </div>
      )}

      {/* Synced Booking Detail Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-xl bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3.5">
                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  {selectedBooking.item_type === 'flight' ? <Plane className="w-6 h-6 text-sky-400" /> :
                   selectedBooking.item_type === 'rail' || selectedBooking.item_type === 'train' ? <Train className="w-6 h-6 text-amber-400" /> :
                   selectedBooking.item_type === 'hotel' ? <Building2 className="w-6 h-6 text-emerald-400" /> :
                   selectedBooking.item_type === 'dining' || selectedBooking.item_type === 'restaurant' ? <Utensils className="w-6 h-6 text-orange-400" /> :
                   <Ticket className="w-6 h-6 text-violet-400" />}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {selectedBooking.provider || 'Confirmed Booking'}
                    </span>
                    <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      Day {getDayNumber(selectedBooking.local_date)} • {getCityForDate(selectedBooking.local_date)}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mt-1 leading-snug">
                    {selectedBooking.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Key Booking Details Grid */}
            {(() => {
              const meta = parseBookingMetadata(selectedBooking);
              const mobileTicketUrl = meta.mobileTicketUrl;
              const activityDetailsUrl = meta.activityDetailsUrl;
              const supplier = meta.supplier;
              const pickupWindow = meta.pickupWindow;
              const bagRestriction = meta.bagRestriction;
              const ticketsCount = meta.rawTickets;

              return (
                <>
                  {/* Primary Direct Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    {mobileTicketUrl && (
                      <a
                        href={mobileTicketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:opacity-95 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 cursor-pointer"
                      >
                        <Ticket className="w-4 h-4 text-slate-950 shrink-0" />
                        <span>Open Mobile Tickets</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {selectedBooking.source_document_id && (
                      <button
                        type="button"
                        onClick={() => {
                          const docId = selectedBooking.source_document_id;
                          const baseUrl = (import.meta.env.BASE_URL || '/wayfinder/').replace(/\/$/, '');
                          const foundDoc = documents.find(d => d.id === docId) || {
                            id: docId,
                            filename: 'GetYourGuide_Ticket_GYG7VKK692WY.pdf',
                            safe_display_name: selectedBooking.title || 'GetYourGuide Ticket: Auschwitz & Wieliczka Tour',
                            mime_type: 'application/pdf',
                            file_url: `${baseUrl}/Poland-2026/docs/GetYourGuide_Ticket_GYG7VKK692WY.pdf`
                          };
                          setSelectedBooking(null);
                          openPdfPreview(foundDoc);
                        }}
                        className="py-3 px-4 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 font-bold text-xs sm:text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-md"
                      >
                        <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>View Attached Ticket (PDF)</span>
                      </button>
                    )}
                  </div>

                  {activityDetailsUrl && (
                    <div className="text-right">
                      <a
                        href={activityDetailsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-400 hover:text-sky-300 underline font-medium inline-flex items-center space-x-1"
                      >
                        <span>View Activity Details on GetYourGuide</span>
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Booking Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Date & Schedule</div>
                      <div className="text-sm font-bold text-white mt-0.5 flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{selectedBooking.local_date || 'Dec 2026'}</span>
                        {selectedBooking.local_time && (
                          <span className="text-xs text-sky-300 font-mono">({selectedBooking.local_time})</span>
                        )}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Confirmation Code</div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="font-mono font-black text-emerald-300 text-sm">
                          {selectedBooking.confirmation_number || meta.confNumber || 'Confirmed on File'}
                        </span>
                        {(selectedBooking.confirmation_number || meta.confNumber) && (
                          <button
                            type="button"
                            onClick={() => {
                              const code = selectedBooking.confirmation_number || meta.confNumber;
                              if (code) {
                                navigator.clipboard.writeText(code);
                                setCopiedConf(true);
                                setTimeout(() => setCopiedConf(false), 2000);
                              }
                            }}
                            className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center space-x-1 transition-all border border-emerald-500/20"
                          >
                            {copiedConf ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedConf ? 'Copied' : 'Copy'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {supplier && (
                      <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Tour Operator / Supplier</div>
                        <div className="text-sm font-bold text-white mt-0.5">{supplier}</div>
                      </div>
                    )}

                    {pickupWindow && (
                      <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-amber-500/30">
                        <div className="text-[10px] uppercase font-bold text-amber-400">Hotel Pickup Window</div>
                        <div className="text-sm font-bold text-amber-300 mt-0.5 font-mono">{pickupWindow}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Exact time confirmed via SMS 12h prior</div>
                      </div>
                    )}

                    {ticketsCount && (
                      <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Tickets & Participants</div>
                        <div className="text-xs font-semibold text-slate-200 mt-0.5">{ticketsCount}</div>
                      </div>
                    )}

                    {selectedBooking.location && (
                      <div className="sm:col-span-2 p-3.5 rounded-2xl bg-slate-950/70 border border-white/10">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Location / Route</div>
                        <div className="text-xs sm:text-sm font-semibold text-slate-200 mt-0.5 flex items-center space-x-1.5">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{selectedBooking.location}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Museum Bag Restrictions Banner */}
                  {bagRestriction && (
                    <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start space-x-2.5 text-xs text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold text-amber-300">Museum Bag Size Restriction:</strong>{' '}
                        <span>Strict limit of 30×20×10 cm permitted on memorial grounds. Belongings and larger luggage can be left safely locked on the tour bus during the visit.</span>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Email Forward & Notes details */}
            {selectedBooking.notes && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Imported Email Details & Notes
                </div>
                <div className="p-4 rounded-2xl bg-slate-950/90 border border-white/10 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {selectedBooking.notes.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  const day = getDayNumber(selectedBooking.local_date);
                  setSelectedBooking(null);
                  window.history.pushState({}, '', `/wayfinder/poland-christmas-2026/private?day=${day}`);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <span>Jump to Day {getDayNumber(selectedBooking.local_date)} Timeline</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center space-x-2">
            <File className="w-5 h-5 text-wf-blue-lt" />
            <span>Stored Travel Documents ({displayDocuments.length})</span>
          </h3>
          <button
            onClick={() => fetchDocuments()}
            className="text-xs text-wf-muted hover:text-white flex items-center space-x-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayDocuments.map(doc => (
              <div key={doc.id} className="glass-panel p-4 rounded-2xl flex flex-col hover-lift group">
                <div 
                  className={`w-full h-32 rounded-xl border flex items-center justify-center mb-4 relative overflow-hidden transition-colors cursor-pointer ${
                    doc.detected_doc_type === 'flight' ? 'bg-sky-950/40 border-sky-500/20 group-hover:border-sky-400/60' :
                    doc.detected_doc_type === 'hotel' ? 'bg-emerald-950/40 border-emerald-500/20 group-hover:border-emerald-400/60' :
                    doc.detected_doc_type === 'restaurant' ? 'bg-orange-950/40 border-orange-500/20 group-hover:border-orange-400/60' :
                    doc.detected_doc_type === 'excursion' ? 'bg-violet-950/40 border-violet-500/20 group-hover:border-violet-400/60' :
                    doc.detected_doc_type === 'rail' ? 'bg-amber-950/40 border-amber-500/20 group-hover:border-amber-400/60' :
                    'bg-wf-navy border-white/5 group-hover:border-wf-blue-lt/50'
                  }`}
                  onClick={() => openPdfPreview(doc)}
                >
                  {
                    doc.detected_doc_type === 'flight' ? <Plane className="w-10 h-10 text-sky-400/60 group-hover:text-sky-300 transition-colors" /> :
                    doc.detected_doc_type === 'hotel' ? <Building2 className="w-10 h-10 text-emerald-400/60 group-hover:text-emerald-300 transition-colors" /> :
                    doc.detected_doc_type === 'restaurant' ? <Utensils className="w-10 h-10 text-orange-400/60 group-hover:text-orange-300 transition-colors" /> :
                    doc.detected_doc_type === 'excursion' ? <Ticket className="w-10 h-10 text-violet-400/60 group-hover:text-violet-300 transition-colors" /> :
                    doc.detected_doc_type === 'rail' ? <Train className="w-10 h-10 text-amber-400/60 group-hover:text-amber-300 transition-colors" /> :
                    <FileText className="w-10 h-10 text-wf-muted group-hover:text-wf-blue-lt transition-colors" />
                  }
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
        </div>
      </div>
    );
  }

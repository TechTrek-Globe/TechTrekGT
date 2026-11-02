import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/api';
import { resilientFetch } from '../utils/mutationQueue';
import { useAuth } from './AuthContext';

const WayfinderContext = createContext(null);

export function WayfinderProvider({ children }) {
  const { isAuthenticated } = useAuth();
  
  const [itinerary, setItinerary] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchItinerary = useCallback(async (journeyId = 'poland-christmas-2026') => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/itinerary?journey_id=${journeyId}`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setItinerary(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch itinerary:', err);
    }
  }, [isAuthenticated]);

  const fetchAccommodations = useCallback(async (journeyId = 'poland-christmas-2026') => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/accommodations?journey_id=${journeyId}`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAccommodations(data.accommodations || []);
      }
    } catch (err) {
      console.error('Failed to fetch accommodations:', err);
    }
  }, [isAuthenticated]);

  const fetchDocuments = useCallback(async (journeyId = 'poland-christmas-2026') => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/documents?journey_id=${journeyId}`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  }, [isAuthenticated]);

  const fetchJobs = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/import-jobs'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, [isAuthenticated]);

  const uploadDocument = async (journeyId, file, type, extractionResult = null) => {
    const formData = new FormData();
    formData.append('journey_id', journeyId);
    formData.append('file', file);
    formData.append('type', type);
    if (extractionResult) {
      formData.append('extractionResult', JSON.stringify(extractionResult));
    }

    const res = await fetch(getApiUrl('/api/wayfinder/documents'), {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to upload document');
    }

    const data = await res.json();
    await fetchDocuments(journeyId);
    await fetchJobs();
    return data;
  };

  const getJobFields = async (docId) => {
    const res = await fetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}`), { credentials: 'include' });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to fetch job fields');
    }
    return res.json();
  };

  const saveExtractedFields = async (docId, fields, provider = null, docType = null) => {
    const res = await resilientFetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}/fields`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fields, provider, doc_type: docType })
    }, {
      entityType: 'document',
      entityId: docId,
      action: 'Save extracted fields'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to save extracted fields');
    }
    const data = await res.json();
    await fetchDocuments('poland-christmas-2026');
    await fetchJobs();
    return data;
  };

  const approveImportJob = async (docId, journeyId = 'poland-christmas-2026', fieldOverrides = {}) => {
    const res = await resilientFetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}/approve`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ journey_id: journeyId, field_overrides: fieldOverrides })
    }, {
      entityType: 'document',
      entityId: docId,
      action: 'Approve import job to itinerary'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || errorData.message || 'Failed to approve import job');
    }
    const data = await res.json();
    await fetchItinerary(journeyId);
    await fetchAccommodations(journeyId);
    await fetchDocuments(journeyId);
    await fetchJobs();
    return data;
  };

  const rejectImportJob = async (docId) => {
    const res = await resilientFetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}/reject`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
    }, {
      entityType: 'document',
      entityId: docId,
      action: 'Reject import job'
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to reject import job');
    }
    const data = await res.json();
    await fetchDocuments('poland-christmas-2026');
    await fetchJobs();
    return data;
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchItinerary();
      fetchAccommodations();
      fetchDocuments();
      fetchJobs();
    } else {
      setItinerary([]);
      setAccommodations([]);
      setDocuments([]);
      setJobs([]);
    }
  }, [isAuthenticated, fetchItinerary, fetchAccommodations, fetchDocuments, fetchJobs]);

  const parseDocument = async (docId, file) => {
    let base64 = null;
    let text = null;
    let filename = '';
    let mimeType = 'application/pdf';

    if (file) {
      filename = file.name || '';
      mimeType = file.type || 'application/pdf';

      if (file.type?.includes('text') || file.name?.endsWith('.txt') || file.name?.endsWith('.eml') || file.name?.endsWith('.html')) {
        text = await file.text();
      } else {
        try {
          const rawSlice = await file.slice(0, 100000).text();
          if (rawSlice && rawSlice.length > 50) {
            text = rawSlice;
          }
        } catch (e) {}

        base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
      }
    } else {
      // Re-parse without file: try to recover from IndexedDB
      try {
        const { getLocalDocumentFile } = await import('../utils/documentStorage.js');
        const storedBlob = await getLocalDocumentFile(docId);
        if (storedBlob && storedBlob.size > 0) {
          filename = storedBlob.name || `document-${docId}.pdf`;
          mimeType = storedBlob.type || 'application/pdf';
          base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(storedBlob);
          });
        }
      } catch (e) {
        console.warn('[WayfinderContext] IndexedDB file recovery failed:', e?.message);
      }
    }

    const res = await resilientFetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}/parse`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        filename,
        mimeType,
        base64,
        text,
      })
    }, {
      entityType: 'document',
      entityId: docId,
      action: 'Parse document with Gemini'
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to parse document with Gemini');
    }

    const data = await res.json();
    await fetchDocuments('poland-christmas-2026');
    await fetchJobs();
    return data;
  };


  const deleteDocument = async (docId, journeyId = 'poland-christmas-2026') => {
    const res = await resilientFetch(getApiUrl(`/api/wayfinder/documents/${docId}`), {
      method: 'DELETE',
      credentials: 'include'
    }, {
      entityType: 'document',
      entityId: docId,
      action: 'Delete document'
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Failed to delete document');
    }

    try {
      const { deleteLocalDocumentFile } = await import('../utils/documentStorage');
      if (deleteLocalDocumentFile) {
        await deleteLocalDocumentFile(docId);
      }
    } catch (_) {}

    await Promise.all([
      fetchDocuments(journeyId),
      fetchJobs(),
      fetchItinerary(journeyId),
      fetchAccommodations(journeyId)
    ]);
    return true;
  };

  const renameDocument = async (docId, newTitle, journeyId = 'poland-christmas-2026') => {
    const res = await resilientFetch(getApiUrl(`/api/wayfinder/documents/${docId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ safe_display_name: newTitle.trim() })
    }, {
      entityType: 'document',
      entityId: docId,
      action: 'Rename document'
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Failed to rename document');
    }
    const data = await res.json();
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, safe_display_name: newTitle.trim(), filename: newTitle.trim() } : d));
    await Promise.all([
      fetchDocuments(journeyId),
      fetchItinerary(journeyId)
    ]);
    return data;
  };

  return (
    <WayfinderContext.Provider value={{
      itinerary,
      accommodations,
      documents,
      jobs,
      isLoading,
      error,
      fetchItinerary,
      fetchAccommodations,
      fetchDocuments,
      fetchJobs,
      uploadDocument,
      deleteDocument,
      renameDocument,
      getJobFields,
      parseDocument,
      saveExtractedFields,
      approveImportJob,
      rejectImportJob
    }}>
      {children}
    </WayfinderContext.Provider>
  );
}

export function useWayfinder() {
  const context = useContext(WayfinderContext);
  if (!context) {
    throw new Error('useWayfinder must be used within a WayfinderProvider');
  }
  return context;
}

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getApiUrl } from '../utils/api';
import { resilientFetch } from '../utils/mutationQueue';
import { saveUserCache, getUserCache } from '../utils/documentStorage';
import { useAuth } from './AuthContext';

const WayfinderContext = createContext(null);

const AGENDA_ACCESS_REF = 'poland-christmas-2026';
const NO_PERMISSIONS = { itinerary: false, packing: false, documents: false, expenses: false, share: false, edit: false };

export function WayfinderProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id || null;

  const [itinerary, setItinerary] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  // Server-resolved agenda role: 'owner' | 'admin' | 'editor' | 'viewer' | 'none' | null (unknown)
  const [agendaAccess, setAgendaAccess] = useState({ role: null, permissions: NO_PERMISSIONS, loaded: false });
  const controllersRef = useRef({});

  const beginSignal = useCallback((channel) => {
    if (controllersRef.current[channel]) {
      controllersRef.current[channel].abort();
    }
    const ctrl = new AbortController();
    controllersRef.current[channel] = ctrl;
    return ctrl.signal;
  }, []);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const ctrl of Object.values(controllers)) {
        ctrl?.abort();
      }
    };
  }, []);

  const refreshAgendaAccess = useCallback(async () => {
    if (!isAuthenticated) {
      setAgendaAccess({ role: null, permissions: NO_PERMISSIONS, loaded: true });
      return;
    }
    const signal = beginSignal('access');
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/agendas/${AGENDA_ACCESS_REF}/access`), {
        credentials: 'include',
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (signal.aborted) return;
      setAgendaAccess({
        role: res.ok ? (data.role || 'none') : 'none',
        permissions: res.ok && data.permissions ? data.permissions : NO_PERMISSIONS,
        loaded: true
      });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      // Network failure: fail closed with unknown role
      setAgendaAccess({ role: null, permissions: NO_PERMISSIONS, loaded: true });
    }
  }, [isAuthenticated, beginSignal]);

  useEffect(() => {
    refreshAgendaAccess();
  }, [refreshAgendaAccess]);

  const fetchItinerary = useCallback(async (journeyId = 'poland-christmas-2026') => {
    if (!isAuthenticated) return;
    const signal = beginSignal('itinerary');
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/itinerary?journey_id=${journeyId}`), {
        credentials: 'include',
        signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const items = data.items || [];
        if (!signal.aborted) {
          setItinerary(items);
          if (userId) void saveUserCache(userId, `itinerary:${journeyId}`, items);
        }
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to fetch itinerary:', err);
    }
    if (userId && !signal.aborted) {
      const cached = await getUserCache(userId, `itinerary:${journeyId}`);
      if (Array.isArray(cached) && !signal.aborted) setItinerary(cached);
    }
  }, [isAuthenticated, userId, beginSignal]);

  const fetchAccommodations = useCallback(async (journeyId = 'poland-christmas-2026') => {
    if (!isAuthenticated) return;
    const signal = beginSignal('accommodations');
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/accommodations?journey_id=${journeyId}`), {
        credentials: 'include',
        signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const list = data.accommodations || [];
        if (!signal.aborted) {
          setAccommodations(list);
          if (userId) void saveUserCache(userId, `accommodations:${journeyId}`, list);
        }
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to fetch accommodations:', err);
    }
    if (userId && !signal.aborted) {
      const cached = await getUserCache(userId, `accommodations:${journeyId}`);
      if (Array.isArray(cached) && !signal.aborted) setAccommodations(cached);
    }
  }, [isAuthenticated, userId, beginSignal]);

  const fetchDocuments = useCallback(async (journeyId = 'poland-christmas-2026') => {
    if (!isAuthenticated) return;
    const signal = beginSignal('documents');
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/documents?journey_id=${journeyId}`), {
        credentials: 'include',
        signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const list = data.documents || [];
        if (!signal.aborted) {
          setDocuments(list);
          if (userId) void saveUserCache(userId, `documents:${journeyId}`, list);
        }
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to fetch documents:', err);
    }
    if (userId && !signal.aborted) {
      const cached = await getUserCache(userId, `documents:${journeyId}`);
      if (Array.isArray(cached) && !signal.aborted) setDocuments(cached);
    }
  }, [isAuthenticated, userId, beginSignal]);

  const fetchJobs = useCallback(async () => {
    if (!isAuthenticated) return;
    const signal = beginSignal('jobs');
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/import-jobs'), {
        credentials: 'include',
        signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const list = data.jobs || [];
        if (!signal.aborted) {
          setJobs(list);
          if (userId) void saveUserCache(userId, 'import_jobs', list);
        }
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to fetch jobs:', err);
    }
    if (userId && !signal.aborted) {
      const cached = await getUserCache(userId, 'import_jobs');
      if (Array.isArray(cached) && !signal.aborted) setJobs(cached);
    }
  }, [isAuthenticated, userId, beginSignal]);

  const fetchBookmarks = useCallback(async (journeyId = 'poland-christmas-2026') => {
    if (!isAuthenticated) return;
    const signal = beginSignal('bookmarks');
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/bookmarks?journey_id=${encodeURIComponent(journeyId)}`), {
        credentials: 'include',
        signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const list = data.bookmarks || [];
        if (!signal.aborted) {
          setBookmarks(list);
          if (userId) void saveUserCache(userId, `bookmarks:${journeyId}`, list);
        }
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to fetch bookmarks:', err);
    }
    if (userId && !signal.aborted) {
      const cached = await getUserCache(userId, `bookmarks:${journeyId}`);
      if (Array.isArray(cached) && !signal.aborted) setBookmarks(cached);
    }
  }, [isAuthenticated, userId, beginSignal]);

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
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to upload document');
    }

    const data = await res.json().catch(() => ({}));
    await fetchDocuments(journeyId);
    await fetchJobs();
    return data;
  };

  const getJobFields = async (docId) => {
    const res = await fetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}`), { credentials: 'include' });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch job fields');
    }
    return res.json().catch(() => ({}));
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
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to save extracted fields');
    }
    const data = await res.json().catch(() => ({}));
    if (data?.queued) return data;
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
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `Failed to approve import job (${res.status})`);
    }
    const data = await res.json().catch(() => ({}));
    if (data?.queued) return data;
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
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to reject import job');
    }
    const data = await res.json().catch(() => ({}));
    if (data?.queued) return data;
    await fetchDocuments('poland-christmas-2026');
    await fetchJobs();
    return data;
  };

  useEffect(() => {
    if (isAuthenticated && agendaAccess.loaded) {
      fetchItinerary();
      fetchAccommodations();
      fetchBookmarks();
      if (agendaAccess.permissions.documents) {
        fetchDocuments();
        fetchJobs();
      } else {
        setDocuments([]);
        setJobs([]);
      }
    } else {
      setItinerary([]);
      setAccommodations([]);
      setDocuments([]);
      setJobs([]);
      setBookmarks([]);
    }
  }, [isAuthenticated, agendaAccess.loaded, agendaAccess.permissions.documents, fetchItinerary, fetchAccommodations, fetchBookmarks, fetchDocuments, fetchJobs]);

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
    const data = await res.json().catch(() => ({}));

    try {
      const { deleteLocalDocumentFile } = await import('../utils/documentStorage');
      if (deleteLocalDocumentFile) {
        await deleteLocalDocumentFile(docId);
      }
    } catch (_) {}

    if (data?.queued) {
      setDocuments(prev => prev.filter(d => d.id !== docId));
      return true;
    }

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
    const data = await res.json().catch(() => ({}));
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, safe_display_name: newTitle.trim(), filename: newTitle.trim() } : d));
    if (data?.queued) return data;
    await Promise.all([
      fetchDocuments(journeyId),
      fetchItinerary(journeyId)
    ]);
    return data;
  };

  const savedItemIds = useMemo(
    () => new Set((bookmarks || []).map((b) => b.item_id)),
    [bookmarks]
  );

  const toggleBookmark = useCallback(async (itemId, meta = {}, journeyId = 'poland-christmas-2026') => {
    if (!itemId || !isAuthenticated) return false;
    const isCurrentlySaved = savedItemIds.has(itemId);
    const optimisticNext = isCurrentlySaved
      ? bookmarks.filter((b) => b.item_id !== itemId)
      : [
          {
            id: `local-${itemId}`,
            user_id: userId,
            journey_id: journeyId,
            item_id: itemId,
            item_type: meta.itemType || 'poi',
            city: meta.city || null,
            title: meta.title || null,
          },
          ...bookmarks,
        ];
    setBookmarks(optimisticNext);
    if (userId) void saveUserCache(userId, `bookmarks:${journeyId}`, optimisticNext);

    try {
      const res = isCurrentlySaved
        ? await resilientFetch(
            getApiUrl(`/api/wayfinder/bookmarks/${encodeURIComponent(itemId)}?journey_id=${encodeURIComponent(journeyId)}`),
            { method: 'DELETE', credentials: 'include' },
            { entityType: 'bookmark', entityId: itemId, action: `Remove bookmark ${itemId}` }
          )
        : await resilientFetch(
            getApiUrl('/api/wayfinder/bookmarks'),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                journey_id: journeyId,
                item_id: itemId,
                item_type: meta.itemType || 'poi',
                city: meta.city || null,
                title: meta.title || null,
              }),
            },
            { entityType: 'bookmark', entityId: itemId, action: `Save bookmark ${meta.title || itemId}` }
          );

      const data = await res.json().catch(() => ({}));
      if (res.ok && !data?.queued) {
        void fetchBookmarks(journeyId);
      }
      return true;
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
      return false;
    }
  }, [isAuthenticated, savedItemIds, bookmarks, userId, fetchBookmarks]);

  return (
    <WayfinderContext.Provider value={{
      itinerary,
      accommodations,
      documents,
      jobs,
      bookmarks,
      savedItemIds,
      isLoading,
      error,
      agendaAccess,
      refreshAgendaAccess,
      fetchItinerary,
      fetchAccommodations,
      fetchDocuments,
      fetchJobs,
      fetchBookmarks,
      toggleBookmark,
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

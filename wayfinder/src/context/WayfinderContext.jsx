import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../utils/api';
import { useAuth } from './AuthContext';

const WayfinderContext = createContext(null);

export function WayfinderProvider({ children }) {
  const { isAuthenticated } = useAuth();
  
  const [itinerary, setItinerary] = useState([]);
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
    const res = await fetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}/fields`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fields, provider, doc_type: docType })
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
    const res = await fetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}/approve`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ journey_id: journeyId, field_overrides: fieldOverrides })
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || errorData.message || 'Failed to approve import job');
    }
    const data = await res.json();
    await fetchItinerary(journeyId);
    await fetchDocuments(journeyId);
    await fetchJobs();
    return data;
  };

  const rejectImportJob = async (docId) => {
    const res = await fetch(getApiUrl(`/api/wayfinder/import-jobs/${docId}/reject`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
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
      fetchDocuments();
      fetchJobs();
    } else {
      setItinerary([]);
      setDocuments([]);
      setJobs([]);
    }
  }, [isAuthenticated, fetchItinerary, fetchDocuments, fetchJobs]);

  return (
    <WayfinderContext.Provider value={{
      itinerary,
      documents,
      jobs,
      isLoading,
      error,
      fetchItinerary,
      fetchDocuments,
      fetchJobs,
      uploadDocument,
      getJobFields,
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

import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Copy, Check, Sparkles, FileCode,
  FileText, Eye, ChevronDown, ChevronUp,
  Globe, Loader2, AlertCircle, CheckCircle2,
  SlidersHorizontal, RefreshCw, ExternalLink, ClipboardPaste
} from 'lucide-react';
import {
  generateEbayCopy,
  generateWhatnotCopy,
  generateMercariCopy,
  generateSocialCopy
} from '../utils/listingCopyGenerator';
import { getApiUrl } from '../utils/api';
import { parseAmazonProductContent } from '../utils/amazonParser';
import { fetchEbayItemDetail, fetchAmazonProduct } from '../utils/auctionApi';

/**
 * Extracts Order ID or ASIN from an item's notes or invoice_ref.
 */
function extractAsinFromItem(item) {
  if (!item) return '';
  const searchStr = `${item.notes || ''} ${item.invoice_ref || ''} ${item.item_name || ''}`;
  const match = searchStr.match(/\b([A-Z0-9]{10})\b/i);
  if (match) return match[1].toUpperCase();
  return '';
}

export function ListingCopyModal({ isOpen, onClose, item }) {
  const [platform, setPlatform] = useState('ebay');
  const [format, setFormat] = useState('html_preview'); // 'text' | 'html_preview' | 'html_code'
  const [copiedField, setCopiedField] = useState('');
  const [showEditor, setShowEditor] = useState(true);

  // Form Fields State
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [productType, setProductType] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [conditionHeader, setConditionHeader] = useState('');
  const [conditionSubheader, setConditionSubheader] = useState('');
  const [condition, setCondition] = useState('Brand New / Excellent');
  const [features, setFeatures] = useState('');
  const [specs, setSpecs] = useState('');
  const [compatibility, setCompatibility] = useState('');
  const [description, setDescription] = useState('');
  const [includedInSale, setIncludedInSale] = useState('');
  const [shippingPolicy, setShippingPolicy] = useState('Ships securely in bubble mailer / box with tracking within 1 business day.');
  const [returnPolicy, setReturnPolicy] = useState('30-Day Returns accepted if item is in original unaltered condition.');

  // Amazon Fetch State & Smart Paste
  const [asinInput, setAsinInput] = useState('');
  const [fetchingAmazon, setFetchingAmazon] = useState(false);
  const [amazonMsg, setAmazonMsg] = useState(null);
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [smartPasteText, setSmartPasteText] = useState('');
  
  // eBay Item Fetch State
  const [generatingReport, setGeneratingReport] = useState(false);

  // Initialize fields when item changes or modal opens
  useEffect(() => {
    if (!item) return;
    const initialAsin = extractAsinFromItem(item);
    setAsinInput(initialAsin);

    setTitle(item.item_name || '');
    setBrand(item.brand || '');
    setProductType(item.category && item.category !== 'General' ? item.category : '');
    setSubtitle('');
    setCondition(item.condition || 'Brand New / Excellent');
    setConditionHeader(item.condition?.toLowerCase().includes('new') ? 'BRAND NEW IN ORIGINAL UNOPENED BOX' : '');
    setConditionSubheader(item.condition?.toLowerCase().includes('new') ? 'Never installed or used' : '');
    setFeatures('');
    setSpecs('');
    setCompatibility('');
    setDescription(item.notes || '');
    setIncludedInSale('');
    setAmazonMsg(null);
    setSmartPasteText('');
    setShowSmartPaste(false);
  }, [item, isOpen]);

  // Apply parsed product content to form fields
  const applyParsedDetails = (parsed) => {
    let populatedCount = 0;
    if (parsed.title) { setTitle(parsed.title); populatedCount++; }
    if (parsed.brand) { setBrand(parsed.brand); populatedCount++; }
    if (parsed.category && parsed.category !== 'Other') { setProductType(parsed.category); populatedCount++; }
    if (parsed.features && parsed.features.length > 0) {
      setFeatures(parsed.features.join('\n'));
      populatedCount++;
    }
    if (parsed.specs && Object.keys(parsed.specs).length > 0) {
      setSpecs(Object.entries(parsed.specs).map(([k, v]) => `${k}: ${v}`).join('\n'));
      populatedCount++;
    }
    if (parsed.description) {
      setDescription(parsed.description);
      populatedCount++;
    }
    return populatedCount;
  };

  // Handle Client-Side Smart Paste Extraction
  const handleExtractFromSmartPaste = (customText) => {
    const textToProcess = (customText !== undefined ? customText : smartPasteText).trim();
    if (!textToProcess) {
      setAmazonMsg({ type: 'warning', text: 'Please paste text or HTML from the Amazon product page first.' });
      return;
    }

    const parsed = parseAmazonProductContent(textToProcess);
    const count = applyParsedDetails(parsed);

    if (count > 0) {
      setAmazonMsg({
        type: 'success',
        text: `Smart Paste extracted ${count} detail fields (Title, Brand, Specs & Bullets) successfully!`
      });
      setSmartPasteText('');
      setShowSmartPaste(false);
    } else {
      setAmazonMsg({
        type: 'warning',
        text: 'Could not auto-detect standard Amazon patterns. You can edit the form fields manually.'
      });
    }
  };

  // Handle Fetching Amazon Product Details
  const handleFetchAmazon = async (overrideInput) => {
    const query = (overrideInput || asinInput || '').trim();
    if (!query) {
      setAmazonMsg({ type: 'warning', text: 'Please enter an Amazon URL, ASIN, or Order ID.' });
      return;
    }
    setFetchingAmazon(true);
    setAmazonMsg(null);
    try {
      const data = await fetchAmazonProduct(query);
      if (data.error === 'AMAZON_BLOCKED' || data.success === false || data.error) {
        setShowSmartPaste(true);
        if (data.error === 'AMAZON_BLOCKED' || (data.message && data.message.toLowerCase().includes('bot protection'))) {
          setAmazonMsg({
            type: 'warning',
            text: 'Amazon bot check triggered. Click "Open on Amazon ↗", copy the page text, and paste into Smart Paste below!'
          });
        } else {
          setAmazonMsg({
            type: 'error',
            text: data.message || data.error || 'Failed to fetch details from Amazon. Use Smart Paste below.'
          });
        }
        return;
      }

      // Populate scraped data into state
      applyParsedDetails(data);
      setAmazonMsg({
        type: 'success',
        text: `Successfully imported product details from Amazon for ASIN ${data.asin || query}!`
      });
    } catch (err) {
      setShowSmartPaste(true);
      setAmazonMsg({
        type: 'error',
        text: 'Network error connecting to Amazon scraper. Use Smart Paste below.'
      });
    } finally {
      setFetchingAmazon(false);
    }
  };

  // Handle Fetching eBay Item Details for Condition Report
  const handleAutoGenerateCondition = async () => {
    // Try to extract an eBay Item ID from asinInput or notes.
    // eBay item IDs are usually 12 digits.
    const searchStr = `${asinInput} ${item.notes || ''} ${item.invoice_ref || ''}`;
    const match = searchStr.match(/\b(\d{12})\b/);
    if (!match) {
      alert("Could not detect a 12-digit eBay Item ID in the Amazon lookup field, notes, or invoice_ref.");
      return;
    }
    const itemId = `v1|${match[1]}|0`;
    
    setGeneratingReport(true);
    try {
      const data = await fetchEbayItemDetail(itemId);
      
      let conditionText = data.condition || 'Unknown Condition';
      if (data.conditionDescription) {
        conditionText += ` - ${data.conditionDescription}`;
      }
      
      setConditionHeader(data.condition || '');
      setConditionSubheader(data.conditionDescription || '');
      
      let reportLines = [];
      reportLines.push(`**Condition Report - ${new Date().toLocaleDateString()}**`);
      reportLines.push('');
      reportLines.push(`Based on our inspection and the original listing details (Item ID: ${match[1]}), this item is described as:`);
      reportLines.push(`• ${conditionText}`);
      reportLines.push('');
      
      if (item.authenticator && item.authenticator !== 'Other') {
        reportLines.push(`**Authentication Guarantee:**`);
        reportLines.push(`This item has been authenticated by ${item.authenticator}. Certificate Number: ${item.cert_number || 'Available upon request'}.`);
        reportLines.push(`The authenticator's opinion is final and binding regarding the authenticity of the signature(s).`);
        reportLines.push('');
      }
      
      reportLines.push(`*Please review all provided high-resolution images carefully, as they constitute a major part of the condition report. If you have specific questions about corners, edges, or surfaces, please message us prior to purchase.*`);
      
      setDescription((prev) => {
        if (prev) {
          return prev + '\n\n' + reportLines.join('\n');
        }
        return reportLines.join('\n');
      });
      
    } catch (err) {
      alert(`Failed to fetch eBay item details: ${err.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  // Parse Key-Value text blocks
  const parsedSpecs = useMemo(() => {
    if (!specs.trim()) return [];
    return specs.split('\n').map(line => {
      const idx = line.indexOf(':');
      if (idx === -1) return null;
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }).filter(Boolean);
  }, [specs]);

  const parsedCompatibility = useMemo(() => {
    if (!compatibility.trim()) return [];
    return compatibility.split('\n').map(line => {
      const idx = line.indexOf(':');
      if (idx === -1) return null;
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }).filter(Boolean);
  }, [compatibility]);

  // Generate All Platform Copy
  const generated = useMemo(() => {
    if (!item) return {};
    const options = {
      title: title || item.item_name,
      brand,
      productType,
      subtitle,
      conditionHeader,
      conditionSubheader,
      condition,
      features,
      specs: parsedSpecs,
      compatibility: parsedCompatibility,
      description,
      includedInSale,
      shippingPolicy,
      returnPolicy
    };
    const ebay = generateEbayCopy(item, options);
    const whatnot = generateWhatnotCopy(item, options);
    const mercari = generateMercariCopy(item, options);
    const social = generateSocialCopy(item, options);

    return { ebay, whatnot, mercari, social };
  }, [item, title, brand, productType, subtitle, conditionHeader, conditionSubheader, condition, features, parsedSpecs, parsedCompatibility, description, includedInSale, shippingPolicy, returnPolicy]);

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField('');
    }, 2000);
  };

  if (!isOpen || !item) return null;

  const curEbay = generated.ebay || {};
  const curWhatnot = generated.whatnot || {};
  const curMercari = generated.mercari || {};
  const curSocial = generated.social || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-4xl glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden my-auto animate-scale-up flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                Multi-Channel Listing Creator
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Enhanced
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate max-w-md">{item.item_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditor(!showEditor)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                showEditor
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showEditor ? 'Hide Details Form' : 'Edit Listing Details'}</span>
              {showEditor ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Collapsible Item Details / Amazon Lookup Form */}
          {showEditor && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 space-y-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Item Details &amp; Amazon Import
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  Fill in specifics to generate professional listing copy
                </span>
              </div>

              {/* Amazon ASIN / URL Fetcher Row */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Amazon Product Lookup &amp; Smart Assist
                  </label>
                  <div className="flex items-center gap-2">
                    {asinInput.trim() && (
                      <a
                        href={asinInput.startsWith('http') ? asinInput : `https://www.amazon.com/dp/${asinInput.trim()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 transition-colors"
                      >
                        <span>Open on Amazon</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSmartPaste(!showSmartPaste)}
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 border transition-colors ${
                        showSmartPaste
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      <span>{showSmartPaste ? 'Hide Smart Paste' : 'Smart Paste'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={asinInput}
                    onChange={e => setAsinInput(e.target.value)}
                    placeholder="Paste Amazon Product URL, ASIN (e.g. B08N5WRWNW), or Order ID"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => handleFetchAmazon()}
                    disabled={fetchingAmazon || !asinInput.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shrink-0 shadow-md shadow-amber-500/10"
                  >
                    {fetchingAmazon ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Fetch from Amazon</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Smart Paste Drawer */}
                {showSmartPaste && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-blue-900/40 space-y-2 animate-in fade-in-0 duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-300 flex items-center gap-1">
                        <ClipboardPaste className="w-3.5 h-3.5 text-blue-400" />
                        1-Click Smart Paste (Bypasses Bot Checks)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Paste copied text or HTML from Amazon to auto-extract details
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={smartPasteText}
                      onChange={e => setSmartPasteText(e.target.value)}
                      placeholder="Paste any text, specifications, bullet points, or page HTML copied from Amazon here..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleExtractFromSmartPaste()}
                        disabled={!smartPasteText.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-blue-400 hover:bg-blue-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Extract &amp; Apply Details</span>
                      </button>
                    </div>
                  </div>
                )}

                {amazonMsg && (
                  <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                    amazonMsg.type === 'success'
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                      : amazonMsg.type === 'warning'
                        ? 'bg-amber-950/40 text-amber-300 border-amber-800'
                        : 'bg-rose-950/40 text-rose-300 border-rose-800'
                  }`}>
                    {amazonMsg.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="flex-1">{amazonMsg.text}</span>
                  </div>
                )}
              </div>

              {/* Editable Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Product Title / Headline
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. KEMIMOTO UTV Flip Windshield"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Brand */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    placeholder="e.g. KEMIMOTO, Nike, Apple"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Product Type / Subtitle */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Product Type / Category
                  </label>
                  <input
                    type="text"
                    value={productType}
                    onChange={e => setProductType(e.target.value)}
                    placeholder="e.g. Flip-Up Front UTV Windshield"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Subtitle / Model Line */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Subtitle / Model Sub-headline
                  </label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={e => setSubtitle(e.target.value)}
                    placeholder="e.g. For Kawasaki Mule 4000 & 4010 (2009+) and Mule 4010 Trans (2015+)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Condition Headline */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Condition Banner Headline
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoGenerateCondition}
                      disabled={generatingReport}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20 disabled:opacity-50"
                    >
                      {generatingReport ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Auto-Gen Report
                    </button>
                  </div>
                  <input
                    type="text"
                    value={conditionHeader}
                    onChange={e => setConditionHeader(e.target.value)}
                    placeholder="e.g. BRAND NEW IN ORIGINAL UNOPENED BOX"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Condition Sub-text */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Condition Sub-text
                  </label>
                  <input
                    type="text"
                    value={conditionSubheader}
                    onChange={e => setConditionSubheader(e.target.value)}
                    placeholder="e.g. Never installed or used"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Features (Bullet Points) */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Product Features (1 per line)
                  </label>
                  <textarea
                    rows={4}
                    value={features}
                    onChange={e => setFeatures(e.target.value)}
                    placeholder="Flip-up design provides open and closed operating positions&#10;Clear, hard-coated polycarbonate construction&#10;Scratch-resistant surface design"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono leading-relaxed"
                  />
                </div>

                {/* Technical Specs Table */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Item Specifications (Key: Value)
                  </label>
                  <textarea
                    rows={4}
                    value={specs}
                    onChange={e => setSpecs(e.target.value)}
                    placeholder="Material: Hard-Coated Polycarbonate&#10;Color: Clear&#10;Placement: Front"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono leading-relaxed"
                  />
                </div>

                {/* Vehicle Compatibility Table */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Vehicle Compatibility (Model: Years)
                  </label>
                  <textarea
                    rows={4}
                    value={compatibility}
                    onChange={e => setCompatibility(e.target.value)}
                    placeholder="Make: Kawasaki&#10;Mule 4000: 2009 and newer&#10;Mule 4010: 2009 and newer&#10;Mule 4010 Trans: 2015 and newer"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono leading-relaxed"
                  />
                </div>

                {/* Detailed Description */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Detailed Item Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Offered is a brand-new flip-up front windshield designed for select utility vehicles..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500 leading-relaxed"
                  />
                </div>

                {/* Included in Sale */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Included in the Sale
                  </label>
                  <input
                    type="text"
                    value={includedInSale}
                    onChange={e => setIncludedInSale(e.target.value)}
                    placeholder="e.g. One unopened KEMIMOTO UTV Flip Windshield package in its original box."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Platform Selection Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/60 pt-2 gap-2 overflow-x-auto rounded-t-xl px-2">
            {[
              { id: 'ebay', label: 'eBay (SEO & HTML)' },
              { id: 'whatnot', label: 'Whatnot (Stream Notes)' },
              { id: 'mercari', label: 'Mercari (+ Tags)' },
              { id: 'social', label: 'Instagram / Social' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPlatform(tab.id)}
                className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  platform === tab.id
                    ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* eBay Tab Content */}
          {platform === 'ebay' && (
            <div className="space-y-4">
              {/* Title Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Listing Title ({curEbay.title?.length || 0}/80 chars)
                  </label>
                  <button
                    onClick={() => copyToClipboard(curEbay.title, 'ebay_title')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'ebay_title' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Title</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 select-all">
                  {curEbay.title}
                </div>
              </div>

              {/* Format Toggle for Description */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setFormat('text')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                      format === 'text' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-3 h-3" /> Plain Text
                  </button>
                  <button
                    onClick={() => setFormat('html_preview')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                      format === 'html_preview' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Eye className="w-3 h-3" /> HTML Preview
                  </button>
                  <button
                    onClick={() => setFormat('html_code')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                      format === 'html_code' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileCode className="w-3 h-3" /> Raw HTML
                  </button>
                </div>

                <button
                  onClick={() => copyToClipboard(format === 'text' ? curEbay.textBody : (curEbay.insertHtml || curEbay.htmlBody), 'ebay_desc')}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-all flex items-center gap-1 shadow-md shadow-amber-500/10"
                >
                  {copiedField === 'ebay_desc' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-slate-950" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy {format === 'text' ? 'Text' : 'HTML Insert'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Description Body Display */}
              {format === 'text' && (
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all max-h-80 overflow-y-auto leading-relaxed">
                  {curEbay.textBody}
                </div>
              )}

              {format === 'html_preview' && (
                <div
                  className="p-4 rounded-xl bg-white text-slate-900 border border-slate-800 max-h-96 overflow-y-auto shadow-inner"
                  dangerouslySetInnerHTML={{ __html: curEbay.htmlBody }}
                />
              )}

              {format === 'html_code' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-300/80 whitespace-pre-wrap select-all max-h-80 overflow-y-auto">
                  {curEbay.insertHtml || curEbay.htmlBody}
                </div>
              )}
            </div>
          )}

          {/* Whatnot Tab Content */}
          {platform === 'whatnot' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stream Title</label>
                  <button
                    onClick={() => copyToClipboard(curWhatnot.title, 'wn_title')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'wn_title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'wn_title' ? 'Copied!' : 'Copy Title'}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 select-all">
                  {curWhatnot.title}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Auction / Stream Notes</label>
                  <button
                    onClick={() => copyToClipboard(curWhatnot.notes, 'wn_notes')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'wn_notes' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'wn_notes' ? 'Copied!' : 'Copy Stream Notes'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all max-h-60 overflow-y-auto leading-relaxed">
                  {curWhatnot.notes}
                </div>
              </div>
            </div>
          )}

          {/* Mercari Tab Content */}
          {platform === 'mercari' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mercari Title ({curMercari.title?.length || 0}/80 chars)
                  </label>
                  <button
                    onClick={() => copyToClipboard(curMercari.title, 'mercari_title')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'mercari_title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'mercari_title' ? 'Copied!' : 'Copy Title'}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 select-all">
                  {curMercari.title}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description &amp; Hashtags</label>
                  <button
                    onClick={() => copyToClipboard(curMercari.description, 'mercari_desc')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'mercari_desc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'mercari_desc' ? 'Copied!' : 'Copy Description'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all max-h-60 overflow-y-auto leading-relaxed">
                  {curMercari.description}
                </div>
              </div>
            </div>
          )}

          {/* Social Tab Content */}
          {platform === 'social' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Instagram / Social Post Caption</label>
                  <button
                    onClick={() => copyToClipboard(curSocial.caption, 'social_caption')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'social_caption' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'social_caption' ? 'Copied!' : 'Copy Caption'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all leading-relaxed">
                  {curSocial.caption}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900/50 text-xs shrink-0">
          <div className="flex items-center gap-3">
            <a
              href="https://www.ebay.com/sl/prelist/suggest"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
            >
              eBay Sell Hub ↗
            </a>
            <a
              href="https://www.whatnot.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
            >
              Whatnot ↗
            </a>
            <a
              href="https://www.mercari.com/sell/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
            >
              Mercari ↗
            </a>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

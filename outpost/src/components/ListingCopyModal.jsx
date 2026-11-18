import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Copy, Check, Sparkles, FileCode,
  FileText, Eye, ChevronDown, ChevronUp,
  Globe, Loader2, AlertCircle, CheckCircle2,
  SlidersHorizontal, RefreshCw, ExternalLink, ClipboardPaste,
  RotateCcw, ShieldCheck, ShieldAlert, DollarSign,
  MapPin, Tag, Package, Music, Camera, Save
} from 'lucide-react';
import {
  generateEbayCopy,
  generateFacebookCopy,
  generateWhatnotCopy,
  generateMercariCopy,
  generateReverbCopy,
  stripInternalTrackingNotes,
  sanitizeListingHtml
} from '../utils/listingCopyGenerator';
import {
  SUPPORTED_PLATFORMS,
  PLATFORM_RULES_REGISTRY,
  getPlatformRules,
  computeUtf16Length
} from '../utils/platformListingRules';
import { getApiUrl } from '../utils/api';
import { parseAmazonProductContent } from '../utils/amazonParser';
import {
  fetchEbayItemDetail,
  fetchAmazonProduct,
  generateAiEbayDetails,
  generateAiPlatformListingApi,
  createEbayListingApi,
  updateItem
} from '../utils/auctionApi';

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

export function ListingCopyModal({ isOpen, onClose, item, onListingCreated, onItemUpdated }) {
  const [platform, setPlatform] = useState('ebay');
  const [format, setFormat] = useState('html_preview'); // 'text' | 'html_preview' | 'html_code'
  const [copiedField, setCopiedField] = useState('');
  const [showEditor, setShowEditor] = useState(true);
  const [showAmazonAssist, setShowAmazonAssist] = useState(false);

  // Persistence State
  const [savingItem, setSavingItem] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

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
  const [conditionMsg, setConditionMsg] = useState(null);

  // Gemini AI Listing Details State
  const [aiGeneratedMiddleSection, setAiGeneratedMiddleSection] = useState('');
  const [generatingAiDetails, setGeneratingAiDetails] = useState(false);
  const [aiDetailsMsg, setAiDetailsMsg] = useState(null);

  // Multi-Platform Rules & AI Listing State
  const [athlete, setAthlete] = useState('');
  const [teamOrBand, setTeamOrBand] = useState('');
  const [sportOrGenre, setSportOrGenre] = useState('');
  const [authenticator, setAuthenticator] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [inscription, setInscription] = useState('');
  const [size, setSize] = useState('');
  const [isWearable, setIsWearable] = useState(false);
  const [isCustomJersey, setIsCustomJersey] = useState(false);
  const [isPickguardSignedGuitar, setIsPickguardSignedGuitar] = useState(false);
  const [targetNet, setTargetNet] = useState('');
  const [aiPlatformPayloads, setAiPlatformPayloads] = useState({});
  const [generatingPlatformAi, setGeneratingPlatformAi] = useState(false);
  const [platformAiMsg, setPlatformAiMsg] = useState(null);

  // 1-Click Publish to eBay State
  const [publishingEbay, setPublishingEbay] = useState(false);
  const [publishResult, setPublishResult] = useState(null);

  // Initialize fields when item changes or modal opens
  useEffect(() => {
    if (!item) return;
    let parsedAttrs = {};
    if (item.attributes) {
      try {
        parsedAttrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
      } catch (_) {}
    }

    const initialAsin = item.asin || parsedAttrs.asin || extractAsinFromItem(item);
    const combinedText = `${item.item_name || ''} ${item.category || ''} ${item.notes || ''}`.toLowerCase();
    const detectedWearable = /\b(jersey|shirt|t-shirt|hoodie|jacket|hat|cap)\b/.test(combinedText);
    const detectedCustomJersey = /\bcustom\b/.test(combinedText) && /\bjersey\b/.test(combinedText);
    const detectedPickguard = /\b(pickguard|pick guard)\b/.test(combinedText) && /\bguitar\b/.test(combinedText);

    setAsinInput(initialAsin);

    setTitle(item.item_name || '');
    setBrand(item.brand || parsedAttrs.brand || '');
    setProductType(item.category && item.category !== 'General' ? item.category : (parsedAttrs.category || ''));
    setSubtitle(parsedAttrs.model || '');
    const resolvedCond = item.item_condition || item.condition || parsedAttrs.condition || 'Brand New / Excellent';
    setCondition(resolvedCond);
    setConditionHeader(parsedAttrs.condition_header || (resolvedCond.toLowerCase().includes('new') ? 'BRAND NEW IN ORIGINAL UNOPENED BOX' : ''));
    setConditionSubheader(item.condition_notes || parsedAttrs.condition_subheader || (resolvedCond.toLowerCase().includes('new') ? 'Never installed or used' : ''));
    setFeatures(Array.isArray(parsedAttrs.features) ? parsedAttrs.features.join('\n') : (parsedAttrs.features || ''));
    setSpecs(typeof parsedAttrs.specs === 'object' && parsedAttrs.specs ? Object.entries(parsedAttrs.specs).map(([k, v]) => `${k}: ${v}`).join('\n') : (parsedAttrs.specs || ''));
    setCompatibility(parsedAttrs.compatibility || '');
    setDescription(stripInternalTrackingNotes(item.condition_notes || item.notes || ''));
    setIncludedInSale(parsedAttrs.included_in_sale || '');
    setAthlete(item.athlete_person || parsedAttrs.athlete_person || '');
    setTeamOrBand(item.team_or_band || parsedAttrs.team_or_band || '');
    setSportOrGenre(item.sport_genre || parsedAttrs.sport_genre || (item.category && item.category !== 'General' ? item.category : ''));
    setAuthenticator(item.authenticator || parsedAttrs.authenticator || '');
    setCertNumber(item.cert_number || parsedAttrs.cert_number || '');
    setInscription(item.inscription || parsedAttrs.inscription || '');
    setSize(item.size || parsedAttrs.size || '');
    setIsWearable(Boolean(item.is_wearable ?? parsedAttrs.is_wearable ?? detectedWearable));
    setIsCustomJersey(Boolean(item.is_custom_jersey ?? parsedAttrs.is_custom_jersey ?? detectedCustomJersey));
    setIsPickguardSignedGuitar(Boolean(item.is_pickguard_guitar ?? parsedAttrs.is_pickguard_guitar ?? detectedPickguard));
    const seedPrice = item.target_net ?? parsedAttrs.target_net ?? item.min_sell_price ?? item.suggested_list_price ?? item.current_list_price ?? item.unit_price ?? '';
    setTargetNet(seedPrice ? String(seedPrice) : '');
    setAiPlatformPayloads({});
    setGeneratingPlatformAi(false);
    setPlatformAiMsg(null);
    setAmazonMsg(null);
    setConditionMsg(null);
    setSmartPasteText('');
    setShowSmartPaste(false);
    setAiGeneratedMiddleSection(parsedAttrs.ai_middle_section || '');
    setGeneratingAiDetails(false);
    setAiDetailsMsg(null);
    setPublishingEbay(false);
    setPublishResult(null);
    setSavingItem(false);
    setSaveSuccess(false);
    setSaveError('');
  }, [item, isOpen]);

  // Persist all user-edited listing fields directly to the item in SQLite D1
  const handleSaveItem = async () => {
    if (!item?.id) return;
    setSavingItem(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      const payload = {
        item_name: title?.trim() || item.item_name,
        brand: brand?.trim() || null,
        athlete_person: athlete?.trim() || null,
        team_or_band: teamOrBand?.trim() || null,
        sport_genre: sportOrGenre?.trim() || null,
        authenticator: authenticator?.trim() || null,
        cert_number: certNumber?.trim() || null,
        inscription: inscription?.trim() || null,
        size: size?.trim() || null,
        is_wearable: Boolean(isWearable),
        is_custom_jersey: Boolean(isCustomJersey),
        is_pickguard_guitar: Boolean(isPickguardSignedGuitar),
        target_net: (targetNet !== '' && targetNet != null && !isNaN(Number(targetNet))) ? parseFloat(targetNet) : null,
        asin: asinInput?.trim() || null,
        item_condition: condition?.trim() || null,
        condition_notes: conditionSubheader?.trim() || null,
        condition_header: conditionHeader?.trim() || null,
        condition_subheader: conditionSubheader?.trim() || null,
        features: features?.trim() || null,
        specs: specs?.trim() || null,
        model: subtitle?.trim() || null,
        included_in_sale: includedInSale?.trim() || null,
        ai_middle_section: aiGeneratedMiddleSection?.trim() || null,
        notes: description?.trim() || item.notes || null
      };

      const res = await updateItem(item.id, payload);
      setSaveSuccess(true);
      const updatedItem = {
        ...item,
        ...payload,
        ...(res?.item || res || {})
      };
      if (onItemUpdated) {
        onItemUpdated(updatedItem);
      }
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      setSaveError(err.message || 'Failed to save item details.');
    } finally {
      setSavingItem(false);
    }
  };

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
    setConditionMsg(null);
    // Try to extract an eBay Item ID from asinInput or notes.
    // eBay item IDs are usually 12 digits.
    const searchStr = `${asinInput} ${item.notes || ''} ${item.invoice_ref || ''}`;
    const match = searchStr.match(/\b(\d{12})\b/);
    if (!match) {
      setConditionMsg({
        type: 'error',
        text: 'Could not detect a 12-digit eBay Item ID in the Amazon lookup field, notes, or invoice_ref.'
      });
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
      
      setConditionMsg({
        type: 'success',
        text: `Condition report generated from eBay item ${match[1]}.`
      });
    } catch (err) {
      setConditionMsg({
        type: 'error',
        text: `Failed to fetch eBay item details: ${err.message}`
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  // Handle Generating AI eBay Condition & Key Details Cards
  const handleGenerateAiDetails = async () => {
    setGeneratingAiDetails(true);
    setAiDetailsMsg(null);
    try {
      const cleanNotes = stripInternalTrackingNotes(description || item.notes || '');
      const res = await generateAiEbayDetails({
        title: title || item.item_name || '',
        brand: brand || '',
        productType: productType || '',
        condition: condition || '',
        conditionHeader: conditionHeader || '',
        conditionSubheader: conditionSubheader || '',
        notes: cleanNotes,
        specs: specs || '',
        features: features || ''
      });

      if (!res || res.success === false || !res.html) {
        throw new Error(res?.error || 'Failed to generate AI listing details.');
      }

      setAiGeneratedMiddleSection(stripInternalTrackingNotes(res.html));
      setAiDetailsMsg({
        type: 'success',
        text: 'AI Condition and Key Details cards generated successfully. Preview updated.'
      });
      if (format === 'text') {
        setFormat('html_preview');
      }
    } catch (err) {
      setAiDetailsMsg({
        type: 'error',
        text: err.message || 'Failed to generate AI listing details.'
      });
    } finally {
      setGeneratingAiDetails(false);
    }
  };

  // Reset AI Generated Content back to standard static template
  const handleResetAiDetails = () => {
    setAiGeneratedMiddleSection('');
    setAiDetailsMsg({
      type: 'info',
      text: 'Reverted to standard static listing template.'
    });
  };

  // Generate AI Platform-Compliant Listing Payload via Worker
  const handleGeneratePlatformAi = async (targetPlatform = platform) => {
    if (!item) return;
    setGeneratingPlatformAi(true);
    setPlatformAiMsg(null);
    try {
      const cleanNotes = stripInternalTrackingNotes(description || item.notes || '');
      const res = await generateAiPlatformListingApi({
        platform: targetPlatform,
        title: title || item.item_name || '',
        brand: brand || '',
        productType: productType || '',
        condition: condition || '',
        notes: cleanNotes,
        specs: parsedSpecs,
        features,
        athlete,
        teamOrBand,
        sportOrGenre,
        authenticator,
        certNumber,
        inscription,
        size,
        isWearable,
        isCustomJersey,
        isPickguardSignedGuitar,
        targetNet: targetNet ? Number(targetNet) : null,
        min_sell_price: item.min_sell_price,
        suggested_list_price: item.suggested_list_price,
        current_list_price: item.current_list_price
      });

      if (!res || res.success === false || !res.payload) {
        throw new Error(res?.error || `Failed to generate ${targetPlatform} AI payload.`);
      }

      setAiPlatformPayloads(prev => ({
        ...prev,
        [targetPlatform]: {
          payload: res.payload,
          validation: res.validation,
          rules_version: res.rules_version
        }
      }));
      setPlatformAiMsg({
        type: 'success',
        text: `AI optimized ${getPlatformRules(targetPlatform).name} listing JSON generated and validated.`
      });
    } catch (err) {
      setPlatformAiMsg({
        type: 'error',
        text: err.message || `Failed to generate AI listing payload for ${targetPlatform}.`
      });
    } finally {
      setGeneratingPlatformAi(false);
    }
  };

  const handleResetPlatformAi = (targetPlatform = platform) => {
    setAiPlatformPayloads(prev => {
      const next = { ...prev };
      delete next[targetPlatform];
      return next;
    });
    setPlatformAiMsg({
      type: 'info',
      text: `Reverted ${getPlatformRules(targetPlatform).name} to live rule-engine defaults.`
    });
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
      enforcePlatformRules: true,
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
      returnPolicy,
      aiGeneratedMiddleSection,
      athlete,
      teamOrBand,
      sportOrGenre,
      authenticator,
      certNumber,
      inscription,
      size,
      isWearable,
      isCustomJersey,
      isPickguardSignedGuitar,
      targetNet: targetNet ? Number(targetNet) : undefined
    };
    const ebay = generateEbayCopy(item, options);
    const facebook = generateFacebookCopy(item, options);
    const whatnot = generateWhatnotCopy(item, options);
    const mercari = generateMercariCopy(item, options);
    const reverb = generateReverbCopy(item, options);

    return { ebay, facebook, whatnot, mercari, reverb };
  }, [
    item, title, brand, productType, subtitle, conditionHeader, conditionSubheader,
    condition, features, parsedSpecs, parsedCompatibility, description, includedInSale,
    shippingPolicy, returnPolicy, aiGeneratedMiddleSection, athlete, teamOrBand,
    sportOrGenre, authenticator, certNumber, inscription, size, isWearable,
    isCustomJersey, isPickguardSignedGuitar, targetNet
  ]);

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField('');
    }, 2000);
  };

  if (!isOpen || !item) return null;

  const mergeAiOverride = (key, fallbackObj) => {
    const base = fallbackObj || {};
    const aiOverride = aiPlatformPayloads[key];
    if (!aiOverride || !aiOverride.payload) return base;
    const p = aiOverride.payload;
    return {
      ...base,
      title: p.title || base.title,
      price: p.pricing_guidance?.suggested_list_price ? `$${p.pricing_guidance.suggested_list_price}` : base.price,
      htmlBody: p.description_html || base.htmlBody,
      insertHtml: p.insert_html || base.insertHtml,
      textBody: p.description_plain_text || base.textBody,
      notes: p.description_plain_text || base.notes,
      description: p.description_plain_text || base.description,
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.join(' ') : base.hashtags,
      payload: p,
      validation: aiOverride.validation || base.validation,
      isAiOptimized: true
    };
  };

  const curEbay = mergeAiOverride('ebay', generated.ebay);
  const curFacebook = mergeAiOverride('facebook', generated.facebook);
  const curWhatnot = mergeAiOverride('whatnot', generated.whatnot);
  const curMercari = mergeAiOverride('mercari', generated.mercari);
  const curReverb = mergeAiOverride('reverb', generated.reverb);
  const platformMap = {
    ebay: curEbay,
    facebook: curFacebook,
    mercari: curMercari,
    whatnot: curWhatnot,
    reverb: curReverb
  };
  const activePlatformData = platformMap[platform] || curEbay;
  const activePlatformRules = getPlatformRules(platform);
  const activePayload = activePlatformData.payload || {};
  const activeValidation = activePlatformData.validation || { passed: true, checks: [], errors: [], warnings: [] };
  const activeTitleUtf16 = computeUtf16Length(activePlatformData.title || '');

  const handlePublishToEbay = async () => {
    if (!item?.id) return;
    setPublishingEbay(true);
    setPublishResult(null);

    try {
      let middleSection = aiGeneratedMiddleSection;
      if (!middleSection) {
        try {
          const aiRes = await generateAiEbayDetails({
            title: title || item.item_name,
            brand,
            productType,
            condition,
            conditionHeader,
            conditionSubheader,
            notes: description,
            specs: parsedSpecs,
            features
          });
          if (aiRes?.html) {
            middleSection = aiRes.html;
            setAiGeneratedMiddleSection(aiRes.html);
          }
        } catch (aiErr) {
          console.warn('[ListingCopyModal] AI pre-generation notice:', aiErr.message || aiErr);
        }
      }

      const res = await createEbayListingApi({
        item_id: item.id,
        title: curEbay.title || title || item.item_name,
        description_html: curEbay.htmlBody,
        price: item.current_list_price || item.suggested_list_price || item.min_sell_price,
        use_ai: Boolean(middleSection),
        shipping_cost: item.buyer_shipping_cost || 0,
        free_shipping: item.buyer_shipping_cost === 0
      });

      if (res?.success) {
        setPublishResult({
          success: true,
          action: res.action || 'created',
          listing_id: res.listing_id,
          ebay_url: res.ebay_url,
          warning: res.warning
        });
        if (onListingCreated) {
          onListingCreated(res.item || { ...item, ebay_listing_id: res.listing_id, status: 'Listed' });
        }
      } else {
        setPublishResult({
          success: false,
          error: res?.error || 'Failed to create listing on eBay'
        });
      }
    } catch (err) {
      setPublishResult({
        success: false,
        error: err.message || 'Error communicating with eBay API'
      });
    } finally {
      setPublishingEbay(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-4xl glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden my-auto animate-scale-up flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                Multi-Channel Listing Creator
                <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Enhanced
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md">{item.item_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleSaveItem}
              disabled={savingItem}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
              title="Save all changes to item in database"
            >
              {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saveSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{savingItem ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Item'}</span>
              <span className="sm:hidden">{savingItem ? '...' : saveSuccess ? 'Saved' : 'Save'}</span>
            </button>
            <button
              onClick={() => setShowEditor(!showEditor)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                showEditor
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showEditor ? 'Hide Details Form' : 'Edit Listing Details'}</span>
              <span className="sm:hidden">{showEditor ? 'Hide' : 'Details'}</span>
              {showEditor ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Save Feedback Banner */}
        {saveError && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1 font-medium">{saveError}</span>
            <button type="button" onClick={() => setSaveError('')} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {saveSuccess && (
          <div className="mx-4 mt-2 p-2 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="flex-1 font-medium">Item details, guardrails, and specifications successfully saved to database!</span>
          </div>
        )}

        {/* Scrollable Container */}
        <div className="overflow-y-auto flex-1 p-3.5 sm:p-6 space-y-4 sm:space-y-6">
          {/* Collapsible Item Details / Amazon Lookup Form */}
          {showEditor && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 space-y-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Item Details &amp; Specifications
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  Fill in specifics to generate professional listing copy
                </span>
              </div>

              {/* De-emphasized Collapsible Amazon Product Lookup & Smart Assist */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                <div
                  onClick={() => setShowAmazonAssist(!showAmazonAssist)}
                  className="flex items-center justify-between p-2.5 sm:px-3.5 bg-slate-950/70 hover:bg-slate-900/60 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-300 truncate">
                      Amazon Product Lookup &amp; Smart Assist
                    </span>
                    {asinInput.trim() && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                        ASIN: {asinInput.trim()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {asinInput.trim() && (
                      <a
                        href={asinInput.startsWith('http') ? asinInput : `https://www.amazon.com/dp/${asinInput.trim()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 transition-colors"
                      >
                        <span>Amazon ↗</span>
                      </a>
                    )}
                    <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                      {showAmazonAssist ? (
                        <>
                          <span className="hidden sm:inline">Collapse</span>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline text-slate-500">Expand</span>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {showAmazonAssist && (
                  <div className="p-3.5 border-t border-slate-800/80 space-y-2.5 bg-slate-950/70 animate-in fade-in-0 duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Fetch specs, features and bullets using an ASIN, Order ID, or direct URL.
                      </span>
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

                    <div className="flex flex-col sm:flex-row gap-2">
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
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shrink-0 shadow-md shadow-amber-500/10 cursor-pointer"
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
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-blue-400 hover:bg-blue-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
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
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleGenerateAiDetails}
                        disabled={generatingAiDetails}
                        className="text-[10px] text-amber-300 hover:text-amber-200 font-bold flex items-center gap-1 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 disabled:opacity-50"
                        title="Generate AI Condition & Details Cards"
                      >
                        {generatingAiDetails ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>AI Condition &amp; Details</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAutoGenerateCondition}
                        disabled={generatingReport}
                        className="text-[10px] text-slate-400 hover:text-slate-300 font-bold flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 disabled:opacity-50"
                        title="Auto-Gen from 12-digit eBay Item ID"
                      >
                        {generatingReport ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        <span>eBay Item Report</span>
                      </button>
                    </div>
                  </div>
                  {conditionMsg && (
                    <div className={`text-[10px] p-2 rounded-lg border ${
                      conditionMsg.type === 'error'
                        ? 'bg-red-950/60 border-red-500/40 text-red-300'
                        : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    }`}>
                      {conditionMsg.text}
                    </div>
                  )}
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

                {/* Memorabilia, Authentication & Platform Rule Guards */}
                <div className="md:col-span-2 p-3.5 rounded-xl bg-slate-900/70 border border-amber-500/25 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      Memorabilia, Sizing &amp; Platform Guardrails
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Feeds all 5 platform rule engines (80-char UTF-16 budget, Size token, COA check, Pricing math)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Athlete / Artist / Signer
                      </label>
                      <input
                        type="text"
                        value={athlete}
                        onChange={e => setAthlete(e.target.value)}
                        placeholder="e.g. Brock Bowers, Taylor Swift"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Team / Band / Franchise
                      </label>
                      <input
                        type="text"
                        value={teamOrBand}
                        onChange={e => setTeamOrBand(e.target.value)}
                        placeholder="e.g. Georgia Bulldogs"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Authenticator (COA)
                      </label>
                      <input
                        type="text"
                        value={authenticator}
                        onChange={e => setAuthenticator(e.target.value)}
                        placeholder="e.g. JSA, PSA/DNA, Beckett, SWAU"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Cert / Hologram #
                      </label>
                      <input
                        type="text"
                        value={certNumber}
                        onChange={e => setCertNumber(e.target.value)}
                        placeholder="e.g. AB12345"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Sport / Music Genre
                      </label>
                      <input
                        type="text"
                        value={sportOrGenre}
                        onChange={e => setSportOrGenre(e.target.value)}
                        placeholder="e.g. Football, Country Guitar"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Inscription (Exact)
                      </label>
                      <input
                        type="text"
                        value={inscription}
                        onChange={e => setInscription(e.target.value)}
                        placeholder="e.g. Go Dawgs, HOF 20"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Wearable Size (XL, 52...)
                      </label>
                      <input
                        type="text"
                        value={size}
                        onChange={e => setSize(e.target.value)}
                        placeholder="Apparel only (e.g. XL, 52)"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Target Net Payout ($)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={targetNet}
                        onChange={e => setTargetNet(e.target.value)}
                        placeholder="e.g. 200"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono tabular-nums focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-300">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isWearable}
                        onChange={e => setIsWearable(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                      />
                      <span>Wearable Apparel / Jersey (injects standalone Size token)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isCustomJersey}
                        onChange={e => setIsCustomJersey(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                      />
                      <span>Custom Stitched Jersey (strips Nike/NFL/OEM spoofing)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPickguardSignedGuitar}
                        onChange={e => setIsPickguardSignedGuitar(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                      />
                      <span>Signed Pickguard Display Guitar (strips Fender/Gibson spoofing)</span>
                    </label>
                  </div>
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

                {/* Save Details Row */}
                <div className="md:col-span-2 pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    Saves all attributes, guardrails, notes, and specs to this item in the database.
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveItem}
                    disabled={savingItem}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saveSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{savingItem ? 'Saving Changes...' : saveSuccess ? 'Saved to Database!' : 'Save Item Details'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Platform Selection Tabs (Amber Tactical 5-Platform Switcher) */}
          <div className="flex border-b border-slate-800 bg-slate-950/60 pt-2 gap-2 overflow-x-auto rounded-t-xl px-2">
            {SUPPORTED_PLATFORMS.map(tabId => {
              const ruleSpec = PLATFORM_RULES_REGISTRY[tabId];
              const tabData = platformMap[tabId] || {};
              const tabChars = computeUtf16Length(tabData.title || '');
              const tabPassed = tabData.validation ? tabData.validation.passed : true;
              const isSelected = platform === tabId;
              return (
                <button
                  key={tabId}
                  onClick={() => setPlatform(tabId)}
                  className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                    isSelected
                      ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${tabPassed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <span>{ruleSpec.shortLabel}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                    tabChars > 80
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : isSelected
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}>
                    {tabChars}/80
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Platform Intelligence Bar + Pre-Publish Validation Gate */}
          <div className="glass-card rounded-xl border border-amber-500/25 bg-slate-900/75 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-amber-300">
                    {activePlatformRules.name} Rules Engine
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums bg-slate-950 text-slate-300 border border-slate-800">
                    UTF-16 Title: {activeTitleUtf16}/{activePlatformRules.titleMaxUtf16} (Target {activePlatformRules.titleTargetRange})
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border ${
                    activeValidation.passed
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  }`}>
                    {activeValidation.passed ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                    <span>{activeValidation.passed ? 'Pre-Publish Gate Passed' : `${activeValidation.errors.length} Gate Violation(s)`}</span>
                  </span>
                  {activePlatformData.isAiOptimized && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      AI Schema Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  {activePlatformRules.tagline} | Fee Math: <span className="text-slate-300 font-mono">{activePlatformRules.feeFormulaLabel}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activePlatformData.isAiOptimized && (
                  <button
                    type="button"
                    onClick={() => handleResetPlatformAi(platform)}
                    disabled={generatingPlatformAi}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Rule Engine</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleGeneratePlatformAi(platform)}
                  disabled={generatingPlatformAi}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-amber-500/15"
                >
                  {generatingPlatformAi ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                      <span>Optimizing {activePlatformRules.name}...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                      <span>AI Optimize {activePlatformRules.name} JSON</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(activePayload, null, 2), `${platform}_json`)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1"
                >
                  {copiedField === `${platform}_json` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedField === `${platform}_json` ? 'JSON Copied!' : 'Copy JSON'}</span>
                </button>
              </div>
            </div>

            {platformAiMsg && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                platformAiMsg.type === 'success'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                  : platformAiMsg.type === 'info'
                    ? 'bg-blue-950/40 text-blue-300 border-blue-800'
                    : 'bg-rose-950/40 text-rose-300 border-rose-800'
              }`}>
                {platformAiMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span className="flex-1">{platformAiMsg.text}</span>
                <button
                  type="button"
                  onClick={() => setPlatformAiMsg(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-1"
                >
                  x
                </button>
              </div>
            )}

            {/* Pricing Math & Photo Order Strip */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-amber-400" />
                  Fee-Adjusted Pricing Guidance
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                  {activePayload.pricing_guidance && Object.entries(activePayload.pricing_guidance).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1">
                      <span className="text-slate-500">{k.replace(/_/g, ' ')}:</span>
                      <span className="text-emerald-400 font-bold">
                        {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : `$${v}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Camera className="w-3 h-3 text-amber-400" />
                  Recommended 4-Photo Sequence
                </div>
                <div className="text-[11px] text-slate-300 leading-snug">
                  {(activePayload.recommended_photo_order || activePlatformRules.photoOrder || []).map((step, i) => (
                    <span key={step} className="mr-2 inline-block">
                      <span className="text-amber-400 font-bold font-mono">{i + 1}.</span> {step}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Pre-Publish Checks */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(activeValidation.checks || []).map(chk => (
                <span
                  key={chk.id}
                  title={chk.detail}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 ${
                    chk.passed
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                      : 'bg-rose-950/60 text-rose-300 border-rose-500/50 font-bold'
                  }`}
                >
                  {chk.passed ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                  <span>{chk.label}: {chk.detail}</span>
                </span>
              ))}
            </div>
          </div>

          {/* eBay Tab Content */}
          {platform === 'ebay' && (
            <div className="space-y-4">
              {/* 1-Click Publish Directly to eBay Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-slate-900/90 to-amber-950/30 border border-blue-500/30 shadow-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-blue-400" />
                        1-Click eBay Listing Creator
                      </span>
                      {item.ebay_listing_id ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Listed #{item.ebay_listing_id}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Ready to List
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Creates the full live listing on eBay with Gemini description, category, specs, and policies. Just add photos on eBay!
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.ebay_listing_id && (
                      <a
                        href={`https://www.ebay.com/itm/${item.ebay_listing_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-cyan-300 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-500/30 transition-colors flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View on eBay.com</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handlePublishToEbay}
                      disabled={publishingEbay}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-blue-400 via-amber-300 to-amber-400 hover:from-blue-300 hover:to-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-blue-500/10 cursor-pointer"
                    >
                      {publishingEbay ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Creating Listing on eBay...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-slate-950" />
                          <span>{item.ebay_listing_id ? 'Re-Publish / Update on eBay' : 'Create Listing on eBay'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {publishResult && (
                  <div className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                    publishResult.success
                      ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/40'
                      : 'bg-rose-950/60 text-rose-200 border-rose-500/40'
                  }`}>
                    <div className="flex items-center gap-2">
                      {publishResult.success ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      )}
                      <span>
                        {publishResult.success
                          ? `Successfully ${publishResult.action === 'revised' ? 'updated' : 'created'} eBay listing #${publishResult.listing_id}!${publishResult.warning ? ` (${publishResult.warning})` : ''}`
                          : (publishResult.error || 'Failed to create listing on eBay')}
                      </span>
                    </div>
                    {publishResult.success && publishResult.ebay_url && (
                      <a
                        href={publishResult.ebay_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>View Live Listing ↗</span>
                      </a>
                    )}
                  </div>
                )}
              </div>

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

              {/* Gemini AI Listing Cards Enhancer */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-amber-500/5 border border-amber-500/30 space-y-2.5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">
                          Gemini AI Listing Enhancer
                        </span>
                        {aiGeneratedMiddleSection ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            AI Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            Standard Template
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Dynamically generate tailored Condition and Key Details cards based on item metadata.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {aiGeneratedMiddleSection && (
                      <button
                        type="button"
                        onClick={handleResetAiDetails}
                        disabled={generatingAiDetails}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset to Static</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleGenerateAiDetails}
                      disabled={generatingAiDetails}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/15"
                    >
                      {generatingAiDetails ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                          <span>Generating AI Cards...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                          <span>{aiGeneratedMiddleSection ? 'Regenerate AI Details' : 'Auto-Generate AI Description'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {aiDetailsMsg && (
                  <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                    aiDetailsMsg.type === 'success'
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                      : aiDetailsMsg.type === 'info'
                        ? 'bg-blue-950/40 text-blue-300 border-blue-800'
                        : 'bg-rose-950/40 text-rose-300 border-rose-800'
                  }`}>
                    {aiDetailsMsg.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="flex-1">{aiDetailsMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setAiDetailsMsg(null)}
                      className="text-slate-400 hover:text-slate-200 text-xs px-1"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              {/* Format Toggle for Description */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(format === 'text' ? curEbay.textBody : curEbay.htmlBody, 'ebay_desc')}
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
                        <span>Copy {format === 'text' ? 'Text' : 'Full HTML'}</span>
                      </>
                    )}
                  </button>
                  {format !== 'text' && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(curEbay.insertHtml || curEbay.htmlBody, 'ebay_insert')}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center gap-1"
                      title="Copy only the inner listing content cards without the outer banner and footer strip"
                    >
                      {copiedField === 'ebay_insert' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Insert Only</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
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
                  dangerouslySetInnerHTML={{ __html: sanitizeListingHtml(curEbay.htmlBody) }}
                />
              )}

              {format === 'html_code' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-300/80 whitespace-pre-wrap select-all max-h-80 overflow-y-auto">
                  {curEbay.htmlBody}
                </div>
              )}
            </div>
          )}

          {/* Facebook Marketplace / Local Pickup Tab Content */}
          {platform === 'facebook' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <span>
                    {curFacebook.payload?.logistics?.risk_tier || 'Facebook Marketplace'} Meetup:{' '}
                    {curFacebook.payload?.logistics?.meetup_location || 'Local Police Precinct / QT Safe Place'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-300">
                  Local Payments: {(curFacebook.payload?.logistics?.accepted_local_payments || ['Cash', 'Apple Pay']).join(' / ')}
                  {' · '}Brand: {curFacebook.payload?.brand === null ? 'null (Custom/Unbranded Guard)' : (curFacebook.payload?.brand || 'N/A')}
                </span>
              </div>

              {/* Primary + 14-Day Relist Titles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Primary Marketplace Title ({computeUtf16Length(curFacebook.title || '')}/80 UTF-16)
                    </label>
                    <button
                      onClick={() => copyToClipboard(curFacebook.title, 'fb_title')}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                    >
                      {copiedField === 'fb_title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'fb_title' ? 'Copied!' : 'Copy Title'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 select-all">
                    {curFacebook.title}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      14-Day Relist Title ({computeUtf16Length(curFacebook.payload?.relist_title || '')}/80 UTF-16)
                    </label>
                    <button
                      onClick={() => copyToClipboard(curFacebook.payload?.relist_title || curFacebook.title, 'fb_relist_title')}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                    >
                      {copiedField === 'fb_relist_title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'fb_relist_title' ? 'Copied!' : 'Copy Relist'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-amber-200/90 select-all">
                    {curFacebook.payload?.relist_title || curFacebook.title}
                  </div>
                </div>
              </div>

              {/* Asking Price & Metadata Strip */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Suggested List Price (+15% Buffer)
                    </label>
                    <button
                      onClick={() => copyToClipboard(curFacebook.price, 'fb_price')}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                    >
                      {copiedField === 'fb_price' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'fb_price' ? 'Copied!' : 'Copy Price'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono font-bold text-emerald-400 tabular-nums select-all">
                    {curFacebook.price} (Min Floor: ${curFacebook.payload?.pricing_guidance?.minimum_acceptable_price || '--'})
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Category &amp; Condition
                    </label>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300">
                    {curFacebook.payload?.marketplace_category || 'Collectibles'} | {curFacebook.payload?.condition || 'New'}
                  </div>
                </div>
              </div>

              {/* Product Tags */}
              {Array.isArray(curFacebook.payload?.product_tags) && curFacebook.payload.product_tags.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-amber-400" />
                      Product Tags ({curFacebook.payload.product_tags.length} tags)
                    </label>
                    <button
                      onClick={() => copyToClipboard(curFacebook.payload.product_tags.join(', '), 'fb_tags')}
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                    >
                      {copiedField === 'fb_tags' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'fb_tags' ? 'Copied!' : 'Copy Tags'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap gap-1.5">
                    {curFacebook.payload.product_tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Description Section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Plain-Text Marketplace Description &amp; Safe Meetup Terms
                  </label>
                  <button
                    onClick={() => copyToClipboard(curFacebook.textBody, 'fb_desc')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'fb_desc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'fb_desc' ? 'Copied!' : 'Copy Description'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all max-h-80 overflow-y-auto leading-relaxed">
                  {curFacebook.textBody}
                </div>
              </div>
            </div>
          )}

          {/* Whatnot Tab Content */}
          {platform === 'whatnot' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <Package className="w-4 h-4 text-amber-400" />
                  <span>
                    {curWhatnot.payload?.listing_format_recommendation || 'Live Auction / BIN'} |{' '}
                    Weight Tier: {curWhatnot.payload?.shipping_profile?.estimated_packed_weight || '1-2 lbs'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-300">
                  {curWhatnot.payload?.whatnot_category || 'Sports Memorabilia > Autographed Memorabilia'}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Live-Show Scannable Title ({computeUtf16Length(curWhatnot.title || '')}/80 UTF-16)
                  </label>
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Plain-Text Show Notes &amp; Packaging Guarantee
                  </label>
                  <button
                    onClick={() => copyToClipboard(curWhatnot.notes, 'wn_notes')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'wn_notes' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'wn_notes' ? 'Copied!' : 'Copy Stream Notes'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all max-h-64 overflow-y-auto leading-relaxed">
                  {curWhatnot.notes}
                </div>
              </div>
            </div>
          )}

          {/* Mercari Tab Content */}
          {platform === 'mercari' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <Tag className="w-4 h-4 text-amber-400" />
                  <span>
                    Brand Field: {curMercari.payload?.brand || 'No Brand'} | Condition: {curMercari.payload?.condition || 'New'}
                  </span>
                </div>
                <span className={`text-[11px] font-mono tabular-nums ${(curMercari.description || '').length > 1000 ? 'text-rose-400 font-bold' : 'text-emerald-300'}`}>
                  Plain Text Length: {(curMercari.description || '').length}/1000 chars | Zero URLs
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mercari Title ({computeUtf16Length(curMercari.title || '')}/80 UTF-16)
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Plain-Text Description + {curMercari.payload?.hashtags?.length || 0} Hashtags (Max 1000 Chars)
                  </label>
                  <button
                    onClick={() => copyToClipboard(curMercari.description, 'mercari_desc')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'mercari_desc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'mercari_desc' ? 'Copied!' : 'Copy Description'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all max-h-64 overflow-y-auto leading-relaxed">
                  {curMercari.description}
                </div>
              </div>
            </div>
          )}

          {/* Reverb Tab Content */}
          {platform === 'reverb' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <Music className="w-4 h-4 text-amber-400" />
                  <span>
                    Brand: {curReverb.payload?.brand || 'Unbranded'} | Model: {curReverb.payload?.model || 'Custom Display Acoustic Guitar'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-300">
                  Condition: {curReverb.payload?.condition || 'Mint'} | Handling: {curReverb.payload?.shipping_profile?.handling_days || 3} business days
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Reverb SEO Title ({computeUtf16Length(curReverb.title || '')}/80 UTF-16)
                  </label>
                  <button
                    onClick={() => copyToClipboard(curReverb.title, 'reverb_title')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'reverb_title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'reverb_title' ? 'Copied!' : 'Copy Title'}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 select-all">
                  {curReverb.title}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300">
                <span className="text-amber-400 font-bold uppercase tracking-wider mr-2">Shipping Profile:</span>
                {curReverb.payload?.shipping_profile?.box_dimensions_note}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setFormat('html_preview')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                      format !== 'html_code' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
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
                  onClick={() => copyToClipboard(curReverb.htmlBody || '', 'reverb_html')}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-all flex items-center gap-1"
                >
                  {copiedField === 'reverb_html' ? <Check className="w-3.5 h-3.5 text-slate-950" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedField === 'reverb_html' ? 'Copied!' : 'Copy Reverb HTML'}</span>
                </button>
              </div>

              {format === 'html_code' ? (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-300/80 whitespace-pre-wrap select-all max-h-80 overflow-y-auto">
                  {curReverb.htmlBody}
                </div>
              ) : (
                <div
                  className="p-4 rounded-xl bg-white text-slate-900 border border-slate-800 max-h-80 overflow-y-auto shadow-inner"
                  dangerouslySetInnerHTML={{ __html: sanitizeListingHtml(curReverb.htmlBody || '') }}
                />
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-800 bg-slate-900/50 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://www.ebay.com/sl/prelist/suggest"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
            >
              eBay Sell Hub ↗
            </a>
            <a
              href="https://www.facebook.com/marketplace/create/item"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
            >
              FB Marketplace ↗
            </a>
            <a
              href="https://www.mercari.com/sell/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
            >
              Mercari ↗
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
              href="https://reverb.com/sell"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium"
            >
              Reverb ↗
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveItem}
              disabled={savingItem}
              className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
              title="Save all changes to item in database"
            >
              {savingItem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saveSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savingItem ? 'Saving Changes...' : saveSuccess ? 'Saved to Item!' : 'Save Item Details'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

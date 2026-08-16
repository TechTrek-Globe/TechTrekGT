import React, { useState, useMemo } from 'react';
import {
  X, Copy, Check, Sparkles, FileCode,
  FileText, Eye
} from 'lucide-react';
import {
  generateEbayCopy,
  generateWhatnotCopy,
  generateMercariCopy,
  generateSocialCopy
} from '../utils/listingCopyGenerator';

export function ListingCopyModal({ isOpen, onClose, item }) {
  const [platform, setPlatform] = useState('ebay');
  const [format, setFormat] = useState('text'); // 'text' | 'html_preview' | 'html_code'
  const [copiedField, setCopiedField] = useState('');
  const [condition, setCondition] = useState('Brand New / Excellent');
  const [shippingPolicy, setShippingPolicy] = useState('Ships securely in bubble mailer / box with tracking within 1 business day.');
  const [returnPolicy, setReturnPolicy] = useState('30-Day Returns accepted if item is in original unaltered condition.');

  const generated = useMemo(() => {
    if (!item) return {};
    const ebay = generateEbayCopy(item, { condition, shippingPolicy, returnPolicy });
    const whatnot = generateWhatnotCopy(item);
    const mercari = generateMercariCopy(item);
    const social = generateSocialCopy(item);

    return { ebay, whatnot, mercari, social };
  }, [item, condition, shippingPolicy, returnPolicy]);

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
      <div className="w-full max-w-2xl glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden my-auto animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                Multi-Channel Listing Copywriter
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  AI Formatted
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate max-w-md">{item.item_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Selection Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-6 pt-2 gap-2 overflow-x-auto">
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

        {/* Modal Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
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
                      <span>Copy {format === 'text' ? 'Text' : 'HTML'} Description</span>
                    </>
                  )}
                </button>
              </div>

              {/* Description Body Display */}
              {format === 'text' && (
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all max-h-60 overflow-y-auto leading-relaxed">
                  {curEbay.textBody}
                </div>
              )}

              {format === 'html_preview' && (
                <div
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 max-h-72 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: curEbay.htmlBody }}
                />
              )}

              {format === 'html_code' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-amber-300/80 whitespace-pre-wrap select-all max-h-60 overflow-y-auto">
                  {curEbay.htmlBody}
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Item Notes / Highlights</label>
                  <button
                    onClick={() => copyToClipboard(curWhatnot.notes, 'wn_notes')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'wn_notes' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'wn_notes' ? 'Copied!' : 'Copy Notes'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all">
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mercari Title</label>
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description & Tags</label>
                  <button
                    onClick={() => copyToClipboard(curMercari.description, 'mercari_desc')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold"
                  >
                    {copiedField === 'mercari_desc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === 'mercari_desc' ? 'Copied!' : 'Copy Description'}</span>
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap select-all">
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

        {/* Footer with Marketplace Links */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900/50 text-xs">
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

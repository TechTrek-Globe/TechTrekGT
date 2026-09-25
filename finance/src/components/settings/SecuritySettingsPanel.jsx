// @ts-nocheck
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Save,
  Mail,
  KeyRound,
  Loader2
} from 'lucide-react';
import { PRESET_SECURITY_QUESTIONS } from '../AuthModal';

export function SecuritySettingsPanel() {
  const { user, updateProfile, confirmEmailChange } = useAuth();
  const [profileForm, setProfileForm] = useState(() => ({
    name: user?.name || '',
    email: user?.email || '',
    securityQuestion: user?.securityQuestion || PRESET_SECURITY_QUESTIONS[0],
    securityAnswer: '',
    currentPassword: '',
    newPassword: ''
  }));

  const [profileStatus, setProfileStatus] = useState(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(null);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileStatus(null);
    setIsUpdatingProfile(true);
    try {
      const res = await updateProfile(profileForm);
      setProfileStatus({ type: 'success', message: res.message || 'Profile and security settings updated successfully!' });
      setProfileForm(prev => ({ ...prev, securityAnswer: '', currentPassword: '', newPassword: '' }));
    } catch (err) {
      setProfileStatus({ type: 'error', message: err.message || 'Failed to update profile.' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleConfirmEmail = async (e) => {
    e.preventDefault();
    if (!confirmCode.trim()) return;
    setConfirmStatus(null);
    setIsConfirming(true);
    try {
      const res = await confirmEmailChange(confirmCode.trim());
      setConfirmStatus({ type: 'success', message: res.message || 'Email address confirmed and updated successfully!' });
      if (res.user?.email) {
        setProfileForm(prev => ({ ...prev, email: res.user.email }));
      }
      setConfirmCode('');
    } catch (err) {
      setConfirmStatus({ type: 'error', message: err.message || 'Failed to confirm email change.' });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto animate-fade-in">
      <div className="flex items-center space-x-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-100">Account Security &amp; Profile</h3>
          <p className="text-xs text-slate-400">Update your email, name, security question, and password</p>
        </div>
      </div>

      {user?.pendingEmail && (
        <div className="p-4 bg-amber-950/60 border border-amber-800/80 rounded-2xl text-amber-200 text-xs space-y-3">
          <div className="flex items-center space-x-2 font-bold text-amber-100">
            <Mail className="w-4 h-4 text-amber-400" />
            <span>Pending Email Change: {user.pendingEmail}</span>
          </div>
          <p className="text-amber-300">
            A confirmation code was sent to <strong className="text-amber-100">{user.pendingEmail}</strong>. Enter the 8-digit code below to complete the update:
          </p>

          {confirmStatus && (
            <div className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
              confirmStatus.type === 'success' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-red-950/80 border border-red-800 text-red-300'
            }`}>
              {confirmStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              <span>{confirmStatus.message}</span>
            </div>
          )}

          <form onSubmit={handleConfirmEmail} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              required
              maxLength={8}
              value={confirmCode}
              onChange={e => setConfirmCode(e.target.value.replace(/\D/g, ''))}
              placeholder="8-digit code"
              className="w-36 px-3 py-1.5 text-xs bg-slate-950 border border-amber-700/60 rounded-xl text-slate-100 font-mono tracking-widest text-center focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={isConfirming || confirmCode.length !== 8}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-xl shadow transition-colors flex items-center space-x-1 cursor-pointer"
            >
              {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              <span>Confirm Change</span>
            </button>
          </form>
        </div>
      )}

      {user && !user.hasSecurityQuestion && (
        <div className="p-4 bg-amber-950/60 border border-amber-800/80 rounded-2xl text-amber-300 text-xs space-y-1">
          <div className="flex items-center space-x-2 font-bold text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Security Question Required</span>
          </div>
          <p>Please set up a security question and answer below to enable account recovery in case you forget your password.</p>
        </div>
      )}

      {profileStatus && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 ${
          profileStatus.type === 'success' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-red-950/80 border border-red-800 text-red-300'
        }`}>
          {profileStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          <span>{profileStatus.message}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-4 glass-card border border-slate-800 rounded-2xl p-5">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">Profile Information</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={profileForm.name}
              onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={profileForm.email}
              onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 pt-2">Security Question &amp; Answer</h4>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Security Question</label>
          <select
            value={profileForm.securityQuestion}
            onChange={e => setProfileForm({ ...profileForm, securityQuestion: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {PRESET_SECURITY_QUESTIONS.map((q, idx) => (
              <option key={idx} value={q}>{q}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">New Security Answer (Leave blank to keep current)</label>
          <input
            type="text"
            placeholder="Enter secret answer"
            value={profileForm.securityAnswer}
            onChange={e => setProfileForm({ ...profileForm, securityAnswer: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 pt-2">Change Password (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Current Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={profileForm.currentPassword}
              onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">New Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={profileForm.newPassword}
              onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="pt-3 flex justify-end">
          <button
            type="submit"
            disabled={isUpdatingProfile}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

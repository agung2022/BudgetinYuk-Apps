/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, signIn, logOut, isMock } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDoc,
  getDocs,
  deleteDoc,
  collectionGroup,
  where
} from 'firebase/firestore';
import { 
  Plus, 
  LogOut, 
  LayoutDashboard, 
  Users, 
  Settings, 
  ChevronRight,
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  MoreVertical,
  Menu,
  X,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Group, UserProfile } from './types';

// Components
import Dashboard from './components/Dashboard';
import GroupView from './components/GroupView';
import CreateGroupModal from './components/CreateGroupModal';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [dataDeletedPopup, setDataDeletedPopup] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAccountChooser, setShowAccountChooser] = useState(false);
  const [useCustomAccount, setUseCustomAccount] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customEmailError, setCustomEmailError] = useState('');

  const mockAccounts = [
    {
      uid: 'agung_demo_uid',
      displayName: 'Agung Faizal',
      email: 'agungfaizal0603@gmail.com',
      photoURL: 'https://ui-avatars.com/api/?name=Agung+Faizal&background=6366f1&color=fff'
    },
    {
      uid: 'budi_demo_uid',
      displayName: 'Budi Santoso',
      email: 'budi.santoso@example.com',
      photoURL: 'https://ui-avatars.com/api/?name=Budi+Santoso&background=10b981&color=fff'
    },
    {
      uid: 'siti_demo_uid',
      displayName: 'Siti Aminah',
      email: 'siti.aminah@example.com',
      photoURL: 'https://ui-avatars.com/api/?name=Siti+Aminah&background=f59e0b&color=fff'
    }
  ];

  const handleSelectAccount = async (account: typeof mockAccounts[0]) => {
    localStorage.setItem('mock_firebase_user_pending', JSON.stringify(account));
    await signIn();
    setShowAccountChooser(false);
  };

  const handleCustomAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) {
      setCustomEmailError('Nama dan email wajib diisi.');
      return;
    }
    if (!customEmail.trim().includes('@')) {
      setCustomEmailError('Format email tidak valid.');
      return;
    }

    const customUid = 'user_' + Math.random().toString(36).substring(2, 11);
    const customUserObj = {
      uid: customUid,
      displayName: customName.trim(),
      email: customEmail.trim().toLowerCase(),
      photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(customName.trim())}&background=random&color=fff`
    };

    localStorage.setItem('mock_firebase_user_pending', JSON.stringify(customUserObj));
    await signIn();
    setShowAccountChooser(false);
    setUseCustomAccount(false);
    setCustomName('');
    setCustomEmail('');
    setCustomEmailError('');
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    (window as any).openCreateGroupModal = () => setIsCreateModalOpen(true);
    return () => {
      delete (window as any).openCreateGroupModal;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user has seen welcome popup
        const hasSeenWelcome = localStorage.getItem(`hasSeenWelcome_${currentUser.uid}`);
        if (!hasSeenWelcome) {
          setShowWelcomePopup(true);
        }

        // Ensure user profile exists
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          try {
            await setDoc(userRef, {
              uid: currentUser.uid,
              displayName: currentUser.displayName,
              email: currentUser.email,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
            });
          } catch (error) {
            console.error("Error creating user profile:", error);
          }
        }

        // Test connection
        try {
          const { getDocFromServer } = await import('firebase/firestore');
          await getDocFromServer(doc(db, 'users', currentUser.uid));
          console.log("Firestore connection successful");
        } catch (error) {
          if (error instanceof Error && error.message.includes('offline')) {
            console.error("Firestore connection failed: client is offline");
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }

    // Query groups where the user is a member using the memberIds array
    const groupsQuery = query(
      collection(db, 'groups'),
      where('memberIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
      console.log(`Groups snapshot received: ${snapshot.docs.length} groups`);
      setLastError(null);
      const fetchedGroups = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Group));
      setGroups(fetchedGroups);
    }, (error) => {
      console.error("Error fetching groups:", error);
      setLastError(error.message);
      if (error.message.includes('Missing or insufficient permissions')) {
        console.warn("Permission denied for groups query. Check firestore.rules.");
        return;
      }
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (selectedGroupId && !groups.find(g => g.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [groups, selectedGroupId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 p-4 text-center relative overflow-hidden transition-colors duration-300">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] bg-indigo-600/10 dark:bg-indigo-600/20 rounded-full blur-[120px]" />
          <div className="absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] bg-fuchsia-600/10 dark:bg-fuchsia-600/20 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-zinc-50/50 dark:bg-white/5 backdrop-blur-2xl p-8 sm:p-12 rounded-[48px] shadow-2xl border border-zinc-200 dark:border-white/10 relative z-10"
        >
          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-[32px] flex items-center justify-center mx-auto mb-8 sm:mb-10 shadow-2xl shadow-indigo-500/20">
            <Wallet className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-zinc-900 dark:text-white font-display">BudgetinYuk</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8 sm:mb-12 leading-relaxed text-base sm:text-lg">Cara mudah dan profesional untuk memantau pengeluaran, berbagi tagihan, dan mengelola anggaran bersama.</p>
          
          {lastError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-left text-xs text-red-600 dark:text-red-400">
              <p className="font-bold mb-1">Gagal Masuk:</p>
              <p>{lastError}</p>
              <button 
                onClick={() => setLastError(null)} 
                className="mt-2 text-[10px] underline hover:text-red-800 dark:hover:text-red-300 font-bold"
              >
                Clear Error
              </button>
            </div>
          )}

          <button
            onClick={() => {
              setLastError(null);
              if (isMock) {
                setShowAccountChooser(true);
              } else {
                signIn().catch((error) => {
                  console.error("Firebase Sign-In Error:", error);
                  setLastError(error.message || "Gagal masuk menggunakan Google.");
                });
              }
            }}
            className="w-full py-4 sm:py-5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all active:scale-[0.98] flex items-center justify-center gap-4 shadow-xl shadow-zinc-900/10 dark:shadow-white/10 text-base sm:text-lg outline-none focus:ring-4 focus:ring-indigo-500/40"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-6 h-6 bg-white rounded-full p-0.5" />
            Lanjutkan dengan Google
          </button>

          {typeof window !== 'undefined' && window.self !== window.top && !isMock && (
            <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl text-left text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
              <span className="font-bold block mb-1">⚠️ Integrasi Iframe Terdeteksi</span>
              Keamanan Google Chrome membatasi dialog pop-up akun Google saat aplikasi dibuka di dalam bingkai panel (iframe) AI Studio ini. 
              <br /><br />
              Silakan klik tombol <strong>"Open in new tab"</strong> (ikon anak panah keluar) di kanan atas jendela pratinjau ini untuk menggunakan real Google OAuth di tab penuh secara normal.
            </div>
          )}
        </motion.div>

        {/* Account Chooser / Simulasi Google Sign-In */}
        <AnimatePresence>
          {showAccountChooser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => {
                  setShowAccountChooser(false);
                  setUseCustomAccount(false);
                }}
                className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl p-6 text-left z-10"
              >
                <div className="flex items-center gap-2 mb-4">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" />
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Google Sign-In</span>
                </div>

                {!useCustomAccount ? (
                  <>
                    <h3 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1 font-display">Pilih akun</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-4">untuk melanjutkan ke <span className="font-semibold text-indigo-500">BudgetinYuk</span></p>

                    <div className="space-y-2 mb-4">
                      {mockAccounts.map((account) => (
                        <button
                          key={account.uid}
                          onClick={() => handleSelectAccount(account)}
                          className="w-full flex items-center gap-3 p-3 bg-zinc-50 hover:bg-indigo-50 dark:bg-white/5 dark:hover:bg-indigo-500/10 rounded-2xl transition-all border border-zinc-100 dark:border-white/5 text-left group"
                        >
                          <img src={account.photoURL} alt="" className="w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-700" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-zinc-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{account.displayName}</p>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{account.email}</p>
                          </div>
                        </button>
                      ))}

                      <button
                        onClick={() => setUseCustomAccount(true)}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-zinc-100/50 hover:bg-zinc-100 dark:bg-white/5 dark:hover:bg-white/10 rounded-2xl transition-all text-xs font-bold text-zinc-600 dark:text-zinc-300"
                      >
                        Gunakan akun kustom lain
                      </button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleCustomAccountSubmit} className="space-y-3">
                    <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white mb-1 font-display">Buat Akun Google Simulasi</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-3">Masukkan nama dan email kustom Anda untuk simulasi login.</p>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Nama Lengkap</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: Rian Hidayat"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Email</label>
                      <input
                        type="email"
                        required
                        placeholder="Contoh: rian@domain.com"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {customEmailError && (
                      <p className="text-[10px] font-bold text-red-500">{customEmailError}</p>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomAccount(false);
                          setCustomEmailError('');
                        }}
                        className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/15 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition-all"
                      >
                        Kembali
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        Keluar & Masuk
                      </button>
                    </div>
                  </form>
                )}

                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/5 text-[9px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                  <p className="font-semibold text-zinc-500 mb-1">Info Keamanan & Mode Simulasi:</p>
                  Aplikasi saat ini berjalan dalam mode <strong>simulasi terisolasi</strong>. Akun Google riil atau sandi Anda tidak akan diminta/disimpan, demi keamanan 100%. Memilih akun di atas akan menyimulasikan Google OAuth secara instan secara lokal.
                </div>

                {!useCustomAccount && (
                  <button
                    onClick={() => setShowAccountChooser(false)}
                    className="w-full mt-4 py-2.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition-all text-center"
                  >
                    Batal
                  </button>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-indigo-100 selection:text-indigo-900 relative overflow-hidden transition-colors duration-300">


      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-white/5 flex flex-col z-50 lg:z-10 transition-all duration-300 ease-in-out overflow-y-auto custom-scrollbar
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Vibrant background glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20">
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-600 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 -right-32 w-64 h-64 bg-fuchsia-600 rounded-full blur-[100px]" />
        </div>

        <div className="p-8 relative z-10 shrink-0">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">BudgetinYuk</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="space-y-1.5">
            <button 
              onClick={() => {
                setSelectedGroupId(null);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${!selectedGroupId ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-zinc-900/10 dark:shadow-white/10' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="font-bold">Dashboard</span>
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 relative z-10 custom-scrollbar min-h-[200px]">
          <div className="flex items-center justify-between px-4 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">Grup Anda</span>
            <button 
              onClick={() => {
                setIsCreateModalOpen(true);
                setIsSidebarOpen(false);
              }}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-colors text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group ${selectedGroupId === group.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${group.type === 'personal' ? 'bg-blue-400' : group.type === 'household' ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                  <span className="truncate text-sm font-medium">{group.name}</span>
                </div>
                {selectedGroupId === group.id && <ChevronRight className="w-4 h-4 opacity-70" />}
              </button>
            ))}
            {groups.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">Belum ada grup</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 mt-auto relative z-10 shrink-0">
          <div className="p-4 bg-zinc-50 dark:bg-white/5 rounded-2xl border border-zinc-200 dark:border-white/10 mb-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} alt="" className="w-10 h-10 rounded-xl shadow-sm border border-zinc-200 dark:border-white/10" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{user.displayName}</p>
                <p className="text-[10px] text-zinc-500 truncate font-mono">{user.email}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={logOut}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-300 font-bold text-sm"
            >
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
            <button 
              onClick={toggleTheme}
              className="p-3 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-all duration-300"
              title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-zinc-950 border-b border-white/5 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white font-display">BudgetinYuk</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        <AnimatePresence mode="wait">
          {!selectedGroupId ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="p-10 max-w-7xl mx-auto"
            >
              <Dashboard 
                user={user} 
                groups={groups} 
                onSelectGroup={(id) => {
                  setSelectedGroupId(id);
                  setIsSidebarOpen(false);
                }}
                theme={theme}
              />
            </motion.div>
          ) : (
            <motion.div
              key={selectedGroupId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="p-10 max-w-7xl mx-auto"
            >
              <GroupView 
                groupId={selectedGroupId} 
                user={user} 
                onBack={() => setSelectedGroupId(null)} 
                theme={theme}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <CreateGroupModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        user={user}
      />

      {/* Welcome Popup */}
      <AnimatePresence>
        {showWelcomePopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowWelcomePopup(false);
                if (user) {
                  localStorage.setItem(`hasSeenWelcome_${user.uid}`, 'true');
                }
              }}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[40px] shadow-2xl p-10 text-center"
            >
              <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                <LayoutDashboard className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4 font-display">Selamat Datang di BudgetinYuk!</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-10 leading-relaxed text-sm">
                BudgetinYuk adalah aplikasi pelacakan pengeluaran bersama dan manajemen anggaran fungsional yang andal.
                <br /><br />
                Catat pengeluaran kelompok Anda, kelola anggaran, undang anggota tim/keluarga/rekan kos secara instan, dan dapatkan analisis wawasan keuangan berbasis kecerdasan buatan (AI) yang disesuaikan!
              </p>
              <button
                onClick={() => {
                  setShowWelcomePopup(false);
                  if (user) {
                    localStorage.setItem(`hasSeenWelcome_${user.uid}`, 'true');
                  }
                }}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                Mulai Catat Sekarang
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

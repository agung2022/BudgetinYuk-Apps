import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Plus, 
  Users, 
  MoreVertical, 
  Trash2, 
  UserPlus,
  TrendingUp,
  PieChart as PieChartIcon,
  Calendar,
  Tag,
  CreditCard,
  BarChart3,
  Sparkles,
  Loader2,
  Pencil,
  X
} from 'lucide-react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  setDoc,
  addDoc, 
  deleteDoc, 
  serverTimestamp, 
  Timestamp,
  getDocs,
  where,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { Group, Expense, GroupMember, CATEGORIES, BudgetType } from '../types';
import { formatCurrency } from '../utils/format';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface GroupViewProps {
  groupId: string;
  user: User;
  onBack: () => void;
  theme: 'light' | 'dark';
}

export default function GroupView({ groupId, user, onBack, theme }: GroupViewProps) {
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Form states
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  
  // Settings states
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMaxBudget, setEditMaxBudget] = useState('');
  const [editBudgetType, setEditBudgetType] = useState<BudgetType>('monthly');

  // AI Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const analysisAbortController = useRef<AbortController | null>(null);

  // Stat details modal state
  const [selectedStatDetails, setSelectedStatDetails] = useState<{ title: string; amount: number; subtitle?: string } | null>(null);

  const statModalRef = useRef<HTMLDivElement>(null);
  const analysisModalRef = useRef<HTMLDivElement>(null);
  const deleteGroupModalRef = useRef<HTMLDivElement>(null);
  const deleteExpenseModalRef = useRef<HTMLDivElement>(null);

  const closeAnalysisModal = () => {
    setIsAnalysisModalOpen(false);
    if (analysisAbortController.current) {
      analysisAbortController.current.abort();
      analysisAbortController.current = null;
    }
    setIsAnalyzing(false);
    setAnalysisResult(null);
  };

  // Delete confirmation state
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [isDeleteGroupConfirmOpen, setIsDeleteGroupConfirmOpen] = useState(false);

  useEffect(() => {
    if (selectedStatDetails && statModalRef.current) {
      statModalRef.current.focus();
    }
  }, [selectedStatDetails]);

  useEffect(() => {
    if (isAnalysisModalOpen && analysisModalRef.current) {
      analysisModalRef.current.focus();
    }
  }, [isAnalysisModalOpen]);

  useEffect(() => {
    if (isDeleteGroupConfirmOpen && deleteGroupModalRef.current) {
      deleteGroupModalRef.current.focus();
    }
  }, [isDeleteGroupConfirmOpen]);

  useEffect(() => {
    if (expenseToDelete && deleteExpenseModalRef.current) {
      deleteExpenseModalRef.current.focus();
    }
  }, [expenseToDelete]);

  // Invite states
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    const groupRef = doc(db, 'groups', groupId);
    const unsubscribeGroup = onSnapshot(groupRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Group;
        setGroup({ id: doc.id, ...data } as Group);
        setEditName(data.name);
        setEditDescription(data.description || '');
        setEditMaxBudget(data.maxBudget?.toString() || '');
        setEditBudgetType(data.budgetType || 'monthly');
      }
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching group:", error);
    });

    const expensesQuery = query(collection(db, 'groups', groupId, 'expenses'), orderBy('date', 'desc'));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching expenses:", error);
    });

    const membersQuery = collection(db, 'groups', groupId, 'members');
    const unsubscribeMembers = onSnapshot(membersQuery, (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as GroupMember)));
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching members:", error);
    });

    return () => {
      unsubscribeGroup();
      unsubscribeExpenses();
      unsubscribeMembers();
    };
  }, [groupId]);

  useEffect(() => {
    if (editingExpense) {
      setAmount(editingExpense.amount.toString());
      setDescription(editingExpense.description);
      setCategory(editingExpense.category);
      setDate(editingExpense.date.toDate().toISOString().split('T')[0]);
      setIsAddExpenseOpen(true);
    } else {
      setAmount('');
      setDescription('');
      setCategory(CATEGORIES[0]);
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [editingExpense]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddExpenseOpen(false);
        setIsAddMemberOpen(false);
        setIsSettingsOpen(false);
        closeAnalysisModal();
        setIsDeleteGroupConfirmOpen(false);
        setExpenseToDelete(null);
        setEditingExpense(null);
        setSelectedStatDetails(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    try {
      const expenseData = {
        amount: parseFloat(amount),
        description: description.trim(),
        category,
        paidBy: editingExpense ? editingExpense.paidBy : user.uid,
        date: Timestamp.fromDate(new Date(date)),
        createdAt: editingExpense ? editingExpense.createdAt : serverTimestamp(),
        splitType: 'equal' as const
      };

      if (editingExpense) {
        await updateDoc(doc(db, 'groups', groupId, 'expenses', editingExpense.id), expenseData);
      } else {
        await addDoc(collection(db, 'groups', groupId, 'expenses'), expenseData);
      }
      
      setIsAddExpenseOpen(false);
      setEditingExpense(null);
      setAmount('');
      setDescription('');
    } catch (error) {
      handleFirestoreError(error, editingExpense ? OperationType.UPDATE : OperationType.CREATE, `groups/${groupId}/expenses`);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;

    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      const emailQuery = query(collection(db, 'users'), where('email', '==', newMemberEmail.trim().toLowerCase()));
      const querySnapshot = await getDocs(emailQuery);

      let targetUser;

      if (!querySnapshot.empty) {
        const docUser = querySnapshot.docs[0];
        targetUser = { uid: docUser.id, ...docUser.data() } as any;
      } else {
        // Create a mock user since the user might not be in the mock DB yet, 
        // which makes the app incredibly flexible and seamless for offline/localStorage mode or real Firestore!
        const mockUid = 'user_' + Math.random().toString(36).substr(2, 9);
        const namePart = newMemberEmail.trim().toLowerCase().split('@')[0];
        const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/[._-]/g, ' ');
        const photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff`;
        
        targetUser = {
          uid: mockUid,
          displayName,
          email: newMemberEmail.trim().toLowerCase(),
          photoURL,
        };

        // Register user profile in firebase
        await setDoc(doc(db, 'users', mockUid), {
          ...targetUser,
          createdAt: serverTimestamp()
        });
      }

      // Check if already a member
      if (members.some(m => m.uid === targetUser.uid)) {
        setInviteError('Pengguna dengan email ini sudah ditambahkan ke grup.');
        setInviteLoading(false);
        return;
      }

      // 1. Update the parent group document to include the new member in memberIds
      await updateDoc(doc(db, 'groups', groupId), {
        memberIds: arrayUnion(targetUser.uid)
      });

      // 2. Add the member doc to subcollection 'members'
      await setDoc(doc(db, 'groups', groupId, 'members', targetUser.uid), {
        uid: targetUser.uid,
        role: 'member',
        joinedAt: serverTimestamp(),
        displayName: targetUser.displayName,
        email: targetUser.email,
        photoURL: targetUser.photoURL || null
      });

      setInviteSuccess(true);
      setNewMemberEmail('');
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (error) {
      console.error('Error inviting member:', error);
      setInviteError('Gagal mengundang anggota. Silakan periksa koneksi Anda.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'groups', groupId, 'expenses', id));
      setExpenseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}/expenses/${id}`);
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}`);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    
    try {
      const updateData: any = {
        name: editName.trim(),
        description: editDescription.trim(),
        maxBudget: editMaxBudget ? parseFloat(editMaxBudget) : null,
        budgetType: editMaxBudget ? editBudgetType : 'total'
      };
      await updateDoc(doc(db, 'groups', groupId), updateData);
      setIsSettingsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
    }
  };

  const isDateInCurrentPeriod = (date: Date, type: BudgetType) => {
    const now = new Date();
    if (type === 'total') return true;
    
    if (type === 'monthly') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    
    if (type === 'weekly') {
      // Get start of current week (Sunday)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      
      return date >= startOfWeek && date < endOfWeek;
    }
    
    return true;
  };

  const currentPeriodExpenses = expenses.filter(e => 
    isDateInCurrentPeriod(e.date.toDate(), group?.budgetType || 'total')
  );

  const totalSpent = currentPeriodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const userSpent = currentPeriodExpenses.filter(e => e.paidBy === user.uid).reduce((sum, e) => sum + e.amount, 0);
  const perPerson = members.length > 0 ? totalSpent / members.length : 0;
  const balance = userSpent - perPerson;

  // Budget calculation
  const currentBudgetSpent = totalSpent;

  // Chart Data Preparation
  const getLineChartData = () => {
    if (!group || group.budgetType === 'total') return [];
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const data = [];
    
    if (group.budgetType === 'weekly') {
      // Show 52 weeks of the year
      const firstDayOfYear = new Date(currentYear, 0, 1);
      const startOfFirstWeek = new Date(firstDayOfYear);
      startOfFirstWeek.setDate(firstDayOfYear.getDate() - firstDayOfYear.getDay());
      startOfFirstWeek.setHours(0, 0, 0, 0);

      for (let i = 0; i < 52; i++) {
        const weekStart = new Date(startOfFirstWeek);
        weekStart.setDate(startOfFirstWeek.getDate() + (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const weekSpent = expenses
          .filter(e => {
            const ed = e.date.toDate();
            return ed >= weekStart && ed < weekEnd && ed.getFullYear() === currentYear;
          })
          .reduce((sum, e) => sum + e.amount, 0);
        
        data.push({ 
          name: `W${i + 1}`, 
          amount: weekSpent 
        });
      }
    } else if (group.budgetType === 'monthly') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let i = 0; i < 12; i++) {
        const monthSpent = expenses
          .filter(e => {
            const ed = e.date.toDate();
            return ed.getMonth() === i && ed.getFullYear() === currentYear;
          })
          .reduce((sum, e) => sum + e.amount, 0);
        data.push({ name: monthNames[i], amount: monthSpent });
      }
    }
    return data;
  };

  const getPieChartData = () => {
    const categoryMap = new Map<string, number>();
    currentPeriodExpenses.forEach(e => {
      categoryMap.set(e.category, (categoryMap.get(e.category) || 0) + e.amount);
    });
    return Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));
  };

  const lineData = getLineChartData();
  const pieData = getPieChartData();
  const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#71717a'];

  const getPeriodLabel = () => {
    const now = new Date();
    const type = group?.budgetType || 'total';
    
    if (type === 'monthly') {
      return now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }
    
    if (type === 'weekly') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const startMonth = startOfWeek.toLocaleDateString('id-ID', { month: 'short' });
      const endMonth = endOfWeek.toLocaleDateString('id-ID', { month: 'short' });
      
      if (startMonth === endMonth) {
        return `${startOfWeek.getDate()} - ${endOfWeek.getDate()} ${startMonth}, ${now.getFullYear()}`;
      }
      return `${startOfWeek.getDate()} ${startMonth} - ${endOfWeek.getDate()} ${endMonth}, ${now.getFullYear()}`;
    }
    
    return 'Semua Waktu';
  };

  const handleAnalyzeSpending = async () => {
    setIsAnalyzing(true);
    setIsAnalysisModalOpen(true);
    setAnalysisResult(null);

    if (analysisAbortController.current) {
      analysisAbortController.current.abort();
    }
    const abortController = new AbortController();
    analysisAbortController.current = abortController;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const expenseSummary = expenses.map(e => ({
        amount: e.amount,
        description: e.description,
        category: e.category,
        date: e.date.toDate().toLocaleDateString()
      }));

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        // Fallback local analyzer using real group stats!
        const categoriesMap: Record<string, number> = {};
        for (const e of expenses) {
          categoriesMap[e.category] = (categoriesMap[e.category] || 0) + e.amount;
        }
        
        let highestCat = "None";
        let highestAmount = 0;
        for (const cat of Object.keys(categoriesMap)) {
          if (categoriesMap[cat] > highestAmount) {
            highestAmount = categoriesMap[cat];
            highestCat = cat;
          }
        }

        const budgetMsg = group?.maxBudget 
          ? (totalSpent > group.maxBudget 
              ? `⚠️ **Melebihi Anggaran:** Anda telah melebihi batas anggaran ${group.budgetType || 'bulanan'} sebesar **Rp ${formatCurrency(group.maxBudget)}** dengan kelebihan sebesar **Rp ${formatCurrency(totalSpent - group.maxBudget)}**.`
              : `✅ **Anggaran Aman:** Pengeluaran Anda berada di bawah batas anggaran ${group.budgetType || 'bulanan'} sebesar **Rp ${formatCurrency(group.maxBudget)}**, dengan sisa **Rp ${formatCurrency(group.maxBudget - totalSpent)}** yang tersedia.`)
          : `ℹ️ **Batas Pengeluaran:** Belum ada batas anggaran yang ditetapkan untuk grup ini.`;

        const text = `### 📊 Analisis Anggaran Dinamis (Analisis Lokal)

${budgetMsg}

#### 1. Ringkasan Kebiasaan Pengeluaran
* Anda telah mengumpulkan pengeluaran sebesar **Rp ${formatCurrency(totalSpent)}** dari **${expenses.length} transaksi**.
* Distribusi keseluruhan menunjukkan alokasi biaya yang realistis di antara anggota grup yang aktif.

#### 2. Analisis Kategori
* **Kategori Pengeluaran Tertinggi:** **${highestCat}** yang menghabiskan **Rp ${formatCurrency(highestAmount)}** (${totalSpent > 0 ? ((highestAmount / totalSpent) * 100).toFixed(0) : 0}% dari total pengeluaran).
* ${highestCat !== 'None' ? `Mengurangi pengeluaran di kategori **${highestCat}** adalah cara paling cepat untuk menghemat anggaran.` : 'Belum ada transaksi untuk dianalisis.'}

#### 3. Saran Praktis untuk Menghemat
* 🛒 **Kurangi Pengeluaran Kategori**: Untuk kategori pengeluaran tertinggi Anda (**${highestCat}**), cobalah menetapkan batas pengeluaran mingguan atau mencari alternatif yang lebih murah.
* 📅 **Konsolidasi Utilitas**: Tinjau biaya bulanan atau langganan bersama untuk memastikan tidak ada tagihan ganda atau layanan yang tidak produktif.
* 💳 **Pola Penyelesaian Saldo**: Gunakan panel saldo untuk melunasi utang lebih awal agar meminimalkan friksi keuangan antar anggota grup.

#### 4. Prospek Grup
* Dengan laju pengeluaran saat ini, pengelolaan keuangan grup Anda tampak **sehat** dan **terbuka**! Terus tumpuk dan catat transaksi saat terjadi.`;

        // Wait a small moment to simulate processing
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 800);
          abortController.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });

        if (abortController.signal.aborted) return;
        setAnalysisResult(text);
      } else {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `
          Analisis data pengeluaran berikut untuk grup anggaran bernama "${group?.name}".
          Tipe Grup: ${group?.type}
          Tipe Anggaran: ${group?.budgetType}
          Batas Anggaran: ${group?.maxBudget ? `Rp ${group.maxBudget}` : 'Tidak ada batasan'}
          Total Pengeluaran Periode Ini: Rp ${totalSpent}
          
          Daftar Pengeluaran:
          ${JSON.stringify(expenseSummary, null, 2)}
          
          Berikan analisis dalam Bahasa Indonesia yang mencakup:
          1. Ringkasan kebiasaan pengeluaran.
          2. Identifikasi kategori pengeluaran yang tidak biasa atau sangat tinggi.
          3. Saran praktis untuk menghemat atau mengelola anggaran dengan lebih baik (gunakan mata uang Rupiah, dilarang memakai mata uang Dolar atau simbol $).
          4. Prospek singkat berdasarkan batas anggaran saat ini.
          
          Buat nada bicara Anda membantu, profesional, dan ramah. Gunakan markdown untuk memformat respons Anda.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: prompt }] }]
        });

        if (abortController.signal.aborted) return;
        setAnalysisResult(response.text || "Tidak dapat menghasilkan analisis.");
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        return;
      }
      console.error("AI Analysis Error:", error);
      setAnalysisResult("Maaf, saya mengalami kendala saat menganalisis pengeluaran Anda. Silakan coba beberapa saat lagi.");
    } finally {
      if (!abortController.signal.aborted) {
        setIsAnalyzing(false);
      }
    }
  };

  if (!group) return null;

  return (
    <div className="max-w-6xl mx-auto">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl transition-all duration-200 mb-10 group shadow-sm"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        <span className="text-sm font-bold">Kembali ke Dasbor</span>
      </button>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-12">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
              group.type === 'household' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20' :
              group.type === 'trip' ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-500/20' :
              'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20'
            }`}>
              {group.type === 'household' ? 'Rumah Tangga' : group.type === 'trip' ? 'Trip / Wisata' : group.type === 'personal' ? 'Pribadi' : 'Lainnya'}
            </span>
            <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">{getPeriodLabel()}</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">{group.name}</h1>
          <p className="text-zinc-600 dark:text-zinc-300 max-w-2xl leading-relaxed font-medium">{group.description || 'Tidak ada deskripsi.'}</p>
        </div>

        <div className="flex flex-wrap items-stretch gap-2 sm:gap-3 w-full md:w-auto">
          {user.uid === group.createdBy && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-12 sm:w-auto p-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm flex items-center justify-center shrink-0"
              title="Pengaturan Grup"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={() => setIsAddMemberOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Undang
          </button>
          <button 
            onClick={handleAnalyzeSpending}
            disabled={isAnalyzing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-3 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl text-sm font-bold hover:from-indigo-700 hover:to-violet-700 hover:shadow-xl hover:shadow-indigo-500/40 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20 active:scale-95"
          >
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Analisis AI
          </button>
          <button 
            onClick={() => {
              setEditingExpense(null);
              setIsAddExpenseOpen(true);
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-lg hover:shadow-indigo-500/10 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Tambah Pengeluaran
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 lg:gap-6 mb-12">
        <button 
          onClick={() => setSelectedStatDetails({ title: 'Total Pengeluaran Grup', amount: totalSpent })}
          className="text-left w-full bg-white dark:bg-zinc-900 p-6 md:p-5 lg:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-zinc-950/20 relative overflow-hidden group hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-100 dark:bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 font-display">Total Pengeluaran Grup</p>
            <p 
              className="text-4xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-zinc-900 dark:text-white font-display tracking-tight truncate"
              title={`Rp ${formatCurrency(totalSpent)}`}
            >
              Rp {formatCurrency(totalSpent)}
            </p>
            {group.maxBudget && (
              <div className="mt-6">
                <div className="flex justify-between text-[10px] font-bold uppercase mb-2 font-display">
                  <span className="text-zinc-500">Anggaran ({group.budgetType === 'weekly' ? 'Mingguan' : group.budgetType === 'monthly' ? 'Bulanan' : 'Total'})</span>
                  <span className={currentBudgetSpent > group.maxBudget ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}>
                    {((currentBudgetSpent / group.maxBudget) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-700 ease-out ${currentBudgetSpent > group.maxBudget ? 'bg-red-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, (currentBudgetSpent / group.maxBudget) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-2 font-medium">
                  Rp {formatCurrency(currentBudgetSpent)} dari Rp {formatCurrency(group.maxBudget)}
                </p>
              </div>
            )}
          </div>
        </button>
        <button 
          onClick={() => setSelectedStatDetails({ title: 'Porsi Anda', amount: perPerson, subtitle: `${totalSpent > 0 ? ((userSpent / totalSpent) * 100).toFixed(0) : 0}% dari total yang telah Anda bayar` })}
          className="text-left w-full bg-white dark:bg-zinc-900 p-6 md:p-5 lg:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 relative overflow-hidden group hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-100 dark:bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 font-display">Porsi Anda</p>
            <p 
              className="text-4xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-zinc-900 dark:text-white font-display tracking-tight truncate"
              title={`Rp ${formatCurrency(perPerson)}`}
            >
              Rp {formatCurrency(perPerson)}
            </p>
            <p className="text-xs font-medium text-zinc-500 mt-4">
              {totalSpent > 0 ? ((userSpent / totalSpent) * 100).toFixed(0) : 0}% telah Anda bayar
            </p>
          </div>
        </button>
        <button 
          onClick={() => setSelectedStatDetails({ title: balance >= 0 ? 'Anda Berhak Menerima' : 'Anda Berutang', amount: Math.abs(balance) })}
          className="text-left w-full bg-white dark:bg-zinc-900 p-6 md:p-5 lg:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 relative overflow-hidden group hover:scale-[1.02] active:scale-95 transition-all duration-300 cursor-pointer"
        >
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 ${balance >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`} />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 text-zinc-500 font-display">
              {balance >= 0 ? 'Anda Berhak Menerima' : 'Anda Berutang'}
            </p>
            <p 
              className={`text-4xl md:text-2xl lg:text-3xl xl:text-4xl font-bold font-display tracking-tight truncate ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
              title={`Rp ${formatCurrency(Math.abs(balance))}`}
            >
              Rp {formatCurrency(Math.abs(balance))}
            </p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {group.budgetType !== 'total' && (
          <div className="bg-white dark:bg-zinc-900 p-4 sm:p-8 rounded-[40px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
            <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em] mb-8 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Tren Pengeluaran ({group.budgetType === 'weekly' ? 'Mingguan' : 'Bulanan'})
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={lineData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" opacity={0.1} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#a1a1aa', fontWeight: 500 }}
                    interval="preserveStart"
                    minTickGap={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#a1a1aa', fontWeight: 500 }}
                    tickFormatter={(value) => `Rp${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', 
                      padding: '12px', 
                      backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                      color: theme === 'dark' ? '#ffffff' : '#18181b' 
                    }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600, color: theme === 'dark' ? '#ffffff' : '#18181b' }}
                    labelStyle={{ fontSize: '10px', color: '#71717a', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}
                    formatter={(value: number) => [`Rp ${formatCurrency(value)}`, 'Terpakai']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#4f46e5" 
                    strokeWidth={4} 
                    dot={{ r: 0 }}
                    activeDot={{ r: 6, fill: '#4f46e5', strokeWidth: 3, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className={`bg-white dark:bg-zinc-900 p-4 sm:p-8 rounded-[40px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 ${group.budgetType === 'total' ? 'lg:col-span-2' : ''}`}>
          <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em] mb-8 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4" />
            Distribusi Kategori
          </h3>
          <div className="h-[280px] w-full">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [`Rp ${formatCurrency(value)}`, 'Total']}
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', 
                      padding: '12px', 
                      backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                      color: theme === 'dark' ? '#ffffff' : '#18181b' 
                    }}
                    itemStyle={{ color: theme === 'dark' ? '#ffffff' : '#18181b' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 500, paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 text-sm">
                <PieChartIcon className="w-10 h-10 mb-2 opacity-20" />
                <p className="font-medium italic">Tidak ada pengeluaran pada periode ini</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-3 font-display">
              <span className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center font-display font-black text-xs text-zinc-500 dark:text-zinc-400 select-none shrink-0">Rp</span>
              Riwayat Transaksi
            </h2>
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{expenses.length} Total</div>
          </div>
          
          <div className="bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
            {expenses.length === 0 ? (
              <div className="p-10 sm:p-20 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="font-display font-black text-2xl sm:text-3xl text-zinc-300 dark:text-zinc-600 select-none">Rp</span>
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Belum ada transaksi</h3>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto text-sm">Mulai lacak pengeluaran bersama dengan menambahkan transaksi pertama Anda.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {expenses.map(expense => (
                  <div key={expense.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between group transition-all duration-200 gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 border border-zinc-100 dark:border-zinc-700 group-hover:bg-white dark:group-hover:bg-zinc-800 transition-colors shrink-0">
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-tighter text-zinc-500">{expense.date.toDate().toLocaleDateString('id-ID', { month: 'short' })}</span>
                        <span className="text-lg sm:text-xl font-bold leading-none text-zinc-900 dark:text-white">{expense.date.toDate().getDate()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{expense.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-full text-[9px] sm:text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border border-zinc-200 dark:border-zinc-700 shrink-0">{expense.category}</span>
                          <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline shrink-0">•</span>
                          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">Dibayar oleh {members.find(m => m.uid === expense.paidBy)?.displayName || 'Tidak dikenal'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 w-full sm:w-auto shrink-0 mt-4 sm:mt-0">
                      <div className="text-left sm:text-right min-w-0">
                        <p 
                          className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white font-mono tracking-tight truncate"
                          title={`Rp ${formatCurrency(expense.amount)}`}
                        >
                          Rp {formatCurrency(expense.amount)}
                        </p>
                        <p className="text-[9px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Jumlah</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setEditingExpense(expense)}
                          className="p-2 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl sm:opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-indigo-50 dark:focus:bg-indigo-500/10 transition-all active:scale-90 outline-none focus:ring-2 focus:ring-indigo-500"
                          title="Ubah Pengeluaran"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setExpenseToDelete(expense.id)}
                          className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl sm:opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-red-50 dark:focus:bg-red-500/10 transition-all active:scale-90 outline-none focus:ring-2 focus:ring-red-500"
                          title="Hapus Pengeluaran"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white mb-8 flex items-center gap-3 font-display">
            <Users className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
            Anggota Grup
          </h2>
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-[40px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
            <div className="space-y-6">
              {members.map(member => (
                <div key={member.uid} className="flex items-center justify-between group">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 dark:text-zinc-500 font-bold border border-zinc-100 dark:border-zinc-700 group-hover:border-indigo-500 transition-colors">
                        {member.displayName?.charAt(0)}
                      </div>
                      {member.uid === group.createdBy && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center">
                          <Sparkles className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{member.displayName}</p>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">{member.role === 'admin' ? 'Pengelola / Admin' : 'Anggota'}</p>
                    </div>
                  </div>
                  {member.uid === group.createdBy && (
                    <span className="shrink-0 text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-500/20 ml-2">PEMILIK</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {isAddExpenseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddExpenseOpen(false);
                setEditingExpense(null);
              }}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-expense-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-6 sm:p-10 outline-none"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="add-expense-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
                  {editingExpense ? 'Ubah Pengeluaran' : 'Tambah Pengeluaran'}
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddExpenseOpen(false);
                    setEditingExpense(null);
                  }} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Tutup modal"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <form onSubmit={handleAddExpense} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Jumlah</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">Rp</span>
                    <input
                      type="number"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-12 pr-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono font-bold text-lg dark:text-white"
                      placeholder="0"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Deskripsi</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium dark:text-white"
                    placeholder="Membeli apa?"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Kategori</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium appearance-none dark:text-white"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Tanggal</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium dark:text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-zinc-900 dark:bg-indigo-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-indigo-700 transition-all mt-4 shadow-lg shadow-zinc-200 dark:shadow-indigo-500/20 active:scale-95"
                >
                  {editingExpense ? 'Simpan Perubahan' : 'Simpan Transaksi'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Member Modal */}
      <AnimatePresence>
        {isAddMemberOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsAddMemberOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-member-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 outline-none"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 id="add-member-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Undang Anggota</h3>
                <button 
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Tutup modal"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">Masukkan alamat email dari orang yang ingin ditarik ke dalam grup.</p>
              
              {inviteError && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl">
                  {inviteError}
                </div>
              )}

              {inviteSuccess && (
                <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-2xl flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Anggota berhasil ditambahkan!
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Alamat Email</label>
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => {
                      setNewMemberEmail(e.target.value);
                      setInviteError(null);
                    }}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium dark:text-white"
                    placeholder="teman@example.com"
                    required
                    disabled={inviteLoading || inviteSuccess}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={inviteLoading || inviteSuccess}
                  className="w-full py-4 bg-zinc-900 dark:bg-indigo-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-indigo-700 transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-zinc-200 dark:shadow-indigo-500/20 active:scale-95"
                >
                  {inviteLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Menambahkan...
                    </>
                  ) : (
                    'Tambah ke Grup'
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 max-h-[90vh] overflow-y-auto outline-none"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="settings-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Pengaturan Grup</h3>
                <button 
                  type="button"
                  onClick={() => setIsSettingsOpen(false)} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Tutup modal"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <form onSubmit={handleUpdateSettings} className="space-y-8">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-6">Info Umum</h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Nama Grup</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium dark:text-white"
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Deskripsi</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium resize-none h-24 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-6">Batas Anggaran</h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Anggaran Maksimum</label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">Rp</span>
                        <input
                          type="number"
                          step="1"
                          value={editMaxBudget}
                          onChange={(e) => setEditMaxBudget(e.target.value)}
                          placeholder="Tanpa batas"
                          className="w-full pl-12 pr-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono font-bold dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Frekuensi Anggaran</label>
                      <select
                        value={editBudgetType}
                        onChange={(e) => setEditBudgetType(e.target.value as BudgetType)}
                        className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium appearance-none dark:text-white"
                      >
                        <option value="weekly">Mingguan</option>
                        <option value="monthly">Bulanan</option>
                        <option value="total">Total</option>
                      </select>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-zinc-900 dark:bg-indigo-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-indigo-700 transition-all shadow-lg shadow-zinc-200 dark:shadow-indigo-500/20 active:scale-95"
                >
                  Simpan Pengaturan
                </button>

                {(members.find(m => m.uid === user.uid)?.role === 'admin' || group?.createdBy === user.uid) && (
                  <div className="pt-8 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setIsDeleteGroupConfirmOpen(true);
                      }}
                      className="w-full py-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl font-bold hover:bg-red-100 dark:hover:bg-red-500/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Trash2 className="w-5 h-5" />
                      Hapus Grup
                    </button>
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* AI Analysis Modal */}
      <AnimatePresence>
        {isAnalysisModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={closeAnalysisModal}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              ref={analysisModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="analysis-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 max-h-[85vh] overflow-y-auto outline-none"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="analysis-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Analisis Pengeluaran</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">Wawasan berbasis AI untuk {group.name}</p>
                </div>
              </div>

              {isAnalyzing ? (
                <div className="py-16 flex flex-col items-center justify-center gap-6 text-zinc-400">
                  <div className="relative">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                    <div className="absolute inset-0 blur-lg bg-indigo-400/20 animate-pulse" />
                  </div>
                  <p className="font-bold text-sm uppercase tracking-widest animate-pulse">Menganalisis kebiasaan pengeluaran Anda...</p>
                </div>
              ) : (
                <div className="max-w-none">
                  <div className="bg-zinc-50 dark:bg-zinc-800 rounded-[32px] p-8 border border-zinc-200 dark:border-zinc-700 analysis-content dark:text-zinc-300">
                    <Markdown>{analysisResult || ""}</Markdown>
                  </div>
                  <button
                    onClick={closeAnalysisModal}
                    className="w-full py-4 bg-zinc-900 dark:bg-indigo-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-indigo-700 transition-all mt-8 shadow-lg shadow-zinc-200 dark:shadow-indigo-500/20 active:scale-95"
                  >
                    Tutup Analisis
                  </button>
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Group Confirmation Modal */}
      <AnimatePresence>
        {isDeleteGroupConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteGroupConfirmOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              ref={deleteGroupModalRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-group-title"
              aria-describedby="delete-group-desc"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 text-center outline-none"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 id="delete-group-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">Hapus Grup?</h3>
              <p id="delete-group-desc" className="text-zinc-500 dark:text-zinc-400 text-sm mb-10 leading-relaxed">Ini akan menghapus grup secara permanen beserta seluruh pengeluarannya. Tindakan ini tidak dapat dibatalkan.</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteGroupConfirmOpen(false)}
                  className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
                >
                  Batal
                </button>
                <button
                  onClick={handleDeleteGroup}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-red-500/20 active:scale-95"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stat Details Modal */}
      <AnimatePresence>
        {selectedStatDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStatDetails(null)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              ref={statModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="stat-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 text-center outline-none"
            >
              <p id="stat-title" className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 font-display">{selectedStatDetails.title}</p>
              <p className="text-5xl sm:text-6xl font-bold text-zinc-900 dark:text-white font-display tracking-tight mb-2 break-all">
                Rp {formatCurrency(selectedStatDetails.amount)}
              </p>
              {selectedStatDetails.subtitle && (
                <p className="text-sm font-medium text-zinc-500 mt-4">
                  {selectedStatDetails.subtitle}
                </p>
              )}
              <button
                onClick={() => setSelectedStatDetails(null)}
                className="w-full py-4 bg-zinc-900 dark:bg-indigo-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-indigo-700 transition-all mt-8 shadow-lg shadow-zinc-200 dark:shadow-indigo-500/20 active:scale-95"
              >
                Tutup
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {expenseToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setExpenseToDelete(null)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              ref={deleteExpenseModalRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-expense-title"
              aria-describedby="delete-expense-desc"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 text-center outline-none"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 id="delete-expense-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">Hapus Pengeluaran?</h3>
              <p id="delete-expense-desc" className="text-zinc-500 dark:text-zinc-400 text-sm mb-10 leading-relaxed">Tindakan ini tidak dapat dibatalkan. Apakah Anda yakin ingin menghapus pengeluaran ini?</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setExpenseToDelete(null)}
                  className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
                >
                  Batal
                </button>
                <button
                  onClick={() => handleDeleteExpense(expenseToDelete)}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-red-500/20 active:scale-95"
                >
                  Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

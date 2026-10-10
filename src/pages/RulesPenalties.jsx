import React, { useEffect, useState } from 'react';
import { BookOpen, AlertTriangle, Wrench, Package, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { getDoc, doc, getDocs, collection, query, where } from 'firebase/firestore';
import { formatDate } from '../lib/helpers';
import { PageLoader } from '../components/LoadingSpinner';

const DEFAULT_RULES = [
  {
    id: 'late',
    title: 'Late Return',
    icon: 'AlertTriangle',
    iconColor: 'text-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    description: 'Returning equipment after the expected return date.',
    consequence: 'Corresponding penalty or warning as set by the school/laboratory.',
  },
  {
    id: 'improper',
    title: 'Not Properly Returned/Arranged',
    icon: 'Package',
    iconColor: 'text-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description: 'Equipment returned dirty, disassembled, or not arranged properly.',
    consequence: 'Warning or temporary borrowing restriction.',
  },
  {
    id: 'damaged',
    title: 'Damaged Equipment',
    icon: 'Tool',
    iconColor: 'text-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    description: 'Equipment returned in a damaged condition.',
    consequence: 'Assessment and possible replacement/repair responsibility.',
  },
  {
    id: 'lost',
    title: 'Lost Equipment',
    icon: 'AlertCircle',
    iconColor: 'text-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    description: 'Equipment not returned or confirmed lost.',
    consequence: 'Replacement or other school-approved consequence.',
  },
];

const iconMap = {
  AlertTriangle: props => <AlertTriangle {...props} />,
  Package: props => <Package {...props} />,
  Tool: props => <Wrench {...props} />,
  AlertCircle: props => <AlertCircle {...props} />,
};

export default function RulesPenalties() {
  const { userProfile, isAdmin } = useAuth();
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [myPenalties, setMyPenalties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'penaltyRules'));
        if (snap.exists() && snap.data().rules?.length) {
          setRules(snap.data().rules);
        }
        if (userProfile && !isAdmin) {
          const pSnap = await getDocs(
            query(collection(db, 'penalties'), where('userId', '==', userProfile.uid))
          );
          setMyPenalties(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userProfile, isAdmin]);

  if (loading) return <PageLoader />;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="card">
        <div className="card-header">
          <BookOpen size={18} strokeWidth={1.8} />
          Laboratory Rules & Penalties
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            The following rules apply to all students borrowing laboratory equipment from KNCHS.
            Violations may result in consequences as described below.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rules.map((rule, i) => {
              const Icon = iconMap[rule.icon] || (() => <AlertTriangle />);
              return (
                <div key={rule.id || i} className={`p-4 rounded-xl border ${rule.bg || 'bg-gray-50'} ${rule.border || 'border-gray-200'}`}>
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className={rule.iconColor || 'text-gray-500'}>
                      <Icon size={20} strokeWidth={1.8} />
                    </div>
                    <h3 className="font-semibold text-gray-800 text-sm leading-tight">{rule.title}</h3>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{rule.description}</p>
                  <div className="p-2 bg-white/60 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 mb-0.5">Consequence:</p>
                    <p className="text-xs text-gray-700">{rule.consequence}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-3 bg-primary-50 border border-primary-200 rounded-xl">
            <p className="text-xs text-primary-800 font-medium">
              <strong>Note:</strong> Actual penalties are customizable by the school/laboratory.
              Contact the laboratory staff for clarification on specific cases.
            </p>
          </div>
        </div>
      </div>

      {/* Student's own violations */}
      {!isAdmin && myPenalties.length > 0 && (
        <div className="card">
          <div className="card-header bg-red-600">
            <AlertTriangle size={18} strokeWidth={1.8} />
            My Recorded Violations
          </div>
          <div className="p-4 space-y-3">
            {myPenalties.map(p => (
              <div key={p.id} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-red-700 uppercase">{p.violationType}</span>
                  <span className="text-xs text-gray-400">{formatDate(p.dateRecorded)}</span>
                </div>
                <p className="text-sm text-gray-700">{p.description}</p>
                {p.consequence && (
                  <p className="text-xs text-red-600 mt-1">Consequence: {p.consequence}</p>
                )}
                {p.staffRemarks && (
                  <p className="text-xs text-gray-500 mt-1">Staff remarks: {p.staffRemarks}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isAdmin && myPenalties.length === 0 && (
        <div className="card p-5 text-center text-gray-400">
          <AlertCircle size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No violations on record. Keep up the good work!</p>
        </div>
      )}
    </div>
  );
}

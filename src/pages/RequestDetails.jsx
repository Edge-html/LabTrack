import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText, User, FlaskConical, Package, Info, AlertTriangle,
  ArrowLeft, Camera, Clock, ShieldAlert, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/firebase';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import {
  formatDate, formatTimestamp, timeAgo, getTodayManila,
} from '../lib/helpers';
import { StatusBadge } from '../components/StatusBadge';
import { PageLoader } from '../components/LoadingSpinner';
import ReturnProofCard from '../components/ReturnProofCard';
import ReturnProofModal from '../components/ReturnProofModal';
import { WarningRow, useWarnings } from '../components/WarningsPanel';
import { proofPhotos } from '../lib/upload';

export default function RequestDetails() {
  const { id } = useParams();
  const { userProfile, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [penalties, setPenalties] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  // Hooks must run unconditionally — request may still be loading.
  const { warnings } = useWarnings(request?.userId);
  const linkedWarnings = warnings.filter(w => w.requestId === id);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'requests', id));
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const r = { id: snap.id, ...snap.data() };
      if (!isAdmin && r.userId !== userProfile?.uid) { setNotFound(true); setLoading(false); return; }
      setRequest(r);
    } catch (err) {
      console.error(err);
      setNotFound(true);
      setLoading(false);
      return;
    }

    // Load penalties separately so it doesn't crash the page if it fails
    try {
      let penQ;
      if (isAdmin) {
        penQ = query(collection(db, 'penalties'), where('requestId', '==', id));
      } else {
        // Students must query by their own userId to pass Firestore rules
        penQ = query(collection(db, 'penalties'), where('userId', '==', userProfile.uid));
      }
      const penSnap = await getDocs(penQ);
      const allPenalties = penSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPenalties(allPenalties.filter(p => p.requestId === id));
    } catch (err) {
      console.error("Failed to load penalties:", err);
      setPenalties([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <PageLoader />;
  if (notFound) {
    return (
      <div className="max-w-xl mx-auto mt-10 text-center">
        <FileText size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Request not found.</p>
        <button onClick={() => navigate(-1)} className="btn-primary mt-3 btn-sm">Go Back</button>
      </div>
    );
  }

  const today = getTodayManila();
  const isOverdueFlag = ['borrowed', 'approved', 'return_submitted', 'return_flagged'].includes(request.status) &&
    request.expectedReturnDate < today;

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="btn-ghost btn-sm p-1.5">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-gray-800">Request Details</h1>
      </div>

      {/* Student alert — flagged return */}
      {!isAdmin && request.status === 'return_flagged' && (
        <div className="card border-red-300 bg-red-50/60">
          <div className="card-header bg-red-700">
            <ShieldAlert size={18} strokeWidth={1.8} />
            Action Required — Report to the Laboratory
          </div>
          <div className="p-4 space-y-3 text-sm">
            <p className="text-red-900">
              The laboratory staff assessed your return proof and found a problem with the equipment.
            </p>
            {request.returnReview?.remarks && (
              <p className="p-3 bg-white rounded-xl border border-red-200 font-medium text-red-800">
                {request.returnReview.remarks}
              </p>
            )}
            <p className="text-red-800">
              Please <span className="font-bold">report directly to the laboratory</span> to settle this
              before the equipment can be checked in. Once the equipment is cleaned or repaired, upload a
              new photo below.
            </p>
            <button onClick={() => setShowReturnModal(true)} className="btn-primary btn-sm">
              <Camera size={14} /> Upload a New Photo
            </button>
          </div>
        </div>
      )}

      {/* Status Banner */}
      <div className="card p-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">Current Status</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={request.status} expectedReturnDate={request.expectedReturnDate} />
            {request.lateRequestFlag && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} /> Late submission
              </span>
            )}
            {request.returnAttempt > 1 && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                Re-submission #{request.returnAttempt}
              </span>
            )}
          </div>
          {request.status === 'borrowed' && !isAdmin && (
            <button onClick={() => setShowReturnModal(true)} className="btn-primary btn-sm mt-3">
              <Camera size={14} /> Submit Return Proof
            </button>
          )}
        </div>
        {request.expectedReturnDate && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Due Date</p>
            <p className={`font-semibold ${isOverdueFlag ? 'text-red-600' : 'text-primary-700'}`}>
              {formatDate(request.expectedReturnDate)}
            </p>
            {isOverdueFlag && (
              <p className="text-xs text-red-500 flex items-center gap-1 justify-end">
                <AlertTriangle size={11} /> Overdue
              </p>
            )}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="card">
        <div className="card-header"><Clock size={18} strokeWidth={1.8} /> Timeline</div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <TimelineStep label="Request Sent" at={request.createdAt} />
          <TimelineStep label="Approved" at={request.approvedAt} />
          <TimelineStep label="Released" at={request.releasedAt || request.releaseDate} />
          <TimelineStep label="Returned" at={request.returnedAt} />
        </div>
      </div>

      {/* Return proof */}
      {(proofPhotos(request.returnProof).length > 0 || request.status === 'return_submitted') && (
        <div className="card">
          <div className="card-header"><Camera size={18} strokeWidth={1.8} /> Return Proof</div>
          <div className="p-4">
            {proofPhotos(request.returnProof).length > 0 ? (
              <ReturnProofCard request={request} size="lg" />
            ) : (
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Waiting for the student to submit a photo…
              </p>
            )}
          </div>
        </div>
      )}

      {/* Borrower Info */}
      <div className="card">
        <div className="card-header"><User size={18} strokeWidth={1.8} /> Borrower Information</div>
        <div className="p-4 grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Name" value={request.borrowerName} />
          <InfoRow label="Grade Level" value={request.gradeLevel} />
          <InfoRow label="Section" value={request.section} />
          <InfoRow label="Teacher" value={request.teacher} />
          <InfoRow label="Proposed Borrow" value={`${formatDate(request.experimentDate)} · ${request.proposedBorrowTime || '08:00'}`} />
          <InfoRow label="Expected Return" value={`${formatDate(request.expectedReturnDate)} · ${request.expectedReturnTime || '12:00'}`} />
        </div>
      </div>

      {/* Experiment Info */}
      <div className="card">
        <div className="card-header"><FlaskConical size={18} strokeWidth={1.8} /> Experiment Information</div>
        <div className="p-4 grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Experiment / Activity" value={request.experiment} span2 />
          <InfoRow label="Experiment Date" value={formatDate(request.experimentDate)} />
          <InfoRow label="Duration" value={request.duration} />
          <InfoRow label="Expected Return Date" value={formatDate(request.expectedReturnDate)} />
          {request.actualReturnDate && (
            <InfoRow label="Actual Return Date" value={formatDate(request.actualReturnDate)} />
          )}
          {request.releaseDate && (
            <InfoRow label="Release Date" value={formatDate(request.releaseDate)} />
          )}
        </div>
      </div>

      {/* Equipment */}
      <div className="card">
        <div className="card-header"><Package size={18} strokeWidth={1.8} /> Equipment</div>
        {request.items?.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Requested</th>
                  <th>Released</th>
                  <th>Returned</th>
                  <th>Damaged</th>
                  <th>Missing</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((item, i) => (
                  <tr key={i}>
                    <td data-label="Equipment" className="font-medium">{item.name}</td>
                    <td data-label="Requested">{item.qtyRequested}</td>
                    <td data-label="Released">{item.qtyReleased || '—'}</td>
                    <td data-label="Returned">{item.qtyReturned ?? '—'}</td>
                    <td data-label="Damaged">{item.qtyDamaged || '—'}</td>
                    <td data-label="Missing">{item.qtyMissing || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-gray-400">No equipment listed.</p>
        )}
      </div>

      {/* Request Info */}
      <div className="card">
        <div className="card-header"><Info size={18} strokeWidth={1.8} /> Request Information</div>
        <div className="p-4 grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Date Submitted" value={formatDate(request.requestDate)} />
          <InfoRow label="Sent At" value={formatTimestamp(request.createdAt)} />
          <InfoRow label="Returned At" value={request.returnedAt ? formatTimestamp(request.returnedAt) : null} />
          <InfoRow label="Status" value={(request.status || '').replace(/_/g, ' ')} />
          {request.staffRemarks && (
            <InfoRow label="Staff Remarks" value={request.staffRemarks} span2 />
          )}
        </div>
      </div>

      {/* Warnings linked to this request */}
      {linkedWarnings.length > 0 && (
        <div className="card">
          <div className="card-header bg-red-700"><AlertTriangle size={18} strokeWidth={1.8} /> Warnings</div>
          <div className="p-3 space-y-2">
            {linkedWarnings.map(w => <WarningRow key={w.id} warning={w} />)}
          </div>
        </div>
      )}

      {/* Penalties */}
      {penalties && penalties.length > 0 && (
        <div className="card">
          <div className="card-header bg-red-600"><AlertTriangle size={18} strokeWidth={1.8} /> Violations</div>
          <div className="p-4 space-y-3">
            {penalties.map(p => (
              <div key={p.id} className="p-3 bg-red-50 rounded-xl border border-red-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-red-700 uppercase">{p.violationType}</span>
                  <span className="text-xs text-gray-400">{formatDate(p.dateRecorded)}</span>
                </div>
                <p className="text-sm text-gray-700">{p.description}</p>
                {p.consequence && <p className="text-xs text-red-600 mt-1">Consequence: {p.consequence}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/requests" className="btn-secondary btn-sm">
            <ArrowLeft size={14} /> Back to Manage Requests
          </Link>
          {(request.status === 'return_submitted' || proofPhotos(request.returnProof).length > 0) && (
            <Link
              to={`/admin/borrowing?id=${request.id}&action=return`}
              className="btn-primary btn-sm"
            >
              <Camera size={14} /> Review Return Proof
            </Link>
          )}
          <Link
            to={`/admin/warnings?userId=${request.userId}&requestId=${request.id}`}
            className="btn-danger btn-sm"
          >
            <AlertTriangle size={14} /> Issue Warning
          </Link>
        </div>
      )}

      {showReturnModal && (
        <ReturnProofModal
          request={request}
          onClose={() => setShowReturnModal(false)}
          onDone={() => {
            setShowReturnModal(false);
            load();
            toast.success('Proof submitted.');
          }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value, span2 }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-gray-800 mt-0.5">{value || '—'}</p>
    </div>
  );
}

function TimelineStep({ label, at }) {
  return (
    <div className={`p-3 rounded-xl border text-center ${at ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-xs font-semibold mt-1 ${at ? 'text-green-800' : 'text-gray-400'}`}>
        {at ? formatTimestamp(at) : 'Pending'}
      </p>
      {at && <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(at)}</p>}
    </div>
  );
}

import React, { useState } from 'react';
import { Download, FileBarChart2 } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { downloadCsv } from '../../lib/csv';
import { getEquipmentDueState } from '../../lib/helpers';

const PAGE_SIZE = 500;

async function fetchAllByDate(collectionName, field, from, to) {
  const results = [];
  let cursor = null;
  while (true) {
    const constraints = [];
    if (from) constraints.push(where(field, '>=', from));
    if (to) constraints.push(where(field, '<=', to));
    constraints.push(orderBy(field, 'asc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(PAGE_SIZE));
    const snap = await getDocs(query(collection(db, collectionName), ...constraints));
    results.push(...snap.docs.map(item => ({ id: item.id, ...item.data() })));
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs.at(-1);
  }
  return results;
}

const REPORTS = [
  { id: 'equipment', title: 'Equipment use', description: 'One row per item request, with dates, quantities, and current status.' },
  { id: 'overdue', title: 'Overdue equipment', description: 'Equipment that is still out after its expected return date.' },
  { id: 'rooms', title: 'Laboratory bookings', description: 'Room requests, decisions, and actual occupancy timestamps.' },
  { id: 'requests', title: 'Equipment requests', description: 'Request records submitted during the selected period.' },
];

export default function Reports() {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [labFilter, setLabFilter] = useState('');
  const [busy, setBusy] = useState('');

  async function exportReport(report) {
    if (from && to && from > to) {
      toast.error('The start date must be on or before the end date.');
      return;
    }
    setBusy(report.id);
    try {
      let rows = [];
      if (report.id === 'rooms') {
        const bookings = await fetchAllByDate('labBookings', 'bookingDate', from, to);
        rows = bookings.map(b => ({
          bookingId: b.id, bookingDate: b.bookingDate, startTime: b.startTime, endTime: b.endTime,
          room: b.labRoom, student: b.studentName, LRN: b.studentId, grade: b.gradeLevel,
          section: b.section, purpose: b.purpose, status: b.status,
          submittedAt: b.submittedAt?.toDate?.()?.toISOString?.() || '',
          approvedAt: b.approvedAt?.toDate?.()?.toISOString?.() || '',
          occupiedAt: b.checkedInAt?.toDate?.()?.toISOString?.() || '',
          doneAt: b.returnedAt?.toDate?.()?.toISOString?.() || '',
          staffRemarks: b.staffRemarks || '',
        }));
      } else {
        const dateField = report.id === 'overdue' ? 'expectedReturnDate' : report.id === 'requests' ? 'requestDate' : 'experimentDate';
        const requests = await fetchAllByDate('requests', dateField, from, to);
        const filtered = report.id === 'overdue'
          ? requests.filter(r => getEquipmentDueState(r.status, r.expectedReturnDate, r.expectedReturnTime)?.kind === 'overdue')
          : requests;
        rows = filtered.flatMap(r => {
          const items = report.id === 'overdue' || report.id === 'requests' ? (r.items || [null]) : (r.items || [null]);
          return items.map(item => ({
            requestId: r.id, requestDate: r.requestDate, experimentDate: r.experimentDate,
            proposedBorrowTime: r.proposedBorrowTime, expectedReturnDate: r.expectedReturnDate,
            expectedReturnTime: r.expectedReturnTime, actualReturnDate: r.actualReturnDate,
            student: r.borrowerName, LRN: r.studentId, grade: r.gradeLevel, section: r.section,
            teacher: r.teacher, experiment: r.experiment, equipment: item?.name || '', lab: item?.lab || '',
            qtyRequested: item?.qtyRequested ?? '', qtyReleased: item?.qtyReleased ?? '',
            qtyReturned: item?.qtyReturned ?? '', status: r.status, staffRemarks: r.staffRemarks || '',
          }));
        });
        if (labFilter) rows = rows.filter(row => row.lab === labFilter);
      }
      if (!rows.length) {
        toast.info('No records match that report and date range.');
        return;
      }
      const suffix = [from || 'all', to || 'dates', labFilter || 'all_labs'].join('_');
      downloadCsv(`labtrack_${report.id}_${suffix}.csv`, rows);
      toast.success(`Exported ${rows.length} report row${rows.length === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Report export failed:', error);
      toast.error(`Could not export report: ${error.message}`);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div className="card">
        <div className="card-header"><FileBarChart2 size={18} /> Reports & Exports</div>
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm text-gray-600 mb-3">Choose an optional date range, then download a CSV report. Leave both dates empty to include all available records.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <div><label className="label" htmlFor="report-from">From</label><input id="report-from" type="date" className="input" value={from} onChange={event => setFrom(event.target.value)} /></div>
            <div><label className="label" htmlFor="report-to">To</label><input id="report-to" type="date" className="input" value={to} onChange={event => setTo(event.target.value)} /></div>
            <div><label className="label" htmlFor="report-lab">Equipment laboratory</label>
              <select id="report-lab" className="input" value={labFilter} onChange={event => setLabFilter(event.target.value)}>
                <option value="">All labs</option><option>Physics Lab</option><option>Biochem Lab</option><option>Unassigned</option>
              </select>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
          {REPORTS.map(report => (
            <article key={report.id} className="rounded-xl border border-gray-200 p-4 flex flex-col items-start">
              <h2 className="font-semibold text-gray-900">{report.title}</h2>
              <p className="text-sm text-gray-600 mt-1 mb-4">{report.description}</p>
              <button type="button" onClick={() => exportReport(report)} disabled={!!busy} className="btn-secondary btn-sm mt-auto">
                <Download size={14} /> {busy === report.id ? 'Preparing…' : 'Download CSV'}
              </button>
            </article>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 px-1">Reports include student identifiers and should be stored and shared carefully.</p>
    </div>
  );
}

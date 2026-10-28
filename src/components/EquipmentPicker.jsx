import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const KNOWN_LABS = ['Physics Lab', 'Biochem Lab', 'Unassigned'];
const LAB_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'Physics Lab', label: 'Physics' },
  { value: 'Biochem Lab', label: 'Biochem' },
  { value: 'Unassigned', label: 'Unassigned' },
];

export default function EquipmentPicker({ equipment, value, onChange, invalid = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [labFilter, setLabFilter] = useState('all');
  const rootRef = useRef(null);
  const selected = equipment.find(item => item.id === value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipment.filter(item => {
      const itemLab = item.lab || 'Unassigned';
      const matchesLab = labFilter === 'all' || itemLab === labFilter;
      const matchesSearch = !q || [item.name, item.category, itemLab]
        .some(text => text?.toLowerCase().includes(q));
      return matchesLab && matchesSearch;
    });
  }, [equipment, labFilter, search]);

  useEffect(() => {
    function closeOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const groups = [...new Set([...KNOWN_LABS, ...filtered.map(item => item.lab || 'Unassigned')])];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`input flex items-center justify-between gap-2 text-left text-sm ${invalid ? 'input-error' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setOpen(current => !current); setSearch(''); }}
      >
        <span className={selected ? 'truncate text-gray-900' : 'truncate text-gray-500'}>
          {selected
            ? `[${selected.lab || 'Unassigned'}] ${selected.name} · ${selected.category} (available: ${selected.availableQty})`
            : 'Select equipment'}
        </span>
        <ChevronDown size={15} className="shrink-0 text-gray-500" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="search"
                className="input pl-8 text-sm"
                placeholder="Search equipment…"
                aria-label="Search equipment in list"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-1.5 px-2 py-2 border-b border-gray-100 overflow-x-auto" role="group" aria-label="Filter equipment by laboratory">
            {LAB_FILTERS.map(filter => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={labFilter === filter.value}
                onClick={() => setLabFilter(filter.value)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  labFilter === filter.value
                    ? 'border-primary-700 bg-primary-700 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300 hover:text-primary-700'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div role="listbox" aria-label="Equipment choices" className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-gray-500">No matching equipment found.</p>
            ) : groups.map(lab => {
              const rows = filtered.filter(item => (item.lab || 'Unassigned') === lab);
              if (!rows.length) return null;
              return (
                <div key={lab}>
                  <p className="sticky top-0 bg-gray-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">{lab}</p>
                  {rows.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={item.id === value}
                      onClick={() => { onChange(item.id); setOpen(false); setSearch(''); }}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-medium text-gray-800">{item.name}</span>
                        <span className="block truncate text-xs text-gray-500">{item.category} · available {item.availableQty}</span>
                      </span>
                      {item.id === value && <Check size={15} className="text-green-700 shrink-0" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

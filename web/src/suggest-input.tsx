import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api } from './api';

interface Suggestion { insert: string; label: string }

// Kolom narasi dengan saran lanjutan dari pola dataset. Saran bersifat opsional: abaikan saja bila tidak sesuai.
// Tab = pakai saran pertama, klik = pakai saran itu, Esc = sembunyikan.
export function NarrativeInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [hidden, setHidden] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const ref = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!atEnd || !value.trim()) { setItems([]); return; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      api<{ suggestions: Suggestion[] }>('GET', `/suggest?text=${encodeURIComponent(value.slice(-300))}`)
        .then((r) => { if (n === seq.current) setItems(r.suggestions); })
        .catch(() => setItems([]));
    }, 180);
    return () => clearTimeout(t);
  }, [value, atEnd]);

  const accept = (s: Suggestion) => {
    onChange(value + s.insert);
    setHidden(false);
    requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; } });
  };
  const show = !hidden && atEnd && items.length > 0;
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (show && e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); accept(items[0]); }
    else if (show && e.key === 'Escape') { e.preventDefault(); setHidden(true); }
  };
  const track = () => { const el = ref.current; if (el) setAtEnd(el.selectionStart === el.value.length); };

  return (
    <div className="narr">
      <textarea ref={ref} rows={4} placeholder={placeholder} value={value} onKeyDown={onKey} onKeyUp={track} onClick={track}
        onChange={(e) => { onChange(e.target.value); setHidden(false); setAtEnd(e.target.selectionStart === e.target.value.length); }} aria-describedby="narr-hint" />
      <div className="narr-bar" id="narr-hint" aria-live="polite">
        {show ? (
          <>
            <span className="narr-k">Saran</span>
            {items.map((s, i) => (
              <button key={s.label} type="button" className="chip narr-s" onMouseDown={(e) => e.preventDefault()} onClick={() => accept(s)}>
                {s.label}{i === 0 && <kbd>Tab</kbd>}
              </button>
            ))}
            <span className="narr-k muted">opsional · Esc untuk sembunyikan</span>
          </>
        ) : <span className="narr-k muted">Saran lanjutan kalimat muncul saat mengetik. Tanggal dan nama bandara tetap ditulis sendiri.</span>}
      </div>
    </div>
  );
}

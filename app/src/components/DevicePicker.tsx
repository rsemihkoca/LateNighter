import { useEffect, useRef, useState } from 'react'
import { MOCKUPS, getMockup } from './mockups'
import { useDoc } from '../doc/DocContextCore'

// Mockup dropdown: pick which phone frame screens are shown in (or "Mockup yok"
// for a plain screen card). Opens downward as a list of names.
export function DevicePicker() {
  const { doc, setDevice } = useDoc()
  const active = getMockup(doc.deviceId)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-[7px] h-6 px-2 border border-border rounded-base bg-bg text-fg text-xs font-medium cursor-pointer hover:bg-subtle hover:border-border-strong"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Mockup"
      >
        <span className="whitespace-nowrap">{active.name}</span>
        <span className="text-[9px] text-fg-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul
          className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-full m-0 p-1 list-none border border-border rounded-base bg-panel shadow-[var(--shadow-md)]"
          role="listbox"
        >
          {MOCKUPS.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === active.id}
                className={`flex items-center gap-2 w-full py-[5px] pl-[5px] pr-2 rounded-sm text-fg text-xs font-medium text-left cursor-pointer hover:bg-subtle${
                  m.id === active.id
                    ? ' bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
                    : ''
                }`}
                onClick={() => {
                  setDevice(m.id)
                  setOpen(false)
                }}
              >
                <span className="whitespace-nowrap">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

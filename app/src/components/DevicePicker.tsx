import { useEffect, useRef, useState } from 'react'
import { MOCKUPS, getMockup } from './mockups'
import { useDoc } from '../doc/DocContext'

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
    <div className="device-picker" ref={ref}>
      <button
        type="button"
        className="device-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Mockup"
      >
        <span className="device-picker__name">{active.name}</span>
        <span className="device-picker__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="device-picker__menu" role="listbox">
          {MOCKUPS.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === active.id}
                className={`device-picker__option${m.id === active.id ? ' is-active' : ''}`}
                onClick={() => {
                  setDevice(m.id)
                  setOpen(false)
                }}
              >
                <span className="device-picker__name">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

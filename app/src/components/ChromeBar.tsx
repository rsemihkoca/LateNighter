import { useTheme } from '../theme/ThemeContext'
import { useDoc, type SaveState } from '../doc/DocContextCore'
import { DevicePicker } from './DevicePicker'

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  dirty: 'Pending…',
  error: 'Error',
}

// Save-state pill colors (was .chrome__save--{state}).
const SAVE_TONE: Record<SaveState, string> = {
  saved: 'text-green bg-green-bg border-green-border',
  saving: 'text-blue bg-blue-bg border-blue-border',
  dirty: 'text-amber bg-amber-bg border-amber-border',
  error: 'text-red bg-red-bg border-red-border',
}

const CHROME_BTN_BASE =
  'h-6 px-2.5 border rounded-base text-xs font-medium cursor-pointer transition-[background-color,border-color,color] duration-[120ms] ease-out'
const CHROME_BTN = `${CHROME_BTN_BASE} border-border bg-bg text-fg hover:bg-subtle hover:border-border-strong`
const CHROME_BTN_ACCENT = `${CHROME_BTN_BASE} bg-accent border-accent text-white shadow-[0_6px_14px_color-mix(in_srgb,var(--accent)_24%,transparent)] hover:bg-accent-hover hover:border-accent-hover`

export function ChromeBar() {
  const { theme, toggleTheme } = useTheme()
  const { storageLabel, saveState, addScreen, closeProject } = useDoc()

  return (
    <header className="flex items-center h-[34px] gap-2.5 px-2 border-b border-border bg-[color-mix(in_srgb,var(--bg-panel)_88%,var(--bg-subtle))] select-none group-data-[tauri-window=true]:pl-24">
      <div className="inline-flex items-center gap-2 flex-[0_1_auto] min-w-0" data-tauri-drag-region>
        <span
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm bg-[linear-gradient(135deg,var(--accent-tint)_0%,var(--accent-soft)_100%)] text-accent text-[11px]"
          aria-hidden
        >
          ◆
        </span>
        <span className="text-[13px] font-[650] tracking-[-0.01em] text-fg-strong">
          {storageLabel}
        </span>
        <span
          className={`ml-1 px-[9px] py-0.5 rounded-pill text-[10.5px] font-semibold border ${SAVE_TONE[saveState]}`}
        >
          {SAVE_LABEL[saveState]}
        </span>
      </div>
      <div
        className="self-stretch flex-[1_1_auto] min-w-6"
        data-tauri-drag-region
        aria-hidden
      />
      <div className="inline-flex items-center flex-none gap-[5px]">
        <DevicePicker />
        <button className={CHROME_BTN} type="button" onClick={() => addScreen()}>
          + Screen
        </button>
        <button className={CHROME_BTN} type="button" onClick={closeProject} title="Projects">
          Projects
        </button>
        <button
          className={CHROME_BTN}
          type="button"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <button className={CHROME_BTN_ACCENT} type="button">
          Export
        </button>
      </div>
    </header>
  )
}

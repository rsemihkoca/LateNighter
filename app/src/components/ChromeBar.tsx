import { useTheme } from '../theme/ThemeContext'
import { useDoc, type SaveState } from '../doc/DocContext'
import { DevicePicker } from './DevicePicker'

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  dirty: 'Pending…',
  error: 'Error',
}

export function ChromeBar() {
  const { theme, toggleTheme } = useTheme()
  const { storageLabel, saveState, addScreen, closeProject } = useDoc()

  return (
    <header className="chrome">
      <div className="chrome__brand" data-tauri-drag-region>
        <span className="chrome__logo" aria-hidden>
          ◆
        </span>
        <span className="chrome__title">{storageLabel}</span>
        <span className={`chrome__save chrome__save--${saveState}`}>
          {SAVE_LABEL[saveState]}
        </span>
      </div>
      <div className="chrome__drag-spacer" data-tauri-drag-region aria-hidden />
      <div className="chrome__actions">
        <DevicePicker />
        <button className="chrome__btn" type="button" onClick={() => addScreen()}>
          + Screen
        </button>
        <button className="chrome__btn" type="button" onClick={closeProject} title="Projects">
          Projects
        </button>
        <button
          className="chrome__btn"
          type="button"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <button className="chrome__btn chrome__btn--accent" type="button">
          Export
        </button>
      </div>
    </header>
  )
}

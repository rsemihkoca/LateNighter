import { useTheme } from '../theme/ThemeContext'
import { useDoc, type SaveState } from '../doc/DocContext'

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Kaydedildi',
  saving: 'Kaydediliyor…',
  dirty: 'Bekliyor…',
  error: 'Hata',
}

export function ChromeBar() {
  const { theme, toggleTheme } = useTheme()
  const { doc, storageLabel, saveState, addScreen, closeProject } = useDoc()

  return (
    <header className="chrome">
      <div className="chrome__brand">
        <span className="chrome__logo" aria-hidden>
          ◆
        </span>
        <span className="chrome__title">{doc.name}</span>
        <span className="chrome__sep" aria-hidden />
        <span className="chrome__crumb">{storageLabel}</span>
        <span className={`chrome__save chrome__save--${saveState}`}>
          {SAVE_LABEL[saveState]}
        </span>
      </div>
      <div className="chrome__actions">
        <button className="chrome__btn" type="button" onClick={addScreen}>
          + Ekran
        </button>
        <button className="chrome__btn" type="button" onClick={closeProject} title="Projeler">
          Projeler
        </button>
        <button
          className="chrome__btn"
          type="button"
          onClick={toggleTheme}
          title="Tema değiştir"
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

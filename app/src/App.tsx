import { useCallback, useMemo, useState } from 'react'
import { ThemeContext, type Theme } from './theme/ThemeContext'
import { DocProvider, type DocSession } from './doc/DocContext'
import { ChromeBar } from './components/ChromeBar'
import { Workspace } from './components/Workspace'
import { ProjectPicker } from './components/ProjectPicker'

export default function App() {
  const [theme, setTheme] = useState<Theme>('light')
  const [session, setSession] = useState<DocSession | null>(null)

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    [],
  )
  const themeValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])
  const closeProject = useCallback(() => setSession(null), [])

  return (
    <ThemeContext.Provider value={themeValue}>
      {session ? (
        <DocProvider session={session} onClose={closeProject}>
          <div className="app-shell" data-theme={theme}>
            <ChromeBar />
            <div className="app-shell__body">
              <Workspace />
            </div>
          </div>
        </DocProvider>
      ) : (
        <div className="picker-shell" data-theme={theme}>
          <ProjectPicker onOpen={setSession} />
        </div>
      )}
    </ThemeContext.Provider>
  )
}

import {
  DockviewDefaultTab,
  DockviewReact,
  themeDark,
  themeLight,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react'
import { useTheme } from '../theme/ThemeContext'
import { FlowCanvas } from './FlowCanvas'
import { Sidebar } from './Sidebar'

const components: Record<string, (props: IDockviewPanelProps) => React.JSX.Element> = {
  flow: () => <FlowCanvas />,
  tree: () => <Sidebar />,
}

// Tab'lar kapatılamaz: default tab'ı hideClose ile sarmalayıp X butonunu gizle.
function NoCloseTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab {...props} hideClose />
}

function onReady(event: DockviewReadyEvent) {
  // Ana panel: React Flow canvas (doc'un görünümü). renderer:'always' →
  // tab değişiminde / panel sürüklenirken unmount olmaz.
  event.api.addPanel({
    id: 'flow',
    component: 'flow',
    title: 'Flow',
    renderer: 'always',
  })

  // Sol ayrı panel: Tree navigator (doc'un hiyerarşik görünümü).
  const tree = event.api.addPanel({
    id: 'tree',
    component: 'tree',
    title: 'Explorer',
    position: { referencePanel: 'flow', direction: 'left' },
  })
  tree.api.setSize({ width: 300 })
}

export function Workspace() {
  const { theme } = useTheme()
  return (
    <DockviewReact
      components={components}
      defaultTabComponent={NoCloseTab}
      onReady={onReady}
      theme={theme === 'dark' ? themeDark : themeLight}
    />
  )
}

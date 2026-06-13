import {
  DockviewReact,
  themeDark,
  themeLight,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import { useTheme } from '../theme/ThemeContext'
import { FlowCanvas } from './FlowCanvas'
import { TreeNavigator } from './TreeNavigator'

const components: Record<string, (props: IDockviewPanelProps) => React.JSX.Element> = {
  flow: () => <FlowCanvas />,
  tree: () => <TreeNavigator />,
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
    title: 'Tree',
    position: { referencePanel: 'flow', direction: 'left' },
  })
  tree.api.setSize({ width: 300 })
}

export function Workspace() {
  const { theme } = useTheme()
  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      theme={theme === 'dark' ? themeDark : themeLight}
    />
  )
}

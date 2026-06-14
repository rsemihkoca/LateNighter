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

// Tabs can't be closed: wrap the default tab with hideClose to hide the X button.
function NoCloseTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab {...props} hideClose />
}

function onReady(event: DockviewReadyEvent) {
  // Main panel: React Flow canvas (the doc's view). renderer:'always' →
  // it won't unmount on tab change / while the panel is dragged.
  event.api.addPanel({
    id: 'flow',
    component: 'flow',
    title: 'Flow',
    renderer: 'always',
  })

  // Separate left panel: Tree navigator (the doc's hierarchical view).
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

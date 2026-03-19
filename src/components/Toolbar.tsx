import type { ToolbarProps } from './toolbar/types'
import { useToolbarController } from './toolbar/useToolbarController'
import { ToolbarMenus } from './toolbar/ToolbarMenus'
import { ToolbarDialogs } from './toolbar/ToolbarDialogs'

function Toolbar(props: ToolbarProps) {
  const controller = useToolbarController(props)

  return (
    <>
      <ToolbarMenus
        theme={props.theme}
        onThemeChange={props.onThemeChange}
        actions={controller.actions}
        themeOptions={props.themeOptions}
      />

      <ToolbarDialogs
        ui={controller.ui}
        actions={controller.actions}
      />
    </>
  )
}

export type { ToolbarProps } from './toolbar/types'
export type { EditorActions, ThemeType } from './milkdown/types'

export default Toolbar
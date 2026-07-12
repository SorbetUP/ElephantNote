import { isOsx } from '../../config'

export const COMMAND_KEY = isOsx ? '⌘' : 'Ctrl'
export const OPTION_KEY = isOsx ? '⌥' : 'Alt'
export const SHIFT_KEY = isOsx ? '⇧' : 'Shift'

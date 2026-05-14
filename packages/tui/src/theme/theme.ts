export interface Theme {
  name: 'dark' | 'light'
  colors: {
    fg: string
    dim: string
    accent: string
    userMsg: string
    assistantMsg: string
    systemMsg: string
    errorMsg: string
    panelBorder: string
    statusBg: string
    statusFg: string
  }
}

export const themes: Record<'dark' | 'light', Theme> = {
  dark: {
    name: 'dark',
    colors: {
      fg: 'white',
      dim: 'gray',
      accent: 'cyan',
      userMsg: 'cyan',
      assistantMsg: 'white',
      systemMsg: 'yellow',
      errorMsg: 'red',
      panelBorder: 'gray',
      statusBg: 'blackBright',
      statusFg: 'whiteBright',
    },
  },
  light: {
    name: 'light',
    colors: {
      fg: 'black',
      dim: 'gray',
      accent: 'magenta',
      userMsg: 'blue',
      assistantMsg: 'black',
      systemMsg: 'yellow',
      errorMsg: 'red',
      panelBorder: 'gray',
      statusBg: 'whiteBright',
      statusFg: 'black',
    },
  },
}

export function resolveTheme(env: NodeJS.ProcessEnv): Theme {
  const raw = (env.GLM_THEME ?? 'dark').toLowerCase()
  if (raw === 'light') return themes.light
  return themes.dark
}

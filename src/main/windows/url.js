export const buildRendererBaseUrl = ({ isDevMode, rendererUrl, fallbackUrl }) =>
  isDevMode && rendererUrl ? rendererUrl : fallbackUrl

import githubMarkdownCss from 'github-markdown-css/github-markdown.css?inline'
import exportStyle from '../assets/styles/exportStyle.css?inline'
import highlightCss from 'prismjs/themes/prism.css?inline'
import katexCss from 'katex/dist/katex.css?inline'
import { EXPORT_DOMPURIFY_CONFIG } from '../config'
import { sanitize } from '../utils'

export default async function generateExportDocument(exporter, options) {
  const { printOptimization } = options
  const highlightCssStyle = printOptimization ? `@media print { ${highlightCss} }` : highlightCss
  const html = exporter._prepareHtml(await exporter.renderHtml(options.toc), options)
  const katexCssStyle = exporter.mathRendererCalled ? katexCss : ''
  exporter.mathRendererCalled = false
  const { title, extraCss } = options
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${sanitize(title, EXPORT_DOMPURIFY_CONFIG, true)}</title>
  <style>
  ${githubMarkdownCss}
  </style>
  <style>
  ${highlightCssStyle}
  </style>
  <style>
  ${katexCssStyle}
  </style>
  <style>
    .markdown-body {
      font-family: -apple-system,Segoe UI,Helvetica,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji;
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0 auto;
      padding: 45px;
    }

    @media not print {
      .markdown-body {
        padding: 45px;
      }

      @media (max-width: 767px) {
        .markdown-body {
          padding: 15px;
        }
      }
    }

    .hf-container {
      color: #24292e;
      line-height: 1.3;
    }

    .markdown-body .highlight pre,
    .markdown-body pre {
      white-space: pre-wrap;
    }
    .markdown-body table {
      display: table;
    }
    .markdown-body img[data-align="center"] {
      display: block;
      margin: 0 auto;
    }
    .markdown-body img[data-align="right"] {
      display: block;
      margin: 0 0 0 auto;
    }
    .markdown-body li.task-list-item {
      list-style-type: none;
    }
    .markdown-body li > [type=checkbox] {
      margin: 0 0 0 -1.3em;
    }
    .markdown-body input[type="checkbox"] ~ p {
      margin-top: 0;
      display: inline-block;
    }
    .markdown-body ol ol,
    .markdown-body ul ol {
      list-style-type: decimal;
    }
    .markdown-body ol ol ol,
    .markdown-body ol ul ol,
    .markdown-body ul ol ol,
    .markdown-body ul ul ol {
      list-style-type: decimal;
    }
  </style>
  <style>${exportStyle}</style>
  <style>${extraCss}</style>
</head>
<body>
  ${html}
</body>
</html>`
}
